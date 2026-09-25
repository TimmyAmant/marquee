import XCTest
@testable import Marquee

// Every MarqueeAPI method against a stubbed server: the method, path, query
// and JSON body it sends must be exactly what Docs/api-v1.md specifies, and
// the doc's example response must decode into its return value.

@MainActor
final class MarqueeAPIRequestTests: XCTestCase {
    private struct Case {
        let method: String
        let path: String
        var query: [String: String] = [:]
        /// Expected JSON body; nil means no body at all.
        var body: String?
        /// The fixture the stub answers with.
        let response: String
        let call: (MarqueeAPI) async throws -> Void
    }

    private static let requestId = UUID(uuidString: "28713D50-27F2-4230-9C95-C1E6A000F6C0")!
    private static let userId = UUID(uuidString: "83C55A49-6153-4CB9-AE22-4A42D48F4CF3")!
    private static let notificationId = UUID(uuidString: "BEDCB20B-FA30-4683-B000-42AFFC320087")!

    override func tearDown() {
        StubURLProtocol.handler = nil
        StubURLProtocol.requests = []
        super.tearDown()
    }

    private func fixture(_ name: String) throws -> Data {
        let url = Bundle(for: Self.self).resourceURL!.appendingPathComponent("Fixtures/api/\(name).json")
        return try Data(contentsOf: url)
    }

    /// POSTs that change nothing the screens show (or that the session owns).
    private static let readOnlyPosts = [
        "/surprise", "/auth/login", "/auth/setup", "/auth/logout", "/settings/integrations/plex/pin",
    ]

