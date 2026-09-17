import Testing
import Foundation
@testable import Marquee

/// A pinned launch (MARQUEE_PINNED_SERVER) must be unable to reach the real
/// server saved on this Mac, or to disturb its saved session.
@MainActor
struct PinnedServerTests {
    private func defaults(_ savedServer: String?) -> UserDefaults {
        let suite = UserDefaults(suiteName: "marquee.tests.pinned.\(UUID().uuidString)")!
        if let savedServer { suite.set(savedServer, forKey: ServerSession.serverDefaultsKey) }
        return suite
    }

    private var pinned: PinnedServer {
        PinnedServer(address: try! ServerAddress.parse("127.0.0.1:3100"), token: "mqt_test")
    }

    @Test func resolvesFromEnvironment() throws {
        let resolved = PinnedServer.resolve(
            environment: [PinnedServer.environmentKey: "127.0.0.1:3100", PinnedServer.tokenEnvironmentKey: "mqt_abc"],
            defaults: defaults(nil)
        )
        #expect(resolved?.address.baseURLString == "http://127.0.0.1:3100")
        #expect(resolved?.token == "mqt_abc")
        #expect(PinnedServer.resolve(environment: [:], defaults: defaults(nil)) == nil)
    }

    @Test func ignoresTheSavedServer() {
        let suite = defaults("http://192.168.1.35:3000")
        let session = ServerSession(defaults: suite, tokenStore: FailingTokenStore(), pinned: pinned)
        #expect(session.server?.baseURLString == "http://127.0.0.1:3100")
        // The seeded token comes from the environment, not the Keychain.
        #expect(session.hasToken)
    }

    @Test func refusesToSwitchServers() {
        let suite = defaults("http://192.168.1.35:3000")
        let session = ServerSession(defaults: suite, tokenStore: FailingTokenStore(), pinned: pinned)
        session.select(try! ServerAddress.parse("192.168.1.35:3000"), info: nil)
        #expect(session.server?.baseURLString == "http://127.0.0.1:3100")
        #expect(suite.string(forKey: ServerSession.serverDefaultsKey) == "http://192.168.1.35:3000")
    }

    @Test func forgetServerLeavesTheSavedServerAlone() {
        let suite = defaults("http://192.168.1.35:3000")
        let session = ServerSession(defaults: suite, tokenStore: FailingTokenStore(), pinned: pinned)
        session.forgetServer()
        #expect(suite.string(forKey: ServerSession.serverDefaultsKey) == "http://192.168.1.35:3000")
        #expect(session.server?.baseURLString == "http://127.0.0.1:3100")
    }
}

/// Stands in for the Keychain: any use at all is a test failure.
private struct FailingTokenStore: TokenStore {
    func token(for server: String) -> String? {
        Issue.record("A pinned session read the Keychain for \(server)")
        return nil
    }

    func save(_ token: String, for server: String) -> Bool {
        Issue.record("A pinned session wrote the Keychain for \(server)")
        return false
    }

    func delete(for server: String) {
        Issue.record("A pinned session deleted the Keychain item for \(server)")
    }
}
