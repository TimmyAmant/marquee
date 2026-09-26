import XCTest
@testable import Marquee

// API keys (0.47+, api-v1.md §16): the fixtures, the three endpoints and
// `/stats/summary` against a stub, and the Settings card's model — including
// an older server that has none of it.

@MainActor
final class ApiKeysTests: XCTestCase {
    private static let server = URL(string: "http://192.168.1.10:3000")!
    private static let kidId = UUID(uuidString: "83c55a49-6153-4cb9-ae22-4a42d48f4cf3")!
    private static let utc = TimeZone(identifier: "UTC")!

    override func tearDown() {
        StubURLProtocol.handler = nil
        StubURLProtocol.requests = []
        super.tearDown()
    }

    private func fixtureData(_ name: String) throws -> Data {
        try Data(contentsOf: Bundle(for: Self.self).resourceURL!.appendingPathComponent("Fixtures/api/\(name).json"))
    }

    private func fixtureString(_ name: String) throws -> String {
        String(decoding: try fixtureData(name), as: UTF8.self)
    }

    private func decode<T: Decodable>(_ type: T.Type, _ name: String) throws -> T {
        try APIClient.decoder.decode(type, from: fixtureData(name))
    }

    private func stubbedAPI() -> MarqueeAPI {
        MarqueeAPI(client: APIClient(baseURL: Self.server, token: "mqt_test", session: StubURLProtocol.session()))
    }