    private var cases: [Case] {
        let request = Self.requestId
        let user = Self.userId
        let browseQuery = API.BrowseQuery(sort: .topRated, genreId: 28, year: 1999, networkId: 213, hideOwned: false)
        var arr: [Case] = []
        for (provider, name) in [(API.ArrProvider.sonarr, "sonarr"), (.radarr, "radarr")] {
            arr += [
                Case(method: "PUT", path: "/settings/integrations/\(name)", body: #"{"baseUrl":"http://10.0.0.2:8989","apiKey":"k"}"#, response: "arr-connect") {
                    _ = try await $0.integrations.arr(provider).connect(baseUrl: "http://10.0.0.2:8989", apiKey: "k")
                },
                Case(method: "DELETE", path: "/settings/integrations/\(name)", response: "ok") { try await $0.integrations.arr(provider).disconnect() },
                Case(method: "GET", path: "/settings/integrations/\(name)/options", response: "arr-options") { _ = try await $0.integrations.arr(provider).options() },
                Case(method: "PUT", path: "/settings/integrations/\(name)/defaults", body: #"{"rootFolderPath":"/tv","qualityProfileId":4}"#, response: "ok") {
                    try await $0.integrations.arr(provider).saveDefaults(rootFolderPath: "/tv", qualityProfileId: 4)
                },
            ]
        }

        return [
            // Discovery & auth
            Case(method: "GET", path: "/server-info", response: "server-info") { _ = try await $0.auth.serverInfo() },
            Case(method: "POST", path: "/auth/login", body: #"{"username":"timmy","password":"pw","deviceName":"Mac"}"#, response: "auth-login") {
                _ = try await $0.auth.login(username: "timmy", password: "pw", deviceName: "Mac")
            },
            Case(method: "POST", path: "/auth/setup", body: #"{"username":"timmy","password":"pw","displayName":"Timmy","deviceName":"Mac"}"#, response: "auth-login") {
                _ = try await $0.auth.setup(username: "timmy", password: "pw", displayName: "Timmy", deviceName: "Mac")
            },
            Case(method: "POST", path: "/auth/logout", response: "ok") { try await $0.auth.logout() },
            Case(method: "GET", path: "/me", response: "me") { _ = try await $0.me() },
            Case(method: "GET", path: "/badges", response: "badges") { _ = try await $0.badges() },
            // Discover / browse / search
            Case(method: "GET", path: "/discover", response: "discover") { _ = try await $0.discover.shelves() },
            Case(method: "GET", path: "/movies", query: ["sort": "top_rated", "genre": "28", "year": "1999", "network": "213", "hideOwned": "false", "page": "2"], response: "browse-page") {
                _ = try await $0.browse.page(.movie, browseQuery, page: 2)
            },
            Case(method: "GET", path: "/movies/extras", query: ["genre": "28", "year": "1999", "network": "213"], response: "browse-extras") {
                _ = try await $0.browse.extras(.movie, browseQuery)
            },
            Case(method: "GET", path: "/series", query: ["sort": "popularity", "hideOwned": "true", "page": "1"], response: "browse-page") {
                _ = try await $0.browse.page(.tv)
            },
            Case(method: "GET", path: "/series/extras", response: "browse-extras") { _ = try await $0.browse.extras(.tv) },
            Case(method: "POST", path: "/surprise", body: #"{"type":"tv","genreId":18,"hideOwned":false}"#, response: "surprise") {
                _ = try await $0.discover.surprise(API.SurpriseRequest(type: .tv, genreId: 18, hideOwned: false))
            },
            Case(method: "GET", path: "/search", query: ["q": "Romeo + Juliet & co"], response: "search") { _ = try await $0.search.results("Romeo + Juliet & co") },
            Case(method: "GET", path: "/search/suggest", query: ["q": "ma"], response: "search-suggest") { _ = try await $0.search.suggestions("ma") },
            // Title, library & arr actions
            Case(method: "GET", path: "/titles/movie/603", response: "title-detail") { _ = try await $0.titles.detail(.movie, id: 603) },
            Case(method: "GET", path: "/titles/tv/1399/seasons/1", response: "season-episodes") { _ = try await $0.titles.season(1, ofShow: 1399) },
            Case(method: "GET", path: "/titles/tv/1399/status", response: "title-status") { _ = try await $0.titles.status(.tv, id: 1399) },
            Case(method: "POST", path: "/titles/movie/603/add", response: "title-add") { try await $0.titles.add(.movie, id: 603) },
            Case(method: "POST", path: "/titles/tv/1399/search", response: "title-search") { try await $0.titles.searchNow(.tv, id: 1399) },
            Case(method: "PUT", path: "/titles/movie/603/monitored", body: #"{"monitored":false}"#, response: "title-monitored") {
                try await $0.titles.setMonitored(false, .movie, id: 603)
            },
            Case(method: "POST", path: "/titles/movie/603/relink", body: #"{"imdbId":"tt0133093"}"#, response: "title-relink") {
                _ = try await $0.titles.relink(.movie, id: 603, to: .imdb("tt0133093"))
            },
            // Person / company
            Case(method: "GET", path: "/people/6384", response: "person-detail") { _ = try await $0.people.detail(6384) },
            Case(method: "GET", path: "/companies/420", response: "company-detail") { _ = try await $0.companies.detail(420) },
            // Favorites
            Case(method: "GET", path: "/favorites", response: "favorites") { _ = try await $0.favorites.all() },
            Case(method: "GET", path: "/favorites/collection/2344", response: "favorite-state") { _ = try await $0.favorites.isFavorited(.collection, id: 2344) },
            Case(method: "PUT", path: "/favorites/person/6384", response: "favorite-toggle") { try await $0.favorites.add(.person, id: 6384) },
            Case(method: "DELETE", path: "/favorites/movie/603", response: "favorite-state") { try await $0.favorites.remove(.movie, id: 603) },
            Case(method: "POST", path: "/favorites/company/420/toggle", response: "favorite-toggle") { try await $0.favorites.toggle(.company, id: 420) },
            // Requests
            Case(method: "POST", path: "/titles/tv/1399/request", response: "request-created") { try await $0.requests.create(.tv, id: 1399) },
            Case(method: "GET", path: "/requests/mine", response: "requests-mine") { _ = try await $0.requests.mine() },
            Case(method: "GET", path: "/requests/pending", response: "requests-pending") { _ = try await $0.requests.pending() },
            Case(method: "GET", path: "/requests/history", response: "requests-history") { _ = try await $0.requests.history() },
            Case(method: "GET", path: "/requests/pending-count", response: "requests-pending-count") { _ = try await $0.requests.pendingCount() },
            Case(method: "POST", path: "/requests/28713d50-27f2-4230-9c95-c1e6a000f6c0/approve", response: "ok") { try await $0.requests.approve(request) },
            Case(method: "POST", path: "/requests/28713d50-27f2-4230-9c95-c1e6a000f6c0/manual-approve", response: "ok") { try await $0.requests.manuallyApprove(request) },
            Case(method: "POST", path: "/requests/28713d50-27f2-4230-9c95-c1e6a000f6c0/reject", response: "ok") { try await $0.requests.reject(request) },
            Case(method: "POST", path: "/requests/approve-all", response: "requests-approve-all") { _ = try await $0.requests.approveAll() },
            // Notifications
            Case(method: "GET", path: "/notifications", query: ["limit": "5"], response: "notifications") { _ = try await $0.notifications.list(limit: 5) },
            Case(method: "GET", path: "/notifications/unread-count", response: "notifications-unread-count") { _ = try await $0.notifications.unreadCount() },
            Case(method: "POST", path: "/notifications/read-all", response: "ok") { try await $0.notifications.markAllRead() },
            Case(method: "POST", path: "/notifications/bedcb20b-fa30-4683-b000-42affc320087/read", response: "ok") {
                try await $0.notifications.markRead(Self.notificationId)
            },
            // Calendar, activity
            Case(method: "GET", path: "/calendar", query: ["month": "2026-09"], response: "calendar") { _ = try await $0.calendar.month(API.CalendarMonth(year: 2026, month: 9)) },
            Case(method: "GET", path: "/settings/activity", response: "activity") { _ = try await $0.activity.recent() },
            // Users
            Case(method: "GET", path: "/users", response: "users") { _ = try await $0.users.list() },
            Case(method: "POST", path: "/users", body: #"{"username":"kid","password":"correct-horse"}"#, response: "household-member") {
                _ = try await $0.users.create(API.CreateUserRequest(username: "kid", password: "correct-horse"))
            },
            Case(method: "PATCH", path: "/users/83c55a49-6153-4cb9-ae22-4a42d48f4cf3", body: #"{"username":"kid","autoApproveTv":true}"#, response: "user-update") {
                _ = try await $0.users.update(user, API.UpdateUserRequest(username: "kid", autoApproveTv: true))
            },
            Case(method: "DELETE", path: "/users/83c55a49-6153-4cb9-ae22-4a42d48f4cf3", response: "ok") { try await $0.users.remove(user) },
            // Integrations
            Case(method: "GET", path: "/settings/integrations", response: "integrations") { _ = try await $0.integrations.overview() },
            Case(method: "POST", path: "/settings/integrations/sync", response: "ok") { try await $0.integrations.syncNow() },
            Case(method: "POST", path: "/settings/integrations/webhook-secret", response: "webhook-secret") { _ = try await $0.integrations.regenerateWebhookSecret() },
            Case(method: "POST", path: "/settings/integrations/plex/pin", response: "plex-pin-start") { _ = try await $0.integrations.plex.startPin() },
            Case(method: "GET", path: "/settings/integrations/plex/pin/123456789", response: "plex-pin-connected") { _ = try await $0.integrations.plex.pollPin(123_456_789) },
            Case(method: "DELETE", path: "/settings/integrations/plex", response: "ok") { try await $0.integrations.plex.disconnect() },
            Case(method: "PUT", path: "/settings/integrations/jellyfin", body: #"{"baseUrl":"http://10.0.0.2:8096","apiKey":"k"}"#, response: "ok") {
                try await $0.integrations.jellyfin.connect(baseUrl: "http://10.0.0.2:8096", apiKey: "k")
            },
            Case(method: "DELETE", path: "/settings/integrations/jellyfin", response: "ok") { try await $0.integrations.jellyfin.disconnect() },
            Case(method: "PUT", path: "/settings/integrations/tmdb", body: #"{"accessToken":"t"}"#, response: "ok") { try await $0.integrations.tmdb.save("t") },
            Case(method: "DELETE", path: "/settings/integrations/tmdb", response: "ok") { try await $0.integrations.tmdb.remove() },
            Case(method: "PUT", path: "/settings/integrations/trakt", body: #"{"clientId":"c"}"#, response: "ok") { try await $0.integrations.trakt.save("c") },
            Case(method: "DELETE", path: "/settings/integrations/trakt", response: "ok") { try await $0.integrations.trakt.remove() },
            Case(method: "POST", path: "/settings/integrations/trakt/import", body: #"{"url":"https://trakt.tv/users/u/watchlist"}"#, response: "trakt-import") {
                _ = try await $0.integrations.trakt.importList(url: "https://trakt.tv/users/u/watchlist")
            },
            Case(method: "PUT", path: "/settings/integrations/tvdb", body: #"{"apiKey":"v"}"#, response: "ok") { try await $0.integrations.tvdb.save("v") },
            Case(method: "DELETE", path: "/settings/integrations/tvdb", response: "ok") { try await $0.integrations.tvdb.remove() },
            Case(method: "PUT", path: "/settings/integrations/discord", body: #"{"webhookUrl":"https://discord.com/api/webhooks/1"}"#, response: "ok") {
                try await $0.integrations.discord.save("https://discord.com/api/webhooks/1")
            },
            Case(method: "DELETE", path: "/settings/integrations/discord", response: "ok") { try await $0.integrations.discord.remove() },
            Case(method: "PUT", path: "/settings/integrations/ntfy", body: #"{"topicUrl":"https://ntfy.sh/t"}"#, response: "ok") { try await $0.integrations.ntfy.save("https://ntfy.sh/t") },
            Case(method: "DELETE", path: "/settings/integrations/ntfy", response: "ok") { try await $0.integrations.ntfy.remove() },
            Case(method: "PUT", path: "/settings/integrations/webhook", body: #"{"webhookUrl":"https://example.com/hook"}"#, response: "ok") {
                try await $0.integrations.webhook.save("https://example.com/hook")
            },
            Case(method: "DELETE", path: "/settings/integrations/webhook", response: "ok") { try await $0.integrations.webhook.remove() },
            // Jobs, about, help
            Case(method: "GET", path: "/settings/jobs", response: "jobs") { _ = try await $0.jobs.list() },
            Case(method: "POST", path: "/settings/jobs/arr-sync/run", response: "ok") { try await $0.jobs.run("arr-sync") },
            Case(method: "GET", path: "/settings/about", response: "about") { _ = try await $0.about.info() },
            Case(method: "GET", path: "/changelog", response: "changelog") { _ = try await $0.about.changelog() },
            Case(method: "GET", path: "/help/errors", response: "help-errors") { _ = try await $0.help.errors() },
        ] + arr
    }

    func testEveryEndpointSendsWhatTheDocSpecifies() async throws {
        let cases = self.cases
        XCTAssertEqual(cases.count, 81, "Docs/api-v1.md documents 81 endpoints")
        XCTAssertEqual(Set(cases.map { "\($0.method) \($0.path)" }).count, 81, "Each case covers a different endpoint")

        let events = ServerEvents()
        let client = APIClient(baseURL: URL(string: "http://127.0.0.1:3000")!, token: "mqt_test", session: StubURLProtocol.session())
        let api = MarqueeAPI(client: client, events: events)

        for testCase in cases {
            let label = "\(testCase.method) \(testCase.path)"
            let response = try fixture(testCase.response)
            StubURLProtocol.requests = []
            StubURLProtocol.handler = { _ in (200, StubURLProtocol.apiHeaders, response) }
            let before = events.revision(of: .all)

            do {
                try await testCase.call(api)
            } catch {
                XCTFail("\(label): \(error)")
                continue
            }

            guard let request = StubURLProtocol.requests.first, StubURLProtocol.requests.count == 1 else {
                XCTFail("\(label): expected exactly one request, got \(StubURLProtocol.requests.count)")
                continue
            }
            let url = try XCTUnwrap(request.url)
            XCTAssertEqual(request.httpMethod, testCase.method, label)
            XCTAssertEqual(url.path, "/api/v1" + testCase.path, label)
            let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
            XCTAssertEqual(Dictionary(uniqueKeysWithValues: items.map { ($0.name, $0.value ?? "") }), testCase.query, label)
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer mqt_test", label)

            let body = Self.body(of: request)
            if let expected = testCase.body {
                XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json", label)
                XCTAssertEqual(try Self.jsonObject(body), try Self.jsonObject(Data(expected.utf8)), label)
            } else {
                XCTAssertTrue(body.isEmpty, "\(label) sends no body")
            }

            // Reads never signal a change; mutations do — as does a Plex PIN
            // poll that comes back connected (it just synced the library).
            let isPlexPoll = testCase.path.hasPrefix("/settings/integrations/plex/pin/")
            let expectsChange = isPlexPoll || (testCase.method != "GET" && !Self.readOnlyPosts.contains(testCase.path))
            XCTAssertEqual(events.revision(of: .all) != before, expectsChange, "\(label) change signal")
        }
    }

    func testPlusSignsAreEncodedInQueries() async throws {
        let response = try fixture("search")
        StubURLProtocol.handler = { _ in (200, StubURLProtocol.apiHeaders, response) }
        let client = APIClient(baseURL: URL(string: "http://127.0.0.1:3000")!, token: "mqt_test", session: StubURLProtocol.session())
        _ = try await MarqueeAPI(client: client).search.results("Romeo + Juliet")
        XCTAssertEqual(StubURLProtocol.requests.first?.url?.query, "q=Romeo%20%2B%20Juliet")
    }

    /// `reject` is one endpoint with two shapes (the table above covers the
    /// bare one): with a reason it sends `{"reason": …}`, without one no body
    /// at all, so a pre-0.28 server sees exactly what it always did.
    func testRejectSendsTheReasonAsItsBody() async throws {
        let response = try fixture("ok")
        StubURLProtocol.handler = { _ in (200, StubURLProtocol.apiHeaders, response) }
        let client = APIClient(baseURL: URL(string: "http://127.0.0.1:3000")!, token: "mqt_test", session: StubURLProtocol.session())
        let api = MarqueeAPI(client: client)

        StubURLProtocol.requests = []
        try await api.requests.reject(Self.requestId, reason: "Not enough space on the server right now")
        let withReason = try XCTUnwrap(StubURLProtocol.requests.first)
        XCTAssertEqual(withReason.httpMethod, "POST")
        XCTAssertEqual(withReason.url?.path, "/api/v1/requests/28713d50-27f2-4230-9c95-c1e6a000f6c0/reject")
        XCTAssertEqual(withReason.value(forHTTPHeaderField: "Content-Type"), "application/json")
        XCTAssertEqual(
            try Self.jsonObject(Self.body(of: withReason)),
            try Self.jsonObject(Data(#"{"reason":"Not enough space on the server right now"}"#.utf8))
        )

        StubURLProtocol.requests = []
        try await api.requests.reject(Self.requestId, reason: nil)
        let bare = try XCTUnwrap(StubURLProtocol.requests.first)
        XCTAssertEqual(bare.url?.path, "/api/v1/requests/28713d50-27f2-4230-9c95-c1e6a000f6c0/reject")
        XCTAssertTrue(Self.body(of: bare).isEmpty, "nil reason sends no body")
    }

    func testNoServerThrowsUnauthorizedWithoutSending() async {
        StubURLProtocol.requests = []
        do {
            _ = try await MarqueeAPI(client: nil).me()
            XCTFail("Expected unauthorized")
        } catch {
            XCTAssertEqual(error as? APIError, .unauthorized)
        }
        XCTAssertTrue(StubURLProtocol.requests.isEmpty)
    }

    func testUnknownMediaTypeIsNotFoundForBrowse() async {
        do {
            _ = try await MarqueeAPI(client: APIClient(baseURL: URL(string: "http://127.0.0.1:3000")!)).browse.page(.unknown("music"))
            XCTFail("Expected notFound")
        } catch {
            XCTAssertEqual(error as? APIError, .notFound)
        }
    }

    func testFailedMutationRecordsNothing() async throws {
        StubURLProtocol.handler = { _ in StubURLProtocol.json(409, #"{"error":"Couldn't resolve this show for Sonarr.","code":"conflict"}"#) }
        let events = ServerEvents()
        let client = APIClient(baseURL: URL(string: "http://127.0.0.1:3000")!, token: "mqt_test", session: StubURLProtocol.session())
        do {
            try await MarqueeAPI(client: client, events: events).requests.approve(Self.requestId)
            XCTFail("Expected conflict")
        } catch let error as APIError {
            XCTAssertTrue(error.isSonarrUnresolvable)
        }
        XCTAssertEqual(events.revision(of: .all), 0)
    }

    // MARK: Helpers

    /// URLSession hands a protocol the body as a stream.
    private static func body(of request: URLRequest) -> Data {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return Data() }
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable {
            let read = stream.read(&buffer, maxLength: buffer.count)
            if read <= 0 { break }
            data.append(buffer, count: read)
        }
        return data
    }

    private static func jsonObject(_ data: Data) throws -> NSDictionary {
        try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? NSDictionary)
    }
}
