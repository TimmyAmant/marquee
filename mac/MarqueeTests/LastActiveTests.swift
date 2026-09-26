import XCTest
@testable import Marquee

// Household members' "last active" line: decoding `lastActiveAt` (a date,
// null for "never", or missing from an older server) and the label at each
// threshold of the website's lib/users/last-active-label.ts.

final class LastActiveTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_790_000_000)
    private let utc = TimeZone(identifier: "UTC")!

    private func label(ago seconds: TimeInterval) -> String {
        lastActiveLabel(now.addingTimeInterval(-seconds), now: now, timeZone: utc)
    }

    private func decode(_ json: String) throws -> API.HouseholdMember {
        try APIClient.decoder.decode(API.HouseholdMember.self, from: Data(json.utf8))
    }

    private static let memberBase = #""id":"6f1c2a4e-8b1d-4c3e-9f0a-2b7d5e8c1a90","username":"sam","displayName":null,"role":"member","autoApproveMovies":false,"autoApproveTv":false,"createdAt":"2026-09-01T12:00:00.000Z","isCurrentUser":false"#

    func testFixtureDecodesLastActiveAt() throws {
        let url = Bundle(for: Self.self).resourceURL!
            .appendingPathComponent("Fixtures/api/household-member.json")
        let member = try APIClient.decoder.decode(API.HouseholdMember.self, from: Data(contentsOf: url))
        XCTAssertEqual(member.lastActiveAt, ISO8601DateFormatter().date(from: "2026-09-25T18:42:10Z"))
        XCTAssertTrue(member.reportsLastActive)
        XCTAssertEqual(member.lastActiveLine(now: member.lastActiveAt!.addingTimeInterval(3 * 3600)), "Active 3 hours ago")
    }

    func testNullMeansNeverSignedIn() throws {
        let member = try decode("{\(Self.memberBase),\"lastActiveAt\":null}")
        XCTAssertNil(member.lastActiveAt)
        XCTAssertTrue(member.reportsLastActive)
        XCTAssertEqual(member.lastActiveLine(now: now), "Never signed in")
    }

    func testOlderServerShowsNothing() throws {
        let member = try decode("{\(Self.memberBase)}")
        XCTAssertNil(member.lastActiveAt)
        XCTAssertFalse(member.reportsLastActive)
        XCTAssertNil(member.lastActiveLine(now: now))
    }

    func testReencodingKeepsTheField() throws {
        let member = try decode("{\(Self.memberBase),\"lastActiveAt\":\"2026-09-25T18:42:10.000Z\"}")
        let object = try JSONSerialization.jsonObject(with: APIClient.encoder.encode(member)) as? [String: Any]
        XCTAssertNotNil(object?["lastActiveAt"])
        XCTAssertNil(object?["reportsLastActive"])
    }

    func testLabelThresholds() {
        let minute: TimeInterval = 60, hour = 3600.0, day = 86_400.0
        XCTAssertEqual(lastActiveLabel(nil, now: now), "Never signed in")
        XCTAssertEqual(label(ago: 0), "Active now")
        XCTAssertEqual(label(ago: 10 * minute - 1), "Active now")
        XCTAssertEqual(label(ago: 10 * minute), "Active 10 minutes ago")
        XCTAssertEqual(label(ago: 25 * minute + 30), "Active 25 minutes ago")
        XCTAssertEqual(label(ago: hour - 1), "Active 59 minutes ago")
        XCTAssertEqual(label(ago: hour), "Active 1 hour ago")
        XCTAssertEqual(label(ago: 2 * hour - 1), "Active 1 hour ago")
        XCTAssertEqual(label(ago: 2 * hour), "Active 2 hours ago")
        XCTAssertEqual(label(ago: day - 1), "Active 23 hours ago")
        XCTAssertEqual(label(ago: day), "Active yesterday")
        XCTAssertEqual(label(ago: 2 * day - 1), "Active yesterday")
        XCTAssertEqual(label(ago: 2 * day), "Active 2 days ago")
        XCTAssertEqual(label(ago: 30 * day - 1), "Active 29 days ago")
    }

    func testPastThirtyDaysShowsTheDate() {
        let july4 = ISO8601DateFormatter().date(from: "2026-07-04T15:00:00Z")!
        let later = july4.addingTimeInterval(30 * 86_400)
        XCTAssertEqual(lastActiveLabel(july4, now: later, timeZone: utc), "Last active Jul 4, 2026")
        XCTAssertEqual(lastActiveLabel(july4, now: later.addingTimeInterval(365 * 86_400), timeZone: utc), "Last active Jul 4, 2026")
    }
}
