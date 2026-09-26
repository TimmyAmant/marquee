import XCTest
@testable import Marquee

// Every endpoint against a real Marquee server, to prove the DTOs decode what
// the server actually sends (not just what Docs/api-v1.md says it sends).
//
// Skipped unless MARQUEE_LIVE_URL is set. Start a throwaway server with
// Scripts/local-server.sh up, then:
//
//   TEST_RUNNER_MARQUEE_LIVE_URL=http://127.0.0.1:3100 \
//   TEST_RUNNER_MARQUEE_LIVE_USER=tester TEST_RUNNER_MARQUEE_LIVE_PASSWORD=correct-horse-battery \
//   xcodebuild -project Marquee.xcodeproj -scheme Marquee -destination 'platform=macOS' \
//     -derivedDataPath build/DerivedData test -only-testing:MarqueeTests/LiveContractTests
//
// Never point it at the household server: the mutations are safe but real
// (favorites, requests, a throwaway member account).
//
// Tests run in name order; the coverage summary is printed at the end.

@MainActor
final class LiveContractTests: XCTestCase {
    private struct Credentials {
        let url: String
        let username: String
        let password: String
        let memberUsername: String?
        let memberPassword: String?
    }

    private static func credentials() -> Credentials? {
        let environment = ProcessInfo.processInfo.environment
        guard let url = environment["MARQUEE_LIVE_URL"], !url.isEmpty else { return nil }
        return Credentials(
            url: url,
            username: environment["MARQUEE_LIVE_USER"] ?? "tester",
            password: environment["MARQUEE_LIVE_PASSWORD"] ?? "correct-horse-battery",
            memberUsername: environment["MARQUEE_LIVE_MEMBER_USER"],
            memberPassword: environment["MARQUEE_LIVE_MEMBER_PASSWORD"]
        )
    }

    private var credentials: Credentials!
    private var events: ServerEvents!
    private var adminSession: ServerSession!
    private var admin: MarqueeAPI!

    override func setUp() async throws {
        try await super.setUp()
        guard let credentials = Self.credentials() else {
            throw XCTSkip("Set MARQUEE_LIVE_URL (and MARQUEE_LIVE_USER / MARQUEE_LIVE_PASSWORD) to run the live contract tests")
        }
        self.credentials = credentials
        events = ServerEvents()
        adminSession = try makeSession()
        _ = try await adminSession.login(username: credentials.username, password: credentials.password)
        admin = MarqueeAPI(client: adminSession.client, events: events)
    }

    override func tearDown() async throws {
        if let adminSession {
            await adminSession.logout()
        }
        try await super.tearDown()
    }

    /// A session on the live server that records every request it makes, so
    /// the coverage summary is what really went over the wire.
    private func makeSession() throws -> ServerSession {
        let address = try ServerAddress.parse(credentials.url)
        let session = ServerSession(
            defaults: UserDefaults(suiteName: "com.timmyamant.MarqueeTests.live.\(UUID().uuidString)")!,
            tokenStore: InMemoryTokenStore(),
            urlSession: RecordingURLProtocol.session(),
            deviceName: "LiveContractTests"
        )
        session.select(address, info: nil)
        return session
    }

    // MARK: 1. Reads

