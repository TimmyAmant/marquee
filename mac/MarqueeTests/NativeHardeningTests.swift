import Foundation
import XCTest
@testable import Marquee

/// Links a server hands the app, trailer keys, redirects, plain-http
/// servers off the local network, and clicked notification banners.
final class SafeLinkTests: XCTestCase {
    func testWebLinksAreHttpOrHttpsOnly() {
        XCTAssertEqual(SafeLink.web("http://192.168.1.20:7878/movie/603")?.absoluteString, "http://192.168.1.20:7878/movie/603")
        XCTAssertEqual(SafeLink.web(" https://www.imdb.com/title/tt0133093 ")?.host, "www.imdb.com")
        for refused in [
            "file:///etc/passwd", "javascript:alert(1)", "x-apple.systempreferences:com.apple.preference.security",
            "plex://preplay/?metadataKey=1", "https://user:pass@example.com/", "//example.com/path", "/relative", "", "http://",
        ] {
            XCTAssertNil(SafeLink.web(refused), refused)
        }
        XCTAssertNil(SafeLink.web(nil))
    }

    func testTelegramIsHttpsOnly() {
        XCTAssertNotNil(SafeLink.https("https://t.me/marquee_bot?start=abc"))
        XCTAssertNil(SafeLink.https("http://t.me/marquee_bot?start=abc"))
        XCTAssertNil(SafeLink.https("tg://resolve?domain=marquee_bot"))
    }

    func testPlayLinksAllowOnlyTheMediaServersAppSchemes() {
        XCTAssertNotNil(SafeLink.mediaApp("plex://preplay/?metadataKey=%2Flibrary%2Fmetadata%2F1&metadataType=1&server=abc"))
        XCTAssertNil(SafeLink.mediaApp("https://app.plex.tv/desktop"))
        XCTAssertNil(SafeLink.mediaApp("file:///Applications/Calculator.app"))
        XCTAssertNil(SafeLink.mediaApp("ssh://example.com"))
        XCTAssertNil(SafeLink.mediaApp(nil))

        let link = API.TitleDetail.PlayLink(server: "plex", serverName: nil, label: "Play on Plex", url: "file:///etc/hosts", appUrl: "vnc://example.com")
        XCTAssertNil(link.link)
        XCTAssertNil(link.appLink)
    }

    /// Windows' `SignInWeb.Allows`: https anywhere, plain http only on the
    /// server's own address.
    func testSignInPagesAreHttpsOrTheServersOwnOrigin() throws {
        let server = try XCTUnwrap(URL(string: "http://192.168.1.20:3000"))
        func allows(_ string: String, _ server: URL?) -> Bool {
            SafeLink.allowsSignInPage(URL(string: string)!, server: server)
        }
        XCTAssertTrue(allows("https://auth.example.com/authorize", nil))
        XCTAssertTrue(allows("http://192.168.1.20:3000/auth/sso/continue?h=1", server))
        XCTAssertFalse(allows("http://192.168.1.20:3001/auth/sso/continue", server), "Another port")
        XCTAssertFalse(allows("http://192.168.1.21:3000/", server), "Another host")
        XCTAssertFalse(allows("http://192.168.1.20:3000/", nil))
        XCTAssertFalse(allows("http://user@192.168.1.20:3000/", server))
        XCTAssertFalse(allows("file:///etc/passwd", server))
        XCTAssertFalse(allows("marquee://title/movie/603", server))
        XCTAssertNil(API.signInPageURL("javascript:alert(1)", server: server))
    }

    func testTrailerKeysMustLookLikeYouTubes() {
        XCTAssertTrue(YouTubeTrailer.isValidKey("dQw4w9WgXcQ"))
        XCTAssertTrue(YouTubeTrailer.isValidKey("a-b_c1"))
        for bad in ["short", String(repeating: "a", count: 21), #"abc"><script>"#, "abc def ghi", "abc&autoplay=0", "ünïcödé123", ""] {
            XCTAssertFalse(YouTubeTrailer.isValidKey(bad), bad)
            XCTAssertNil(YouTubeTrailer.watchURL(bad))
            XCTAssertNil(YouTubeTrailer.embedURL(bad))
        }
        XCTAssertEqual(YouTubeTrailer.watchURL("dQw4w9WgXcQ")?.absoluteString, "https://www.youtube.com/watch?v=dQw4w9WgXcQ")
        XCTAssertEqual(
            YouTubeTrailer.embedURL("dQw4w9WgXcQ")?.absoluteString,
            "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&playsinline=1"
        )
    }
}

final class UnencryptedServerTests: XCTestCase {
    private func address(_ text: String) -> ServerAddress { try! ServerAddress.parse(text) }

