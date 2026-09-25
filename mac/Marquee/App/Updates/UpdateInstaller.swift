import Foundation

/// The Mac side of updating: unpack the verified download, make sure it's
/// really the Marquee release it claims to be, and swap it in for the running
/// copy once that has quit (a small shell script does the swap, since an app
/// can't replace itself while it runs).
enum UpdateInstaller {
    static let bundleIdentifier = "com.timmyamant.Marquee"
    static let appName = "Marquee.app"

    // MARK: Where

    /// Why the running copy can't be replaced in place, if it can't: macOS
    /// runs an app opened straight from Downloads or a disk image from a
    /// read-only "translocated" copy, and an app in a folder this account
    /// can't write to can't be swapped either.
    nonisolated static func blocker(
        for bundle: URL,
        isWritable: (String) -> Bool = { FileManager.default.isWritableFile(atPath: $0) }
    ) -> UpdateError? {
        guard bundle.pathExtension == "app",
              !bundle.path.contains("/AppTranslocation/"),
              isWritable(bundle.deletingLastPathComponent().path)
        else { return .cannotReplace }
        return nil
    }

    /// A fresh folder for the download, on the same volume as `bundle` when
    /// there is one, so the final swap is a rename rather than a copy.
    nonisolated static func workspace(near bundle: URL?) throws -> URL {
        let fileManager = FileManager.default
        if let bundle,
           let near = try? fileManager.url(for: .itemReplacementDirectory, in: .userDomainMask, appropriateFor: bundle, create: true) {
            return near
        }
        let fallback = fileManager.temporaryDirectory.appendingPathComponent("Marquee-update-\(UUID().uuidString)")
        do {
            try fileManager.createDirectory(at: fallback, withIntermediateDirectories: true)
        } catch {
            throw UpdateError.downloadFailed
        }
        return fallback
    }

    // MARK: What

