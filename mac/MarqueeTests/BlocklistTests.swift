import XCTest
@testable import Marquee

// The request blocklist (0.41+): `viewer.blocked` on the title fixtures, the
// Settings list, and an older server that sends none of it.

final class BlocklistTests: XCTestCase {
    private func fixture(_ name: String) throws -> [String: Any] {
        let url = Bundle(for: Self.self).resourceURL!.appendingPathComponent("Fixtures/api/\(name).json")
        return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
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

    func testTitleFixturesDecodeBlocked() throws {
        let detail = try decode(API.TitleDetail.self, fixture("title-detail"))
        XCTAssertEqual(detail.viewer.blocked, .notBlocked, "null: not blocked, but the server can block")
        XCTAssertNil(detail.viewer.block)
        XCTAssertTrue(detail.viewer.offersBlocking, "The admin gets Block requests")

        let status = try decode(API.TitleStatus.self, fixture("title-status"))
        let block = try XCTUnwrap(status.viewer.block)
        XCTAssertEqual(block, API.TitleBlock(reason: "Already on Max.", keyword: nil))
        XCTAssertEqual(block.closedLine, "Requests are closed for this title — Already on Max.")
        XCTAssertFalse(status.viewer.canRequest)
        XCTAssertEqual(detail.updating(status).viewer.block, block)
        XCTAssertNil(detail.updating(status).requestAction, "No Request button while blocked")
    }

    func testBlockedByKeywordAndForMembers() throws {
        let json = try withViewer("title-status") {
            $0["isAdmin"] = false
            $0["blocked"] = ["reason": NSNull(), "keyword": "anime"]
        }
        let status = try decode(API.TitleStatus.self, json)
        XCTAssertEqual(status.viewer.block?.keyword, "anime")
        XCTAssertEqual(status.viewer.block?.closedLine, "Requests are closed for this title")
        XCTAssertFalse(status.viewer.offersBlocking, "Members can't block")
    }

    func testOlderServerWithoutBlocklistDecodes() throws {
        let detail = try decode(API.TitleDetail.self, withViewer("title-detail") { $0.removeValue(forKey: "blocked") })
        XCTAssertNil(detail.viewer.blocked)
        XCTAssertNil(detail.viewer.block)
        XCTAssertFalse(detail.viewer.offersBlocking, "No Block requests against a server that can't")
        let status = try decode(API.TitleStatus.self, withViewer("title-status") { $0.removeValue(forKey: "blocked") })
        XCTAssertNil(status.viewer.blocked)
    }

    func testBlockStateRoundTrips() throws {
        let status = try decode(API.TitleStatus.self, fixture("title-status"))
        let encoded = try XCTUnwrap(JSONSerialization.jsonObject(with: APIClient.encoder.encode(status.viewer)) as? [String: Any])
        XCTAssertEqual(encoded["blocked"] as? NSDictionary, ["reason": "Already on Max."] as NSDictionary)

        let detail = try decode(API.TitleDetail.self, fixture("title-detail"))
        let open = try XCTUnwrap(JSONSerialization.jsonObject(with: APIClient.encoder.encode(detail.viewer)) as? [String: Any])
        XCTAssertTrue(open["blocked"] is NSNull, "A present null stays null")
    }

    func testBlocklistEntries() throws {
        let entries = try APIClient.decoder.decode(
            API.ListResponse<API.BlocklistEntry>.self, from: Data(MarqueeAPIRequestTests.blocklistResponse.utf8)
        ).results
        XCTAssertEqual(entries.count, 2)
        let keyword = entries[0]
        XCTAssertEqual(keyword.kind, .keyword)
        XCTAssertNil(keyword.titleID)
        XCTAssertEqual(keyword.label, "Keyword: anime")
        XCTAssertNil(keyword.reason)
        let title = entries[1]
        XCTAssertEqual(title.kind, .title)
        XCTAssertEqual(title.titleID, API.TitleID(.movie, 438631))
        XCTAssertEqual(title.label, "Dune")
        XCTAssertEqual(title.reason, "Already on Max.")
        XCTAssertEqual(title.createdAt, APIClient.parseDate("2026-09-25T19:00:00.000Z"))

        let unknown = try decode(API.BlocklistEntry.self, [
            "id": "x", "kind": "studio", "mediaType": NSNull(), "tmdbId": NSNull(), "title": NSNull(),
            "keyword": NSNull(), "reason": NSNull(), "createdAt": "2026-09-25T19:00:00.000Z",
        ])
        XCTAssertFalse(unknown.kind.isKnown)
    }
}
