import XCTest
@testable import Marquee

// "Open in Radarr / Sonarr" (0.63+): `viewer.arrLinks` decoded from the doc
// fixture and from an older server that omits it, and the buttons' titles.

@MainActor
final class ArrLinksTests: XCTestCase {
    private func fixture(_ name: String) throws -> [String: Any] {
        let url = Bundle(for: Self.self).resourceURL!.appendingPathComponent("Fixtures/api/\(name).json")
        return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
    }

    private func decode<T: Decodable>(_ type: T.Type, _ object: Any) throws -> T {
        try APIClient.decoder.decode(type, from: JSONSerialization.data(withJSONObject: object))
    }

    private func detail(arrLinks: Any?) throws -> API.TitleDetail {
        var json = try fixture("title-detail")
        var viewer = try XCTUnwrap(json["viewer"] as? [String: Any])
        viewer["arrLinks"] = arrLinks
        json["viewer"] = viewer
        return try decode(API.TitleDetail.self, json)
    }

    private func link(_ kind: String, _ name: String, is4k: Bool = false) -> [String: Any] {
        ["kind": kind, "serverName": name, "is4k": is4k, "url": "http://\(name.lowercased().replacingOccurrences(of: " ", with: "-")):7878/x"]
    }

    func testFixtureDecodesTheLink() throws {
        let detail = try decode(API.TitleDetail.self, fixture("title-detail"))
        let links = try XCTUnwrap(detail.viewer.arrLinks)
        XCTAssertEqual(links, [API.ArrLink(kind: .radarr, serverName: "Radarr", is4k: false, url: "https://radarr.example.com/movie/603")])
        XCTAssertEqual(detail.viewer.openInArrLinks.map(\.title), ["Open in Radarr"])
    }

    func testOlderServerAndMembersGetNoButtons() throws {
        let older = try detail(arrLinks: nil)
        XCTAssertNil(older.viewer.arrLinks)
        XCTAssertTrue(older.viewer.openInArrLinks.isEmpty)
        let member = try detail(arrLinks: [Any]())
        XCTAssertTrue(member.viewer.openInArrLinks.isEmpty)
    }

    func testTitlesNameTheServerOnlyWhenThereAreSeveral() throws {
        let one = try detail(arrLinks: [link("radarr", "Movies"), link("radarr", "Movies UHD", is4k: true)])
        XCTAssertEqual(one.viewer.openInArrLinks.map(\.title), ["Open in Radarr", "Open in Radarr 4K"])

        let several = try detail(arrLinks: [link("sonarr", "Sonarr"), link("sonarr", "Anime"), link("sonarr", "4K Sonarr", is4k: true)])
        XCTAssertEqual(several.viewer.openInArrLinks.map(\.title), ["Open in Sonarr", "Open in Anime", "Open in Sonarr 4K"])
        XCTAssertEqual(Set(several.viewer.openInArrLinks.map(\.id)).count, 3)
    }

    func testAnUnknownKindStillDecodes() throws {
        let odd = try detail(arrLinks: [link("lidarr", "Lidarr")])
        XCTAssertEqual(odd.viewer.arrLinks?.first?.kind, .unknown("lidarr"))
    }
}
