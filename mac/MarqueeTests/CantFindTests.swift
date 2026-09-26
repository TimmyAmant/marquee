import XCTest
@testable import Marquee

// "Can't find" (0.46+): `GET /requests/not-found`, `notFoundSince` on the
// history rows and the title's viewer, `notFoundRequests` in the badges, the
// `request_not_found` notification and the Can't Find Check's wait — decoded
// from the doc fixtures and from an older server that omits them all.

final class CantFindTests: XCTestCase {
    private func fixtureData(_ name: String) throws -> Data {
        try Data(contentsOf: Bundle(for: Self.self).resourceURL!.appendingPathComponent("Fixtures/api/\(name).json"))
    }

    private func fixture(_ name: String) throws -> [String: Any] {
        try XCTUnwrap(JSONSerialization.jsonObject(with: fixtureData(name)) as? [String: Any])
    }

    private func decode<T: Decodable>(_ type: T.Type, _ object: Any) throws -> T {
        try APIClient.decoder.decode(type, from: JSONSerialization.data(withJSONObject: object))
    }

    private func withViewer(_ name: String, _ edit: (inout [String: Any]) -> Void) throws -> [String: Any] {
        var json = try fixture(name)
        var viewer = try XCTUnwrap(json["viewer"] as? [String: Any])
        edit(&viewer)
        json["viewer"] = viewer
        return json
    }

    private static let since = APIClient.parseDate("2026-09-18T18:20:00.412Z")!

    // MARK: GET /requests/not-found

    func testNotFoundListDecodes() throws {
        let list = try decode(API.NotFoundRequests.self, fixture("requests-not-found"))
        XCTAssertEqual(list.afterHours, 24)
        let row = try XCTUnwrap(list.results.first)
        XCTAssertEqual(list.results.count, 1)
        XCTAssertEqual(row.id, UUID(uuidString: "9a7d2c11-5e3b-4f0a-8c6d-2b1e0f9a8d77"))
        XCTAssertEqual(row.titleID, API.TitleID(.movie, 425))
        XCTAssertEqual(row.title, "Ice Age")
        XCTAssertEqual(row.requestedBy.label, "Susan")
        XCTAssertEqual(row.notFoundSince, Self.since)
        XCTAssertEqual(row.server.name, "Radarr")
        XCTAssertEqual(row.server.kind, "radarr")
        XCTAssertNil(row.detailLine, "A whole movie in HD has no seasons or 4K line")
        XCTAssertEqual(row.arrURL, URL(string: "http://192.168.1.10:7878/movie/425"))
        XCTAssertEqual(row.openInArrTitle, "Open in Radarr")
        XCTAssertEqual(row.searchingAgainLine, "Radarr is searching again…")
        XCTAssertEqual(row.hint?.hasPrefix("In Radarr, Interactive Search"), true)
        XCTAssertEqual(
            list.blurb,
            "Approved and released, but Sonarr/Radarr still has nothing 24 hours or more after approval. Most often no indexer has a copy yet."
        )
    }

    func testNotFoundRowForAShowWithUnknownServerAndNoLink() throws {
        var json = try fixture("requests-not-found")
        var results = try XCTUnwrap(json["results"] as? [[String: Any]])
        results[0]["mediaType"] = "tv"
        results[0]["seasons"] = [2, 3]
        results[0]["seasonsLabel"] = NSNull()
        results[0]["is4k"] = true
        results[0]["server"] = ["id": NSNull(), "name": NSNull(), "kind": "sonarr"]
        results[0]["arrUrl"] = NSNull()
        json["results"] = results
        json["afterHours"] = 1
        let list = try decode(API.NotFoundRequests.self, json)
        let row = try XCTUnwrap(list.results.first)
        XCTAssertEqual(row.detailLine, "Seasons 2–3 · In 4K")
        XCTAssertNil(row.arrURL, "No Open in Sonarr without a link")
        XCTAssertEqual(row.openInArrTitle, "Open in Sonarr")
        XCTAssertEqual(row.searchingAgainLine, "Sonarr is searching again…")
        XCTAssertFalse(row.summaryLine(now: Self.since).contains(" · Sonarr"), "No server name when it's unknown")
        XCTAssertTrue(list.blurb.contains("nothing 1 hour or more"))
    }

    func testNotFoundURLMustBeHTTP() throws {
        var json = try fixture("requests-not-found")
        var results = try XCTUnwrap(json["results"] as? [[String: Any]])
        results[0]["arrUrl"] = "javascript:alert(1)"
        json["results"] = results
        let row = try XCTUnwrap(decode(API.NotFoundRequests.self, json).results.first)
        XCTAssertNil(row.arrURL)
    }

    func testSummaryLine() throws {
        let row = try XCTUnwrap(decode(API.NotFoundRequests.self, fixture("requests-not-found")).results.first)
        let now = Self.since.addingTimeInterval(3 * 24 * 3600 + 5 * 3600)
        XCTAssertEqual(
            row.summaryLine(now: now),
            "Susan · can't find for 3 days (since \(Format.shortDate(Self.since))) · Radarr"
        )
    }

