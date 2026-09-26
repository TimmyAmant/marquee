import XCTest
@testable import Marquee

// A household member's "Request all N missing" on a franchise row: the
// optional `franchise.requestAllMissing` (missing from an older server hides
// the button), the result, and the title page's model sending it and
// reloading the page afterwards.

@MainActor
final class RequestAllMissingTests: XCTestCase {
    override func tearDown() {
        StubURLProtocol.handler = nil
        StubURLProtocol.requests = []
        super.tearDown()
    }

    private func fixture(_ name: String) throws -> [String: Any] {
        let url = Bundle(for: Self.self).resourceURL!.appendingPathComponent("Fixtures/api/\(name).json")
        return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
    }

    /// The doc's title detail with its franchise edited.
    private func detailJSON(_ edit: (inout [String: Any]) -> Void) throws -> Data {
        var json = try fixture("title-detail")
        var franchise = try XCTUnwrap(json["franchise"] as? [String: Any])
        edit(&franchise)
        json["franchise"] = franchise
        return try JSONSerialization.data(withJSONObject: json)
    }

    private func memberDetail() throws -> Data {
        try detailJSON {
            $0["addAllMissing"] = []
            $0["requestAllMissing"] = [["mediaType": "movie", "tmdbId": 57800], ["mediaType": "movie", "tmdbId": 278154]]
        }
    }

    func testDecodesWithAndWithoutTheField() throws {
        let member = try APIClient.decoder.decode(API.TitleDetail.self, from: memberDetail())
        XCTAssertEqual(member.franchise?.requestAllMissing, [API.TitleID(.movie, 57800), API.TitleID(.movie, 278154)])

        let older = try APIClient.decoder.decode(API.TitleDetail.self, from: detailJSON { $0.removeValue(forKey: "requestAllMissing") })
        XCTAssertNil(older.franchise?.requestAllMissing, "An older server leaves it out: no button")
    }

    func testResultDecodes() throws {
        let data = try JSONSerialization.data(withJSONObject: fixture("request-all-missing"))
        let result = try APIClient.decoder.decode(API.RequestAllMissingResult.self, from: data)
        XCTAssertEqual(result.total, 4)
        XCTAssertEqual(result.requested, 2)
        XCTAssertEqual(result.refused.map(\.tmdbId), [57800, 278154])
        XCTAssertTrue(result.message.hasPrefix("Requested 2 of 4."))
    }

    func testRequestAllSendsOnePostThenReloadsThePage() async throws {
        let detail = try memberDetail()
        let result = try JSONSerialization.data(withJSONObject: fixture("request-all-missing"))
        let client = APIClient(baseURL: URL(string: "http://127.0.0.1:3000")!, token: "mqt_test", session: StubURLProtocol.session())
        let api = MarqueeAPI(client: client, events: ServerEvents())
        StubURLProtocol.handler = { request in
            let body = request.httpMethod == "POST" ? result : detail
            return (200, StubURLProtocol.apiHeaders, body)
        }

        let screen = TitleDetailModel(id: API.TitleID(.movie, 425))
        await screen.load(api)
        XCTAssertEqual(screen.detail?.franchise?.requestAllMissing?.count, 2)
        StubURLProtocol.requests = []

        await screen.requestAllMissing()

        XCTAssertEqual(StubURLProtocol.requests.map { "\($0.httpMethod ?? "") \($0.url?.path ?? "")" }, [
            "POST /api/v1/titles/movie/425/request-all-missing",
            "GET /api/v1/titles/movie/425",
        ])
        XCTAssertEqual(
            screen.requestAllResult,
            "Requested 2 of 4. You've used your 2 movie requests for a week. You can ask again in 7 days."
        )
        XCTAssertFalse(screen.isRequestingAll)
    }

    func testNothingToRequestSendsNothing() async throws {
        let detail = try detailJSON { $0["requestAllMissing"] = [] }
        let client = APIClient(baseURL: URL(string: "http://127.0.0.1:3000")!, token: "mqt_test", session: StubURLProtocol.session())
        let api = MarqueeAPI(client: client, events: ServerEvents())
        StubURLProtocol.handler = { _ in (200, StubURLProtocol.apiHeaders, detail) }

        let screen = TitleDetailModel(id: API.TitleID(.movie, 603))
        await screen.load(api)
        StubURLProtocol.requests = []
        await screen.requestAllMissing()
        XCTAssertTrue(StubURLProtocol.requests.isEmpty)
        XCTAssertNil(screen.requestAllResult)
    }

    func testAFailureShowsTheServersMessage() async throws {
        let detail = try memberDetail()
        let client = APIClient(baseURL: URL(string: "http://127.0.0.1:3000")!, token: "mqt_test", session: StubURLProtocol.session())
        let api = MarqueeAPI(client: client, events: ServerEvents())
        StubURLProtocol.handler = { request in
            request.httpMethod == "POST"
                ? StubURLProtocol.json(502, #"{"error":"Couldn't look this title up with TMDb right now.","code":"upstream"}"#)
                : (200, StubURLProtocol.apiHeaders, detail)
        }
        let screen = TitleDetailModel(id: API.TitleID(.movie, 425))
        await screen.load(api)
        await screen.requestAllMissing()
        XCTAssertEqual(screen.requestAllResult, "Couldn't look this title up with TMDb right now.")
        XCTAssertFalse(screen.isRequestingAll)
    }
}