    func test1ReadOnlyEndpoints() async throws {
        let info = try await admin.auth.serverInfo()
        XCTAssertEqual(info.app, "marquee")
        XCTAssertEqual(info.apiVersion, ServerInfo.supportedAPIVersion)
        XCTAssertEqual(info.setupComplete, true)

        let me = try await admin.me()
        XCTAssertEqual(me.username, credentials.username)
        XCTAssertTrue(me.isAdmin, "MARQUEE_LIVE_USER must be the admin")
        _ = try await admin.badges()

        // Discover / browse / search
        let shelves = try await admin.discover.shelves()
        XCTAssertFalse(shelves.trending.isEmpty, "TMDb must be configured on the test server")
        XCTAssertFalse(shelves.movieGenres.isEmpty)
        let firstPage = try await admin.browse.page(.movie)
        XCTAssertFalse(firstPage.results.isEmpty)
        XCTAssertTrue(firstPage.hasMorePages)
        let movieExtras = try await admin.browse.extras(.movie)
        XCTAssertFalse(movieExtras.genres.isEmpty)
        let genreId = try XCTUnwrap(movieExtras.genres.first?.id)
        let filtered = try await admin.browse.page(
            .movie, API.BrowseQuery(sort: .topRated, genreId: genreId, hideOwned: false), page: 2
        )
        XCTAssertEqual(filtered.page, 2)
        let seriesPage = try await admin.browse.page(.tv, API.BrowseQuery(sort: .newest))
        XCTAssertFalse(seriesPage.results.isEmpty)
        let seriesExtras = try await admin.browse.extras(.tv, API.BrowseQuery(networkId: 213))
        XCTAssertEqual(seriesExtras.network?.tmdbId, 213)
        let pick = try await admin.discover.surprise(API.SurpriseRequest(type: .movie, hideOwned: false))
        XCTAssertGreaterThan(pick.tmdbId, 0)

        let search = try await admin.search.results("keanu")
        XCTAssertFalse(search.people.isEmpty)
        let themed = try await admin.search.results("science fiction movies")
        XCTAssertNotNil(themed.theme)
        let suggestions = try await admin.search.suggestions("matrix")
        XCTAssertFalse(suggestions.isEmpty)
        let tooShort = try await admin.search.suggestions("m")
        XCTAssertTrue(tooShort.isEmpty, "Under two characters is always empty")

        // A movie and a TV title, with seasons and episodes
        let matrix = try await admin.titles.detail(.movie, id: 603)
        XCTAssertEqual(matrix.name, "The Matrix")
        XCTAssertEqual(matrix.facts.productionCountry?.code, "US")
        XCTAssertFalse(matrix.cast.isEmpty)
        XCTAssertFalse(matrix.studios.isEmpty)
        XCTAssertNotNil(matrix.franchise?.collectionId)
        let thrones = try await admin.titles.detail(.tv, id: 1399)
        XCTAssertEqual(thrones.tvdbId, 121_361)
        let season = try XCTUnwrap(thrones.seasons.last)
        XCTAssertEqual(thrones.seasons.map(\.seasonNumber), thrones.seasons.map(\.seasonNumber).sorted(by: >), "Newest first")
        let episodes = try await admin.titles.season(season.seasonNumber, ofShow: 1399)
        XCTAssertEqual(episodes.seasonNumber, season.seasonNumber)
        XCTAssertFalse(episodes.episodes.isEmpty)
        let status = try await admin.titles.status(.movie, id: 603)
        XCTAssertEqual(status.library.status, matrix.library.status)

        // Person, company
        let person = try await admin.people.detail(6384)
        XCTAssertEqual(person.name, "Keanu Reeves")
        XCTAssertFalse(person.credits.isEmpty)
        let company = try await admin.companies.detail(420)
        XCTAssertGreaterThan(company.titleCount, 0)

        // Lists
        _ = try await admin.favorites.all()
        _ = try await admin.favorites.isFavorited(.movie, id: 603)
        _ = try await admin.requests.mine()
        _ = try await admin.requests.pending()
        _ = try await admin.requests.history()
        _ = try await admin.requests.pendingCount()
        _ = try await admin.notifications.list(limit: 5)
        _ = try await admin.notifications.unreadCount()

        let calendar = try await admin.calendar.month()
        XCTAssertEqual(calendar.gridDays.count % 7, 0)
        let next = try await admin.calendar.month(calendar.nextMonth)
        XCTAssertEqual(next.month, calendar.nextMonth)
        _ = try await admin.activity.recent()

        let users = try await admin.users.list()
        XCTAssertTrue(users.contains { $0.isCurrentUser && $0.isAdmin })
        let integrations = try await admin.integrations.overview()
        XCTAssertTrue(integrations.tmdb.connected)
        XCTAssertFalse(integrations.arrWebhooks.secret.isEmpty)
        let jobs = try await admin.jobs.list()
        XCTAssertEqual(jobs.map(\.id).sorted(), ["arr-sync", "cleanup", "disk-space-snapshot", "jellyfin-sync", "plex-sync", "plex-watchlist"])
        let about = try await admin.about.info()
        XCTAssertEqual(about.version, info.version)
        let changelog = try await admin.about.changelog()
        XCTAssertFalse(changelog.isEmpty)
        let help = try await admin.help.errors()
        XCTAssertNotNil(help.entry(for: "Connect Sonarr in Settings first."))

        // Reads record nothing.
        XCTAssertEqual(events.revision(of: .all), 0)
    }

    // MARK: 2. Favorites

    func test2Favorites() async throws {
        var favorited = try await admin.favorites.add(.movie, id: 603)
        XCTAssertTrue(favorited)
        favorited = try await admin.favorites.isFavorited(.movie, id: 603)
        XCTAssertTrue(favorited)
        favorited = try await admin.favorites.add(.movie, id: 603)
        XCTAssertTrue(favorited, "Favoriting twice is idempotent")
        let withMovie = try await admin.favorites.all()
        XCTAssertTrue(withMovie.movies.contains { $0.tmdbId == 603 })
        XCTAssertEqual(withMovie.movies.first { $0.tmdbId == 603 }?.favorited, true)

        // Toggle flips whatever the state happens to be.
        let personWasFavorited = try await admin.favorites.isFavorited(.person, id: 6384)
        favorited = try await admin.favorites.toggle(.person, id: 6384)
        XCTAssertEqual(favorited, !personWasFavorited)
        favorited = try await admin.favorites.toggle(.person, id: 6384)
        XCTAssertEqual(favorited, personWasFavorited)
        favorited = try await admin.favorites.add(.company, id: 420)
        XCTAssertTrue(favorited)
        favorited = try await admin.favorites.add(.collection, id: 2344)
        XCTAssertTrue(favorited)
        let full = try await admin.favorites.all()
        XCTAssertTrue(full.studios.contains { $0.tmdbId == 420 })
        XCTAssertEqual(full.collections.first { $0.collectionId == 2344 }?.firstMovieTmdbId, 603)
        XCTAssertGreaterThan(events.favorites, 0, "Every favorite mutation signals a reload")

        for entity in [API.FavoriteEntityType.movie, .company, .collection] {
            let id = entity == .movie ? 603 : (entity == .company ? 420 : 2344)
            favorited = try await admin.favorites.remove(entity, id: id)
            XCTAssertFalse(favorited, entity.rawValue)
        }
        favorited = try await admin.favorites.remove(.movie, id: 603)
        XCTAssertFalse(favorited, "Unfavoriting twice is idempotent")
        let cleared = try await admin.favorites.all()
        XCTAssertFalse(cleared.movies.contains { $0.tmdbId == 603 })
        XCTAssertFalse(cleared.collections.contains { $0.collectionId == 2344 })
    }

    // MARK: 3. Requests, review and notifications