    /// `ditto -x -k` into a fresh folder, then `validatedApp`.
    @concurrent
    static func unpack(_ zip: URL, in workspace: URL, expecting version: AppVersion) async throws -> URL {
        let folder = workspace.appendingPathComponent("unpacked-\(UUID().uuidString)")
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        } catch {
            throw UpdateError.unzipFailed
        }
        guard run("/usr/bin/ditto", ["-x", "-k", zip.path, folder.path]) == 0 else { throw UpdateError.unzipFailed }
        return try validatedApp(in: folder, expecting: version)
    }

    /// The `Marquee.app` in `folder`, if it's this app (bundle identifier),
    /// the release it claims to be (version), and intact (`codesign --verify
    /// --deep --strict`).
    nonisolated static func validatedApp(
        in folder: URL,
        expecting version: AppVersion,
        verifySignature: (URL) -> Bool = signatureVerifies
    ) throws -> URL {
        let app = folder.appendingPathComponent(appName)
        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: app.path, isDirectory: &isDirectory), isDirectory.boolValue else {
            throw UpdateError.invalidApp("there's no \(appName) in it")
        }
        let infoURL = app.appendingPathComponent("Contents/Info.plist")
        guard let data = try? Data(contentsOf: infoURL),
              let info = try? PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any]
        else { throw UpdateError.invalidApp("it has no Info.plist") }
        guard info["CFBundleIdentifier"] as? String == bundleIdentifier else {
            throw UpdateError.invalidApp("it's a different app")
        }
        let found = (info["CFBundleShortVersionString"] as? String).flatMap(AppVersion.init)
        guard let found, found == version else {
            throw UpdateError.invalidApp("it's version \(found?.description ?? "unknown"), not \(version)")
        }
        guard verifySignature(app) else {
            throw UpdateError.invalidApp("its code signature doesn't check out")
        }
        return app
    }

    nonisolated static func signatureVerifies(_ app: URL) -> Bool {
        run("/usr/bin/codesign", ["--verify", "--deep", "--strict", app.path]) == 0
    }

    /// When the running copy can't be replaced: the checked download goes to
    /// Downloads for the person to drag to Applications themselves.
    nonisolated static func keepForManualInstall(_ app: URL, version: AppVersion) -> URL? {
        let fileManager = FileManager.default
        guard let downloads = fileManager.urls(for: .downloadsDirectory, in: .userDomainMask).first else { return nil }
        var destination = downloads.appendingPathComponent(appName)
        if fileManager.fileExists(atPath: destination.path) {
            destination = downloads.appendingPathComponent("Marquee \(version).app")
        }
        try? fileManager.removeItem(at: destination)
        do {
            try fileManager.moveItem(at: app, to: destination)
            return destination
        } catch {
            return nil
        }
    }

    // MARK: The swap

    /// Waits for the app (`$1`, its pid) to quit, moves the installed copy
    /// (`$2`) aside, moves the new one (`$3`) into its place, and opens it. If
    /// the new one can't go in, the old one goes back and opens instead.
    /// `MARQUEE_UPDATE_OPEN` stands in for `open` in tests.
    static let swapScript = """
        #!/bin/sh
        # Marquee's updater (mac/Marquee/App/Updates/UpdateInstaller.swift).
        pid="$1"
        current="$2"
        new="$3"
        open_app="${MARQUEE_UPDATE_OPEN:-/usr/bin/open}"

        [ -n "$pid" ] && [ -n "$new" ] || exit 2
        case "$current" in
          *.app) ;;
          *) echo "Not an app: $current" >&2; exit 2 ;;
        esac

        # Up to a minute for Marquee to quit.
        waited=0
        while kill -0 "$pid" 2>/dev/null; do
          if [ "$waited" -ge 600 ]; then
            echo "Marquee (pid $pid) didn't quit; nothing was changed." >&2
            exit 1
          fi
          sleep 0.1
          waited=$((waited + 1))
        done

        old="$current.old"
        rm -rf "$old"
        if ! mv "$current" "$old"; then
          echo "Couldn't move $current aside; nothing was changed." >&2
          "$open_app" "$current"
          exit 1
        fi
        if ! mv "$new" "$current"; then
          echo "Couldn't move the new app into place; putting the old one back." >&2
          rm -rf "$current"
          mv "$old" "$current"
          "$open_app" "$current"
          exit 1
        fi
        rm -rf "$old"
        /usr/bin/xattr -dr com.apple.quarantine "$current" 2>/dev/null
        "$open_app" "$current"
        echo "Updated $current."

        """

    /// Writes the script next to the download and starts it detached (a
    /// background job of a shell that exits at once), so it outlives this
    /// app. Its output goes to `update.log` beside it.
    nonisolated static func launchSwap(current: URL, new: URL, pid: Int32, workspace: URL) throws {
        let script = workspace.appendingPathComponent("swap.sh")
        let log = workspace.appendingPathComponent("update.log")
        do {
            try swapScript.write(to: script, atomically: true, encoding: .utf8)
        } catch {
            throw UpdateError.launchFailed
        }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/sh")
        process.arguments = [
            "-c", #"nohup /bin/sh "$0" "$1" "$2" "$3" >>"$4" 2>&1 </dev/null &"#,
            script.path, String(pid), current.path, new.path, log.path,
        ]
        do {
            try process.run()
        } catch {
            throw UpdateError.launchFailed
        }
        process.waitUntilExit()
        guard process.terminationStatus == 0 else { throw UpdateError.launchFailed }
    }

    // MARK: Helpers

    /// Runs a tool to completion, discarding its output; its exit status.
    @discardableResult
    nonisolated static func run(_ tool: String, _ arguments: [String]) -> Int32 {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: tool)
        process.arguments = arguments
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        do {
            try process.run()
        } catch {
            return -1
        }
        process.waitUntilExit()
        return process.terminationStatus
    }
}
