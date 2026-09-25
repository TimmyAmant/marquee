import XCTest
@testable import Marquee

// Every example response in Docs/api-v1.md (extracted to Fixtures/api by
// Scripts/extract-api-fixtures.py) decoded with its DTO, plus the value types
// the DTOs are built from: open enums, calendar days, image refs.

final class APIFixtureTests: XCTestCase {
    private typealias Check = (Data) throws -> Void

    private static var fixturesURL: URL {
        Bundle(for: APIFixtureTests.self).resourceURL!.appendingPathComponent("Fixtures/api", isDirectory: true)
    }

    private func fixture(_ name: String) throws -> Data {
        try Data(contentsOf: Self.fixturesURL.appendingPathComponent(name + ".json"))
    }

    private func decode<T: Decodable>(_ type: T.Type, _ name: String) throws -> T {
        try APIClient.decoder.decode(type, from: fixture(name))
    }

    private func decodes<T: Decodable>(_ type: T.Type) -> Check {
        { data in _ = try APIClient.decoder.decode(type, from: data) }
    }

    /// Fixture name → the DTO its endpoint decodes into.
    private var checks: [String: Check] { [
        "title-card": decodes(API.TitleCard.self),
        "person-card": decodes(API.PersonCard.self),
        "company-card": decodes(API.CompanyCard.self),
        "network-card": decodes(API.NetworkCard.self),
        "request-person": decodes(API.RequestPerson.self),
        "server-info": decodes(API.ServerInfo.self),
        "auth-login": decodes(API.AuthResponse.self),
        "ok": decodes(API.OK.self),
        "me": decodes(API.Me.self),
        "badges": decodes(API.Badges.self),
        "discover": decodes(API.DiscoverShelves.self),
        "browse-page": decodes(API.BrowsePage.self),
        "browse-extras": decodes(API.BrowseExtras.self),
        "surprise": decodes(API.TitleID.self),
        "search": decodes(API.SearchResults.self),
        "search-suggest": decodes(API.ListResponse<API.SearchSuggestion>.self),
        "title-detail": decodes(API.TitleDetail.self),
        "season-episodes": decodes(API.SeasonEpisodes.self),
        "title-status": decodes(API.TitleStatus.self),
        "title-add": decodes(API.OK.self),
        "title-search": decodes(API.OK.self),
        "title-monitored": decodes(API.MonitoredResult.self),
        "title-relink": decodes(API.RelinkResult.self),
        "person-detail": decodes(API.PersonDetail.self),
        "company-detail": decodes(API.CompanyDetail.self),
        "favorites": decodes(API.FavoritesResponse.self),
        "favorite-state": decodes(API.FavoriteState.self),
        "favorite-toggle": decodes(API.FavoriteState.self),
        "request-created": decodes(API.RequestCreated.self),
        "requests-mine": decodes(API.ListResponse<API.MyRequest>.self),
        "requests-pending": decodes(API.PendingRequests.self),
        "requests-history": decodes(API.ListResponse<API.ReviewedRequest>.self),
        "requests-pending-count": decodes(API.Count.self),
        "requests-approve-all": decodes(API.ApproveAllResult.self),
        "notifications": decodes(API.NotificationList.self),
        "notifications-unread-count": decodes(API.Count.self),
        "calendar": decodes(API.CalendarMonthResponse.self),
        "activity": decodes(API.ListResponse<API.ActivityItem>.self),
        "household-member": decodes(API.HouseholdMember.self),
        "users": decodes(API.ListResponse<API.HouseholdMember>.self),
        "user-update": decodes(API.UpdateUserResult.self),
        "avatar-set": decodes(API.AvatarResult.self),
        "avatar-removed": decodes(API.AvatarResult.self),
        "integrations": decodes(API.IntegrationsOverview.self),
        "webhook-secret": decodes(API.ArrWebhooks.self),
        "arr-connect": decodes(API.ArrConnectionResult.self),
        "arr-options": decodes(API.ArrOptions.self),
        "plex-pin-start": decodes(API.PlexPinStart.self),
        "plex-pin-waiting": decodes(API.PlexPinStatus.self),
        "plex-pin-connected": decodes(API.PlexPinStatus.self),
        "trakt-import": decodes(API.TraktImportResult.self),
        "jobs": decodes(API.ListResponse<API.Job>.self),
        "about": decodes(API.AboutInfo.self),
        "changelog": decodes(API.ListResponse<API.ChangelogEntry>.self),
        "help-errors": decodes(API.ListResponse<API.ErrorReferenceCategory>.self),
        "error-upstream": decodes(APIError.Body.self),
    ] }