    func test3RequestReviewAndNotifications() async throws {
        let member = try await memberSession()
        let memberAPI = MarqueeAPI(client: member.session.client)
        let memberMe = try await memberAPI.me()
        XCTAssertFalse(memberMe.isAdmin)

        // A member's own view of a title decides whether they can request it.
        // `canRequest` alone isn't enough: the server leaves it true for a
        // title whose request was already approved (only a *pending* one sets
        // `alreadyRequested`), and requesting that again is a 409.
        let candidates = try await memberAPI.browse.page(.movie, API.BrowseQuery(hideOwned: false)).results
        let alreadyMine = Set(try await memberAPI.requests.mine().filter { $0.status != .rejected }.map(\.tmdbId))
        var requestable: [Int] = []
        for card in candidates.prefix(20) where requestable.count < 2 {
            guard !alreadyMine.contains(card.tmdbId) else { continue }
            let status = try await memberAPI.titles.status(.movie, id: card.tmdbId)
            if status.viewer.canRequest, status.viewer.requestStatus == nil {
                requestable.append(card.tmdbId)
            }
        }
        XCTAssertEqual(requestable.count, 2, "Needed two requestable movies")
        let (toReview, toManuallyApprove) = (requestable[0], requestable[1])

        let requestId = try await memberAPI.requests.create(.movie, id: toReview)
        _ = try await memberAPI.requests.create(.movie, id: toManuallyApprove)
        await assertThrowsAPIError(.conflict("You've already requested this.")) {
            _ = try await memberAPI.requests.create(.movie, id: toReview)
        }

        let mine = try await memberAPI.requests.mine()
        let pendingMine = try XCTUnwrap(mine.first { $0.id == requestId })
        XCTAssertEqual(pendingMine.status, .pending)
        XCTAssertEqual(pendingMine.statusTone, .pending)
        XCTAssertEqual(pendingMine.statusLabel, "Pending review")
        XCTAssertNil(pendingMine.libraryStatus)

        let queue = try await admin.requests.pending()
        XCTAssertTrue(queue.results.contains { $0.id == requestId })
        let queued = try XCTUnwrap(queue.results.first { $0.id == requestId })
        XCTAssertEqual(queued.requestedBy.username, member.username)
        XCTAssertEqual(queued.requestedBy.userId, memberMe.id)
        let pendingCount = try await admin.requests.pendingCount()
        XCTAssertGreaterThanOrEqual(pendingCount, 2)
        let adminBadges = try await admin.badges()
        XCTAssertGreaterThanOrEqual(adminBadges.pendingRequests, 2)

        // Approving needs Radarr; without it the server says so, and the
        // website's fallback is to approve by hand.
        do {
            try await admin.requests.approve(requestId)
        } catch let error as APIError {
            XCTAssertEqual(error, .conflict("Connect Radarr in Settings first."))
            try await admin.requests.reject(requestId)
        }
        try await admin.requests.manuallyApprove(
            try XCTUnwrap(queue.results.first { $0.tmdbId == toManuallyApprove }?.id)
        )
        await assertThrowsAPIError(.notFound) { try await self.admin.requests.reject(requestId) }

        let reviewed = try await admin.requests.history()
        XCTAssertTrue(reviewed.contains { $0.id == requestId })
        let manual = try XCTUnwrap(reviewed.first { $0.tmdbId == toManuallyApprove })
        XCTAssertTrue(manual.manuallyApproved)
        XCTAssertEqual(manual.statusLabel, "Manually approved")
        XCTAssertNotNil(manual.reviewedAt)

        let activity = try await admin.activity.recent()
        XCTAssertTrue(activity.contains { $0.eventType == .requestCreated && $0.actor.username == member.username })
        XCTAssertTrue(activity.contains { $0.eventType == .requestManuallyApproved })

        // "Approve all" needs Radarr/Sonarr for anything still queued (a
        // leftover from an interrupted run), so clear the queue first.
        for leftover in try await admin.requests.pending().results {
            try await admin.requests.reject(leftover.id)
        }
        let emptyQueue = try await admin.requests.approveAll()
        XCTAssertEqual(emptyQueue.approvedCount, 0)
        XCTAssertEqual(emptyQueue.failedCount, 0)
        XCTAssertNil(emptyQueue.message)

        // The requester was notified about both reviews.
        let notifications = try await memberAPI.notifications.list()
        XCTAssertGreaterThanOrEqual(notifications.unreadCount, 2)
        let notification = try XCTUnwrap(notifications.results.first)
        XCTAssertTrue([.requestApproved, .requestRejected].contains(notification.eventType))
        XCTAssertFalse(notification.read)
        try await memberAPI.notifications.markRead(notification.id)
        let afterRead = try await memberAPI.notifications.list()
        XCTAssertEqual(afterRead.unreadCount, notifications.unreadCount - 1)
        XCTAssertEqual(afterRead.results.first { $0.id == notification.id }?.read, true)
        await assertThrowsAPIError(.notFound) { try await memberAPI.notifications.markRead(UUID()) }
        try await memberAPI.notifications.markAllRead()
        let unread = try await memberAPI.notifications.unreadCount()
        XCTAssertEqual(unread, 0)
        let memberBadges = try await memberAPI.badges()
        XCTAssertEqual(memberBadges.unreadNotifications, 0)

        await member.session.logout()
    }

    // MARK: 4. Member permissions

    func test4MemberPermissions() async throws {
        let member = try await memberSession()
        let memberAPI = MarqueeAPI(client: member.session.client)

        let badges = try await memberAPI.badges()
        XCTAssertEqual(badges.pendingRequests, 0, "Members never see a pending count")
        let pendingCount = try await memberAPI.requests.pendingCount()
        XCTAssertEqual(pendingCount, 0)
        let visible = try await memberAPI.users.list()
        XCTAssertEqual(visible.count, 1)
        XCTAssertEqual(visible.first?.isCurrentUser, true)

        for call in adminOnlyCalls(memberAPI) {
            await assertThrowsAPIError(.forbidden, message: call.label) { try await call.body() }
        }

        // A member's title page offers Request, never Add.
        let title = try await memberAPI.titles.detail(.movie, id: 603)
        XCTAssertFalse(title.viewer.isAdmin)
        XCTAssertFalse(title.viewer.canAdd)
        XCTAssertFalse(title.viewer.canRelink)
        XCTAssertTrue(title.franchise?.addAllMissing.isEmpty ?? true)

        await member.session.logout()
    }

