import CryptoKit
import XCTest
@testable import Marquee

// The in-app updater: versions, GitHub's release JSON, the download checks,
// what counts as a Marquee app, where it can be installed, and the script
// that swaps it in (run for real against dummy apps).

final class AppVersionTests: XCTestCase {
    private func version(_ text: String) throws -> AppVersion {
        try XCTUnwrap(AppVersion(text), text)
    }

    func testNumericOrder() throws {
        XCTAssertLessThan(try version("0.29.0"), try version("0.29.1"))
        XCTAssertLessThan(try version("0.29.1"), try version("0.30.0"))
        XCTAssertLessThan(try version("0.29.9"), try version("0.29.10"), "Numbers, not text")
        XCTAssertLessThan(try version("0.30.0"), try version("1.0.0"))
    }

    func testTagsAndShortForms() throws {
        XCTAssertEqual(try version("v0.29.0"), try version("0.29.0"), "A release tag's v")
        XCTAssertEqual(try version("0.29"), try version("0.29.0"))
        XCTAssertEqual(try version("0.30.0-beta.1"), try version("0.30.0"))
        XCTAssertEqual(try version("v0.29.0").description, "0.29.0")
        XCTAssertNil(AppVersion("latest"))
        XCTAssertNil(AppVersion(""))
        XCTAssertNil(AppVersion("1..0"))
    }

    func testALocalOnePointOhBuildIsNeverOfferedAnUpdate() throws {
        // Builds from before the version came from package.json said 1.0.0,
        // which is newer than any 0.x release: no nagging a developer build.
        XCTAssertGreaterThan(try version("1.0.0"), try version("0.29.0"))
        XCTAssertNotNil(AppVersion.current, "This build's own version reads")
    }
}

final class GitHubReleaseTests: XCTestCase {
    static func fixture() throws -> Data {
        let url = Bundle(for: GitHubReleaseTests.self).resourceURL!.appendingPathComponent("Fixtures/github/release-latest.json")
        return try Data(contentsOf: url)
    }

    /// The fixture with its JSON changed by `edit`.
    static func release(_ edit: (inout [String: Any]) -> Void = { _ in }) throws -> GitHubRelease {
        var json = try XCTUnwrap(JSONSerialization.jsonObject(with: fixture()) as? [String: Any])
        edit(&json)
        return try GitHubRelease.decoder.decode(GitHubRelease.self, from: JSONSerialization.data(withJSONObject: json))
    }

    func testTheLatestReleaseParses() throws {
        let update = try XCTUnwrap(AvailableUpdate(release: Self.release()))
        XCTAssertEqual(update.version.description, "0.30.0")
        XCTAssertEqual(update.download.absoluteString, "https://github.com/TimmyAmant/marquee/releases/download/v0.30.0/Marquee-mac.zip")
        XCTAssertEqual(update.size, 6_284_173)
        XCTAssertEqual(update.sha256, "3f5b0e0cdb1cd0e8a2c3a4d6f0e1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d")
        XCTAssertEqual(update.checksumFile?.lastPathComponent, "Marquee-mac.zip.sha256")
        XCTAssertEqual(update.releasePage.absoluteString, "https://github.com/TimmyAmant/marquee/releases/tag/v0.30.0")
    }

    func testWithoutADigestTheChecksumFileIsUsed() throws {
        let release = try Self.release { json in
            json["assets"] = (json["assets"] as? [[String: Any]])?.map { asset in
                var asset = asset
                asset.removeValue(forKey: "digest")
                return asset
            }
        }
        let update = try XCTUnwrap(AvailableUpdate(release: release))
        XCTAssertNil(update.sha256)
        XCTAssertNotNil(update.checksumFile)
    }

    func testAReleaseWithoutAMacDownloadOffersNothing() throws {
        let release = try Self.release { json in
            json["assets"] = (json["assets"] as? [[String: Any]])?.filter { ($0["name"] as? String)?.hasPrefix("Marquee-mac") == false }
        }
        XCTAssertNil(AvailableUpdate(release: release))
    }

