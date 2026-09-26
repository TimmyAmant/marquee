import XCTest
@testable import Marquee

// Request limits and the trusted role (0.39+): `/me` `requestLimits`, the
// quota fields on household members, the `PATCH /users/{id}` body, and who
// gets the review UI — decoded from the doc fixtures and from an older server.

final class RequestLimitsTests: XCTestCase {
    private func fixtureData(_ name: String) throws -> Data {
        try Data(contentsOf: Bundle(for: Self.self).resourceURL!.appendingPathComponent("Fixtures/api/\(name).json"))
    }

    private func decode<T: Decodable>(_ type: T.Type, _ name: String) throws -> T {
        try APIClient.decoder.decode(type, from: fixtureData(name))
    }

    private func decode<T: Decodable>(_ type: T.Type, json: String) throws -> T {
        try APIClient.decoder.decode(type, from: Data(json.utf8))
    }

    private func encodedObject(_ request: API.UpdateUserRequest) throws -> [String: Any] {
        try XCTUnwrap(JSONSerialization.jsonObject(with: APIClient.encoder.encode(request)) as? [String: Any])
    }

    private static let utc: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }()

    private static let meBase = """
    "id":"54caac33-73d6-4864-8e12-1ea6b212d2f1","username":"kid","displayName":null,"role":"member",\
    "libraryOwnerId":"54caac33-73d6-4864-8e12-1ea6b212d2f1","autoApproveMovies":false,"autoApproveTv":false,\
    "createdAt":"2026-09-17T17:10:57.821Z"
    """

    private static let memberBase = """
    "id":"83c55a49-6153-4cb9-ae22-4a42d48f4cf3","username":"kid","displayName":null,\
    "autoApproveMovies":false,"autoApproveTv":false,"createdAt":"2026-09-17T17:12:40.991Z","isCurrentUser":false
    """

    // MARK: Decoding

    func testMeFixtureDecodesRequestLimits() throws {
        let me = try decode(API.Me.self, "me")
        let limits = try XCTUnwrap(me.requestLimits)
        XCTAssertNil(limits.movie)
        XCTAssertNil(limits.tv)
        XCTAssertNil(limits.summaryLine(), "No line when nothing is limited")
        XCTAssertTrue(me.canReviewRequests)
    }

    func testMeWithLimitsDecodes() throws {
        let json = """
        {\(Self.meBase),"requestLimits":{\
        "movie":{"limit":5,"days":7,"used":2,"remaining":3,"nextSlotAt":null},\
        "tv":{"limit":2,"days":30,"used":2,"remaining":0,"nextSlotAt":"2026-10-03T02:53:36.305Z"}}}
        """
        let me = try decode(API.Me.self, json: json)
        let limits = try XCTUnwrap(me.requestLimits)
        XCTAssertEqual(limits.movie, API.RequestLimit(limit: 5, days: 7, used: 2, remaining: 3, nextSlotAt: nil))
        XCTAssertEqual(limits.tv?.remaining, 0)
        XCTAssertNotNil(limits.tv?.nextSlotAt)
        XCTAssertEqual(
            limits.summaryLine(calendar: Self.utc),
            "Movies: 3 of 5 requests left (every 7 days) · TV: none left until Oct 3"
        )
        XCTAssertFalse(me.canReviewRequests)
    }

    func testQuotaLines() {
        let movie = API.RequestLimit(limit: 5, days: 7, used: 5, remaining: 0, nextSlotAt: nil)
        XCTAssertEqual(movie.line(label: "Movies"), "Movies: none left")
        XCTAssertEqual(
            API.RequestLimits(tv: API.RequestLimit(limit: 3, days: 14, used: 0, remaining: 3)).summaryLine(),
            "TV: 3 of 3 requests left (every 14 days)"
        )
    }

    func testHouseholdFixturesDecodeQuotaFields() throws {
        let member = try decode(API.HouseholdMember.self, "household-member")
        XCTAssertEqual(member.movieQuotaLimit, 5)
        XCTAssertEqual(member.movieQuotaDays, 7)
        XCTAssertNil(member.tvQuotaLimit)
        XCTAssertEqual(member.tvQuotaDays, 7)
        XCTAssertTrue(member.reportsRequestLimits)
        XCTAssertFalse(member.isTrusted)

        let update = try decode(API.UpdateUserResult.self, "user-update")
        XCTAssertEqual(update.user.movieQuotaLimit, 5)
        let users = try decode(API.ListResponse<API.HouseholdMember>.self, "users")
        XCTAssertFalse(users.results.isEmpty)
        XCTAssertTrue(users.results.allSatisfy(\.reportsRequestLimits))
        let imported = try decode(API.ImportUsersResult.self, "users-import-result")
        XCTAssertEqual(imported.created.first?.movieQuotaLimit, 5)
    }

    func testTrustedMemberDecodes() throws {
        let json = """
        {\(Self.memberBase),"role":"trusted","movieQuotaLimit":null,"movieQuotaDays":7,"tvQuotaLimit":null,"tvQuotaDays":7}
        """
        let member = try decode(API.HouseholdMember.self, json: json)
        XCTAssertEqual(member.role, .trusted)
        XCTAssertTrue(member.role.isKnown)
        XCTAssertTrue(member.isTrusted)
        XCTAssertFalse(member.isAdmin)
        XCTAssertEqual(member.role.label, "Trusted")
    }

    func testOlderServerDecodesWithoutTheNewFields() throws {
        let me = try decode(API.Me.self, json: "{\(Self.meBase)}")
        XCTAssertNil(me.requestLimits)

        let member = try decode(API.HouseholdMember.self, json: "{\(Self.memberBase),\"role\":\"member\"}")
        XCTAssertNil(member.movieQuotaLimit)
        XCTAssertNil(member.movieQuotaDays)
        XCTAssertFalse(member.reportsRequestLimits, "No role or limit controls for a server without them")
    }

    // MARK: Role gating

    func testOnlyAdminAndTrustedReviewRequests() {
        XCTAssertTrue(API.UserRole.admin.canReviewRequests)
        XCTAssertTrue(API.UserRole.trusted.canReviewRequests)
        XCTAssertFalse(API.UserRole.member.canReviewRequests)
        XCTAssertFalse(API.UserRole(rawValue: "guest").canReviewRequests, "An unknown role acts as a member")
        XCTAssertEqual(API.UserRole(rawValue: "trusted"), .trusted)

        let user = User(id: UUID(), username: "kid", displayName: nil, role: .trusted, libraryOwnerId: UUID())
        XCTAssertTrue(user.canReviewRequests)
        XCTAssertFalse(user.isAdmin, "Trusted doesn't get settings, integrations or Add buttons")
    }

    // MARK: PATCH body

    func testUpdateBodyOmitsUntouchedFields() throws {
        let body = try encodedObject(API.UpdateUserRequest(username: "kid", autoApproveTv: true))
        XCTAssertEqual(Set(body.keys), ["username", "autoApproveTv"])
    }

    func testUpdateBodySendsRoleAndLimits() throws {
        let request = API.UpdateUserRequest(
            username: "kid",
            role: .member,
            movieQuota: API.UpdateUserRequest.QuotaChange(limitText: "5", daysText: "7"),
            tvQuota: API.UpdateUserRequest.QuotaChange(limitText: "", daysText: "30")
        )
        let body = try encodedObject(request)
        XCTAssertEqual(body["role"] as? String, "member")
        XCTAssertEqual(body["movieQuotaLimit"] as? Int, 5)
        XCTAssertEqual(body["movieQuotaDays"] as? Int, 7)
        XCTAssertTrue(body["tvQuotaLimit"] is NSNull, "A blank limit is sent as null (removes it)")
        XCTAssertEqual(body["tvQuotaDays"] as? Int, 30)
    }

    func testQuotaFieldsParse() {
        XCTAssertEqual(API.UpdateUserRequest.QuotaChange(limitText: " 3 ", daysText: "7"), .init(limit: 3, days: 7))
        XCTAssertEqual(API.UpdateUserRequest.QuotaChange(limitText: "", daysText: "7"), .init(limit: nil, days: 7))
        XCTAssertNil(API.UpdateUserRequest.QuotaChange(limitText: "five", daysText: "7"))
        XCTAssertNil(API.UpdateUserRequest.QuotaChange(limitText: "5", daysText: ""))
    }
}
