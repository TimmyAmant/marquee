import XCTest
@testable import Marquee

// Season requests: the new optional fields decoded from a current server and
// from one that predates them, the request body, the local seasons label, the
// title page's Request button and the picker's selection.
//
// The doc fixtures are rewritten from Docs/api-v1.md by
// Scripts/extract-api-fixtures.py (which deletes every other .json in that
// folder), so the season shapes are built here: each case starts from a doc
// example and sets or strips the new keys explicitly, which keeps both the
// "new server" and "old server" cases honest whatever the doc says later.

@MainActor
final class SeasonRequestTests: XCTestCase {
    override func tearDown() {
        StubURLProtocol.handler = nil
        StubURLProtocol.requests = []
        super.tearDown()
    }

    private func fixture(_ name: String) throws -> [String: Any] {
        let url = Bundle(for: Self.self).resourceURL!.appendingPathComponent("Fixtures/api/\(name).json")
        return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
    }

    private func decode<T: Decodable>(_ type: T.Type, _ object: Any) throws -> T {
        try APIClient.decoder.decode(type, from: JSONSerialization.data(withJSONObject: object))
    }

    private static let seasonKeys = ["monitored", "requested", "requestable"]
    private static let viewerKeys = ["canRequestSeasons", "requestedSeasons"]
    private static let requestKeys = ["seasons", "seasonsLabel"]

    private func season(
        _ number: Int, episodes: Int = 8, have: Any = NSNull(), total: Any = NSNull(),
        monitored: Any? = NSNull(), requested: Any? = false, requestable: Any? = true
    ) -> [String: Any] {
        var season: [String: Any] = [
            "seasonNumber": number, "name": number == 0 ? "Specials" : "Season \(number)",
            "episodeCount": episodes, "airDate": NSNull(), "posterPath": NSNull(),
            "have": have, "total": total,
        ]
        season["monitored"] = monitored
        season["requested"] = requested
        season["requestable"] = requestable
        return season
    }

    /// The doc's title as a TV show with `seasons` and the viewer's new keys;
    /// `viewer: nil` strips them (an older server).
    private func tvDetail(
        seasons: [[String: Any]],
        viewer: [String: Any]? = ["canRequestSeasons": true, "requestedSeasons": NSNull()],
        canRequest: Bool = true,
        status: String = "untracked",
        alreadyRequested: Bool = false,
        requestStatus: Any = NSNull()
    ) throws -> API.TitleDetail {
        var json = try fixture("title-detail")
        json["mediaType"] = "tv"
        json["seasons"] = seasons
        var library = try XCTUnwrap(json["library"] as? [String: Any])
        library["status"] = status
        json["library"] = library
        var viewerJSON = try XCTUnwrap(json["viewer"] as? [String: Any])
        for key in Self.viewerKeys { viewerJSON.removeValue(forKey: key) }
        for (key, value) in viewer ?? [:] { viewerJSON[key] = value }
        viewerJSON["canRequest"] = canRequest
        viewerJSON["alreadyRequested"] = alreadyRequested
        viewerJSON["requestStatus"] = requestStatus
        viewerJSON["isAdmin"] = false
        viewerJSON["canAdd"] = false
        json["viewer"] = viewerJSON
        return try decode(API.TitleDetail.self, json)
    }

    // MARK: Decoding

    func testSeasonFieldsDecode() throws {
        let detail = try tvDetail(seasons: [
            season(3, requestable: true),
            season(2, monitored: true, requestable: false),
            season(1, have: 10, total: 10, monitored: true, requestable: false),
            season(0, requested: true, requestable: false),
        ], viewer: ["canRequestSeasons": true, "requestedSeasons": [1, 2, 3]])
        XCTAssertEqual(detail.viewer.canRequestSeasons, true)
        XCTAssertEqual(detail.viewer.requestedSeasons, [1, 2, 3])
        XCTAssertEqual(detail.seasons.map(\.requestable), [true, false, false, false])
        XCTAssertEqual(detail.seasons.map(\.monitored), [nil, true, true, nil])
        XCTAssertEqual(detail.seasons.map(\.requestState), [.requestable, .monitored, .inLibrary, .requested])
        XCTAssertEqual(detail.seasons.map(\.requestState.tag), [nil, "Monitored", "In library", "Requested"])
        XCTAssertEqual(detail.seasons.first?.episodeCountLabel, "8 episodes")
    }