    func testDigestsAndChecksumFiles() {
        let hex = String(repeating: "ab", count: 32)
        XCTAssertEqual(AvailableUpdate.sha256(fromDigest: "sha256:\(hex.uppercased())"), hex)
        XCTAssertNil(AvailableUpdate.sha256(fromDigest: "md5:\(hex)"))
        XCTAssertNil(AvailableUpdate.sha256(fromDigest: "sha256:1234"))
        XCTAssertEqual(AvailableUpdate.sha256(fromChecksumFile: "\(hex)  Marquee-mac.zip\n"), hex)
        XCTAssertNil(AvailableUpdate.sha256(fromChecksumFile: "Not Found"))
    }
}

final class UpdateServiceTests: XCTestCase {
    override func tearDown() {
        StubURLProtocol.handler = nil
        StubURLProtocol.requests = []
        super.tearDown()
    }

    func testOnlyGitHubsHostsOverHTTPS() {
        for allowed in [
            "https://github.com/TimmyAmant/marquee/releases/download/v0.30.0/Marquee-mac.zip",
            "https://api.github.com/repos/TimmyAmant/marquee/releases/latest",
            "https://objects.githubusercontent.com/github-production-release-asset/1/2",
            "https://release-assets.githubusercontent.com/github-production-release-asset/1/2",
        ] {
            XCTAssertTrue(UpdateService.isAllowed(URL(string: allowed)), allowed)
        }
        for refused in [
            "http://github.com/TimmyAmant/marquee/releases/download/v0.30.0/Marquee-mac.zip",
            "https://github.com.example.com/Marquee-mac.zip",
            "https://githubusercontent.com.example.com/Marquee-mac.zip",
            "https://example.com/Marquee-mac.zip",
            "file:///tmp/Marquee-mac.zip",
        ] {
            XCTAssertFalse(UpdateService.isAllowed(URL(string: refused)), refused)
        }
        XCTAssertFalse(UpdateService.isAllowed(nil))
    }

    private func update(size: Int, sha256: String?, download: String = "https://github.com/TimmyAmant/marquee/releases/download/v0.30.0/Marquee-mac.zip") throws -> AvailableUpdate {
        try XCTUnwrap(AvailableUpdate(release: GitHubReleaseTests.release { json in
            json["assets"] = [[
                "name": "Marquee-mac.zip", "size": size, "browser_download_url": download,
                "digest": sha256.map { "sha256:\($0)" } as Any,
            ], [
                "name": "Marquee-mac.zip.sha256", "size": 82,
                "browser_download_url": "https://github.com/TimmyAmant/marquee/releases/download/v0.30.0/Marquee-mac.zip.sha256",
            ]]
        }))
    }

