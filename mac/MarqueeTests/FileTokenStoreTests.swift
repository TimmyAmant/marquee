import Foundation
import XCTest
@testable import Marquee

/// The saved sign-in: a private file instead of the login Keychain, so an
/// update (a new ad-hoc signed build) stays signed in with no password prompt.
final class FileTokenStoreTests: XCTestCase {
    private let server = "http://192.168.1.20:3000"
    private let other = "https://marquee.example.com"
    private var directory: URL!

    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("marquee-sessions-\(UUID().uuidString)", isDirectory: true)
            .appendingPathComponent("Marquee", isDirectory: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: directory.deletingLastPathComponent())
    }

    /// Never touches the real Keychain; records whether it was asked.
    private func store(migrating token: String? = nil, asked: LockedCounter? = nil) -> FileTokenStore {
        FileTokenStore(directory: directory) { _, persist in
            asked?.increment()
            guard let token else { return nil }
            return persist(token) ? token : nil
        }
    }

    private func permissions(_ url: URL) throws -> Int {
        let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
        return (attributes[.posixPermissions] as? NSNumber)?.intValue ?? -1
    }

    func testSaveLookupAndDelete() {
        let store = store()
        XCTAssertEqual(store.lookup(for: server), .missing)
        XCTAssertTrue(store.save("mqt_one", for: server))
        XCTAssertTrue(store.save("mqt_two", for: other))
        XCTAssertEqual(store.lookup(for: server), .found("mqt_one"))
        XCTAssertEqual(store.token(for: other), "mqt_two")

        XCTAssertTrue(store.save("mqt_three", for: server))
        XCTAssertEqual(store.token(for: server), "mqt_three", "Signing in again replaces the token")

        store.delete(for: server)
        XCTAssertEqual(store.lookup(for: server), .missing)
        XCTAssertEqual(store.token(for: other), "mqt_two", "Signing out of one server keeps the others")
    }

    func testTheFileIsPrivateAndNotBackedUp() throws {
        let store = store()
        XCTAssertTrue(store.save("mqt_secret", for: server))
        XCTAssertEqual(try permissions(store.fileURL), 0o600)
        XCTAssertEqual(try permissions(directory), 0o700)
        XCTAssertEqual(try store.fileURL.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup, true)
        XCTAssertEqual(try directory.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup, true)

        // Rewrites keep it private, and leave no temp files behind.
        store.delete(for: server)
        XCTAssertTrue(store.save("mqt_again", for: server))
        XCTAssertEqual(try permissions(store.fileURL), 0o600)
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: directory.path), [FileTokenStore.fileName])
    }

    func testAnExistingLooseFolderIsTightened() throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o755])
        XCTAssertTrue(store().save("mqt_x", for: server))
        XCTAssertEqual(try permissions(directory), 0o700)
    }

    /// An update or a relaunch is just a new store over the same file.
    func testTokensSurviveANewInstance() {
        XCTAssertTrue(store().save("mqt_kept", for: server))
        XCTAssertEqual(FileTokenStore(directory: directory).lookup(for: server), .found("mqt_kept"))
    }

    func testADamagedFileIsMissingNotACrash() throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let store = store()
        for junk in ["", "not json", #"{"tokens": 42}"#, "[1,2,3]"] {
            try Data(junk.utf8).write(to: store.fileURL)
            XCTAssertEqual(store.lookup(for: server), .missing, junk)
        }
        XCTAssertTrue(store.save("mqt_fixed", for: server), "The next sign-in writes a good file over it")
        XCTAssertEqual(store.lookup(for: server), .found("mqt_fixed"))
    }

    func testAnUnreadableFileIsUnavailableAndNotOverwritten() throws {
        let store = store()
        XCTAssertTrue(store.save("mqt_other", for: other))
        try FileManager.default.setAttributes([.posixPermissions: 0o000], ofItemAtPath: store.fileURL.path)
        defer { try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: store.fileURL.path) }

        XCTAssertEqual(store.lookup(for: server), .unavailable, "Not the same as signed out")
        XCTAssertFalse(store.save("mqt_new", for: server), "Writing would lose the other server's token")
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: store.fileURL.path)
        XCTAssertEqual(store.token(for: other), "mqt_other")
    }

    func testAnEmptyTokenIsMissing() {
        let store = store()
        XCTAssertTrue(store.save("", for: server))
        XCTAssertEqual(store.lookup(for: server), .missing)
    }

    // MARK: Moving a token out of the Keychain

    func testTheKeychainIsOnlyAskedBeforeTheFileExists() {
        let asked = LockedCounter()
        let store = store(migrating: "mqt_from_keychain", asked: asked)
        XCTAssertEqual(store.lookup(for: server), .found("mqt_from_keychain"))
        XCTAssertEqual(asked.value, 1)
        XCTAssertEqual(FileTokenStore(directory: directory).lookup(for: server), .found("mqt_from_keychain"), "It moved into the file")

        store.delete(for: server)
        XCTAssertEqual(store.lookup(for: server), .missing, "Signed out stays signed out")
        XCTAssertEqual(asked.value, 1, "Once there's a file, the Keychain is never touched again")
    }

    func testNothingInTheKeychainIsJustMissing() {
        let asked = LockedCounter()
        let store = store(asked: asked)
        XCTAssertEqual(store.lookup(for: server), .missing)
        XCTAssertEqual(asked.value, 1)
        XCTAssertTrue(store.save("mqt_signed_in", for: server))
        XCTAssertEqual(store.lookup(for: server), .found("mqt_signed_in"))
        XCTAssertEqual(asked.value, 1)
    }

    func testOnlyThisBuildsOwnKeychainItemIsRead() {
        let thisBuild = #"cdhash H"989f7575929aedf28ecbc9b252b807cac3d19090""#
        let earlierBuild = #"cdhash H"5baa85d00f27996aa5ae42e8ec65da8a133a0324""#
        let items = [
            Keychain.Item(account: server, comment: nil),
            Keychain.Item(account: "\(server) #0f0f0f0f", comment: earlierBuild),
            Keychain.Item(account: "\(server) #1a2b3c4d", comment: thisBuild),
            Keychain.Item(account: other, comment: thisBuild),
        ]
        XCTAssertEqual(KeychainSessionMigration.account(in: items, server: server, identity: thisBuild), "\(server) #1a2b3c4d")
        XCTAssertEqual(KeychainSessionMigration.account(in: items, server: other, identity: thisBuild), other)

        // Reading any of these would bring up macOS's password prompt.
        XCTAssertNil(KeychainSessionMigration.account(in: Array(items.prefix(2)), server: server, identity: thisBuild))
        XCTAssertNil(KeychainSessionMigration.account(in: items, server: server, identity: nil), "An unknown identity reads nothing")
        XCTAssertNil(KeychainSessionMigration.account(in: [], server: server, identity: thisBuild))
        XCTAssertNil(
            KeychainSessionMigration.account(
                in: [Keychain.Item(account: "\(server)/other", comment: thisBuild)], server: server, identity: thisBuild
            ),
            "Another server's item isn't this one's"
        )
    }

    func testWithoutAnIdentityTheKeychainIsNeverOpened() {
        var persisted = false
        XCTAssertNil(KeychainSessionMigration.take(server: server, identity: nil) { _ in
            persisted = true
            return true
        })
        XCTAssertFalse(persisted)
    }

    func testThisBuildHasAnIdentity() {
        XCTAssertNotNil(CodeIdentity.current)
    }

    /// The app's real store lives in Application Support, not the container
    /// or anywhere shared.
    func testTheDefaultLocation() {
        let url = FileTokenStore().fileURL
        XCTAssertTrue(url.path.hasSuffix("/Library/Application Support/Marquee/sessions.json"), url.path)
    }
}
