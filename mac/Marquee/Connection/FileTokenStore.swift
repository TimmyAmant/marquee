import Darwin
import Foundation
import OSLog

/// This Mac's session tokens in a private file,
/// `~/Library/Application Support/Marquee/sessions.json`, keyed by server
/// base URL.
///
/// Why not the login Keychain: Marquee is ad-hoc signed (no Apple developer
/// account), so every update is new code to macOS, and a login-keychain item
/// only trusts the exact build that wrote it. Each update meant signing in
/// again, and touching an earlier build's item brought up "Marquee wants to
/// use your confidential information…" password prompts. A token here is a
/// per-device session the server can revoke (Settings → Devices, or Sign
/// Out), so a file only this user can read is the accepted trade-off — the
/// same one `gh`, `docker` and most CLIs make. It survives updates and
/// relaunches: you stay signed in until you sign out or the server revokes
/// this Mac.
///
/// The folder is 0700 and the file 0600, written atomically (a 0600 temp
/// file renamed over it), and both are excluded from Time Machine.
struct FileTokenStore: TokenStore {
    static let fileName = "sessions.json"

    static var defaultDirectory: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support", isDirectory: true) // i18n-ignore
        return base.appendingPathComponent("Marquee", isDirectory: true)
    }

    private static let logger = Logger(subsystem: "com.timmyamant.Marquee", category: "session")

    let directory: URL

    init(directory: URL = FileTokenStore.defaultDirectory) {
        self.directory = directory
    }

    var fileURL: URL { directory.appendingPathComponent(Self.fileName, isDirectory: false) }

    /// The file's shape. `version` leaves room to change it.
    struct Contents: Codable, Equatable {
        var version = 1
        var tokens: [String: String] = [:]
    }

    enum ReadResult: Equatable {
        case found(Contents)
        /// No file yet.
        case noFile
        /// The file is there but couldn't be read (permissions, I/O).
        case unreadable
    }

    func read() -> ReadResult {
        let data: Data
        do {
            data = try Data(contentsOf: fileURL)
        } catch let error as CocoaError where error.code == .fileReadNoSuchFile {
            return .noFile
        } catch {
            Self.logger.error("Couldn't read the saved sessions: \(error.localizedDescription, privacy: .public)")
            return .unreadable
        }
        guard let contents = try? JSONDecoder().decode(Contents.self, from: data) else {
            // Damaged (or not ours): no saved session, sign in again. The
            // next save writes a good file over it.
            Self.logger.error("The saved sessions file is damaged; ignoring it")
            return .found(Contents())
        }
        return .found(contents)
    }

    func lookup(for server: String) -> TokenLookup {
        switch read() {
        case let .found(contents):
            guard let token = contents.tokens[server], !token.isEmpty else { return .missing }
            return .found(token)
        case .unreadable:
            return .unavailable
        case .noFile:
            return .missing
        }
    }

    func token(for server: String) -> String? {
        if case let .found(token) = lookup(for: server) { return token }
        return nil
    }

    @discardableResult
    func save(_ token: String, for server: String) -> Bool {
        var contents = Contents()
        switch read() {
        case let .found(existing): contents = existing
        case .noFile: break
        // Don't write over a file that may still hold other servers' tokens.
        case .unreadable: return false
        }
        contents.tokens[server] = token
        return write(contents)
    }

    /// Signing out must never leave the token on disk: when the file can't
    /// be read or rewritten, it's removed outright, at the cost of other
    /// servers' sign-ins (they sign in again), and a file left with no
    /// tokens (or a damaged one) goes too.
    func delete(for server: String) {
        switch read() {
        case .noFile:
            return
        case .unreadable:
            removeFile()
        case var .found(contents):
            contents.tokens[server] = nil
            if contents.tokens.isEmpty || !write(contents) {
                removeFile()
            }
        }
    }

    private func removeFile() {
        guard unlink(fileURL.path) == 0 || errno == ENOENT else {
            Self.logger.error("Couldn't remove the saved sessions: \(String(cString: strerror(errno)), privacy: .public)")
            return
        }
    }

    // MARK: Writing

    @discardableResult
    private func write(_ contents: Contents) -> Bool {
        do {
            try prepareDirectory()
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
            try Self.writeAtomically(try encoder.encode(contents), to: fileURL)
            var file = fileURL
            Self.excludeFromBackup(&file)
            return true
        } catch {
            Self.logger.error("Couldn't save the session: \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    private func prepareDirectory() throws {
        let manager = FileManager.default
        var isDirectory: ObjCBool = false
        if manager.fileExists(atPath: directory.path, isDirectory: &isDirectory), isDirectory.boolValue {
            try manager.setAttributes([.posixPermissions: 0o700], ofItemAtPath: directory.path)
        } else {
            try manager.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        }
        var folder = directory
        Self.excludeFromBackup(&folder)
    }

    /// A 0600 temp file beside `url`, renamed over it: readers see the old
    /// file or the new one, never half of one, and never a world-readable one.
    private static func writeAtomically(_ data: Data, to url: URL) throws {
        let temp = url.deletingLastPathComponent()
            .appendingPathComponent(".\(url.lastPathComponent).\(UUID().uuidString).tmp", isDirectory: false)
        let fd = open(temp.path, O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC, S_IRUSR | S_IWUSR)
        guard fd >= 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
        var failure: POSIXErrorCode?
        data.withUnsafeBytes { buffer in
            var offset = 0
            while offset < buffer.count {
                let written = Darwin.write(fd, buffer.baseAddress! + offset, buffer.count - offset)
                if written < 0 {
                    if errno == EINTR { continue }
                    failure = POSIXErrorCode(rawValue: errno) ?? .EIO
                    return
                }
                offset += written
            }
        }
        if failure == nil, fsync(fd) != 0 { failure = POSIXErrorCode(rawValue: errno) ?? .EIO }
        close(fd)
        if failure == nil, rename(temp.path, url.path) != 0 { failure = POSIXErrorCode(rawValue: errno) ?? .EIO }
        if let failure {
            unlink(temp.path)
            throw POSIXError(failure)
        }
    }

    private static func excludeFromBackup(_ url: inout URL) {
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? url.setResourceValues(values)
    }
}