    private func workspace() throws -> URL {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("MarqueeTests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: folder) }
        return folder
    }

    private static func hex(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    func testTheDownloadMustMatchItsSizeAndChecksum() async throws {
        let body = Data((0..<700_000).map { UInt8($0 % 251) })
        StubURLProtocol.handler = { _ in (200, ["Content-Type": "application/zip"], body) }
        let service = UpdateService(session: StubURLProtocol.session())
        let folder = try workspace()

        let good = try update(size: body.count, sha256: Self.hex(body))
        let file = try await service.download(good, sha256: Self.hex(body), into: folder) { _ in }
        XCTAssertEqual(try Data(contentsOf: file), body)

        do {
            _ = try await service.download(good, sha256: String(repeating: "0", count: 64), into: folder) { _ in }
            XCTFail("A wrong checksum must be refused")
        } catch {
            XCTAssertEqual(error as? UpdateError, .checksumMismatch)
        }

        do {
            let short = try update(size: body.count + 1, sha256: Self.hex(body))
            _ = try await service.download(short, sha256: Self.hex(body), into: folder) { _ in }
            XCTFail("A wrong size must be refused")
        } catch {
            XCTAssertEqual(error as? UpdateError, .sizeMismatch)
        }
    }

    func testTheChecksumFileIsReadWhenThereIsNoDigest() async throws {
        let hex = String(repeating: "cd", count: 32)
        StubURLProtocol.handler = { request in
            XCTAssertEqual(request.url?.lastPathComponent, "Marquee-mac.zip.sha256")
            return (200, ["Content-Type": "application/octet-stream"], Data("\(hex)  Marquee-mac.zip\n".utf8))
        }
        let expected = try await UpdateService(session: StubURLProtocol.session()).expectedSHA256(for: update(size: 10, sha256: nil))
        XCTAssertEqual(expected, hex)
    }

    func testADownloadFromAnotherHostIsRefused() async throws {
        StubURLProtocol.handler = { _ in (200, [:], Data("x".utf8)) }
        StubURLProtocol.requests = []
        let evil = try update(size: 1, sha256: String(repeating: "0", count: 64), download: "https://example.com/Marquee-mac.zip")
        do {
            _ = try await UpdateService(session: StubURLProtocol.session()).download(evil, sha256: evil.sha256!, into: workspace()) { _ in }
            XCTFail("Expected untrustedHost")
        } catch {
            XCTAssertEqual(error as? UpdateError, .untrustedHost("example.com"))
        }
        XCTAssertFalse(StubURLProtocol.requests.contains { $0.url?.host == "example.com" }, "Nothing is fetched from it")
    }

    func testARedirectAwayFromGitHubIsRefused() async throws {
        RedirectingURLProtocol.target = URL(string: "https://example.com/Marquee-mac.zip")!
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [RedirectingURLProtocol.self]
        let service = UpdateService(session: URLSession(configuration: configuration))
        let redirected = try update(size: 1, sha256: String(repeating: "0", count: 64))
        do {
            _ = try await service.download(redirected, sha256: redirected.sha256!, into: workspace()) { _ in }
            XCTFail("Expected untrustedHost")
        } catch {
            XCTAssertEqual(error as? UpdateError, .untrustedHost("example.com"))
        }
        XCTAssertFalse(RedirectingURLProtocol.servedTarget, "The other host is never asked")
    }

    @MainActor
    func testChecksAgainstGitHub() async throws {
        let release = try GitHubReleaseTests.fixture()
        StubURLProtocol.handler = { request in
            XCTAssertEqual(request.url, UpdateService.latestReleaseURL)
            XCTAssertEqual(request.value(forHTTPHeaderField: "Accept"), "application/vnd.github+json")
            return (200, ["Content-Type": "application/json"], release)
        }
        let defaults = UserDefaults(suiteName: "marquee.tests.updater.\(UUID().uuidString)")!
        let service = UpdateService(session: StubURLProtocol.session())

        let older = Updater(service: service, currentVersion: AppVersion("0.29.0"), defaults: defaults)
        var announced: [String] = []
        older.onNewUpdate = { announced.append($0.version.description) }
        guard case let .available(update) = await older.check() else { return XCTFail("0.30.0 is newer than 0.29.0") }
        XCTAssertEqual(update.version.description, "0.30.0")
        XCTAssertEqual(older.phase, .available)
        await older.check()
        XCTAssertEqual(announced, ["0.30.0"], "The banner comes once per version")

        let same = Updater(service: service, currentVersion: AppVersion("0.30.0"), defaults: defaults)
        guard case .upToDate = await same.check() else { return XCTFail("0.30.0 is the latest") }
        XCTAssertNil(same.update)
        XCTAssertEqual(same.phase, .upToDate)

        StubURLProtocol.handler = { _ in (404, ["Content-Type": "application/json"], Data(#"{"message":"Not Found"}"#.utf8)) }
        let none = Updater(service: service, currentVersion: AppVersion("0.29.0"), defaults: defaults)
        guard case .failed(.noDownload) = await none.check() else { return XCTFail("No release yet") }

        StubURLProtocol.handler = { _ in throw URLError(.notConnectedToInternet) }
        guard case .failed(.unreachable) = await older.check() else { return XCTFail("Offline") }
        XCTAssertEqual(older.update?.version.description, "0.30.0", "A failed recheck keeps the update it found")
        XCTAssertEqual(older.phase, .available)
    }
}

/// Answers github.com with a redirect to `target`, and records whether the
/// target was ever asked.
final class RedirectingURLProtocol: URLProtocol {
    nonisolated(unsafe) static var target: URL?
    nonisolated(unsafe) static var servedTarget = false

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let url = request.url, let target = Self.target else {
            client?.urlProtocol(self, didFailWithError: URLError(.badURL))
            return
        }
        if url.host == "github.com" {
            let redirect = HTTPURLResponse(url: url, statusCode: 302, httpVersion: "HTTP/1.1", headerFields: ["Location": target.absoluteString])!
            client?.urlProtocol(self, wasRedirectedTo: URLRequest(url: target), redirectResponse: redirect)
            client?.urlProtocol(self, didFailWithError: URLError(.cancelled))
        } else {
            Self.servedTarget = true
            let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: [:])!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: Data("x".utf8))
            client?.urlProtocolDidFinishLoading(self)
        }
    }

    override func stopLoading() {}
}

final class UpdateInstallerTests: XCTestCase {
    private func folder() throws -> URL {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("MarqueeTests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: folder) }
        return folder
    }

    /// A folder shaped like an app: Contents/Info.plist and a marker file.
    @discardableResult
    private func fakeApp(at app: URL, identifier: String = "com.timmyamant.Marquee", version: String = "0.30.0", marker: String = "") throws -> URL {
        let contents = app.appendingPathComponent("Contents")
        try FileManager.default.createDirectory(at: contents, withIntermediateDirectories: true)
        let info: [String: Any] = ["CFBundleIdentifier": identifier, "CFBundleShortVersionString": version]
        try PropertyListSerialization.data(fromPropertyList: info, format: .xml, options: 0).write(to: contents.appendingPathComponent("Info.plist"))
        try Data(marker.utf8).write(to: contents.appendingPathComponent("marker"))
        return app
    }

    private func marker(_ app: URL) -> String? {
        (try? Data(contentsOf: app.appendingPathComponent("Contents/marker"))).map { String(decoding: $0, as: UTF8.self) }
    }

    // MARK: What

    func testOnlyTheReleasedMarqueeIsAccepted() throws {
        let version = try XCTUnwrap(AppVersion("0.30.0"))
        let trusting: (URL) -> Bool = { _ in true }

        let empty = try folder()
        XCTAssertThrowsError(try UpdateInstaller.validatedApp(in: empty, expecting: version, verifySignature: trusting)) {
            XCTAssertEqual($0 as? UpdateError, .invalidApp("there's no Marquee.app in it"))
        }

        let other = try folder()
        try fakeApp(at: other.appendingPathComponent("Marquee.app"), identifier: "com.example.NotMarquee")
        XCTAssertThrowsError(try UpdateInstaller.validatedApp(in: other, expecting: version, verifySignature: trusting)) {
            XCTAssertEqual($0 as? UpdateError, .invalidApp("it's a different app"))
        }

        let stale = try folder()
        try fakeApp(at: stale.appendingPathComponent("Marquee.app"), version: "0.29.0")
        XCTAssertThrowsError(try UpdateInstaller.validatedApp(in: stale, expecting: version, verifySignature: trusting)) {
            XCTAssertEqual($0 as? UpdateError, .invalidApp("it's version 0.29.0, not 0.30.0"))
        }

        let good = try folder()
        let app = try fakeApp(at: good.appendingPathComponent("Marquee.app"))
        XCTAssertEqual(try UpdateInstaller.validatedApp(in: good, expecting: version, verifySignature: trusting).path, app.path)
        XCTAssertThrowsError(try UpdateInstaller.validatedApp(in: good, expecting: version, verifySignature: { _ in false })) {
            XCTAssertEqual($0 as? UpdateError, .invalidApp("its code signature doesn't check out"))
        }
        XCTAssertFalse(UpdateInstaller.signatureVerifies(app), "An unsigned folder fails the real codesign check")
    }

    func testTheRealSignatureCheckPassesThisBuild() throws {
        // The app hosting these tests: signed as CI signs it (ad hoc).
        let host = Bundle.main.bundleURL
        XCTAssertEqual(host.lastPathComponent, "Marquee.app")
        XCTAssertTrue(UpdateInstaller.signatureVerifies(host))
    }

    func testTheReleaseZipUnpacksAndValidates() async throws {
        // A copy of this build stamped 0.30.0 and re-signed, zipped the way CI
        // does, stands in for a release download.
        let work = try folder()
        let build = work.appendingPathComponent("build/Marquee.app")
        try FileManager.default.createDirectory(at: build.deletingLastPathComponent(), withIntermediateDirectories: true)
        try FileManager.default.copyItem(at: Bundle.main.bundleURL, to: build)
        let infoURL = build.appendingPathComponent("Contents/Info.plist")
        var info = try XCTUnwrap(PropertyListSerialization.propertyList(from: Data(contentsOf: infoURL), format: nil) as? [String: Any])
        info["CFBundleShortVersionString"] = "0.30.0"
        try PropertyListSerialization.data(fromPropertyList: info, format: .binary, options: 0).write(to: infoURL)
        XCTAssertEqual(UpdateInstaller.run("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", build.path]), 0)
        let zip = work.appendingPathComponent("Marquee-mac.zip")
        XCTAssertEqual(UpdateInstaller.run("/usr/bin/ditto", ["-c", "-k", "--keepParent", build.path, zip.path]), 0)

        let app = try await UpdateInstaller.unpack(zip, in: work, expecting: XCTUnwrap(AppVersion("0.30.0")))
        XCTAssertEqual(app.lastPathComponent, "Marquee.app")
        XCTAssertNotEqual(app.deletingLastPathComponent(), build.deletingLastPathComponent(), "Into a fresh folder")

        do {
            _ = try await UpdateInstaller.unpack(zip, in: work, expecting: XCTUnwrap(AppVersion("0.31.0")))
            XCTFail("The zip is 0.30.0, not the 0.31.0 the release claims")
        } catch {
            XCTAssertEqual(error as? UpdateError, .invalidApp("it's version 0.30.0, not 0.31.0"))
        }

        let notAZip = work.appendingPathComponent("broken.zip")
        try Data("not a zip".utf8).write(to: notAZip)
        do {
            _ = try await UpdateInstaller.unpack(notAZip, in: work, expecting: XCTUnwrap(AppVersion("0.30.0")))
            XCTFail("Expected unzipFailed")
        } catch {
            XCTAssertEqual(error as? UpdateError, .unzipFailed)
        }
    }

    // MARK: Where

    func testWhereTheAppCanBeReplaced() {
        let writable: (String) -> Bool = { _ in true }
        XCTAssertNil(UpdateInstaller.blocker(for: URL(fileURLWithPath: "/Applications/Marquee.app"), isWritable: writable))
        XCTAssertNil(UpdateInstaller.blocker(for: URL(fileURLWithPath: "/Users/timmy/Applications/Marquee.app"), isWritable: writable))
        XCTAssertEqual(
            UpdateInstaller.blocker(
                for: URL(fileURLWithPath: "/private/var/folders/xy/abc/T/AppTranslocation/0A1B2C3D-0000-0000-0000-000000000000/d/Marquee.app"),
                isWritable: writable
            ),
            .cannotReplace,
            "Opened straight from Downloads: macOS runs a read-only copy"
        )
        XCTAssertEqual(
            UpdateInstaller.blocker(for: URL(fileURLWithPath: "/Applications/Marquee.app"), isWritable: { _ in false }),
            .cannotReplace,
            "A folder this account can't write to"
        )
        XCTAssertEqual(UpdateInstaller.blocker(for: URL(fileURLWithPath: "/usr/local/bin/marquee"), isWritable: writable), .cannotReplace)
    }

    func testTheWritabilityCheckReadsTheRealFolder() throws {
        let writable = try folder()
        XCTAssertNil(UpdateInstaller.blocker(for: writable.appendingPathComponent("Marquee.app")))
        let locked = try folder()
        try FileManager.default.setAttributes([.posixPermissions: 0o555], ofItemAtPath: locked.path)
        addTeardownBlock { try? FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: locked.path) }
        XCTAssertEqual(UpdateInstaller.blocker(for: locked.appendingPathComponent("Marquee.app")), .cannotReplace)
    }

    // MARK: The swap, for real

    /// `swapScript` in `folder`, plus a stand-in for `open` that writes down
    /// what it was asked to open.
    private func scriptAndOpener(in folder: URL) throws -> (script: URL, opener: URL, opened: URL) {
        let script = folder.appendingPathComponent("swap.sh")
        try UpdateInstaller.swapScript.write(to: script, atomically: true, encoding: .utf8)
        let opened = folder.appendingPathComponent("opened.txt")
        let opener = folder.appendingPathComponent("fake-open.sh")
        try "#!/bin/sh\nprintf '%s' \"$1\" > '\(opened.path)'\n".write(to: opener, atomically: true, encoding: .utf8)
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: opener.path)
        return (script, opener, opened)
    }