    func testOlderServerWithoutSeasonFieldsDecodes() throws {
        var bare = season(1)
        for key in Self.seasonKeys { bare.removeValue(forKey: key) }
        let detail = try tvDetail(seasons: [bare], viewer: nil)
        XCTAssertNil(detail.viewer.canRequestSeasons)
        XCTAssertNil(detail.viewer.requestedSeasons)
        let first = try XCTUnwrap(detail.seasons.first)
        XCTAssertNil(first.monitored)
        XCTAssertNil(first.requested)
        XCTAssertNil(first.requestable)
        XCTAssertEqual(first.requestState, .unavailable)
        XCTAssertEqual(detail.requestAction, .wholeSeries, "An old server keeps today's whole-series Request")

        let status = try fixture("title-status")
        var viewer = try XCTUnwrap(status["viewer"] as? [String: Any])
        for key in Self.viewerKeys { viewer.removeValue(forKey: key) }
        var stripped = status
        stripped["viewer"] = viewer
        XCTAssertNil(try decode(API.TitleStatus.self, stripped).viewer.canRequestSeasons)
    }

    func testRequestListsDecodeSeasonsWithAndWithout() throws {
        func rows(_ name: String, _ edit: ([String: Any]) -> [String: Any]) throws -> [String: Any] {
            var json = try fixture(name)
            let results = try XCTUnwrap(json["results"] as? [[String: Any]])
            json["results"] = results.map(edit)
            return json
        }
        let withSeasons: ([String: Any]) -> [String: Any] = {
            var row = $0
            row["mediaType"] = "tv"
            row["seasons"] = [1, 2, 3]
            row["seasonsLabel"] = "Seasons 1–3"
            return row
        }
        let withoutSeasons: ([String: Any]) -> [String: Any] = {
            var row = $0
            for key in Self.requestKeys { row.removeValue(forKey: key) }
            return row
        }
        let labelOnlyFromSeasons: ([String: Any]) -> [String: Any] = {
            var row = $0
            row["seasons"] = [2]
            row["seasonsLabel"] = NSNull()
            return row
        }

        let mine = try decode(API.ListResponse<API.MyRequest>.self, rows("requests-mine", withSeasons)).results
        XCTAssertEqual(mine.first?.seasons, [1, 2, 3])
        XCTAssertEqual(mine.first?.seasonsText, "Seasons 1–3")
        let oldMine = try decode(API.ListResponse<API.MyRequest>.self, rows("requests-mine", withoutSeasons)).results
        XCTAssertNil(oldMine.first?.seasons)
        XCTAssertNil(oldMine.first?.seasonsText)
        let fallback = try decode(API.ListResponse<API.MyRequest>.self, rows("requests-mine", labelOnlyFromSeasons)).results
        XCTAssertEqual(fallback.first?.seasonsText, "Season 2", "No server label: computed locally")

        let pending = try decode(API.PendingRequests.self, rows("requests-pending", withSeasons)).results
        XCTAssertEqual(pending.first?.seasonsText, "Seasons 1–3")
        let oldPending = try decode(API.PendingRequests.self, rows("requests-pending", withoutSeasons)).results
        XCTAssertNil(oldPending.first?.seasons)
        XCTAssertNil(oldPending.first?.seasonsLabel)

        let history = try decode(API.ListResponse<API.ReviewedRequest>.self, rows("requests-history", withSeasons)).results
        XCTAssertEqual(history.first?.seasons, [1, 2, 3])
        XCTAssertEqual(history.first?.seasonsLabel, "Seasons 1–3")
        let oldHistory = try decode(API.ListResponse<API.ReviewedRequest>.self, rows("requests-history", withoutSeasons)).results
        XCTAssertNil(oldHistory.first?.seasonsText)
    }

    // MARK: Request body

    func testCreateSendsSeasonsOnlyWhenGiven() async throws {
        let url = Bundle(for: Self.self).resourceURL!.appendingPathComponent("Fixtures/api/request-created.json")
        let response = try Data(contentsOf: url)
        StubURLProtocol.handler = { _ in (200, StubURLProtocol.apiHeaders, response) }
        let client = APIClient(baseURL: URL(string: "http://127.0.0.1:3000")!, token: "mqt_test", session: StubURLProtocol.session())
        let api = MarqueeAPI(client: client)

        StubURLProtocol.requests = []
        try await api.requests.create(.tv, id: 1399, seasons: [3, 1, 2, 1])
        let picked = try XCTUnwrap(StubURLProtocol.requests.first)
        XCTAssertEqual(picked.httpMethod, "POST")
        XCTAssertEqual(picked.url?.path, "/api/v1/titles/tv/1399/request")
        XCTAssertEqual(picked.value(forHTTPHeaderField: "Content-Type"), "application/json")
        let body = try XCTUnwrap(JSONSerialization.jsonObject(with: Self.body(of: picked)) as? NSDictionary)
        XCTAssertEqual(body, ["seasons": [1, 2, 3]] as NSDictionary, "Sorted and de-duplicated")

        StubURLProtocol.requests = []
        try await api.requests.create(.tv, id: 1399)
        let whole = try XCTUnwrap(StubURLProtocol.requests.first)
        XCTAssertEqual(whole.url?.path, "/api/v1/titles/tv/1399/request")
        XCTAssertTrue(Self.body(of: whole).isEmpty, "The whole series sends no body, as before")
    }

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