    // MARK: 5. Household accounts

    func test5HouseholdAccounts() async throws {
        let username = "contract-\(UUID().uuidString.prefix(8).lowercased())"
        let created = try await admin.users.create(
            API.CreateUserRequest(username: username, password: "correct-horse-battery", displayName: "Contract")
        )
        XCTAssertEqual(created.username, username)
        XCTAssertEqual(created.role, .member)
        XCTAssertFalse(created.isCurrentUser)

        await assertThrowsAPIError(.conflict("An account with that username already exists")) {
            _ = try await self.admin.users.create(API.CreateUserRequest(username: username, password: "correct-horse-battery"))
        }

        let updated = try await admin.users.update(
            created.id, API.UpdateUserRequest(username: username, displayName: "Renamed", autoApproveTv: true)
        )
        XCTAssertEqual(updated.user.displayName, "Renamed")
        XCTAssertTrue(updated.user.autoApproveTv)
        XCTAssertFalse(updated.tokensRevoked)

        // A member editing their own account: the id in the path has to match
        // the server's own lowercase uuid string, or this answers 403.
        let session = try makeSession()
        _ = try await session.login(username: username, password: "correct-horse-battery")
        let theirAPI = MarqueeAPI(client: session.client)
        let selfUpdate = try await theirAPI.users.update(created.id, API.UpdateUserRequest(username: username, displayName: "Self"))
        XCTAssertEqual(selfUpdate.user.displayName, "Self")
        await assertThrowsAPIError(.forbidden) {
            _ = try await theirAPI.users.update(UUID(), API.UpdateUserRequest(username: "x"))
        }

        // A password change revokes that account's tokens (deviation 5).
        let revoked = try await admin.users.update(
            created.id, API.UpdateUserRequest(username: username, password: "correct-horse-battery-2")
        )
        XCTAssertTrue(revoked.tokensRevoked)
        await assertThrowsAPIError(.unauthorized) { _ = try await theirAPI.me() }

        try await admin.users.remove(created.id)
        let remaining = try await admin.users.list()
        XCTAssertFalse(remaining.contains { $0.id == created.id })
        await assertThrowsAPIError(.notFound) { try await self.admin.users.remove(created.id) }
        XCTAssertGreaterThan(events.users, 0)
    }

    // MARK: 6. Actions that need an integration, and their errors

    func test6ActionsAndIntegrationSettings() async throws {
        // Without Radarr/Sonarr the server explains itself rather than failing oddly.
        await assertThrowsAPIError(.conflict("Connect Radarr in Settings first.")) {
            try await self.admin.titles.add(.movie, id: 603)
        }
        await assertThrowsAPIError(.conflict("Not tracked in Radarr/Sonarr.")) {
            try await self.admin.titles.searchNow(.movie, id: 603)
        }
        await assertThrowsAPIError(.conflict("Not tracked in Radarr/Sonarr.")) {
            _ = try await self.admin.titles.setMonitored(false, .movie, id: 603)
        }
        await assertThrowsAPIError(.invalid("That's already the current match.")) {
            _ = try await self.admin.titles.relink(.movie, id: 603, to: .tmdb(603))
        }

        for provider in API.ArrProvider.allCases {
            let arr = admin.integrations.arr(provider)
            await assertThrowsAPIError(.conflict("Connect \(provider.displayName) in Settings first."), message: provider.rawValue) {
                _ = try await arr.options()
            }
            await assertThrowsAPIError(.invalid("Pick a root folder and a quality profile."), message: provider.rawValue) {
                try await arr.saveDefaults(rootFolderPath: "", qualityProfileId: 1)
            }
            await assertThrowsAPIError(nil, message: "\(provider.rawValue) connect") {
                // Nothing is listening on port 9 — a connection failure, not a bad request.
                _ = try await arr.connect(baseUrl: "http://127.0.0.1:9", apiKey: "nope")
            }
            try await arr.disconnect()
        }
        await assertThrowsAPIError(nil, message: "jellyfin connect") {
            try await self.admin.integrations.jellyfin.connect(baseUrl: "http://127.0.0.1:9", apiKey: "nope")
        }
        try await admin.integrations.jellyfin.disconnect()
        try await admin.integrations.plex.disconnect()

        // Instance-wide settings: a rejected value changes nothing.
        await assertThrowsAPIError(.invalid("Enter an access token.")) { try await self.admin.integrations.tmdb.save("") }
        await assertThrowsAPIError(.invalid("Enter a Trakt client id.")) { try await self.admin.integrations.trakt.save("") }
        await assertThrowsAPIError(.invalid("Enter a TheTVDB API key.")) { try await self.admin.integrations.tvdb.save("") }
        await assertThrowsAPIError(.invalid("That doesn't look like a Discord webhook URL.")) {
            try await self.admin.integrations.discord.save("https://example.com/hook")
        }
        await assertThrowsAPIError(.invalid("Enter a full URL, e.g. https://ntfy.sh/your-topic-name.")) {
            try await self.admin.integrations.ntfy.save("my-topic")
        }
        await assertThrowsAPIError(.invalid("Enter a valid URL, starting with http:// or https://.")) {
            try await self.admin.integrations.webhook.save("nope")
        }
        await assertThrowsAPIError(.invalid("Enter the chat ID to send to.")) {
            try await self.admin.integrations.telegram.save(botToken: "123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", chatId: "")
        }
        await assertThrowsAPIError(nil, message: "pushover save") {
            try await self.admin.integrations.pushover.save(appToken: "short", userKey: "short")
        }
        await assertThrowsAPIError(.invalid("Enter at least one address to send to.")) {
            try await self.admin.integrations.email.save(API.EmailRequest(
                host: "smtp.example.com", port: 587, secure: false, username: "", password: "", from: "me@example.com", to: []
            ))
        }
        await assertThrowsAPIError(.conflict("Connect Trakt in Settings first.")) {
            _ = try await self.admin.integrations.trakt.importList(url: "https://trakt.tv/users/someone/watchlist")
        }
        for setting in [admin.integrations.trakt.remove, admin.integrations.tvdb.remove,
                        admin.integrations.discord.remove, admin.integrations.ntfy.remove,
                        admin.integrations.telegram.remove, admin.integrations.pushover.remove,
                        admin.integrations.email.remove,
                        admin.integrations.webhook.remove] {
            try await setting()
        }
        let settings = try await admin.integrations.overview()
        XCTAssertTrue(settings.tmdb.connected, "TMDb is left configured for the other tests")

        // Webhook URLs, sync and a job that needs nothing connected.
        let before = try await admin.integrations.overview().arrWebhooks
        let regenerated = try await admin.integrations.regenerateWebhookSecret()
        XCTAssertNotEqual(regenerated.secret, before.secret)
        XCTAssertTrue(regenerated.url(for: .sonarr).contains(regenerated.secret))
        try await admin.integrations.syncNow()
        try await admin.jobs.run("disk-space-snapshot")
        await assertThrowsAPIError(.notFound) { try await self.admin.jobs.run("not-a-job") }

        // Plex sign-in: starting a PIN only talks to plex.tv, and polling it
        // reports "not yet". A plex.tv outage shouldn't fail the suite.
        do {
            let pin = try await admin.integrations.plex.startPin()
            XCTAssertNotNil(pin.url)
            let status = try await admin.integrations.plex.pollPin(pin.pinId)
            XCTAssertFalse(status.connected)
        } catch let error as APIError {
            XCTAssertTrue(error.isConnectivityFailure || error == .upstream("Couldn't start Plex sign-in. Try again."), "\(error)")
        }
    }

