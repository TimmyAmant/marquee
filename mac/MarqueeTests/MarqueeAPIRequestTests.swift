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
        /// Expected file body instead of JSON (a profile photo): its bytes and Content-Type.
        var upload: (bytes: Data, contentType: String)?
        /// The fixture the stub answers with (`.json` unless it names another extension).
        let response: String
        /// The stub response's Content-Type.
        var responseType = "application/json"
        let call: (MarqueeAPI) async throws -> Void
    }

    /// A few bytes standing in for a photo: the upload sends them as they are.
    private static let photo = Data([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46])

    private static let requestId = UUID(uuidString: "28713D50-27F2-4230-9C95-C1E6A000F6C0")!
    private static let userId = UUID(uuidString: "83C55A49-6153-4CB9-AE22-4A42D48F4CF3")!
    private static let notificationId = UUID(uuidString: "BEDCB20B-FA30-4683-B000-42AFFC320087")!

    override func tearDown() {
        StubURLProtocol.handler = nil
        StubURLProtocol.requests = []
        super.tearDown()
    }

    /// `GET /settings/blocklist`'s example from the doc's prose, with real
    /// ids and dates (the doc elides them).
    nonisolated static let blocklistResponse = #"""
    {"results":[
      {"id":"5b1c2f3e-8a4d-4f7e-9c2b-1a2b3c4d5e6f","kind":"keyword","mediaType":null,"tmdbId":null,"title":null,"keyword":"anime","reason":null,"createdAt":"2026-09-25T20:00:00.000Z"},
      {"id":"0f9e8d7c-6b5a-4c3d-2e1f-0a9b8c7d6e5f","kind":"title","mediaType":"movie","tmdbId":438631,"title":"Dune","keyword":null,"reason":"Already on Max.","createdAt":"2026-09-25T19:00:00.000Z"}
    ]}
    """#

    /// `POST /settings/arr-servers` / `PATCH …/{id}` and `POST …/{id}/webhook-secret`,
    /// from the doc's prose (it shows no example block for them).
    nonisolated static let arrServerSavedResponse = #"""
    {"ok":true,"server":{"id":"4f0c2a8e-1b7d-4c1e-9a55-3c2d8e6f7a10","kind":"sonarr","name":"Sonarr","baseUrl":"http://192.168.1.10:8989","hasApiKey":true,"is4k":false,"isDefault":true,"qualityProfileId":4,"rootFolderPath":"/tv","tags":[],"seriesType":"standard","seasonFolders":true,"animeQualityProfileId":null,"animeRootFolderPath":null,"animeTags":[],"fullyConfigured":true,"webhookUrl":"http://marquee.local:3000/api/webhooks/servers/4f0c2a8e-1b7d-4c1e-9a55-3c2d8e6f7a10?secret=9b1e"}}
    """#
    nonisolated static let arrServerWebhookResponse = #"""
    {"ok":true,"webhookUrl":"http://marquee.local:3000/api/webhooks/servers/4f0c2a8e-1b7d-4c1e-9a55-3c2d8e6f7a10?secret=0f3c"}
    """#
    nonisolated static let arrServerId = "4f0c2a8e-1b7d-4c1e-9a55-3c2d8e6f7a10"

    /// `POST /titles/{type}/{tmdbId}/share`'s answer, from the doc's prose.
    nonisolated static let shareResponse = #"{"ok":true,"sharedWith":1}"#

    private func fixture(_ name: String) throws -> Data {
        if name == "blocklist" { return Data(Self.blocklistResponse.utf8) }
        if name == "arr-server-saved" { return Data(Self.arrServerSavedResponse.utf8) }
        if name == "arr-server-webhook" { return Data(Self.arrServerWebhookResponse.utf8) }
        if name == "share-result" { return Data(Self.shareResponse.utf8) }
        let file = name.contains(".") ? name : name + ".json"
        let url = Bundle(for: Self.self).resourceURL!.appendingPathComponent("Fixtures/api/\(file)")
        return try Data(contentsOf: url)
    }

    /// POSTs that change nothing the screens show (or that the session owns).
    private static let readOnlyPosts = [
        "/surprise", "/auth/login", "/auth/setup", "/auth/logout", "/settings/integrations/plex/pin",
        "/settings/arr-servers/test", "/titles/movie/425/share",
    ]

    private var cases: [Case] {
        let request = Self.requestId
        let user = Self.userId
        let browseQuery = API.BrowseQuery(sort: .topRated, genreId: 28, year: 1999, networkId: 213, hideOwned: false)
        var arr: [Case] = []
        for (provider, name) in [(API.ArrProvider.sonarr, "sonarr"), (.radarr, "radarr"), (.sonarr4k, "sonarr4k"), (.radarr4k, "radarr4k")] {
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
            Case(method: "GET", path: "/discover/lists/trending", query: ["page": "3"], response: "discover-list") { _ = try await $0.discover.list(.trending, page: 3) },
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
            Case(method: "GET", path: "/titles/tv/95396/add-options", response: "add-options") { _ = try await $0.titles.addOptions(.tv, id: 95396) },
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
            Case(method: "POST", path: "/titles/movie/425/request-all-missing", response: "request-all-missing") {
                _ = try await $0.requests.requestAllMissing(.movie, id: 425)
            },
            Case(method: "GET", path: "/requests/mine", response: "requests-mine") { _ = try await $0.requests.mine() },
            Case(method: "GET", path: "/requests/pending", response: "requests-pending") { _ = try await $0.requests.pending() },
            Case(method: "GET", path: "/requests/history", response: "requests-history") { _ = try await $0.requests.history() },
            Case(method: "GET", path: "/requests/pending-count", response: "requests-pending-count") { _ = try await $0.requests.pendingCount() },
            Case(method: "POST", path: "/requests/28713d50-27f2-4230-9c95-c1e6a000f6c0/approve", response: "ok") { try await $0.requests.approve(request) },
            Case(method: "POST", path: "/requests/28713d50-27f2-4230-9c95-c1e6a000f6c0/manual-approve", response: "ok") { try await $0.requests.manuallyApprove(request) },
            Case(method: "POST", path: "/requests/28713d50-27f2-4230-9c95-c1e6a000f6c0/reject", response: "ok") { try await $0.requests.reject(request) },
            Case(method: "POST", path: "/requests/approve-all", response: "requests-approve-all") { _ = try await $0.requests.approveAll() },
            // Problem reports (0.38+)
            Case(
                method: "POST", path: "/titles/tv/1396/issues",
                body: #"{"kind":"audio","message":"Out of sync after 20 minutes","seasonNumber":2,"episodeNumber":5}"#, response: "ok"
            ) {
                try await $0.issues.report(.tv, id: 1396, API.IssueReport(kind: .audio, message: "Out of sync after 20 minutes", seasonNumber: 2, episodeNumber: 5))
            },
            Case(method: "GET", path: "/issues", response: "issues") { _ = try await $0.issues.list() },
            Case(method: "POST", path: "/issues/28713d50-27f2-4230-9c95-c1e6a000f6c0/resolve", body: #"{"note":"Replaced the file"}"#, response: "ok") {
                try await $0.issues.resolve(request, note: "Replaced the file")
            },
            Case(method: "POST", path: "/issues/28713d50-27f2-4230-9c95-c1e6a000f6c0/search", response: "ok") { try await $0.issues.searchAgain(request) },
            Case(method: "DELETE", path: "/issues/28713d50-27f2-4230-9c95-c1e6a000f6c0", response: "ok") { try await $0.issues.delete(request) },
            // Sharing a title (0.45.1+): the doc's example body.
            Case(
                method: "POST", path: "/titles/movie/425/share",
                body: #"{"userIds":["83c55a49-6153-4cb9-ae22-4a42d48f4cf3"],"note":"You'd love this one"}"#, response: "share-result"
            ) {
                let result = try await $0.titles.share(.movie, id: 425, API.ShareTitleRequest(userIds: [user], note: "You'd love this one"))
                XCTAssertEqual(result.sharedWith, 1)
            },
            Case(method: "GET", path: "/users/shareable", response: "users-shareable") { _ = try await $0.users.shareable() },
            // Request blocklist (0.41+)
            Case(method: "POST", path: "/titles/movie/438631/block", body: #"{"reason":"Already on Max."}"#, response: "ok") {
                try await $0.titles.block(.movie, id: 438631, reason: "Already on Max.")
            },
            Case(method: "DELETE", path: "/titles/movie/438631/block", response: "ok") { try await $0.titles.unblock(.movie, id: 438631) },
            Case(method: "GET", path: "/settings/blocklist", response: "blocklist") { _ = try await $0.blocklist.list() },
            Case(method: "POST", path: "/settings/blocklist", body: #"{"keyword":"anime","reason":"Not for this house."}"#, response: "ok") {
                try await $0.blocklist.blockKeyword(" anime ", reason: "Not for this house.")
            },
            Case(method: "DELETE", path: "/settings/blocklist/5b1c2f3e-8a4d-4f7e-9c2b-1a2b3c4d5e6f", response: "ok") {
                try await $0.blocklist.remove("5b1c2f3e-8a4d-4f7e-9c2b-1a2b3c4d5e6f")
            },
            // Notifications
            Case(method: "GET", path: "/notifications", query: ["limit": "5"], response: "notifications") { _ = try await $0.notifications.list(limit: 5) },
            Case(method: "GET", path: "/notifications/unread-count", response: "notifications-unread-count") { _ = try await $0.notifications.unreadCount() },
            Case(method: "POST", path: "/notifications/read-all", response: "ok") { try await $0.notifications.markAllRead() },
            Case(method: "POST", path: "/notifications/bedcb20b-fa30-4683-b000-42affc320087/read", response: "ok") {
                try await $0.notifications.markRead(Self.notificationId)
            },
            Case(method: "GET", path: "/notifications/stream", response: "notifications-stream.sse", responseType: "text/event-stream") {
                _ = try await $0.notifications.stream { _ in }
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
            // The `avatarUrl` exactly as the server hands it out, version and all.
            Case(method: "GET", path: "/users/83c55a49-6153-4cb9-ae22-4a42d48f4cf3/avatar", query: ["v": "1790334036549"], response: "ok", responseType: "image/jpeg") {
                _ = try await $0.users.avatar(at: "/api/v1/users/83c55a49-6153-4cb9-ae22-4a42d48f4cf3/avatar?v=1790334036549")
            },
            Case(method: "PUT", path: "/users/83c55a49-6153-4cb9-ae22-4a42d48f4cf3/avatar", upload: (Self.photo, "image/jpeg"), response: "avatar-set") {
                try await $0.users.setAvatar(user, data: Self.photo, contentType: "image/jpeg")
            },
            Case(method: "DELETE", path: "/users/83c55a49-6153-4cb9-ae22-4a42d48f4cf3/avatar", response: "avatar-removed") {
                try await $0.users.removeAvatar(user)
            },
            // Integrations
            Case(method: "GET", path: "/settings/integrations", response: "integrations") { _ = try await $0.integrations.overview() },
            Case(method: "POST", path: "/settings/integrations/sync", response: "ok") { try await $0.integrations.syncNow() },
            Case(method: "POST", path: "/settings/integrations/webhook-secret", response: "webhook-secret") { _ = try await $0.integrations.regenerateWebhookSecret() },
            // Sonarr / Radarr servers (0.43+)
            Case(method: "GET", path: "/settings/arr-servers", response: "arr-servers") { _ = try await $0.integrations.arrServers.list() },
            Case(
                method: "POST", path: "/settings/arr-servers/test",
                body: #"{"kind":"radarr","baseUrl":"http://192.168.1.10:7878","apiKey":"k"}"#, response: "arr-server-test"
            ) {
                _ = try await $0.integrations.arrServers.test(API.ArrServerTestRequest(kind: .radarr, baseUrl: "http://192.168.1.10:7878", apiKey: "k"))
            },
            Case(
                method: "POST", path: "/settings/arr-servers",
                body: #"{"kind":"radarr","baseUrl":"http://192.168.1.10:7878","apiKey":"k","is4k":true,"tags":[2]}"#, response: "arr-server-saved"
            ) {
                _ = try await $0.integrations.arrServers.add(API.ArrServerRequest(
                    kind: .radarr, baseUrl: "http://192.168.1.10:7878", apiKey: "k", is4k: true, tags: [2]
                ))
            },
            Case(method: "PATCH", path: "/settings/arr-servers/\(Self.arrServerId)", body: #"{"isDefault":true}"#, response: "arr-server-saved") {
                _ = try await $0.integrations.arrServers.update(Self.arrServerId, API.ArrServerRequest(isDefault: true))
            },
            Case(method: "DELETE", path: "/settings/arr-servers/\(Self.arrServerId)", response: "ok") {
                try await $0.integrations.arrServers.remove(Self.arrServerId)
            },
            Case(method: "GET", path: "/settings/arr-servers/\(Self.arrServerId)/options", response: "arr-server-test") {
                _ = try await $0.integrations.arrServers.options(Self.arrServerId)
            },
            Case(method: "POST", path: "/settings/arr-servers/\(Self.arrServerId)/webhook-secret", response: "arr-server-webhook") {
                _ = try await $0.integrations.arrServers.regenerateWebhook(Self.arrServerId)
            },
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
            Case(method: "PUT", path: "/settings/integrations/telegram", body: #"{"botToken":"","chatId":"-1001234567890"}"#, response: "ok") {
                try await $0.integrations.telegram.save(botToken: "", chatId: "-1001234567890")
            },
            Case(method: "DELETE", path: "/settings/integrations/telegram", response: "ok") { try await $0.integrations.telegram.remove() },
            Case(method: "PUT", path: "/settings/integrations/pushover", body: #"{"appToken":"a","userKey":"u"}"#, response: "ok") {
                try await $0.integrations.pushover.save(appToken: "a", userKey: "u")
            },
            Case(method: "DELETE", path: "/settings/integrations/pushover", response: "ok") { try await $0.integrations.pushover.remove() },
            Case(
                method: "PUT", path: "/settings/integrations/email",
                body: #"{"host":"smtp.gmail.com","port":587,"secure":false,"username":"me@gmail.com","password":"","from":"me@gmail.com","to":["me@gmail.com","partner@example.com"]}"#,
                response: "ok"
            ) {
                try await $0.integrations.email.save(API.EmailRequest(
                    host: "smtp.gmail.com", port: 587, secure: false, username: "me@gmail.com", password: "",
                    from: "me@gmail.com", to: ["me@gmail.com", "partner@example.com"]
                ))
            },
            Case(method: "DELETE", path: "/settings/integrations/email", response: "ok") { try await $0.integrations.email.remove() },
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
        XCTAssertEqual(cases.count, 121, "docs/api-v1.md documents 121 endpoints")
        XCTAssertEqual(Set(cases.map { "\($0.method) \($0.path)" }).count, 121, "Each case covers a different endpoint")

        let events = ServerEvents()
        let client = APIClient(baseURL: URL(string: "http://127.0.0.1:3000")!, token: "mqt_test", session: StubURLProtocol.session())
        let api = MarqueeAPI(client: client, events: events)

        for testCase in cases {
            let label = "\(testCase.method) \(testCase.path)"
            let response = try fixture(testCase.response)
            let headers = ["Content-Type": testCase.responseType, "X-Marquee-API": "1"]
            StubURLProtocol.requests = []
            StubURLProtocol.handler = { _ in (200, headers, response) }
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
            } else if let upload = testCase.upload {
                XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), upload.contentType, label)
                XCTAssertEqual(body, upload.bytes, "\(label) sends the file's own bytes")
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

    /// `PATCH /users/{id}` (0.39+) with the role and request limits (the
    /// table above covers the older shape): a blank limit is sent as `null`.
    func testUpdateUserSendsRoleAndRequestLimits() async throws {
        let response = try fixture("user-update")
        StubURLProtocol.handler = { _ in (200, StubURLProtocol.apiHeaders, response) }
        let client = APIClient(baseURL: URL(string: "http://127.0.0.1:3000")!, token: "mqt_test", session: StubURLProtocol.session())
        StubURLProtocol.requests = []
        let result = try await MarqueeAPI(client: client).users.update(Self.userId, API.UpdateUserRequest(
            username: "kid", role: .trusted,
            movieQuota: .init(limit: 5, days: 7), tvQuota: .init(limitText: " ", daysText: "14")
        ))
        XCTAssertEqual(result.user.movieQuotaLimit, 5)
        let sent = try XCTUnwrap(StubURLProtocol.requests.first)
        XCTAssertEqual(sent.httpMethod, "PATCH")
        XCTAssertEqual(sent.url?.path, "/api/v1/users/83c55a49-6153-4cb9-ae22-4a42d48f4cf3")
        XCTAssertEqual(
            try Self.jsonObject(Self.body(of: sent)),
            try Self.jsonObject(Data(#"{"username":"kid","role":"trusted","movieQuotaLimit":5,"movieQuotaDays":7,"tvQuotaLimit":null,"tvQuotaDays":14}"#.utf8))
        )
    }

    /// "Request in 4K" and "Add to 4K Radarr/Sonarr" (0.37+): the same two
    /// endpoints with `{"is4k": true}`; a 4K request ignores `seasons`.
    func testFourKRequestAndAddSendIs4k() async throws {
        let client = APIClient(baseURL: URL(string: "http://127.0.0.1:3000")!, token: "mqt_test", session: StubURLProtocol.session())
        let api = MarqueeAPI(client: client)
        let calls: [(String, String, (MarqueeAPI) async throws -> Void)] = [
            ("request-created", "/titles/movie/603/request", { _ = try await $0.requests.create(.movie, id: 603, is4k: true) }),
            ("request-created", "/titles/tv/1399/request", { _ = try await $0.requests.create(.tv, id: 1399, seasons: [1, 2], is4k: true) }),
            ("title-add", "/titles/movie/603/add", { try await $0.titles.add(.movie, id: 603, is4k: true) }),
            ("title-add", "/titles/tv/1399/add", { try await $0.titles.add(.tv, id: 1399, is4k: true) }),
        ]
        for (response, path, call) in calls {
            let data = try fixture(response)
            StubURLProtocol.handler = { _ in (200, StubURLProtocol.apiHeaders, data) }
            StubURLProtocol.requests = []
            try await call(api)
            let sent = try XCTUnwrap(StubURLProtocol.requests.first, path)
            XCTAssertEqual(sent.httpMethod, "POST", path)
            XCTAssertEqual(sent.url?.path, "/api/v1" + path, path)
            XCTAssertEqual(sent.value(forHTTPHeaderField: "Content-Type"), "application/json", path)
            XCTAssertEqual(try Self.jsonObject(Self.body(of: sent)), ["is4k": true] as NSDictionary, path)
        }
    }

    /// Approve and Add with "Advanced" picks (0.43+): the overrides as the
    /// body (Add's flat beside `is4k`); without them, exactly the old calls.
    func testApproveAndAddSendAddOverrides() async throws {
        let client = APIClient(baseURL: URL(string: "http://127.0.0.1:3000")!, token: "mqt_test", session: StubURLProtocol.session())
        let api = MarqueeAPI(client: client)
        let data = try fixture("ok")
        StubURLProtocol.handler = { _ in (200, StubURLProtocol.apiHeaders, data) }
        let overrides = API.AddOverrides(
            serverId: "b3e1f7a2", qualityProfileId: 6, rootFolderPath: "/movies-kids", tags: [], seriesType: nil
        )

        StubURLProtocol.requests = []
        try await api.requests.approve(Self.requestId, overrides: overrides)
        let approve = try XCTUnwrap(StubURLProtocol.requests.first)
        XCTAssertEqual(approve.url?.path, "/api/v1/requests/28713d50-27f2-4230-9c95-c1e6a000f6c0/approve")
        XCTAssertEqual(
            try Self.jsonObject(Self.body(of: approve)),
            try Self.jsonObject(Data(#"{"serverId":"b3e1f7a2","qualityProfileId":6,"rootFolderPath":"/movies-kids","tags":[]}"#.utf8))
        )

        StubURLProtocol.requests = []
        try await api.requests.approve(Self.requestId)
        XCTAssertTrue(Self.body(of: try XCTUnwrap(StubURLProtocol.requests.first)).isEmpty, "No overrides: no body")

        StubURLProtocol.requests = []
        let tv = API.AddOverrides(serverId: "s1", qualityProfileId: 7, rootFolderPath: "/anime", tags: [3], seriesType: .anime)
        try await api.titles.add(.tv, id: 1399, is4k: true, overrides: tv)
        let add4K = try XCTUnwrap(StubURLProtocol.requests.first)
        XCTAssertEqual(add4K.url?.path, "/api/v1/titles/tv/1399/add")
        XCTAssertEqual(
            try Self.jsonObject(Self.body(of: add4K)),
            try Self.jsonObject(Data(#"{"is4k":true,"serverId":"s1","qualityProfileId":7,"rootFolderPath":"/anime","tags":[3],"seriesType":"anime"}"#.utf8))
        )

        StubURLProtocol.requests = []
        try await api.titles.add(.tv, id: 1399, overrides: tv)
        XCTAssertEqual(
            try Self.jsonObject(Self.body(of: try XCTUnwrap(StubURLProtocol.requests.first))),
            try Self.jsonObject(Data(#"{"serverId":"s1","qualityProfileId":7,"rootFolderPath":"/anime","tags":[3],"seriesType":"anime"}"#.utf8)),
            "Standard Add leaves is4k out"
        )

        StubURLProtocol.requests = []
        try await api.titles.add(.movie, id: 603)
        XCTAssertTrue(Self.body(of: try XCTUnwrap(StubURLProtocol.requests.first)).isEmpty, "Plain Add: no body")
    }

    /// `add-options?is4k=true` lists the 4K servers; without it, no query.
    func testAddOptionsAsksForFourKServers() async throws {
        let client = APIClient(baseURL: URL(string: "http://127.0.0.1:3000")!, token: "mqt_test", session: StubURLProtocol.session())
        let data = try fixture("add-options")
        StubURLProtocol.handler = { _ in (200, StubURLProtocol.apiHeaders, data) }
        StubURLProtocol.requests = []
        let options = try await MarqueeAPI(client: client).titles.addOptions(.movie, id: 438631, is4k: true)
        XCTAssertEqual(options.servers.first?.name, "Sonarr")
        let sent = try XCTUnwrap(StubURLProtocol.requests.first)
        XCTAssertEqual(sent.url?.path, "/api/v1/titles/movie/438631/add-options")
        XCTAssertEqual(sent.url?.query, "is4k=true")
    }

    /// Saving an edited Sonarr server: the anime profile and folder go as
    /// `null` ("Same as above"), and a test without a new key sends `serverId`.
    func testArrServerFormBodies() async throws {
        let client = APIClient(baseURL: URL(string: "http://127.0.0.1:3000")!, token: "mqt_test", session: StubURLProtocol.session())
        let api = MarqueeAPI(client: client)
        let saved = try APIClient.decoder.decode(API.ArrServerSaved.self, from: fixture("arr-server-saved")).server
        var form = ArrServerForm(editing: saved)
        form.name = "Sonarr 2"

        let savedData = try fixture("arr-server-saved")
        StubURLProtocol.handler = { _ in (200, StubURLProtocol.apiHeaders, savedData) }
        StubURLProtocol.requests = []
        _ = try await api.integrations.arrServers.update(saved.id, form.saveRequest)
        let patch = try XCTUnwrap(StubURLProtocol.requests.first)
        XCTAssertEqual(patch.httpMethod, "PATCH")
        XCTAssertEqual(
            try Self.jsonObject(Self.body(of: patch)),
            try Self.jsonObject(Data(#"""
            {"name":"Sonarr 2","is4k":false,"qualityProfileId":4,"rootFolderPath":"/tv","tags":[],
             "seriesType":"standard","seasonFolders":true,"animeQualityProfileId":null,"animeRootFolderPath":null,"animeTags":[]}
            """#.utf8))
        )

        let testData = try fixture("arr-server-test")
        StubURLProtocol.handler = { _ in (200, StubURLProtocol.apiHeaders, testData) }
        StubURLProtocol.requests = []
        _ = try await api.integrations.arrServers.test(form.testRequest)
        XCTAssertEqual(
            try Self.jsonObject(Self.body(of: try XCTUnwrap(StubURLProtocol.requests.first))),
            try Self.jsonObject(Data(#"{"kind":"sonarr","baseUrl":"http://192.168.1.10:8989","serverId":"4f0c2a8e-1b7d-4c1e-9a55-3c2d8e6f7a10"}"#.utf8))
        )
    }

    /// A blank reason sends no reason: no body for a title, just the keyword.
    func testBlockingWithoutAReasonSendsNoReason() async throws {
        let client = APIClient(baseURL: URL(string: "http://127.0.0.1:3000")!, token: "mqt_test", session: StubURLProtocol.session())
        let api = MarqueeAPI(client: client)
        let data = try fixture("ok")
        StubURLProtocol.handler = { _ in (200, StubURLProtocol.apiHeaders, data) }

        StubURLProtocol.requests = []
        try await api.titles.block(.tv, id: 1399, reason: "  ")
        let title = try XCTUnwrap(StubURLProtocol.requests.first)
        XCTAssertEqual(title.url?.path, "/api/v1/titles/tv/1399/block")
        XCTAssertTrue(Self.body(of: title).isEmpty)

        StubURLProtocol.requests = []
        try await api.blocklist.blockKeyword("reality", reason: "")
        let keyword = try XCTUnwrap(StubURLProtocol.requests.first)
        XCTAssertEqual(try Self.jsonObject(Self.body(of: keyword)), ["keyword": "reality"] as NSDictionary)
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

    func testUnknownDiscoverListIsNotFoundWithoutSending() async {
        StubURLProtocol.requests = []
        do {
            _ = try await MarqueeAPI(client: APIClient(baseURL: URL(string: "http://127.0.0.1:3000")!)).discover.list(.unknown("top-secret"))
            XCTFail("Expected notFound")
        } catch {
            XCTAssertEqual(error as? APIError, .notFound)
        }
        XCTAssertTrue(StubURLProtocol.requests.isEmpty)
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