    // MARK: Labels

    func testSeasonsLabel() {
        XCTAssertNil(API.seasonsLabel(nil))
        XCTAssertNil(API.seasonsLabel([]))
        XCTAssertEqual(API.seasonsLabel([2]), "Season 2")
        XCTAssertEqual(API.seasonsLabel([1, 2, 3]), "Seasons 1–3")
        XCTAssertEqual(API.seasonsLabel([1, 2, 3, 5, 7, 8]), "Seasons 1–3, 5, 7–8")
        XCTAssertEqual(API.seasonsLabel([0]), "Specials")
        XCTAssertEqual(API.seasonsLabel([0, 1]), "Specials, Season 1")
        XCTAssertEqual(API.seasonsLabel([0, 2, 3]), "Specials, Seasons 2–3")
        XCTAssertEqual(API.seasonsLabel([1, 3]), "Seasons 1, 3")
        XCTAssertEqual(API.seasonsLabel([3, 1, 2, 2]), "Seasons 1–3", "Unsorted input with duplicates")
    }

    func testPendingLine() throws {
        let seasons = try tvDetail(
            seasons: [season(1, requested: true, requestable: false)],
            viewer: ["canRequestSeasons": false, "requestedSeasons": [1, 2, 3]],
            canRequest: false, alreadyRequested: true, requestStatus: "pending"
        )
        XCTAssertEqual(seasons.viewer.pendingRequestLine, "Requested Seasons 1–3 — waiting for approval")
        XCTAssertNil(seasons.requestAction)

        let whole = try tvDetail(
            seasons: [season(1)], viewer: ["canRequestSeasons": false, "requestedSeasons": NSNull()],
            canRequest: false, alreadyRequested: true, requestStatus: "pending"
        )
        XCTAssertEqual(whole.viewer.pendingRequestLine, "Requested — waiting for approval")
    }

    // MARK: The Request button

    func testRequestActionForNewServer() throws {
        let fresh = try tvDetail(seasons: [season(2), season(1)])
        XCTAssertEqual(fresh.requestAction, .pickSeasons(more: false))
        XCTAssertEqual(fresh.requestAction?.buttonTitle, "Request")

        let tracked = try tvDetail(
            seasons: [season(2), season(1, have: 8, total: 8, monitored: true, requestable: false)],
            canRequest: false, status: "tracked_monitored"
        )
        XCTAssertEqual(tracked.requestAction, .pickSeasons(more: true))
        XCTAssertEqual(tracked.requestAction?.buttonTitle, "Request more seasons")

        let nothingLeft = try tvDetail(
            seasons: [season(1, monitored: true, requestable: false)],
            viewer: ["canRequestSeasons": false, "requestedSeasons": NSNull()],
            canRequest: false, status: "tracked_monitored"
        )
        XCTAssertNil(nothingLeft.requestAction)

        let noSeasonsListed = try tvDetail(seasons: [])
        XCTAssertEqual(noSeasonsListed.requestAction, .wholeSeries, "Nothing to pick: whole series")
    }

    // MARK: The picker

    func testPickerSelection() throws {
        let detail = try tvDetail(seasons: [
            season(3), season(2, monitored: true, requestable: false), season(1),
        ])
        var selection = SeasonPickerSelection(seasons: detail.seasons)
        XCTAssertEqual(selection.requestable, [3, 1])
        XCTAssertTrue(selection.seasons.isEmpty)
        XCTAssertEqual(selection.submitTitle, "Request seasons")

        selection.set(2, true)
        XCTAssertTrue(selection.seasons.isEmpty, "A monitored season can't be picked")
        selection.set(3, true)
        XCTAssertEqual(selection.submitTitle, "Request 1 season")
        XCTAssertFalse(selection.allSelected)

        selection.toggleAll()
        XCTAssertTrue(selection.allSelected)
        XCTAssertEqual(selection.seasons, [1, 3])
        XCTAssertEqual(selection.submitTitle, "Request 2 seasons")

        selection.toggleAll()
        XCTAssertTrue(selection.seasons.isEmpty)
    }
}