    // MARK: 7. Tokens

    func test7SetupAndLogoutInvalidateTokens() async throws {
        await assertThrowsAPIError(.setupComplete) {
            _ = try await self.admin.auth.setup(username: "another", password: "correct-horse-battery", deviceName: "LiveContractTests")
        }
        await assertThrowsAPIError(.invalidCredentials) {
            _ = try await self.admin.auth.login(username: self.credentials.username, password: "wrong-password", deviceName: "LiveContractTests")
        }

        // A token from a plain login (no session around it) stops working the
        // moment it's logged out.
        let response = try await admin.auth.login(
            username: credentials.username, password: credentials.password, deviceName: "LiveContractTests logout"
        )
        XCTAssertTrue(response.token.hasPrefix("mqt_"))
        XCTAssertGreaterThan(response.expiresAt, Date())
        let client = APIClient(
            baseURL: try ServerAddress.parse(credentials.url).baseURL,
            token: response.token,
            session: RecordingURLProtocol.session()
        )
        let api = MarqueeAPI(client: client)
        let signedIn = try await api.me()
        XCTAssertEqual(signedIn.username, credentials.username)
        try await api.auth.logout()
        await assertThrowsAPIError(.unauthorized) { _ = try await api.me() }
        await assertThrowsAPIError(.unauthorized) { _ = try await api.badges() }

        // An unknown path under /api/v1 is a normal JSON 404 (deviation 8).
        await assertThrowsAPIError(.notFound) { _ = try await self.admin.jobs.run("../nope") }
    }

    // MARK: 8. Coverage

    func test8EveryEndpointWasExercised() {
        let (covered, missing) = RecordingURLProtocol.coverage()
        print("LIVE CONTRACT COVERAGE: \(covered.count)/\(covered.count + missing.count) endpoints")
        if !missing.isEmpty {
            print("Not exercised: " + missing.joined(separator: ", "))
        }
        // Only the one destructive call is left out: removing the TMDb token
        // would break every TMDb-backed test that follows it.
        XCTAssertEqual(missing, ["DELETE /settings/integrations/tmdb"])
    }

    // MARK: 9. Field-level round trip

