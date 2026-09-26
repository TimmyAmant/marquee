import XCTest
@testable import Marquee

// 4K Sonarr/Radarr (0.37+): `viewer.fourK`, `is4k` on request rows, the 4K
// instances in Settings → Integrations and their webhook URLs — decoded from
// the doc fixtures and from an older server that omits them all.

@MainActor
final class FourKTests: XCTestCase {
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

    // MARK: Title

    func testTitleFixturesDecodeFourK() throws {
        let detail = try decode(API.TitleDetail.self, fixture("title-detail"))
        let fourK = try XCTUnwrap(detail.viewer.fourK)
        XCTAssertEqual(fourK.status, .untracked)
        XCTAssertNil(fourK.requestStatus)
        XCTAssertFalse(fourK.canRequest)
        XCTAssertTrue(fourK.canAdd)
        XCTAssertNil(fourK.statusLabel, "Untracked shows no chip")
        XCTAssertFalse(fourK.isRequestPending)

        let status = try decode(API.TitleStatus.self, fixture("title-status"))
        XCTAssertNil(status.viewer.fourK, "null: no 4K instance for this type")
        XCTAssertNil(detail.updating(status).viewer.fourK)
    }

    func testOlderServerWithoutFourKDecodes() throws {
        let detail = try decode(API.TitleDetail.self, withViewer("title-detail") { $0.removeValue(forKey: "fourK") })
        XCTAssertNil(detail.viewer.fourK)
        let status = try decode(API.TitleStatus.self, withViewer("title-status") { $0.removeValue(forKey: "fourK") })
        XCTAssertNil(status.viewer.fourK)
    }

    func testFourKChips() throws {
        func state(_ status: String, request: Any = NSNull()) throws -> API.FourKViewerState {
            try decode(API.FourKViewerState.self, ["status": status, "requestStatus": request, "canRequest": true, "canAdd": false])
        }
        XCTAssertEqual(try state("owned").statusLabel, "In 4K")
        XCTAssertEqual(try state("tracked_downloading").statusLabel, "4K downloading")
        XCTAssertEqual(try state("tracked_monitored").statusLabel, "4K missing")
        XCTAssertEqual(try state("coming_soon").statusLabel, "4K coming soon")
        XCTAssertNil(try state("something_new").statusLabel)
        XCTAssertTrue(try state("untracked", request: "pending").isRequestPending)
        XCTAssertFalse(try state("untracked", request: "approved").isRequestPending)
    }

    // MARK: Requests

    func testRequestRowsDecodeIs4kWithAndWithout() throws {
        func rows(_ name: String, _ edit: @escaping ([String: Any]) -> [String: Any]) throws -> [String: Any] {
            var json = try fixture(name)
            json["results"] = try XCTUnwrap(json["results"] as? [[String: Any]]).map(edit)
            return json
        }
        let in4K: ([String: Any]) -> [String: Any] = { var row = $0; row["is4k"] = true; return row }
        let older: ([String: Any]) -> [String: Any] = { var row = $0; row.removeValue(forKey: "is4k"); return row }

        let mine = try decode(API.ListResponse<API.MyRequest>.self, fixture("requests-mine")).results
        XCTAssertEqual(mine.first?.is4k, false)
        let mine4K = try decode(API.ListResponse<API.MyRequest>.self, rows("requests-mine", in4K)).results
        XCTAssertEqual(mine4K.first?.is4k, true)
        let oldMine = try decode(API.ListResponse<API.MyRequest>.self, rows("requests-mine", older)).results
        XCTAssertNil(oldMine.first?.is4k)

        let pending = try decode(API.PendingRequests.self, rows("requests-pending", in4K)).results
        XCTAssertTrue(pending.allSatisfy { $0.is4k == true })
        XCTAssertEqual(pending.first?.detailLine.map { $0.hasSuffix("In 4K") }, true)
        let oldPending = try decode(API.PendingRequests.self, rows("requests-pending", older)).results
        XCTAssertTrue(oldPending.allSatisfy { $0.is4k == nil })

        let history = try decode(API.ListResponse<API.ReviewedRequest>.self, rows("requests-history", in4K)).results
        XCTAssertEqual(history.first?.is4k, true)
        let oldHistory = try decode(API.ListResponse<API.ReviewedRequest>.self, rows("requests-history", older)).results
        XCTAssertNil(oldHistory.first?.is4k)
    }

