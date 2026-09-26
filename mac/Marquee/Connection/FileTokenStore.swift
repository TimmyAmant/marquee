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
            ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support", isDirectory: true)
        return base.appendingPathComponent("Marquee", isDirectory: true)
    }

    private static let logger = Logger(subsystem: "com.timmyamant.Marquee", category: "session")

    let directory: URL
    /// Runs only while no sessions file exists yet (the first launch of a
    /// build with this store): a token an earlier Marquee kept in the login
    /// Keychain, or nil. `persist` saves it here; the source may be removed
    /// once it returns true.
    private let migrate: (_ server: String, _ persist: (String) -> Bool) -> String?

    init(
        directory: URL = FileTokenStore.defaultDirectory,
        migrate: @escaping (_ server: String, _ persist: (String) -> Bool) -> String? = { server, persist in
            KeychainSessionMigration.take(server: server, persist: persist)
        }
    ) {
        self.directory = directory
        self.migrate = migrate
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
            guard let token = migrate(server, { save($0, for: server) }), !token.isEmpty else { return .missing }
            Self.logger.notice("Moved the saved sign-in for \(server, privacy: .public) out of the login Keychain")
            return .found(token)
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

    func delete(for server: String) {
        guard case var .found(contents) = read(), contents.tokens[server] != nil else { return }
        contents.tokens[server] = nil
        write(contents)
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

/// Moves a session token out of the login Keychain, where earlier versions
/// of Marquee kept it, without ever bringing up a password prompt.
///
/// macOS lets only the build that wrote a login-keychain item read it
/// silently, and each item was marked (`comment`) with the code identity of
/// that build. So the only item read here is this build's own — which exists
/// only when builds share an identity (a Developer ID signature would do
/// that). Another build's item is never read, updated or deleted: each of
/// those can prompt. Such leftovers are harmless, and can be removed by hand
/// in Keychain Access (search for "Marquee server session").
enum KeychainSessionMigration {
    static let service = "com.timmyamant.Marquee.api"

    /// "<server>", or "<server> #<tag>" for an item a later build added.
    static func belongs(_ account: String, to server: String) -> Bool {
        account == server || account.hasPrefix(server + " #")
    }

    /// The account of the one item this build may read for `server`: its own
    /// (`comment == identity`). Nil when there's none, or when this build's
    /// identity is unknown (any read could then prompt).
    static func account(in items: [Keychain.Item], server: String, identity: String?) -> String? {
        guard let identity else { return nil }
        return items.first { belongs($0.account, to: server) && $0.comment == identity }?.account
    }

    /// Reads this build's own item for `server`, hands its token to `persist`
    /// and, once that has saved it, deletes the item.
    static func take(
        server: String,
        identity: String? = CodeIdentity.current,
        persist: (String) -> Bool
    ) -> String? {
        // Listing attributes never prompts, whichever build wrote the items.
        guard identity != nil, case let .found(items) = Keychain.items(service: service),
              let account = account(in: items, server: server, identity: identity),
              case let .found(data) = Keychain.read(service: service, account: account),
              let token = String(data: data, encoding: .utf8), !token.isEmpty
        else { return nil }
        if persist(token) {
            Keychain.delete(service: service, account: account)
        }
        return token
    }
}