    func testTheLocalNetworkIsRecognised() {
        for local in [
            "192.168.1.20", "10.0.0.5", "172.16.4.2", "172.31.255.1", "169.254.10.10", "127.0.0.1", "localhost",
            "tower", "tower.local", "nas.lan", "box.home.arpa", "[fe80::1]", "[fd12:3456::1]", "[::1]",
        ] {
            XCTAssertTrue(address(local).isLocalNetwork, local)
            XCTAssertFalse(address(local).isUnencryptedRemote, local)
        }
        for remote in ["marquee.example.com", "172.32.0.1", "8.8.8.8", "100.64.1.2", "[2001:db8::1]", "tower.local.example.com"] {
            XCTAssertFalse(address(remote).isLocalNetwork, remote)
            XCTAssertTrue(address(remote).isUnencryptedRemote, remote)
        }
        XCTAssertFalse(address("https://marquee.example.com").isUnencryptedRemote, "https is encrypted")
    }

    func testABareRemoteHostTriesHttpsFirst() throws {
        XCTAssertEqual(
            try ServerAddress.candidates(for: "marquee.example.com").map(\.baseURLString),
            ["https://marquee.example.com", "http://marquee.example.com:3000"]
        )
        XCTAssertEqual(
            try ServerAddress.candidates(for: "marquee.example.com:8443/discover").map(\.baseURLString),
            ["https://marquee.example.com:8443", "http://marquee.example.com:8443"],
            "A typed port is kept for both"
        )
        // A typed scheme, or a LAN address, is taken as it is.
        XCTAssertEqual(try ServerAddress.candidates(for: "http://marquee.example.com").map(\.baseURLString), ["http://marquee.example.com:3000"])
        XCTAssertEqual(try ServerAddress.candidates(for: "https://marquee.example.com").map(\.baseURLString), ["https://marquee.example.com"])
        XCTAssertEqual(try ServerAddress.candidates(for: "192.168.1.20").map(\.baseURLString), ["http://192.168.1.20:3000"])
        XCTAssertEqual(try ServerAddress.candidates(for: "tower.local:3000").map(\.baseURLString), ["http://tower.local:3000"])
        XCTAssertThrowsError(try ServerAddress.candidates(for: ""))
    }
}

/// Answers every request with a redirect to `target`, and records whether
/// the target was ever asked.
final class RedirectToElsewhereURLProtocol: URLProtocol {
    nonisolated(unsafe) static var servedTarget = false
    static let target = URL(string: "http://evil.example.com/collect")!

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let url = request.url else { return }
        if url.host == Self.target.host {
            Self.servedTarget = true
            let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: StubURLProtocol.apiHeaders)!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: Data("{}".utf8))
            client?.urlProtocolDidFinishLoading(self)
            return
        }
        let redirect = HTTPURLResponse(url: url, statusCode: 302, httpVersion: "HTTP/1.1", headerFields: ["Location": Self.target.absoluteString])!
        client?.urlProtocol(self, wasRedirectedTo: URLRequest(url: Self.target), redirectResponse: redirect)
        // Refused: hand back the redirect itself as the answer.
        client?.urlProtocol(self, didReceive: redirect, cacheStoragePolicy: .notAllowed)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

final class RedirectRefusalTests: XCTestCase {
    func testTheAPINeverFollowsARedirect() async throws {
        RedirectToElsewhereURLProtocol.servedTarget = false
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [RedirectToElsewhereURLProtocol.self]
        let session = URLSession(configuration: configuration, delegate: RedirectRefuser.shared, delegateQueue: nil)
        let client = APIClient(baseURL: URL(string: "http://192.168.1.20:3000")!, token: "mqt_secret", session: session)
        do {
            let _: EmptyResponse = try await client.get("/me")
            XCTFail("A redirect must not be followed")
        } catch {
            XCTAssertEqual(error as? APIError, .notMarquee)
        }
        XCTAssertFalse(RedirectToElsewhereURLProtocol.servedTarget, "The token never went to the other host")
    }
}

final class NotificationClickTests: XCTestCase {
    private static let server = ServerAddress(host: "127.0.0.1", port: 9)
    private let user = User(id: UUID(), username: "timmy", displayName: nil, role: .admin, libraryOwnerId: UUID())
    private let id = UUID()
    private let route = URL(string: "marquee://title/movie/603")!