    private func body(_ request: URLRequest) throws -> [String: Any] {
        var data = request.httpBody ?? Data()
        if data.isEmpty, let stream = request.httpBodyStream {
            stream.open()
            defer { stream.close() }
            var buffer = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable {
                let read = stream.read(&buffer, maxLength: buffer.count)
                if read <= 0 { break }
                data.append(buffer, count: read)
            }
        }
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    private func date(_ string: String) -> Date {
        APIClient.parseDate(string)!
    }

    private func key(
        scope: API.ApiKeyScope = .read,
        actAs: API.RequestPerson? = nil,
        lastUsedAt: Date? = nil,
        expiresAt: Date? = nil,
        expired: Bool = false
    ) -> API.ApiKey {
        API.ApiKey(
            id: "k1", name: "Homepage", scope: scope, actAs: actAs, hint: "mq_Q2xp",
            createdAt: date("2026-09-20T08:30:00.000Z"), lastUsedAt: lastUsedAt, expiresAt: expiresAt, expired: expired
        )
    }

    /// Answers the list, users and create/revoke calls like a 0.47 server.
    private func stubServer(list: String? = nil, createStatus: Int = 201) throws {
        let list = try list ?? fixtureString("api-keys")
        let users = try fixtureString("users")
        let created = try fixtureString("api-key-created")
        StubURLProtocol.handler = { request in
            switch (request.httpMethod, request.url?.path) {
            case ("GET", "/api/v1/settings/api-keys"): return StubURLProtocol.json(200, list)
            case ("GET", "/api/v1/users"): return StubURLProtocol.json(200, users)
            case ("POST", "/api/v1/settings/api-keys"): return StubURLProtocol.json(createStatus, created)
            case ("DELETE", _): return StubURLProtocol.json(200, #"{"ok":true}"#)
            default: return StubURLProtocol.json(404, #"{"error":"Not found.","code":"not_found"}"#)
            }
        }
    }

    // MARK: Fixtures

    func testFixturesDecode() throws {
        let keys = try decode(API.ListResponse<API.ApiKey>.self, "api-keys").results
        XCTAssertEqual(keys.count, 2)
        let homepage = keys[0]
        XCTAssertEqual(homepage.name, "Homepage")
        XCTAssertEqual(homepage.scope, .read)
        XCTAssertNil(homepage.actAs)
        XCTAssertEqual(homepage.hint, "mq_Q2xp")
        XCTAssertEqual(homepage.lastUsedAt, date("2026-09-26T11:59:40.000Z"))
        XCTAssertNil(homepage.expiresAt)
        XCTAssertFalse(homepage.expired)
        let kid = keys[1]
        XCTAssertEqual(kid.scope, .full)
        XCTAssertEqual(kid.actAs?.userId, Self.kidId)
        XCTAssertEqual(kid.actAs?.label, "Kid")
        XCTAssertNil(kid.lastUsedAt)
        XCTAssertEqual(kid.expiresAt, date("2026-12-19T08:30:00.000Z"))

        let created = try decode(API.ApiKeyCreated.self, "api-key-created")
        XCTAssertTrue(created.key.hasPrefix("mq_"))
        XCTAssertEqual(created.key.count, 46)
        XCTAssertEqual(created.apiKey.id, homepage.id)

        let stats = try decode(API.StatsSummary.self, "stats-summary")
        XCTAssertEqual(stats, API.StatsSummary(pendingRequests: 3, openIssues: 1, cantFind: 2, movies: 812, series: 164, downloading: 4))

        let unknown = try APIClient.decoder.decode(API.ApiKeyScope.self, from: Data(#""admin""#.utf8))
        XCTAssertFalse(unknown.isKnown)
    }

    // MARK: Requests

    func testEndpointsSendWhatTheDocSpecifies() async throws {
        try stubServer()
        let events = ServerEvents()
        let api = MarqueeAPI(
            client: APIClient(baseURL: Self.server, token: "mqt_test", session: StubURLProtocol.session()), events: events
        )

        let keys = try await api.apiKeys.list()
        XCTAssertEqual(keys.count, 2)
        var request = try XCTUnwrap(StubURLProtocol.requests.last)
        XCTAssertEqual(request.httpMethod, "GET")
        XCTAssertEqual(request.url?.path, "/api/v1/settings/api-keys")
        XCTAssertEqual(events.revision(of: .settings), 0, "Reading changes nothing")

        // Only what's set: no actAsUserId / expiresInDays keys.
        StubURLProtocol.requests = []
        let created = try await api.apiKeys.create(API.CreateApiKeyRequest(name: "Homepage", scope: .read))
        XCTAssertEqual(created.apiKey.name, "Homepage")
        request = try XCTUnwrap(StubURLProtocol.requests.first)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.url?.path, "/api/v1/settings/api-keys")
        XCTAssertEqual(try body(request) as NSDictionary, ["name": "Homepage", "scope": "read"] as NSDictionary)
        XCTAssertEqual(events.revision(of: .settings), 1, "Creating a key is a settings change")

        StubURLProtocol.requests = []
        _ = try await api.apiKeys.create(API.CreateApiKeyRequest(
            name: "Kid's request app", scope: .full, actAsUserId: "83c55a49-6153-4cb9-ae22-4a42d48f4cf3", expiresInDays: 365
        ))
        XCTAssertEqual(try body(XCTUnwrap(StubURLProtocol.requests.first)) as NSDictionary, [
            "name": "Kid's request app", "scope": "full",
            "actAsUserId": "83c55a49-6153-4cb9-ae22-4a42d48f4cf3", "expiresInDays": 365,
        ] as NSDictionary)

        StubURLProtocol.requests = []
        try await api.apiKeys.revoke("b3a9e0d4-8c1f-4e2b-a7d6-5f0e9c8b7a61")
        request = try XCTUnwrap(StubURLProtocol.requests.first)
        XCTAssertEqual(request.httpMethod, "DELETE")
        XCTAssertEqual(request.url?.path, "/api/v1/settings/api-keys/b3a9e0d4-8c1f-4e2b-a7d6-5f0e9c8b7a61")
        XCTAssertEqual(events.revision(of: .settings), 3)
    }

    func testStatsSummary() async throws {
        let stats = try fixtureString("stats-summary")
        StubURLProtocol.handler = { _ in StubURLProtocol.json(200, stats) }
        let summary = try await stubbedAPI().stats.summary()
        XCTAssertEqual(summary.movies, 812)
        XCTAssertEqual(StubURLProtocol.requests.first?.httpMethod, "GET")
        XCTAssertEqual(StubURLProtocol.requests.first?.url?.path, "/api/v1/stats/summary")
    }

    // MARK: The card's model

    func testLoadListsKeysAndMembers() async throws {
        try stubServer()
        let model = ApiKeysModel()
        XCTAssertFalse(model.isVisible, "Nothing until the server answers")
        await model.load(stubbedAPI())
        XCTAssertTrue(model.isVisible)
        XCTAssertEqual(model.keys?.map(\.name), ["Homepage", "Kid's request app"])
        XCTAssertFalse(model.members.isEmpty)
        XCTAssertFalse(model.members.contains { $0.isAdmin || $0.isCurrentUser }, "Act as: members other than the admin")
    }

    func testOlderServerHidesTheCard() async {
        StubURLProtocol.handler = { _ in StubURLProtocol.json(404, #"{"error":"Not found.","code":"not_found"}"#) }
        let model = ApiKeysModel()
        await model.load(stubbedAPI())
        XCTAssertTrue(model.isUnavailable)
        XCTAssertFalse(model.isVisible)
        XCTAssertNil(model.keys)
        XCTAssertNil(model.loadError)
        XCTAssertEqual(StubURLProtocol.requests.count, 1, "No users call for a card that isn't shown")
    }

    func testCreateShowsTheSecretOnceThenDone() async throws {
        try stubServer(list: #"{"results":[]}"#)
        let api = stubbedAPI()
        let model = ApiKeysModel()
        await model.load(api)
        XCTAssertEqual(model.keys, [])

        model.name = "  Homepage "
        model.scope = .full
        model.actAsUserId = Self.kidId
        model.expiry = .days90
        StubURLProtocol.requests = []
        await model.create(api)

        let request = try XCTUnwrap(StubURLProtocol.requests.first)
        XCTAssertEqual(try body(request) as NSDictionary, [
            "name": "Homepage", "scope": "full",
            "actAsUserId": "83c55a49-6153-4cb9-ae22-4a42d48f4cf3", "expiresInDays": 90,
        ] as NSDictionary, "Trimmed, lowercase id, days")
        XCTAssertEqual(model.createdSecret, "mq_Q2xpY2tpbmcgdGhpcyBpcyBub3QgYSByZWFsIGtleSE")
        XCTAssertEqual(model.keys?.map(\.name), ["Homepage"])
        XCTAssertNil(model.createError)
        XCTAssertEqual(model.name, "", "The form resets")
        XCTAssertEqual(model.scope, .read)
        XCTAssertNil(model.actAsUserId)
        XCTAssertEqual(model.expiry, .never)

        // A reload (the settings change) keeps showing it until Done.
        await model.load(api)
        XCTAssertNotNil(model.createdSecret)
        model.dismissSecret()
        XCTAssertNil(model.createdSecret, "Gone for good")
    }

    func testBlankNameNeverAsksTheServer() async throws {
        try stubServer()
        let api = stubbedAPI()
        let model = ApiKeysModel()
        await model.load(api)
        StubURLProtocol.requests = []
        model.name = "   "
        await model.create(api)
        XCTAssertEqual(model.createError, "Give the key a name, like Homepage.")
        XCTAssertTrue(StubURLProtocol.requests.isEmpty)
        XCTAssertNil(model.createdSecret)
    }

    func testServerErrorOnCreateIsShown() async throws {
        let message = "Keep the name under 80 characters."
        StubURLProtocol.handler = { request in
            if request.httpMethod == "POST" { return StubURLProtocol.json(400, #"{"error":"\#(message)","code":"invalid"}"#) }
            return StubURLProtocol.json(200, #"{"results":[]}"#)
        }
        let api = stubbedAPI()
        let model = ApiKeysModel()
        await model.load(api)
        model.name = String(repeating: "x", count: 81)
        await model.create(api)
        XCTAssertEqual(model.createError, message)
        XCTAssertNil(model.createdSecret)
        XCTAssertEqual(model.name.count, 81, "A failed create keeps the form")
    }

    func testRevokeRemovesTheKey() async throws {
        try stubServer()
        let api = stubbedAPI()
        let model = ApiKeysModel()
        await model.load(api)
        let kid = try XCTUnwrap(model.keys?.last)
        model.confirmingRevokeId = kid.id
        StubURLProtocol.requests = []
        await model.revoke(kid, api)
        XCTAssertEqual(StubURLProtocol.requests.first?.httpMethod, "DELETE")
        XCTAssertEqual(StubURLProtocol.requests.first?.url?.path, "/api/v1/settings/api-keys/\(kid.id)")
        XCTAssertEqual(model.keys?.map(\.name), ["Homepage"])
        XCTAssertNil(model.confirmingRevokeId)
        XCTAssertNil(model.revokingId)
        XCTAssertNil(model.revokeErrors[kid.id])
    }

    // MARK: Labels

    func testLabels() {
        let now = date("2026-09-26T12:00:00.000Z")
        XCTAssertEqual(API.ApiKeyScope.read.label, "Read-only")
        XCTAssertEqual(API.ApiKeyScope.full.label, "Full access")

        let admins = key()
        XCTAssertNil(ApiKeysModel.actAsLabel(admins))
        let kid = key(actAs: API.RequestPerson(userId: Self.kidId, displayName: "Kid", username: "member1", label: "Kid"))
        XCTAssertEqual(ApiKeysModel.actAsLabel(kid), "as Kid")

        XCTAssertEqual(ApiKeysModel.createdLabel(admins, timeZone: Self.utc), "Created Sep 20, 2026")

        XCTAssertEqual(ApiKeysModel.expiryLabel(admins, now: now, timeZone: Self.utc), "Never expires")
        let later = key(expiresAt: date("2026-12-19T08:30:00.000Z"))
        XCTAssertEqual(ApiKeysModel.expiryLabel(later, now: now, timeZone: Self.utc), "Expires Dec 19, 2026")
        XCTAssertEqual(ApiKeysModel.expiryLabel(key(expiresAt: date("2026-09-01T00:00:00.000Z"), expired: true), now: now), "Expired")
        XCTAssertEqual(ApiKeysModel.expiryLabel(key(expiresAt: date("2026-09-26T11:00:00.000Z")), now: now), "Expired", "Past its date, whatever the flag")
        XCTAssertFalse(ApiKeysModel.isExpired(later, now: now))

        XCTAssertEqual(ApiKeysModel.lastUsedLabel(admins, now: now), "Never used")
        XCTAssertEqual(ApiKeysModel.lastUsedLabel(key(lastUsedAt: date("2026-09-26T11:59:40.000Z")), now: now), "Last used just now")
        XCTAssertEqual(ApiKeysModel.lastUsedLabel(key(lastUsedAt: date("2026-09-26T11:58:00.000Z")), now: now), "Last used 2 minutes ago")
        XCTAssertEqual(ApiKeysModel.lastUsedLabel(key(lastUsedAt: date("2026-09-26T11:00:00.000Z")), now: now), "Last used 1 hour ago")
        XCTAssertEqual(ApiKeysModel.lastUsedLabel(key(lastUsedAt: date("2026-09-25T10:00:00.000Z")), now: now), "Last used yesterday")
        XCTAssertEqual(ApiKeysModel.lastUsedLabel(key(lastUsedAt: date("2026-09-20T12:00:00.000Z")), now: now), "Last used 6 days ago")
        XCTAssertEqual(
            ApiKeysModel.lastUsedLabel(key(lastUsedAt: date("2026-07-01T12:00:00.000Z")), now: now, timeZone: Self.utc),
            "Last used Jul 1, 2026"
        )

        XCTAssertEqual(ApiKeysModel.Expiry.allCases.map(\.label), ["Never", "30 days", "90 days", "1 year"])
        XCTAssertEqual(ApiKeysModel.Expiry.allCases.map(\.days), [nil, 30, 90, 365])
    }
}