    /// A process standing in for the running app.
    private func sleepingApp(seconds: String) throws -> Process {
        let app = Process()
        app.executableURL = URL(fileURLWithPath: "/bin/sleep")
        app.arguments = [seconds]
        try app.run()
        return app
    }

    private func runScript(_ script: URL, opener: URL, _ arguments: [String]) throws -> Int32 {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/sh")
        process.arguments = [script.path] + arguments
        process.environment = ["MARQUEE_UPDATE_OPEN": opener.path, "PATH": "/usr/bin:/bin:/usr/sbin:/sbin"]
        process.standardError = FileHandle.nullDevice
        process.standardOutput = FileHandle.nullDevice
        try process.run()
        process.waitUntilExit()
        return process.terminationStatus
    }

    func testTheScriptWaitsForTheAppThenSwapsItIn() throws {
        let root = try folder()
        let current = try fakeApp(at: root.appendingPathComponent("Applications/Marquee.app"), version: "0.29.0", marker: "old")
        let new = try fakeApp(at: root.appendingPathComponent("download/unpacked/Marquee.app"), marker: "new")
        let (script, opener, opened) = try scriptAndOpener(in: root)

        let app = try sleepingApp(seconds: "1")
        let started = Date()
        XCTAssertEqual(try runScript(script, opener: opener, [String(app.processIdentifier), current.path, new.path]), 0)
        XCTAssertFalse(app.isRunning, "It only swapped once the app had quit")
        XCTAssertGreaterThanOrEqual(Date().timeIntervalSince(started), 0.8)

        XCTAssertEqual(marker(current), "new", "The new app is where the old one was")
        XCTAssertFalse(FileManager.default.fileExists(atPath: new.path), "Moved, not copied")
        XCTAssertFalse(FileManager.default.fileExists(atPath: current.path + ".old"), "The old one is gone")
        XCTAssertEqual(try String(contentsOf: opened, encoding: .utf8), current.path, "And it was opened")
    }