    @MainActor
    private func makeModel() -> AppModel {
        let defaults = UserDefaults(suiteName: "marquee.tests.notificationclick.\(UUID().uuidString)")!
        defaults.set(Self.server.baseURLString, forKey: ServerSession.serverDefaultsKey)
        let store = InMemoryTokenStore()
        store.save("mqt_saved", for: Self.server.baseURLString)
        StubURLProtocol.requests = []
        StubURLProtocol.handler = { _ in StubURLProtocol.json(200, #"{"ok":true}"#) }
        let session = ServerSession(
            defaults: defaults, tokenStore: store, urlSession: StubURLProtocol.session(), deviceName: "Test Mac",
            pinned: nil, probe: { _ in .unreachable(.noResponse) }
        )
        return AppModel(session: session)
    }

    override func tearDown() {
        StubURLProtocol.handler = nil
        super.tearDown()
    }

    private func markedRead() -> Bool {
        StubURLProtocol.requests.contains {
            $0.httpMethod == "POST" && $0.url?.path == "/api/v1/notifications/\(id.uuidString.lowercased())/read"
        }
    }

    func testTheUserInfoRoundTrips() {
        let click = NotificationClick(route: route, notificationID: id, account: "http://127.0.0.1:9|abc")
        XCTAssertEqual(NotificationClick(userInfo: click.userInfo), click)
        XCTAssertEqual(NotificationClick(userInfo: ["route": route.absoluteString]), NotificationClick(route: route, notificationID: nil, account: nil))
        XCTAssertNil(NotificationClick(userInfo: ["route": "https://example.com/title/movie/603"]), "Only marquee:// routes")
        XCTAssertNil(NotificationClick(userInfo: [:]))
    }

    @MainActor
    func testAClickForTheSignedInAccountOpensTheTitleAndMarksItRead() async throws {
        let model = makeModel()
        model.viewer = user
        model.phase = .ready
        let account = AppModel.accountIdentity(server: model.session.server, user: user)
        model.openNotification(NotificationClick(route: route, notificationID: id, account: account))
        XCTAssertEqual(model.path, [.title(API.TitleID(.movie, 603))])
        for _ in 0..<50 where !markedRead() {
            try await Task.sleep(for: .milliseconds(20))
        }
        XCTAssertTrue(markedRead())
    }

    @MainActor
    func testAClickForAnotherAccountOpensNothing() async throws {
        let model = makeModel()
        model.viewer = user
        model.phase = .ready
        model.openNotification(NotificationClick(route: route, notificationID: id, account: "http://192.168.1.99:3000|someone-else"))
        XCTAssertTrue(model.path.isEmpty)
        try await Task.sleep(for: .milliseconds(100))
        XCTAssertFalse(markedRead())
    }

    @MainActor
    func testAnOlderBannerOnlyNavigates() async throws {
        let model = makeModel()
        model.viewer = user
        model.phase = .ready
        model.openNotification(NotificationClick(route: route, notificationID: id, account: nil))
        XCTAssertEqual(model.path, [.title(API.TitleID(.movie, 603))])
        try await Task.sleep(for: .milliseconds(100))
        XCTAssertFalse(markedRead())
    }

    @MainActor
    func testAClickThatLaunchedTheAppWaitsForSignIn() {
        let model = makeModel()
        let account = AppModel.accountIdentity(server: model.session.server, user: user)
        model.openNotification(NotificationClick(route: route, notificationID: id, account: account))
        XCTAssertTrue(model.path.isEmpty)
        XCTAssertNotNil(model.pendingNotification)
        model.viewer = user
        model.phase = .ready
        XCTAssertEqual(model.path, [.title(API.TitleID(.movie, 603))])
        XCTAssertNil(model.pendingNotification)
    }
}

@MainActor
final class RecentSearchesSignOutTests: XCTestCase {
    func testSigningOutWipesTheAccountsRecentSearches() throws {
        let suite = try XCTUnwrap(UserDefaults(suiteName: "marquee.tests.recentSignOut.\(UUID().uuidString)"))
        suite.set("http://127.0.0.1:9", forKey: ServerSession.serverDefaultsKey)
        let session = ServerSession(defaults: suite, tokenStore: InMemoryTokenStore(), pinned: nil, probe: { _ in .unreachable(.noResponse) })
        let model = AppModel(session: session)
        model.recentSearchesDefaults = suite
        let user = User(id: UUID(), username: "timmy", displayName: nil, role: .admin, libraryOwnerId: UUID())
        model.viewer = user
        model.phase = .ready
        let account = try XCTUnwrap(model.currentAccountIdentity)
        RecentSearches.remember("dune", account: account, defaults: suite)

        model.signOut()
        XCTAssertNil(model.currentAccountIdentity)
        XCTAssertEqual(RecentSearches.load(account: account, defaults: suite), [])
    }
}

final class ProbeRedirectTests: XCTestCase {
    func testOnlyALegacyServersOwnLoginRedirectIsFollowed() {
        let original = URL(string: "http://192.168.1.20:3000/api/v1/server-info")
        XCTAssertTrue(LegacyLoginRedirects.allows(from: original, to: URL(string: "http://192.168.1.20:3000/login")))
        XCTAssertFalse(LegacyLoginRedirects.allows(from: original, to: URL(string: "https://192.168.1.20:3000/login")))
        XCTAssertFalse(LegacyLoginRedirects.allows(from: original, to: URL(string: "http://evil.example.com:3000/login")))
        XCTAssertFalse(LegacyLoginRedirects.allows(from: original, to: URL(string: "http://192.168.1.20:3001/login")))
        XCTAssertFalse(LegacyLoginRedirects.allows(from: original, to: URL(string: "http://192.168.1.20:3000/api/v1/server-info/")))
        XCTAssertFalse(LegacyLoginRedirects.allows(from: nil, to: URL(string: "http://192.168.1.20:3000/login")))
    }
}