    func testEveryDocExampleDecodes() throws {
        let files = try FileManager.default.contentsOfDirectory(at: Self.fixturesURL, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "json" }
        let names = Set(files.map { $0.deletingPathExtension().lastPathComponent })
        XCTAssertEqual(names.count, 56, "docs/api-v1.md's examples; re-run Scripts/extract-api-fixtures.py after editing the doc")
        let checks = self.checks
        XCTAssertEqual(names, Set(checks.keys), "Every fixture needs a DTO here, and every DTO here a fixture")

        for name in names.sorted() {
            guard let check = checks[name] else { continue }
            do {
                try check(fixture(name))
            } catch {
                XCTFail("\(name).json: \(error)")
            }
        }
    }

    // MARK: Decoded values

    func testTitleDetailValues() throws {
        let detail = try decode(API.TitleDetail.self, "title-detail")
        XCTAssertEqual(detail.id, API.TitleID(.movie, 603))
        XCTAssertEqual(detail.releaseDate, API.CalendarDay(year: 1999, month: 3, day: 31))
        XCTAssertEqual(detail.facts.productionCountry?.flag, "🇺🇸")
        XCTAssertEqual(detail.facts.ratingPercent, 83)
        XCTAssertEqual(detail.links.trailerURL?.absoluteString, "https://www.youtube.com/watch?v=FVI84Dfx2-I")
        XCTAssertEqual(detail.links.external.first?.link?.host, "www.imdb.com")
        XCTAssertEqual(detail.library.status, .owned)
        XCTAssertEqual(detail.library.provider, .plex)
        let file = try XCTUnwrap(detail.library.file)
        XCTAssertEqual(file.sizeBytes, 31_229_390_464)
        XCTAssertEqual(file.resolutionTier, .uhd)
        XCTAssertEqual(file.resolutionLabel, "4K")
        XCTAssertEqual(file.audioLabel, "TrueHD Atmos 7.1ch")
        XCTAssertEqual(file.dateAdded, APIClient.parseDate("2025-11-02T09:14:00.000Z"))
        XCTAssertEqual(detail.viewer.arrTracking, API.ArrTracking(arrId: 412, monitored: true))
        XCTAssertNil(detail.viewer.otherRequestersLine)
        XCTAssertEqual(detail.franchise?.collectionId, 2344)
        XCTAssertEqual(detail.franchise?.addAllMissing, [API.TitleID(.movie, 604)])
        XCTAssertEqual(detail.cast.first?.character, "Neo")

        let status = try decode(API.TitleStatus.self, "title-status")
        let updated = detail.updating(status)
        XCTAssertEqual(updated.library.status, .trackedMonitored)
        XCTAssertNil(updated.library.file)
        XCTAssertEqual(updated.cast, detail.cast)
    }

    func testRequestsAndNotifications() throws {
        let mine = try decode(API.ListResponse<API.MyRequest>.self, "requests-mine").results
        XCTAssertEqual(mine.first?.status, .approved)
        XCTAssertEqual(mine.first?.statusTone, .downloading)
        XCTAssertEqual(mine.first?.libraryStatus, .trackedDownloading)
        XCTAssertEqual(mine.first?.reviewedAt, APIClient.parseDate("2026-09-17T18:00:02.118Z"))
        XCTAssertNil(mine.first?.rejectionReason, "An approved request carries no reason")

        let pending = try decode(API.PendingRequests.self, "requests-pending")
        let request = try XCTUnwrap(pending.results.first)
        XCTAssertEqual(request.requestedBy.userId, UUID(uuidString: "83c55a49-6153-4cb9-ae22-4a42d48f4cf3"))
        XCTAssertEqual(
            pending.manualSonarrAddURL(for: request)?.absoluteString,
            "http://192.168.1.10:8989/add/new?term=The%20Matrix"
        )
        XCTAssertEqual(pending.rejectionReasons.count, 5)
        XCTAssertEqual(pending.rejectionReasons.first, "Already available on a streaming service we have")
        XCTAssertEqual(pending.rejectionReasonChoices, pending.rejectionReasons, "The server's list wins when it sent one")

        let history = try decode(API.ListResponse<API.ReviewedRequest>.self, "requests-history").results
        XCTAssertNil(history.first?.requestedBy.userId)
        XCTAssertEqual(history.first?.status, .rejected)
        XCTAssertEqual(history.first?.rejectionReason, "Not enough space on the server right now")

        let notifications = try decode(API.NotificationList.self, "notifications")
        let item = try XCTUnwrap(notifications.results.first)
        XCTAssertEqual(item.eventType, .requestRejected)
        XCTAssertEqual(item.eventType.emoji, "👎")
        XCTAssertEqual(item.titleID.route.absoluteString, "marquee://title/movie/603")

        let activity = try decode(API.ListResponse<API.ActivityItem>.self, "activity").results
        XCTAssertEqual(activity.first?.sentence, "Timmy declined The Matrix")
        XCTAssertEqual(activity.first?.eventType, .requestRejected)
    }