    /// A field the DTOs got wrong would otherwise decode as a silent nil, so
    /// every response is re-encoded and compared key-for-key with what the
    /// server sent. Runs last, when the request/notification/activity lists
    /// actually have rows in them.
    func test9NoServerFieldIsDropped() async throws {
        let token = try await admin.auth.login(
            username: credentials.username, password: credentials.password, deviceName: "LiveContractTests fields"
        ).token
        let raw = RawClient(baseURL: try ServerAddress.parse(credentials.url).baseURL, token: token)

        // Something favorited, so the Favorites sections aren't all empty.
        _ = try await admin.favorites.add(.movie, id: 603)
        _ = try await admin.favorites.add(.person, id: 6384)
        _ = try await admin.favorites.add(.collection, id: 2344)

        try await assertRoundTrips(raw, "/server-info", API.ServerInfo.self)
        try await assertRoundTrips(raw, "/me", API.Me.self)
        try await assertRoundTrips(raw, "/badges", API.Badges.self)
        try await assertRoundTrips(raw, "/discover", API.DiscoverShelves.self)
        try await assertRoundTrips(raw, "/movies?page=1", API.BrowsePage.self)
        try await assertRoundTrips(raw, "/movies/extras", API.BrowseExtras.self)
        try await assertRoundTrips(raw, "/series/extras?network=213", API.BrowseExtras.self)
        try await assertRoundTrips(raw, "/search?q=keanu", API.SearchResults.self)
        try await assertRoundTrips(raw, "/search?q=science%20fiction%20movies", API.SearchResults.self)
        try await assertRoundTrips(raw, "/search/suggest?q=matrix", API.ListResponse<API.SearchSuggestion>.self)
        try await assertRoundTrips(raw, "/titles/movie/603", API.TitleDetail.self)
        try await assertRoundTrips(raw, "/titles/tv/1399", API.TitleDetail.self)
        try await assertRoundTrips(raw, "/titles/tv/1399/seasons/1", API.SeasonEpisodes.self)
        try await assertRoundTrips(raw, "/titles/movie/603/status", API.TitleStatus.self)
        try await assertRoundTrips(raw, "/people/6384", API.PersonDetail.self)
        try await assertRoundTrips(raw, "/companies/420", API.CompanyDetail.self)
        try await assertRoundTrips(raw, "/favorites", API.FavoritesResponse.self)
        try await assertRoundTrips(raw, "/favorites/movie/603", API.FavoriteState.self)
        try await assertRoundTrips(raw, "/requests/history", API.ListResponse<API.ReviewedRequest>.self)
        try await assertRoundTrips(raw, "/requests/pending", API.PendingRequests.self)
        try await assertRoundTrips(raw, "/requests/pending-count", API.Count.self)
        try await assertRoundTrips(raw, "/notifications", API.NotificationList.self)
        try await assertRoundTrips(raw, "/calendar", API.CalendarMonthResponse.self)
        try await assertRoundTrips(raw, "/settings/activity", API.ListResponse<API.ActivityItem>.self)
        try await assertRoundTrips(raw, "/users", API.ListResponse<API.HouseholdMember>.self)
        try await assertRoundTrips(raw, "/settings/integrations", API.IntegrationsOverview.self)
        try await assertRoundTrips(raw, "/settings/jobs", API.ListResponse<API.Job>.self)
        try await assertRoundTrips(raw, "/settings/about", API.AboutInfo.self)
        try await assertRoundTrips(raw, "/changelog", API.ListResponse<API.ChangelogEntry>.self)
        try await assertRoundTrips(raw, "/help/errors", API.ListResponse<API.ErrorReferenceCategory>.self)

        // The member's own lists, which have rows after test 3.
        let member = try await memberSession()
        let memberToken = try await MarqueeAPI(client: member.session.client).auth.login(
            username: member.username, password: credentials.memberPassword ?? "correct-horse-battery",
            deviceName: "LiveContractTests fields"
        ).token
        let memberRaw = RawClient(baseURL: try ServerAddress.parse(credentials.url).baseURL, token: memberToken)
        try await assertRoundTrips(memberRaw, "/requests/mine", API.ListResponse<API.MyRequest>.self)
        try await assertRoundTrips(memberRaw, "/notifications", API.NotificationList.self)
        await member.session.logout()

        // Leave the favorites as they were, so a second run starts clean.
        for entity in [(API.FavoriteEntityType.movie, 603), (.person, 6384), (.collection, 2344)] {
            _ = try await admin.favorites.remove(entity.0, id: entity.1)
        }
    }

    /// Fetches `path`, decodes it as `type`, re-encodes it, and asserts the
    /// two JSON trees have the same keys (a null on the wire may be dropped).
    private func assertRoundTrips<T: Codable>(
        _ raw: RawClient,
        _ path: String,
        _ type: T.Type,
        file: StaticString = #filePath,
        line: UInt = #line
    ) async throws {
        let data = try await raw.get(path)
        let decoded: T
        do {
            decoded = try APIClient.decoder.decode(type, from: data)
        } catch {
            return XCTFail("\(path): \(error)", file: file, line: line)
        }
        let reencoded = try APIClient.encoder.encode(decoded)
        let sent = try JSONSerialization.jsonObject(with: data)
        let mapped = try JSONSerialization.jsonObject(with: reencoded)
        for difference in Self.keyDifferences(sent: sent, mapped: mapped, at: path) {
            XCTFail(difference, file: file, line: line)
        }
    }

    /// Compares the shape of two JSON trees, ignoring values and arrays' order.
    private static func keyDifferences(sent: Any, mapped: Any, at path: String) -> [String] {
        if let sent = sent as? [String: Any] {
            guard let mapped = mapped as? [String: Any] else { return ["\(path): the DTO doesn't map this object"] }
            var problems: [String] = []
            for (key, value) in sent where !(value is NSNull) {
                guard let mappedValue = mapped[key] else {
                    problems.append("\(path).\(key): the server sends it, the DTO drops it")
                    continue
                }
                problems += keyDifferences(sent: value, mapped: mappedValue, at: "\(path).\(key)")
            }
            for key in mapped.keys where sent[key] == nil {
                problems.append("\(path).\(key): the DTO invents it")
            }
            return problems
        }
        if let sent = sent as? [Any] {
            guard let mapped = mapped as? [Any], mapped.count == sent.count else {
                return ["\(path): the DTO doesn't map this array"]
            }
            return zip(sent, mapped).enumerated().flatMap { index, pair in
                keyDifferences(sent: pair.0, mapped: pair.1, at: "\(path)[\(index)]")
            }
        }
        return []
    }

    // MARK: Helpers