    func testDetailLine() {
        XCTAssertNil(API.requestDetailLine(nil, is4k: false))
        XCTAssertEqual(API.requestDetailLine(nil, is4k: true), "In 4K")
        XCTAssertEqual(API.requestDetailLine("Season 2", is4k: true), "Season 2 · In 4K")
        XCTAssertEqual(API.requestDetailLine("Seasons 1–3", is4k: false), "Seasons 1–3")
        XCTAssertEqual(API.requestDetailLine("  ", is4k: false), nil)
    }

    // MARK: Settings

    func testIntegrationsDecodeFourKInstances() throws {
        let overview = try decode(API.IntegrationsOverview.self, fixture("integrations"))
        let sonarr4k = try XCTUnwrap(overview.sonarr4k)
        XCTAssertFalse(sonarr4k.connected)
        let radarr4k = try XCTUnwrap(overview.arr(.radarr4k))
        XCTAssertTrue(radarr4k.fullyConfigured)
        XCTAssertEqual(radarr4k.rootFolderPath, "/movies-4k")
        XCTAssertEqual(radarr4k.qualityProfileId, 5)
        XCTAssertEqual(overview.arrWebhooks.url(for: .radarr4k)?.contains("/api/webhooks/radarr4k/"), true)
        XCTAssertEqual(overview.arrWebhooks.url(for: .sonarr4k)?.contains("/api/webhooks/sonarr4k/"), true)

        let regenerated = try decode(API.ArrWebhooks.self, fixture("webhook-secret"))
        XCTAssertEqual(regenerated.radarr4kUrl?.contains("radarr4k"), true)
        XCTAssertEqual(regenerated.sonarr4kUrl?.contains("sonarr4k"), true)
    }

    func testIntegrationsFromOlderServerDecodeWithoutFourK() throws {
        var json = try fixture("integrations")
        json.removeValue(forKey: "sonarr4k")
        json.removeValue(forKey: "radarr4k")
        var webhooks = try XCTUnwrap(json["arrWebhooks"] as? [String: Any])
        webhooks.removeValue(forKey: "radarr4kUrl")
        webhooks.removeValue(forKey: "sonarr4kUrl")
        json["arrWebhooks"] = webhooks
        let overview = try decode(API.IntegrationsOverview.self, json)
        XCTAssertNil(overview.sonarr4k)
        XCTAssertNil(overview.arr(.radarr4k))
        XCTAssertNotNil(overview.arr(.sonarr))
        XCTAssertNil(overview.arrWebhooks.url(for: .sonarr4k))
        XCTAssertNotNil(overview.arrWebhooks.url(for: .radarr))

        var secret = try fixture("webhook-secret")
        secret.removeValue(forKey: "radarr4kUrl")
        secret.removeValue(forKey: "sonarr4kUrl")
        XCTAssertNil(try decode(API.ArrWebhooks.self, secret).radarr4kUrl)
    }

    func testFourKProviders() {
        XCTAssertEqual(API.ArrProvider.sonarr4k.displayName, "4K Sonarr")
        XCTAssertEqual(API.ArrProvider.radarr4k.displayName, "4K Radarr")
        XCTAssertEqual(API.ArrProvider.sonarr4k.mediaType, .tv)
        XCTAssertEqual(API.ArrProvider.radarr4k.mediaType, .movie)
        XCTAssertEqual(API.ArrProvider.sonarr4k.defaultPort, 8989)
        XCTAssertEqual(API.ArrProvider.radarr4k.defaultPort, 7878)
        XCTAssertTrue(API.ArrProvider.radarr4k.is4k)
        XCTAssertFalse(API.ArrProvider.radarr.is4k)
    }
}