    func testIfTheNewAppCantGoInTheOldOneComesBack() throws {
        let root = try folder()
        let current = try fakeApp(at: root.appendingPathComponent("Applications/Marquee.app"), version: "0.29.0", marker: "old")
        let missing = root.appendingPathComponent("download/unpacked/Marquee.app")
        let (script, opener, opened) = try scriptAndOpener(in: root)

        let app = try sleepingApp(seconds: "0.2")
        XCTAssertEqual(try runScript(script, opener: opener, [String(app.processIdentifier), current.path, missing.path]), 1)
        XCTAssertEqual(marker(current), "old", "Restored")
        XCTAssertFalse(FileManager.default.fileExists(atPath: current.path + ".old"))
        XCTAssertEqual(try String(contentsOf: opened, encoding: .utf8), current.path, "The old one reopens")
    }

    func testTheScriptRefusesAnythingButAnApp() throws {
        let root = try folder()
        let (script, opener, _) = try scriptAndOpener(in: root)
        let notAnApp = root.appendingPathComponent("Documents")
        try FileManager.default.createDirectory(at: notAnApp, withIntermediateDirectories: true)
        XCTAssertEqual(try runScript(script, opener: opener, ["1", notAnApp.path, root.path]), 2)
        XCTAssertTrue(FileManager.default.fileExists(atPath: notAnApp.path), "Untouched")
    }