    /// Reads an endpoint as raw JSON, bypassing the DTOs.
    private struct RawClient {
        let baseURL: URL
        let token: String

        func get(_ path: String) async throws -> Data {
            var request = URLRequest(url: URL(string: baseURL.absoluteString + "/api/v1" + path)!, timeoutInterval: 60)
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            let (data, response) = try await URLSession(configuration: .ephemeral).data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard (200..<300).contains(status) else {
                throw APIError.from(statusCode: status, body: data)
            }
            return data
        }
    }

    private struct Member {
        let session: ServerSession
        let username: String
    }

    /// The member account from the environment, or a throwaway one created for
    /// this run through the admin.
    private func memberSession() async throws -> Member {
        let session = try makeSession()
        if let username = credentials.memberUsername, let password = credentials.memberPassword {
            _ = try await session.login(username: username, password: password)
            return Member(session: session, username: username)
        }
        let username = "contract-member-\(UUID().uuidString.prefix(8).lowercased())"
        let password = "correct-horse-battery"
        _ = try await admin.users.create(API.CreateUserRequest(username: username, password: password))
        _ = try await session.login(username: username, password: password)
        return Member(session: session, username: username)
    }

    private struct AdminOnlyCall {
        let label: String
        let body: () async throws -> Void
    }

    private func adminOnlyCalls(_ api: MarqueeAPI) -> [AdminOnlyCall] {
        [
            AdminOnlyCall(label: "requests.pending") { _ = try await api.requests.pending() },
            AdminOnlyCall(label: "requests.history") { _ = try await api.requests.history() },
            AdminOnlyCall(label: "requests.approveAll") { _ = try await api.requests.approveAll() },
            AdminOnlyCall(label: "activity.recent") { _ = try await api.activity.recent() },
            AdminOnlyCall(label: "integrations.overview") { _ = try await api.integrations.overview() },
            AdminOnlyCall(label: "integrations.webhookSecret") { _ = try await api.integrations.regenerateWebhookSecret() },
            AdminOnlyCall(label: "integrations.plex.startPin") { _ = try await api.integrations.plex.startPin() },
            AdminOnlyCall(label: "integrations.plex.pollPin") { _ = try await api.integrations.plex.pollPin(1) },
            AdminOnlyCall(label: "jobs.list") { _ = try await api.jobs.list() },
            AdminOnlyCall(label: "jobs.run") { try await api.jobs.run("plex-sync") },
            AdminOnlyCall(label: "titles.searchNow") { try await api.titles.searchNow(.movie, id: 603) },
            AdminOnlyCall(label: "titles.monitored") { _ = try await api.titles.setMonitored(true, .movie, id: 603) },
            AdminOnlyCall(label: "titles.relink") { _ = try await api.titles.relink(.movie, id: 603, to: .tmdb(604)) },
            AdminOnlyCall(label: "titles.add") { try await api.titles.add(.movie, id: 603) },
            AdminOnlyCall(label: "trakt.import") { _ = try await api.integrations.trakt.importList(url: "https://trakt.tv/users/x/watchlist") },
        ]
    }

    /// Asserts the call throws `expected` (any `APIError` when nil), and
    /// never the "couldn't read the response" error a DTO mismatch produces.
    private func assertThrowsAPIError(
        _ expected: APIError?,
        message: String = "",
        file: StaticString = #filePath,
        line: UInt = #line,
        _ body: () async throws -> Void
    ) async {
        do {
            try await body()
            XCTFail("Expected \(expected.map(String.init(describing:)) ?? "an APIError") — \(message)", file: file, line: line)
        } catch let error as APIError {
            if let expected {
                XCTAssertEqual(error, expected, message, file: file, line: line)
            }
            XCTAssertNotEqual(
                error.errorDescription, "Your Marquee server sent a response this version of the app couldn't read.",
                "Decoding failure — \(message)", file: file, line: line
            )
        } catch {
            XCTFail("Expected an APIError, got \(error) — \(message)", file: file, line: line)
        }
    }

}