    /// A server before 0.28 sends no `rejectionReasons`; the queue must still
    /// decode, and the chooser falls back to the built-in list.
    func testPendingQueueFromOlderServerDecodesWithoutReasons() throws {
        let json = #"{"sonarrUrl":null,"results":[]}"#
        let queue = try APIClient.decoder.decode(API.PendingRequests.self, from: Data(json.utf8))
        XCTAssertNil(queue.sonarrUrl)
        XCTAssertEqual(queue.rejectionReasons, [])
        XCTAssertEqual(queue.rejectionReasonChoices, API.PendingRequests.defaultRejectionReasons)
        // Re-encoding keeps the key the current doc specifies.
        let encoded = String(decoding: try APIClient.encoder.encode(queue), as: UTF8.self)
        XCTAssertTrue(encoded.contains(#""rejectionReasons":[]"#), encoded)
    }

    func testCalendarGrid() throws {
        let calendar = try decode(API.CalendarMonthResponse.self, "calendar")
        XCTAssertEqual(calendar.month.string, "2026-09")
        XCTAssertEqual(calendar.prevMonth, API.CalendarMonth(year: 2026, month: 8))
        XCTAssertEqual(calendar.gridDays.count, 35)
        XCTAssertEqual(calendar.gridDays.first?.string, "2026-08-30")
        XCTAssertEqual(calendar.gridDays.last?.string, "2026-10-03")
        let severance = try XCTUnwrap(API.CalendarDay("2026-09-18"))
        XCTAssertEqual(calendar.entriesByDay[severance]?.map(\.subtitle), ["S03E02"])
        XCTAssertEqual(Set(calendar.entries.map(\.id)).count, calendar.entries.count)
    }

    func testSettingsShapes() throws {
        let integrations = try decode(API.IntegrationsOverview.self, "integrations")
        XCTAssertEqual(integrations.plex.totalBytes, 9_123_456_789_012)
        XCTAssertEqual(integrations.plex.servers.first?.lastSyncedAt, APIClient.parseDate("2026-09-17T16:00:03.412Z"))
        XCTAssertTrue(integrations.arr(.sonarr).fullyConfigured)
        XCTAssertNil(integrations.arr(.radarr).baseUrl)
        XCTAssertTrue(integrations.tmdb.configuredFromEnv)

        let pin = try decode(API.PlexPinStart.self, "plex-pin-start")
        XCTAssertEqual(pin.pinId, 123_456_789)
        XCTAssertEqual(pin.url?.host, "app.plex.tv")

        let update = try decode(API.UpdateUserResult.self, "user-update")
        XCTAssertTrue(update.tokensRevoked)
        XCTAssertEqual(update.user.label, "Kid")

        let changelog = try decode(API.ListResponse<API.ChangelogEntry>.self, "changelog").results
        XCTAssertEqual(changelog.first?.date, API.CalendarDay(year: 2026, month: 9, day: 17))

        let help = try decode(API.ListResponse<API.ErrorReferenceCategory>.self, "help-errors").results
        XCTAssertNotNil(help.entry(for: "Connect Sonarr in Settings first."))

        let error = APIError.from(statusCode: 502, body: try fixture("error-upstream"))
        guard case let .upstream(message) = error else { return XCTFail("Expected upstream, got \(error)") }
        XCTAssertTrue(message?.hasPrefix("TMDb isn't configured") == true)
    }

    func testCardsAndSuggestions() throws {
        let suggestions = try decode(API.ListResponse<API.SearchSuggestion>.self, "search-suggest").results
        XCTAssertEqual(suggestions.map(\.stableId), ["movie-603", "person-6384"])
        XCTAssertEqual(suggestions.map(\.mediaType.label), ["Movie", "Actor"])
        XCTAssertEqual(suggestions.first?.titleID, API.TitleID(.movie, 603))
        XCTAssertNil(suggestions.last?.titleID)

        let page = try decode(API.BrowsePage.self, "browse-page")
        XCTAssertTrue(page.hasMorePages)
        XCTAssertEqual(page.results.first?.rating, 7.832)
        XCTAssertEqual(page.results.first?.footerLine, "Thriller · 1964")

        let person = try decode(API.PersonDetail.self, "person-detail")
        XCTAssertEqual(person.birthday?.string, "1964-09-02")
        XCTAssertNil(person.deathday)
        XCTAssertNotNil(person.age)
    }

    func testProfilePhotoURLs() throws {
        let me = try decode(API.Me.self, "me")
        XCTAssertEqual(me.avatarUrl, "/api/v1/users/54caac33-73d6-4864-8e12-1ea6b212d2f1/avatar?v=1790334036549")
        XCTAssertEqual(me.user.avatarUrl, me.avatarUrl, "The rail reads the photo from the User built from /me")
        XCTAssertNil(try decode(API.AuthResponse.self, "auth-login").user.avatarUrl)
        XCTAssertNil(try decode(API.HouseholdMember.self, "household-member").avatarUrl)
        XCTAssertNotNil(try decode(API.AvatarResult.self, "avatar-set").avatarUrl)
        XCTAssertNil(try decode(API.AvatarResult.self, "avatar-removed").avatarUrl)
    }
}

final class APIValueTypeTests: XCTestCase {
    private struct Holder: Codable {
        let type: API.MediaType
        let status: API.LibraryStatus?
        let day: API.CalendarDay?
    }

    func testOpenEnumsKeepUnknownValues() throws {
        let json = #"{"type":"music","status":"archived","day":"2026-09-17"}"#
        let holder = try APIClient.decoder.decode(Holder.self, from: Data(json.utf8))
        XCTAssertEqual(holder.type, .unknown("music"))
        XCTAssertFalse(holder.type.isKnown)
        XCTAssertEqual(holder.status, .unknown("archived"))
        let encoded = String(decoding: try JSONEncoder().encode(holder), as: UTF8.self)
        XCTAssertTrue(encoded.contains(#""type":"music""#))
        XCTAssertTrue(encoded.contains(#""status":"archived""#))

        XCTAssertEqual(API.LibraryStatus(rawValue: "tracked_downloading"), .trackedDownloading)
        XCTAssertEqual(API.NotificationEventType(rawValue: "request_approved"), .requestApproved)
        XCTAssertEqual(API.ResolutionTier(rawValue: "1080p"), .fullHD)
        XCTAssertTrue(API.UserRole(rawValue: "admin").isKnown)
        for type in API.ActivityEventType.knownCases {
            XCTAssertEqual(API.ActivityEventType(rawValue: type.rawValue), type)
        }
    }

    func testUserWithUnknownRoleStillDecodes() throws {
        let json = #"{"id":"0a2d3c4b-5e6f-4a1b-8c9d-0e1f2a3b4c5d","username":"sam","displayName":null,"role":"guest","libraryOwnerId":"6f1c2a4e-8b1d-4c3e-9f0a-2b7d5e8c1a90"}"#
        let user = try APIClient.decoder.decode(User.self, from: Data(json.utf8))
        XCTAssertEqual(user.role, .unknown("guest"))
        XCTAssertFalse(user.isAdmin)
        XCTAssertEqual(user.label, "sam")
        XCTAssertNil(user.avatarUrl, "A server from before profile photos sends no avatarUrl")
    }

    func testBlankOptionalDaysDecodeAsNil() throws {
        for value in [#""""#, "null", #""not a date""#] {
            let json = #"{"type":"tv","status":null,"day":\#(value)}"#
            let holder = try APIClient.decoder.decode(Holder.self, from: Data(json.utf8))
            XCTAssertNil(holder.day, value)
            XCTAssertNil(holder.status)
        }
        let missing = try APIClient.decoder.decode(Holder.self, from: Data(#"{"type":"tv"}"#.utf8))
        XCTAssertNil(missing.day)

        struct Required: Decodable { let day: API.CalendarDay }
        XCTAssertThrowsError(try APIClient.decoder.decode(Required.self, from: Data(#"{"day":""}"#.utf8)))
    }

    func testCalendarDayAndMonth() throws {
        let day = try XCTUnwrap(API.CalendarDay("2026-02-28"))
        XCTAssertEqual(day.adding(days: 1)?.string, "2026-03-01")
        XCTAssertEqual(API.CalendarDay("2026-09-17T12:00:00.000Z")?.string, "2026-09-17")
        XCTAssertNil(API.CalendarDay("2026-9-17"))
        XCTAssertNil(API.CalendarDay("2026-13-01"))
        XCTAssertLessThan(try XCTUnwrap(API.CalendarDay("2025-12-31")), day)
        XCTAssertEqual(API.CalendarDay(try XCTUnwrap(day.date())), day, "Round-trips through local midnight")

        let month = try XCTUnwrap(API.CalendarMonth("2026-09"))
        XCTAssertEqual(month.firstDay?.string, "2026-09-01")
        XCTAssertNil(API.CalendarMonth("2026-9"))
        XCTAssertNil(API.CalendarMonth("2026-00"))
    }

    func testImageRefs() {
        let tmdb: API.ImageRef = "/aOIuZAjPaRIE6CMzbazvcHuHXDc.jpg"
        XCTAssertEqual(tmdb.url(.w342)?.absoluteString, "https://image.tmdb.org/t/p/w342/aOIuZAjPaRIE6CMzbazvcHuHXDc.jpg")
        XCTAssertFalse(tmdb.isAbsolute)

        let tvdb: API.ImageRef = "https://artworks.thetvdb.com/banners/posters/81189-10.jpg"
        XCTAssertEqual(tvdb.url(.w92)?.absoluteString, "https://artworks.thetvdb.com/banners/posters/81189-10.jpg")
        XCTAssertTrue(tvdb.isAbsolute)

        let none: API.ImageRef? = nil
        XCTAssertNil(none.url(.original))
        XCTAssertNil(API.ImageRef("").url())
        XCTAssertEqual(API.ImageRef.url("/x.png", size: .original)?.absoluteString, "https://image.tmdb.org/t/p/original/x.png")
    }

    func testBadgeLabelsAndListOrder() {
        XCTAssertNil(API.Badges.zero.bellLabel)
        XCTAssertEqual(API.Badges(unreadNotifications: 12, pendingRequests: 0).bellLabel, "9+")
        XCTAssertEqual(API.Badges(unreadNotifications: 12, pendingRequests: 0).dockLabel, "12")
        XCTAssertEqual(API.Badges(unreadNotifications: 120, pendingRequests: 0).dockLabel, "99+")

        func card(_ name: String, _ year: String?) -> API.TitleCard {
            API.TitleCard(
                mediaType: .movie, tmdbId: name.hashValue, name: name, posterPath: nil, year: year, subtitle: nil,
                overview: nil, rating: nil, status: nil, favorited: nil, requested: nil, canQuickAdd: false, canRequest: false
            )
        }
        let cards = [card("b", "2001"), card("a", nil), card("c", "2010"), card("d", "2001")]
        XCTAssertEqual(cards.sorted(by: .newestFirst).map(\.name), ["c", "b", "d", "a"])
        XCTAssertEqual(cards.sorted(by: .oldestFirst).map(\.name), ["b", "d", "c", "a"])
        XCTAssertEqual(cards.sorted(by: .alphabetical).map(\.name), ["a", "b", "c", "d"])
    }

    func testSonarrUnresolvableDetection() {
        XCTAssertTrue(APIError.conflict("Couldn't resolve this show for Sonarr.").isSonarrUnresolvable)
        XCTAssertFalse(APIError.conflict("Request was already reviewed.").isSonarrUnresolvable)
        XCTAssertFalse(APIError.upstream("Couldn't resolve this show for Sonarr.").isSonarrUnresolvable)
    }
}