    func testTheDetachedLaunchOutlivesItsLauncher() throws {
        // What the app does: `launchSwap` returns at once, and the script
        // carries on by itself after the "app" quits.
        let root = try folder()
        let current = try fakeApp(at: root.appendingPathComponent("Applications/Marquee.app"), version: "0.29.0", marker: "old")
        let new = try fakeApp(at: root.appendingPathComponent("download/Marquee.app"), marker: "new")
        let (_, opener, opened) = try scriptAndOpener(in: root)

        let app = try sleepingApp(seconds: "0.5")
        setenv("MARQUEE_UPDATE_OPEN", opener.path, 1)
        defer { unsetenv("MARQUEE_UPDATE_OPEN") }
        try UpdateInstaller.launchSwap(current: current, new: new, pid: app.processIdentifier, workspace: root)
        XCTAssertTrue(app.isRunning, "launchSwap didn't wait for the app")

        let deadline = Date().addingTimeInterval(10)
        while !FileManager.default.fileExists(atPath: opened.path), Date() < deadline {
            Thread.sleep(forTimeInterval: 0.05)
        }
        XCTAssertEqual(marker(current), "new")
        XCTAssertEqual(try? String(contentsOf: opened, encoding: .utf8), current.path)
        let log = try String(contentsOf: root.appendingPathComponent("update.log"), encoding: .utf8)
        XCTAssertTrue(log.contains("Updated \(current.path)."), log)
    }
}