/// Passes requests through to the real server while recording which endpoint
/// each one hit, so the suite can report its own coverage.
final class RecordingURLProtocol: URLProtocol {
    /// method + path template for all 81 endpoints in Docs/api-v1.md.
    private static let endpoints: [(String, String)] = [
        ("GET", "/server-info"), ("POST", "/auth/login"), ("POST", "/auth/setup"), ("POST", "/auth/logout"),
        ("GET", "/me"), ("GET", "/badges"),
        ("GET", "/discover"), ("GET", "/movies"), ("GET", "/movies/extras"), ("GET", "/series"),
        ("GET", "/series/extras"), ("POST", "/surprise"), ("GET", "/search"), ("GET", "/search/suggest"),
        ("GET", "/titles/{type}/{id}"), ("GET", "/titles/tv/{id}/seasons/{season}"), ("GET", "/titles/{type}/{id}/status"),
        ("POST", "/titles/{type}/{id}/add"), ("POST", "/titles/{type}/{id}/search"), ("PUT", "/titles/{type}/{id}/monitored"),
        ("POST", "/titles/{type}/{id}/relink"), ("POST", "/titles/{type}/{id}/request"),
        ("GET", "/people/{id}"), ("GET", "/companies/{id}"),
        ("GET", "/favorites"), ("GET", "/favorites/{entityType}/{id}"), ("PUT", "/favorites/{entityType}/{id}"),
        ("DELETE", "/favorites/{entityType}/{id}"), ("POST", "/favorites/{entityType}/{id}/toggle"),
        ("GET", "/requests/mine"), ("GET", "/requests/pending"), ("GET", "/requests/history"),
        ("GET", "/requests/pending-count"), ("POST", "/requests/{uuid}/approve"), ("POST", "/requests/{uuid}/manual-approve"),
        ("POST", "/requests/{uuid}/reject"), ("POST", "/requests/approve-all"),
        ("GET", "/notifications"), ("GET", "/notifications/unread-count"), ("POST", "/notifications/read-all"),
        ("POST", "/notifications/{uuid}/read"),
        ("GET", "/calendar"), ("GET", "/settings/activity"),
        ("GET", "/users"), ("POST", "/users"), ("PATCH", "/users/{uuid}"), ("DELETE", "/users/{uuid}"),
        ("GET", "/settings/integrations"), ("POST", "/settings/integrations/sync"),
        ("POST", "/settings/integrations/webhook-secret"),
        ("PUT", "/settings/integrations/sonarr"), ("DELETE", "/settings/integrations/sonarr"),
        ("GET", "/settings/integrations/sonarr/options"), ("PUT", "/settings/integrations/sonarr/defaults"),
        ("PUT", "/settings/integrations/radarr"), ("DELETE", "/settings/integrations/radarr"),
        ("GET", "/settings/integrations/radarr/options"), ("PUT", "/settings/integrations/radarr/defaults"),
        ("POST", "/settings/integrations/plex/pin"), ("GET", "/settings/integrations/plex/pin/{id}"),
        ("DELETE", "/settings/integrations/plex"),
        ("PUT", "/settings/integrations/jellyfin"), ("DELETE", "/settings/integrations/jellyfin"),
        ("PUT", "/settings/integrations/tmdb"), ("DELETE", "/settings/integrations/tmdb"),
        ("PUT", "/settings/integrations/trakt"), ("DELETE", "/settings/integrations/trakt"),
        ("POST", "/settings/integrations/trakt/import"),
        ("PUT", "/settings/integrations/tvdb"), ("DELETE", "/settings/integrations/tvdb"),
        ("PUT", "/settings/integrations/discord"), ("DELETE", "/settings/integrations/discord"),
        ("PUT", "/settings/integrations/ntfy"), ("DELETE", "/settings/integrations/ntfy"),
        ("PUT", "/settings/integrations/telegram"), ("DELETE", "/settings/integrations/telegram"),
        ("PUT", "/settings/integrations/pushover"), ("DELETE", "/settings/integrations/pushover"),
        ("PUT", "/settings/integrations/email"), ("DELETE", "/settings/integrations/email"),
        ("PUT", "/settings/integrations/webhook"), ("DELETE", "/settings/integrations/webhook"),
        ("GET", "/settings/jobs"), ("POST", "/settings/jobs/{id}/run"),
        ("GET", "/settings/about"), ("GET", "/changelog"), ("GET", "/help/errors"),
    ]

    private static let lock = NSLock()
    nonisolated(unsafe) private static var hits: Set<String> = []

    /// The endpoints this run reached, and the ones it didn't.
    static func coverage() -> (covered: [String], missing: [String]) {
        let hits = lock.withLock { self.hits }
        let all = endpoints.map { "\($0.0) \($0.1)" }
        return (all.filter { hits.contains($0) }, all.filter { !hits.contains($0) })
    }

    static func session() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [RecordingURLProtocol.self]
        configuration.timeoutIntervalForResource = 900
        configuration.httpShouldSetCookies = false
        return URLSession(configuration: configuration)
    }

    /// The session requests are really sent with (no protocol of ours, so this
    /// doesn't recurse).
    private static let forwarding: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForResource = 900
        configuration.httpShouldSetCookies = false
        return URLSession(configuration: configuration)
    }()

    private static func record(_ method: String, _ path: String) {
        let segments = path.split(separator: "/").map(String.init)
        guard segments.first == "api", segments.dropFirst().first == "v1" else { return }
        let rest = Array(segments.dropFirst(2))
        for (endpointMethod, template) in endpoints where endpointMethod == method {
            let parts = template.split(separator: "/").map(String.init)
            guard parts.count == rest.count else { continue }
            let matches = zip(parts, rest).allSatisfy { part, actual in
                part.hasPrefix("{") ? !actual.isEmpty : part == actual
            }
            if matches {
                lock.withLock { _ = hits.insert("\(method) \(template)") }
                return
            }
        }
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.record(request.httpMethod ?? "GET", request.url?.path ?? "")
        // URLSession hands the body over as a stream; the forwarding session
        // needs it back as data.
        var forwarded = request
        if forwarded.httpBody == nil, let stream = request.httpBodyStream {
            stream.open()
            var data = Data()
            var buffer = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable {
                let read = stream.read(&buffer, maxLength: buffer.count)
                if read <= 0 { break }
                data.append(buffer, count: read)
            }
            stream.close()
            forwarded.httpBody = data
        }
        let client = self.client
        nonisolated(unsafe) let unsafeSelf = self
        let task = Self.forwarding.dataTask(with: forwarded) { data, response, error in
            if let error {
                client?.urlProtocol(unsafeSelf, didFailWithError: error)
                return
            }
            if let response {
                client?.urlProtocol(unsafeSelf, didReceive: response, cacheStoragePolicy: .notAllowed)
            }
            if let data {
                client?.urlProtocol(unsafeSelf, didLoad: data)
            }
            client?.urlProtocolDidFinishLoading(unsafeSelf)
        }
        forwardedTask = task
        task.resume()
    }

    override func stopLoading() {
        forwardedTask?.cancel()
        forwardedTask = nil
    }

    /// `URLProtocol.task` is the request being handled; this is the one that
    /// carries it to the server.
    private var forwardedTask: URLSessionDataTask?
}
