import Testing
import Foundation
@testable import Marquee

/// Regression cover for the spontaneous sign-out: a token store that couldn't be
/// read was indistinguishable from an account that had signed out, and the
/// answer was cached, so one transient failure showed the sign-in card for the
/// rest of the launch even though the saved token was still there and valid.
@MainActor
struct SessionRecoveryTests {
    private static let server = try! ServerAddress.parse("127.0.0.1:3100")

    private func defaults() -> UserDefaults {
        let suite = UserDefaults(suiteName: "marquee.tests.recovery.\(UUID().uuidString)")!
        suite.set(Self.server.baseURLString, forKey: ServerSession.serverDefaultsKey)
        return suite
    }

    @Test func aFailedReadIsNotCachedAsSignedOut() {
        let store = FlakyTokenStore(token: "mqt_saved", failuresBeforeSuccess: 1)
        let session = ServerSession(defaults: defaults(), tokenStore: store)

        // First read fails: no token to offer, but say why rather than
        // pretending the account signed out.
        #expect(session.hasToken == false)
        #expect(session.tokenUnavailable)
        #expect(store.deletions.isEmpty, "A read failure must never delete the saved token")

        // Nothing was latched, so the next read finds it.
        #expect(session.hasToken)
        #expect(session.tokenUnavailable == false)
        #expect(store.lookups == 2)
    }

    @Test func aPersistentlyUnreadableStoreStillDoesNotDeleteAnything() {
        let store = FlakyTokenStore(token: "mqt_saved", failuresBeforeSuccess: .max)
        let session = ServerSession(defaults: defaults(), tokenStore: store)

        #expect(session.hasToken == false)
        #expect(session.tokenUnavailable)
        #expect(session.hasToken == false, "Still retried, still not cached")
        #expect(store.lookups == 2)
        #expect(store.deletions.isEmpty)
    }

    @Test func aMissingTokenIsCachedAndIsNotReportedAsUnavailable() {
        let store = FlakyTokenStore(token: nil, failuresBeforeSuccess: 0)
        let session = ServerSession(defaults: defaults(), tokenStore: store)

        #expect(session.hasToken == false)
        #expect(session.tokenUnavailable == false)
        _ = session.hasToken
        #expect(store.lookups == 1, "A definitive answer is read once")
    }

    @Test func theDefaultLookupMapsAnEmptyStoreToMissing() {
        let store = InMemoryTokenStore()
        #expect(store.lookup(for: Self.server.baseURLString) == .missing)
        store.save("mqt_x", for: Self.server.baseURLString)
        #expect(store.lookup(for: Self.server.baseURLString) == .found("mqt_x"))
    }
}

/// Fails `lookup` the first `failuresBeforeSuccess` times, the way a
/// store that can't be read (a permissions or disk error) does.
private final class FlakyTokenStore: TokenStore {
    private let storedToken: String?
    private let failuresBeforeSuccess: Int
    private(set) var lookups = 0
    private(set) var deletions: [String] = []

    init(token: String?, failuresBeforeSuccess: Int) {
        storedToken = token
        self.failuresBeforeSuccess = failuresBeforeSuccess
    }

    func lookup(for server: String) -> TokenLookup {
        lookups += 1
        if lookups <= failuresBeforeSuccess { return .unavailable }
        return storedToken.map(TokenLookup.found) ?? .missing
    }

    func token(for server: String) -> String? {
        if case let .found(value) = lookup(for: server) { return value }
        return nil
    }

    func save(_ token: String, for server: String) -> Bool { true }

    func delete(for server: String) {
        deletions.append(server)
    }
}

/// The user's own action must not look like the server changing underneath
/// them — that distinction is what keeps a screen from re-fetching (and
/// re-scrolling) after a button press on that screen.
@MainActor
struct ServerEventSourceTests {
    @Test func aMutationMovesOnlyTheLocalRevision() {
        let events = ServerEvents()
        events.record([.library, .requests], source: .mutation)

        #expect(events.revision(of: .library) == 1)
        #expect(events.revision(of: .requests) == 1)
        #expect(events.remoteRevision(of: .library) == 0)
        #expect(events.remoteRevision(of: [.library, .requests]) == 0)
    }

    @Test func aServerChangeMovesBoth() {
        let events = ServerEvents()
        events.record(.notifications, source: .server)

        #expect(events.revision(of: .notifications) == 1)
        #expect(events.remoteRevision(of: .notifications) == 1)
        #expect(events.remoteRevision(of: .library) == 0)
    }

    @Test func unrelatedAreasStayStill() {
        let events = ServerEvents()
        events.record(.favorites, source: .server)

        #expect(events.remoteRevision(of: .favorites) == 1)
        #expect(events.remoteRevision(of: [.library, .requests, .settings, .users]) == 0)
        #expect(events.revision(of: .all) == 1)
    }
}