final class SandboxMigrationTests: XCTestCase {
    func testTheContainersSettingsComeAcrossOnce() throws {
        let suite = "marquee.tests.migration.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        addTeardownBlock { UserDefaults().removePersistentDomain(forName: suite) }
        defaults.set("http://tower.local:3000", forKey: "marquee-theme")

        let plist = FileManager.default.temporaryDirectory.appendingPathComponent("\(suite).plist")
        addTeardownBlock { try? FileManager.default.removeItem(at: plist) }
        let watermark = Date(timeIntervalSince1970: 1_790_000_000)
        let old: [String: Any] = [
            "marquee.server.baseURL": "http://192.168.1.20:3000",
            "marquee-theme": "dark",
            "marquee.notifications.watermark.http://192.168.1.20:3000|abc": watermark,
            "marquee.notifications.choice.http://192.168.1.20:3000|abc": "on",
        ]
        try PropertyListSerialization.data(fromPropertyList: old, format: .binary, options: 0).write(to: plist)

        XCTAssertEqual(SandboxMigration.run(defaults: defaults, containerPreferences: plist), 3)
        XCTAssertEqual(defaults.string(forKey: "marquee.server.baseURL"), "http://192.168.1.20:3000")
        XCTAssertEqual(defaults.object(forKey: "marquee.notifications.watermark.http://192.168.1.20:3000|abc") as? Date, watermark)
        XCTAssertEqual(defaults.string(forKey: "marquee-theme"), "http://tower.local:3000", "What's already set here wins")
        XCTAssertTrue(defaults.bool(forKey: SandboxMigration.markerKey))

        defaults.removeObject(forKey: "marquee.server.baseURL")
        XCTAssertEqual(SandboxMigration.run(defaults: defaults, containerPreferences: plist), 0, "Only ever once")
        XCTAssertNil(defaults.string(forKey: "marquee.server.baseURL"))
    }

