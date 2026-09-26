import Testing
import Foundation
@testable import Marquee

/// Deep links that arrive before the session is ready, and the website links
/// behind Copy Link / Open in Browser.
@MainActor
struct AppModelTests {
    /// A model with no saved server and no saved sessions: nothing here touches the
    /// real session on this Mac.
    private func makeModel(server: String? = nil) -> AppModel {
        let suite = UserDefaults(suiteName: "marquee.tests.appmodel.\(UUID().uuidString)")!
        if let server { suite.set(server, forKey: ServerSession.serverDefaultsKey) }
        let session = ServerSession(defaults: suite, tokenStore: InMemoryTokenStore(), pinned: nil)
        return AppModel(session: session)
    }

    private let matrix = URL(string: "marquee://title/movie/603")!

    @Test func aLinkDuringLaunchOpensOnceReady() {
        let model = makeModel()
        model.handle(url: matrix)
        #expect(model.path.isEmpty)
        #expect(model.pendingURL == matrix)

        model.phase = .ready
        #expect(model.path == [.title(API.TitleID(.movie, 603))])
        #expect(model.pendingURL == nil)
    }

    @Test func theNewestPendingLinkWins() {
        let model = makeModel()
        model.handle(url: URL(string: "marquee://person/287")!)
        model.handle(url: matrix)
        model.phase = .ready
        #expect(model.path == [.title(API.TitleID(.movie, 603))])
    }

    @Test func signingOutDropsThePendingLink() {
        let model = makeModel()
        model.handle(url: matrix)
        model.signOut()
        model.phase = .ready
        #expect(model.path.isEmpty)
    }

    @Test func aDiscoverListLinkOpensItOnDiscover() {
        let model = makeModel()
        model.phase = .ready
        model.select(.movies)
        model.handle(url: URL(string: "marquee://discover/trending")!)
        #expect(model.selection == .discover)
        #expect(model.path == [.discoverList(.trending)])

        model.handle(url: URL(string: "marquee://discover/top-secret")!)
        #expect(model.path == [.discoverList(.trending)], "An unknown list is ignored")
    }

    @Test func otherSchemesAreIgnored() {
        let model = makeModel()
        model.handle(url: URL(string: "https://example.com/title/movie/603")!)
        #expect(model.pendingURL == nil)
    }

    @Test func webLinksFollowTheWebsiteRoutes() {
        let model = makeModel(server: "http://127.0.0.1:3100")
        #expect(model.webURL(for: .title(API.TitleID(.tv, 1399)))?.absoluteString == "http://127.0.0.1:3100/title/tv/1399")
        #expect(model.webURL(for: .person(287))?.absoluteString == "http://127.0.0.1:3100/person/287")
        #expect(model.webURL(for: .company(420))?.absoluteString == "http://127.0.0.1:3100/company/420")
        #expect(model.webURL(for: .discoverList(.upcomingMovies))?.absoluteString == "http://127.0.0.1:3100/discover/upcoming-movies")
        #expect(model.webURL(for: .search("matrix")) == nil)
        #expect(makeModel().webURL(for: .person(287)) == nil, "No server, no link")
    }
}