    // MARK: notFoundAgeLabel (lib/requests/not-found-rules.ts)

    func testAgeLabel() {
        let since = Self.since
        func label(_ seconds: TimeInterval) -> String { API.notFoundAgeLabel(since: since, now: since.addingTimeInterval(seconds)) }
        XCTAssertEqual(label(0), "under an hour")
        XCTAssertEqual(label(59 * 60), "under an hour")
        XCTAssertEqual(label(-3600), "under an hour", "A clock behind the server's never goes negative")
        XCTAssertEqual(label(3600), "1 hour")
        XCTAssertEqual(label(2 * 3600 + 59 * 60), "2 hours")
        XCTAssertEqual(label(47 * 3600 + 3599), "47 hours")
        XCTAssertEqual(label(48 * 3600), "2 days")
        XCTAssertEqual(label(71 * 3600), "2 days")
        XCTAssertEqual(label(72 * 3600), "3 days")
        XCTAssertEqual(label(30 * 24 * 3600), "30 days")
    }

    // MARK: Badges

    func testBadgesCountCantFindOnTheRequestsPage() throws {
        let badges = try decode(API.Badges.self, fixture("badges"))
        XCTAssertEqual(badges.notFoundRequests, 1)
        XCTAssertEqual(badges.requestsPageCount, badges.pendingRequests + (badges.openIssues ?? 0) + 1)
        XCTAssertEqual(API.Badges(unreadNotifications: 0, pendingRequests: 1, openIssues: 0, notFoundRequests: 4).requestsPageCount, 5)

        var old = try fixture("badges")
        old.removeValue(forKey: "notFoundRequests")
        let oldBadges = try decode(API.Badges.self, old)
        XCTAssertNil(oldBadges.notFoundRequests)
        XCTAssertEqual(oldBadges.requestsPageCount, oldBadges.pendingRequests + (oldBadges.openIssues ?? 0))
    }

    // MARK: History

    func testHistoryRowsCarryNotFoundSince() throws {
        let rows = try decode(API.ListResponse<API.ReviewedRequest>.self, fixture("requests-history")).results
        let rejected = try XCTUnwrap(rows.first { $0.status == .rejected })
        XCTAssertNil(rejected.notFoundSince)
        XCTAssertFalse(rejected.isNotFound)
        let dune = try XCTUnwrap(rows.first { $0.title == "Dune" })
        XCTAssertEqual(dune.notFoundSince, Self.since)
        XCTAssertTrue(dune.isNotFound)
    }

    func testOlderHistoryWithoutNotFoundSinceDecodes() throws {
        var json = try fixture("requests-history")
        var results = try XCTUnwrap(json["results"] as? [[String: Any]])
        for index in results.indices { results[index].removeValue(forKey: "notFoundSince") }
        json["results"] = results
        let rows = try decode(API.ListResponse<API.ReviewedRequest>.self, json).results
        XCTAssertFalse(rows.isEmpty)
        XCTAssertTrue(rows.allSatisfy { $0.notFoundSince == nil && !$0.isNotFound })
    }

    // MARK: Title viewer

    func testTitleViewerNotFoundSince() throws {
        let detail = try decode(API.TitleDetail.self, fixture("title-detail"))
        XCTAssertNil(detail.viewer.notFoundSince)
        let status = try decode(API.TitleStatus.self, fixture("title-status"))
        XCTAssertEqual(status.viewer.notFoundSince, Self.since)

        let old = try decode(API.TitleStatus.self, withViewer("title-status") { $0.removeValue(forKey: "notFoundSince") })
        XCTAssertNil(old.viewer.notFoundSince)
        let oldDetail = try decode(API.TitleDetail.self, withViewer("title-detail") { $0.removeValue(forKey: "notFoundSince") })
        XCTAssertNil(oldDetail.viewer.notFoundSince)
    }

    // MARK: Notifications

    func testRequestNotFoundNotification() {
        XCTAssertEqual(API.NotificationEventType(rawValue: "request_not_found"), .requestNotFound)
        XCTAssertEqual(API.NotificationEventType.requestNotFound.rawValue, "request_not_found")
        XCTAssertEqual(API.NotificationEventType.requestNotFound.emoji, "🔍")
        XCTAssertTrue(API.NotificationEventType.requestNotFound.isKnown)
    }

    // MARK: Settings › Jobs

    func testNotFoundSettingsAndJob() throws {
        let settings = try decode(API.NotFoundSettings.self, fixture("not-found-settings"))
        XCTAssertEqual(settings.afterHours, API.NotFoundSettings.defaultAfterHours)
        XCTAssertEqual(API.NotFoundSettings.allowedHours, 1...720)
        let body = try JSONSerialization.jsonObject(with: JSONEncoder().encode(API.NotFoundSettings(afterHours: 48))) as? [String: Int]
        XCTAssertEqual(body, ["afterHours": 48])

        let jobs = try decode(API.ListResponse<API.Job>.self, fixture("jobs")).results
        let check = try XCTUnwrap(jobs.first { $0.id == API.Job.notFoundCheckID })
        XCTAssertEqual(check.name, "Can't Find Check")
    }
}