    func testNoContainerIsFine() throws {
        let suite = "marquee.tests.migration.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        addTeardownBlock { UserDefaults().removePersistentDomain(forName: suite) }
        let nowhere = FileManager.default.temporaryDirectory.appendingPathComponent("no-such-\(UUID().uuidString).plist")
        XCTAssertEqual(SandboxMigration.run(defaults: defaults, containerPreferences: nowhere), 0)
        XCTAssertTrue(defaults.bool(forKey: SandboxMigration.markerKey), "A fresh install doesn't look again")
    }
}

final class KeychainTokenStorePlanTests: XCTestCase {
    private let server = "http://192.168.1.20:3000"
    private let thisBuild = #"cdhash H"989f7575929aedf28ecbc9b252b807cac3d19090""#
    private let earlierBuild = #"cdhash H"5baa85d00f27996aa5ae42e8ec65da8a133a0324""#

    func testThisBuildReadsOnlyItsOwnItem() {
        let items = [
            Keychain.Item(account: server, comment: nil),
            Keychain.Item(account: "\(server) #1a2b3c4d", comment: thisBuild),
            Keychain.Item(account: "http://other:3000", comment: thisBuild),
        ]
        XCTAssertEqual(KeychainTokenStore.readPlan(items, server: server, identity: thisBuild), .read(account: "\(server) #1a2b3c4d"))
        XCTAssertEqual(KeychainTokenStore.readPlan([], server: server, identity: thisBuild), .missing)
    }

    func testAnEarlierBuildsItemIsNeverRead() {
        // Reading it would bring up macOS's password prompt: sign in instead.
        let legacy = [Keychain.Item(account: server, comment: nil)]
        XCTAssertEqual(KeychainTokenStore.readPlan(legacy, server: server, identity: thisBuild), .earlierBuild)
        let tagged = [Keychain.Item(account: "\(server) #0f0f0f0f", comment: earlierBuild)]
        XCTAssertEqual(KeychainTokenStore.readPlan(tagged, server: server, identity: thisBuild), .earlierBuild)
        XCTAssertEqual(
            KeychainTokenStore.readPlan([Keychain.Item(account: "\(server)/other", comment: nil)], server: server, identity: thisBuild),
            .missing,
            "Another server's item isn't this one's"
        )
    }

    func testSavingNextToAnEarlierBuildsItem() {
        let tag = CodeIdentity.tag(thisBuild)
        XCTAssertEqual(tag.count, 8)
        XCTAssertEqual(KeychainTokenStore.savePlan([], server: server, identity: thisBuild), .add(account: server))
        XCTAssertEqual(
            KeychainTokenStore.savePlan([Keychain.Item(account: server, comment: nil)], server: server, identity: thisBuild),
            .add(account: "\(server) #\(tag)"),
            "The earlier build's item can't be deleted, so this build's goes beside it"
        )
        XCTAssertEqual(
            KeychainTokenStore.savePlan([Keychain.Item(account: server, comment: thisBuild)], server: server, identity: thisBuild),
            .update(account: server)
        )
        XCTAssertEqual(
            KeychainTokenStore.savePlan(
                [Keychain.Item(account: server, comment: earlierBuild), Keychain.Item(account: "\(server) #\(tag)", comment: thisBuild)],
                server: server, identity: thisBuild
            ),
            .update(account: "\(server) #\(tag)")
        )
    }

    func testWithoutAnIdentityItBehavesAsBefore() {
        let legacy = [Keychain.Item(account: server, comment: nil)]
        XCTAssertEqual(KeychainTokenStore.readPlan(legacy, server: server, identity: nil), .read(account: server))
        XCTAssertEqual(KeychainTokenStore.savePlan(legacy, server: server, identity: nil), .update(account: server))
    }

    func testThisBuildHasAnIdentity() {
        XCTAssertNotNil(CodeIdentity.current)
    }
}
