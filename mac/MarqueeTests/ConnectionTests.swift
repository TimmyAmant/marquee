import XCTest
@testable import Marquee

// The server-client connection layer: address parsing, subnet enumeration for
// discovery, server-info classification, API error mapping, and the session's
// restore/login/logout paths against a stubbed URLSession.

final class ServerAddressTests: XCTestCase {
    private func parse(_ input: String) throws -> ServerAddress {
        try ServerAddress.parse(input)
    }

    private func assertParseError(_ input: String, _ expected: ServerAddress.ParseError, file: StaticString = #filePath, line: UInt = #line) {
        do {
            let address = try ServerAddress.parse(input)
            XCTFail("Expected \(expected) for \"\(input)\", got \(address.baseURLString)", file: file, line: line)
        } catch {
            XCTAssertEqual(error, expected, file: file, line: line)
        }
    }

    func testBareIPDefaultsToHTTPAndPort3000() throws {
        let address = try parse("192.168.1.20")
        XCTAssertEqual(address.scheme, .http)
        XCTAssertEqual(address.host, "192.168.1.20")
        XCTAssertEqual(address.port, 3000)
        XCTAssertEqual(address.baseURLString, "http://192.168.1.20:3000")
        XCTAssertEqual(address.displayName, "192.168.1.20:3000")
        XCTAssertTrue(address.isIPLiteral)
    }

    func testExplicitPortIsKept() throws {
        XCTAssertEqual(try parse("192.168.1.20:3000").baseURLString, "http://192.168.1.20:3000")
        XCTAssertEqual(try parse("192.168.1.20:8080").baseURLString, "http://192.168.1.20:8080")
        XCTAssertEqual(try parse("http://192.168.1.20:80").port, 80)
    }

    func testHostNamesAreTrimmedAndLowercased() throws {
        let address = try parse("  TOWER.local \n")
        XCTAssertEqual(address.baseURLString, "http://tower.local:3000")
        XCTAssertFalse(address.isIPLiteral)
        XCTAssertEqual(try parse("localhost:3001").baseURLString, "http://localhost:3001")
        XCTAssertTrue(try parse("localhost").isLoopback)
    }

    func testURLsDropTrailingSlashPathQueryAndFragment() throws {
        XCTAssertEqual(try parse("http://tower:4000/").baseURLString, "http://tower:4000")
        XCTAssertEqual(try parse("HTTP://Tower:3000/discover?tab=movies#top").baseURLString, "http://tower:3000")
        // Plain http without a port still means the Docker default.
        XCTAssertEqual(try parse("http://192.168.1.20").baseURLString, "http://192.168.1.20:3000")
    }

    func testHTTPSKeepsItsDefaultPort() throws {
        let address = try parse("https://marquee.example.com/")
        XCTAssertEqual(address.scheme, .https)
        XCTAssertNil(address.port)
        XCTAssertEqual(address.effectivePort, 443)
        XCTAssertEqual(address.baseURLString, "https://marquee.example.com")
        XCTAssertEqual(address.displayName, "https://marquee.example.com")

        let custom = try parse("https://marquee.example.com:8443/login")
        XCTAssertEqual(custom.baseURLString, "https://marquee.example.com:8443")
        XCTAssertEqual(custom.effectivePort, 8443)
    }

    func testIPv6Literals() throws {
        let address = try parse("[::1]:3000")
        XCTAssertEqual(address.host, "::1")
        XCTAssertEqual(address.baseURLString, "http://[::1]:3000")
        XCTAssertEqual(address.baseURL.port, 3000)
        XCTAssertTrue(address.isLoopback)
    }

    func testInvalidInput() {
        assertParseError("", .empty)
        assertParseError("   ", .empty)
        assertParseError("ftp://tower.local", .unsupportedScheme("ftp"))
        assertParseError("tower.local:abc", .invalidPort)
        assertParseError("tower.local:", .invalidPort)
        assertParseError("tower.local:70000", .invalidPort)
        assertParseError("192.168.1.20:0", .invalidPort)
        assertParseError("192.168.1", .invalid)
        assertParseError("192.168.1.300", .invalid)
        assertParseError("my server", .invalid)
        assertParseError("http://", .invalid)
        assertParseError("http://user:secret@tower.local:3000", .invalid)
    }

    func testParseErrorsHaveMessages() {
        XCTAssertNotNil(ServerAddress.ParseError.empty.errorDescription)
        XCTAssertTrue(ServerAddress.ParseError.invalid.errorDescription?.contains("192.168.1.20:3000") == true)
    }

    func testSavedBaseURLRoundTrips() throws {
        for input in ["192.168.1.20", "tower.local:8080", "https://marquee.example.com", "https://marquee.example.com:8443"] {
            let address = try parse(input)
            XCTAssertEqual(ServerAddress(baseURLString: address.baseURLString), address, input)
        }
        XCTAssertNil(ServerAddress(baseURLString: "not a url"))
    }

    func testIPv4Helpers() {
        XCTAssertEqual(IPv4.parse("192.168.1.20"), 0xC0A8_0114)
        XCTAssertEqual(IPv4.string(0xC0A8_0114), "192.168.1.20")
        XCTAssertNil(IPv4.parse("192.168.1"))
        XCTAssertNil(IPv4.parse("192.168.1.256"))
        XCTAssertNil(IPv4.parse("a.b.c.d"))
    }
}

final class SubnetEnumerationTests: XCTestCase {
    private func interface(_ address: String, _ mask: String, name: String = "en0") -> IPv4Interface {
        IPv4Interface(name: name, address: IPv4.parse(address)!, netmask: IPv4.parse(mask)!)
    }

    private func strings(_ hosts: [UInt32]) -> [String] {
        hosts.map(IPv4.string)
    }

    func testSlash24ExcludesNetworkAndBroadcast() {
        let en0 = interface("192.168.1.37", "255.255.255.0")
        let hosts = strings(NetworkInterfaces.scanHosts(for: en0))
        XCTAssertEqual(hosts.count, 254)
        XCTAssertEqual(hosts.first, "192.168.1.1")
        XCTAssertEqual(hosts.last, "192.168.1.254")
        XCTAssertTrue(hosts.contains("192.168.1.37"))
        XCTAssertEqual(en0.subnetDescription, "192.168.1.0/24")
        XCTAssertEqual(en0.prefixLength, 24)
    }

    func testSubnetAtTheCapIsScannedWhole() {
        // A /22 has 1,022 hosts, under the 1,024 cap.
        let hosts = strings(NetworkInterfaces.scanHosts(for: interface("10.0.5.9", "255.255.252.0")))
        XCTAssertEqual(hosts.count, 1022)
        XCTAssertEqual(hosts.first, "10.0.4.1")
        XCTAssertEqual(hosts.last, "10.0.7.254")
    }

    func testLargerSubnetsFallBackToTheSurroundingSlash24() {
        // A /21 (2,046 hosts) is over the cap.
        let slash21 = strings(NetworkInterfaces.scanHosts(for: interface("10.0.5.9", "255.255.248.0")))
        XCTAssertEqual(slash21.count, 254)
        XCTAssertEqual(slash21.first, "10.0.5.1")
        XCTAssertEqual(slash21.last, "10.0.5.254")

        let slash16 = strings(NetworkInterfaces.scanHosts(for: interface("172.16.40.2", "255.255.0.0")))
        XCTAssertEqual(slash16.count, 254)
        XCTAssertEqual(slash16.first, "172.16.40.1")

        let slash8 = NetworkInterfaces.scanHosts(for: interface("10.20.30.40", "255.0.0.0"))
        XCTAssertEqual(slash8.count, 254)
        XCTAssertLessThanOrEqual(slash8.count, NetworkInterfaces.maxHostsPerInterface)
    }

    func testCustomCap() {
        let slash23 = interface("192.168.2.10", "255.255.254.0")
        XCTAssertEqual(NetworkInterfaces.scanHosts(for: slash23).count, 510)
        XCTAssertEqual(NetworkInterfaces.scanHosts(for: slash23, cap: 300).count, 254)
    }

    func testTinySubnets() {
        XCTAssertEqual(strings(NetworkInterfaces.scanHosts(for: interface("10.0.0.1", "255.255.255.252"))), ["10.0.0.1", "10.0.0.2"])
        XCTAssertEqual(strings(NetworkInterfaces.scanHosts(for: interface("10.0.0.0", "255.255.255.254"))), ["10.0.0.1"])
        XCTAssertEqual(NetworkInterfaces.scanHosts(for: interface("10.0.0.1", "255.255.255.255")), [])
    }

    func testUnionAcrossInterfacesDedupes() {
        let wifi = interface("192.168.1.37", "255.255.255.0", name: "en0")
        let ethernet = interface("192.168.1.38", "255.255.255.0", name: "en7")
        let other = interface("10.0.0.5", "255.255.255.0", name: "en8")
        XCTAssertEqual(NetworkInterfaces.scanHosts(for: [wifi, ethernet]).count, 254)
        XCTAssertEqual(NetworkInterfaces.scanHosts(for: [wifi, ethernet, other]).count, 508)
    }

    func testPreferredInterfaces() {
        let en0 = interface("192.168.1.37", "255.255.255.0", name: "en0")
        let en10 = interface("192.168.5.2", "255.255.255.0", name: "en10")
        let bridge = interface("192.168.64.1", "255.255.255.0", name: "bridge100")
        let linkLocal = interface("169.254.10.1", "255.255.0.0", name: "en2")

        XCTAssertEqual(NetworkInterfaces.preferred([bridge, en10, en0, linkLocal]).map(\.name), ["en0", "en10"])
        XCTAssertEqual(NetworkInterfaces.preferred([bridge]).map(\.name), ["bridge100"])
        XCTAssertTrue(NetworkInterfaces.preferred([linkLocal]).isEmpty)
        XCTAssertTrue(linkLocal.isLinkLocal)
    }
}

final class ServerProbeClassificationTests: XCTestCase {
    private func classify(_ status: Int, _ body: String, contentType: String? = "application/json", apiHeader: String? = "1") -> ProbeOutcome {
        ServerProbe.classify(statusCode: status, contentType: contentType, apiHeader: apiHeader, body: Data(body.utf8))
    }

    private let legacyLoginPage = """
    <!DOCTYPE html><html lang="en" class="dark"><head><meta charSet="utf-8"/>\
    <meta name="viewport" content="width=device-width, initial-scale=1"/>\
    <title>Marquee</title><meta name="description" content="Search any actor, studio, or catalog"/>\
    </head><body><main>Sign in</main></body></html>
    """

    func testCurrentServer() {
        let outcome = classify(200, #"{"app":"marquee","apiVersion":1,"version":"0.22.0","setupComplete":true,"status":"ok"}"#)
        XCTAssertEqual(outcome, .marquee(ServerInfo(version: "0.22.0", setupComplete: true)))
        XCTAssertEqual(outcome.serverInfo?.setupComplete, true)
        XCTAssertNil(outcome.problemMessage(for: ServerAddress(host: "192.168.1.20")))
    }

    func testFreshAndDegradedServers() {
        let fresh = classify(200, #"{"app":"marquee","apiVersion":1,"version":"0.22.1","setupComplete":false,"status":"ok"}"#)
        XCTAssertEqual(fresh.serverInfo?.setupComplete, false)

        let degraded = classify(200, #"{"app":"marquee","apiVersion":1,"version":"0.22.0","setupComplete":null,"status":"degraded"}"#)
        XCTAssertNil(degraded.serverInfo?.setupComplete)
        XCTAssertEqual(degraded.serverInfo?.isDegraded, true)
    }

    func testNewerAPIVersionIsIncompatible() {
        let outcome = classify(200, #"{"app":"marquee","apiVersion":2,"version":"1.0.0","setupComplete":true,"status":"ok"}"#)
        guard case let .incompatible(info) = outcome else {
            return XCTFail("Expected incompatible, got \(outcome)")
        }
        XCTAssertEqual(info.version, "1.0.0")
    }

    func testLegacyServerHTMLAfterLoginRedirect() {
        XCTAssertEqual(classify(200, legacyLoginPage, contentType: "text/html; charset=utf-8", apiHeader: nil), .legacy)
        // Even without a content type, the HTML itself is enough.
        XCTAssertEqual(classify(200, legacyLoginPage, contentType: nil, apiHeader: nil), .legacy)
        let message = ProbeOutcome.legacy.problemMessage(for: ServerAddress(host: "tower.local"))
        XCTAssertTrue(message?.contains("0.22.0") == true)
    }

    func testNonMarqueeJSON() {
        XCTAssertEqual(classify(200, #"{"status":"ok","version":"10.2.3"}"#, apiHeader: nil), .notMarquee)
        XCTAssertEqual(classify(200, #"{"app":"grafana","apiVersion":1,"version":"10.2.3"}"#, apiHeader: nil), .notMarquee)
        XCTAssertEqual(classify(404, #"{"message":"Not Found"}"#, apiHeader: nil), .notMarquee)
    }

    func testOtherHTMLAndPlainText() {
        let grafana = "<!doctype html><html><head><title>Grafana</title></head><body></body></html>"
        XCTAssertEqual(classify(200, grafana, contentType: "text/html", apiHeader: nil), .notMarquee)
        XCTAssertEqual(classify(404, "404 page not found", contentType: "text/plain", apiHeader: nil), .notMarquee)
        // A title that merely mentions Marquee isn't the web app's layout.
        let lookalike = "<html><head><title>Marquee Lights Co.</title></head></html>"
        XCTAssertEqual(classify(200, lookalike, contentType: "text/html", apiHeader: nil), .notMarquee)
    }

    func testV1ServerErrorIsNotMistakenForAnotherApp() {
        let outcome = classify(500, #"{"error":"boom","code":"internal"}"#)
        guard case .unreachable(.failed) = outcome else {
            return XCTFail("Expected unreachable(.failed), got \(outcome)")
        }
    }

    func testUnreachableReasonsFromURLErrors() {
        XCTAssertEqual(ServerProbe.unreachableReason(for: URLError(.cannotConnectToHost)), .refused)
        XCTAssertEqual(ServerProbe.unreachableReason(for: URLError(.timedOut)), .noResponse)
        XCTAssertEqual(ServerProbe.unreachableReason(for: URLError(.cannotFindHost)), .unknownHost)
        guard case .failed = ServerProbe.unreachableReason(for: URLError(.secureConnectionFailed)) else {
            return XCTFail("TLS failures keep the system message")
        }
    }

    func testProblemMessages() {
        let address = ServerAddress(host: "192.168.1.20")
        let outcomes: [ProbeOutcome] = [
            .legacy, .notMarquee, .incompatible(ServerInfo(apiVersion: 2, version: "1.0.0", setupComplete: true)),
            .unreachable(.refused), .unreachable(.noResponse), .unreachable(.unknownHost),
            .unreachable(.localNetworkDenied), .unreachable(.failed("TLS")),
        ]
        for outcome in outcomes {
            XCTAssertNotNil(outcome.problemMessage(for: address), "\(outcome)")
        }
        XCTAssertTrue(ProbeOutcome.unreachable(.refused).problemMessage(for: address)?.contains("port 3000") == true)
        XCTAssertTrue(ProbeOutcome.unreachable(.localNetworkDenied).problemMessage(for: address)?.contains("Local Network") == true)
    }
}

final class APIErrorMappingTests: XCTestCase {
    private func map(_ status: Int, _ body: String) -> APIError {
        APIError.from(statusCode: status, body: Data(body.utf8))
    }

    func testContractCodes() {
        XCTAssertEqual(map(401, #"{"error":"Unauthorized","code":"unauthorized"}"#), .unauthorized)
        XCTAssertEqual(map(401, #"{"error":"Incorrect username or password","code":"invalid_credentials"}"#), .invalidCredentials)
        XCTAssertEqual(map(429, #"{"error":"Too many attempts. Try again in 12 minutes.","code":"rate_limited"}"#), .rateLimited("Too many attempts. Try again in 12 minutes."))
        XCTAssertEqual(map(403, #"{"error":"Admins only","code":"forbidden"}"#), .forbidden)
        XCTAssertEqual(map(404, #"{"error":"Not found","code":"not_found"}"#), .notFound)
        XCTAssertEqual(map(409, #"{"error":"Already requested","code":"conflict"}"#), .conflict("Already requested"))
        XCTAssertEqual(map(409, #"{"error":"Setup is complete","code":"setup_complete"}"#), .setupComplete)
        XCTAssertEqual(map(502, #"{"error":"Sonarr didn't respond","code":"upstream"}"#), .upstream("Sonarr didn't respond"))
        XCTAssertEqual(map(400, #"{"error":"Username must be at least 3 characters","code":"invalid"}"#), .invalid("Username must be at least 3 characters"))
        XCTAssertEqual(map(500, #"{"error":"Something went wrong","code":"internal"}"#), .server("Something went wrong"))
    }

    func testFallsBackToStatusCode() {
        XCTAssertEqual(map(401, ""), .unauthorized)
        XCTAssertEqual(map(403, "Forbidden"), .forbidden)
        XCTAssertEqual(map(404, "<html>nope</html>"), .notFound)
        XCTAssertEqual(map(429, ""), .rateLimited(nil))
        XCTAssertEqual(map(502, "<html>Bad Gateway</html>"), .upstream(nil))
        XCTAssertEqual(map(503, ""), .server(nil))
        XCTAssertEqual(map(400, #"{"error":"Title is required"}"#), .invalid("Title is required"))
        XCTAssertEqual(map(409, #"{"error":"Taken","code":"something_new"}"#), .conflict("Taken"))
        XCTAssertEqual(map(400, #"{"error":"  ","code":"invalid"}"#), .invalid("The request was invalid."))
    }

    func testMessages() {
        XCTAssertEqual(APIError.invalid("Username is taken").errorDescription, "Username is taken")
        XCTAssertEqual(APIError.rateLimited("Wait 5 minutes").errorDescription, "Wait 5 minutes")
        XCTAssertNotNil(APIError.rateLimited(nil).errorDescription)
        XCTAssertEqual(APIError.invalidCredentials.errorDescription, "Incorrect username or password.")
        XCTAssertNotNil(APIError.network(URLError(.timedOut)).errorDescription)
        XCTAssertNotNil(APIError.notMarquee.errorDescription)
    }

    func testWrapping() {
        XCTAssertEqual(APIError.wrapping(URLError(.timedOut)), .network(URLError(.timedOut)))
        XCTAssertEqual(APIError.wrapping(APIError.forbidden), .forbidden)
        XCTAssertTrue(APIError.wrapping(URLError(.cancelled)).isCancellation)
        XCTAssertTrue(APIError.network(URLError(.cannotConnectToHost)).isConnectivityFailure)
        XCTAssertFalse(APIError.unauthorized.isConnectivityFailure)
    }
}

final class APIDecodingTests: XCTestCase {
    func testDatesWithAndWithoutMilliseconds() throws {
        let withMillis = try XCTUnwrap(APIClient.parseDate("2026-09-17T12:00:00.000Z"))
        let withoutMillis = try XCTUnwrap(APIClient.parseDate("2026-09-17T12:00:00Z"))
        XCTAssertEqual(withMillis, withoutMillis)
        XCTAssertEqual(try XCTUnwrap(APIClient.parseDate("2026-09-17T12:00:00.250Z")).timeIntervalSince(withMillis), 0.25, accuracy: 0.001)

        let midnight = try XCTUnwrap(APIClient.parseDate("2026-09-17"))
        XCTAssertEqual(withMillis.timeIntervalSince(midnight), 12 * 3600, accuracy: 0.001)
        XCTAssertNil(APIClient.parseDate("next tuesday"))
    }

    func testDecodesLoginResponse() throws {
        let json = """
        {"token":"mqt_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ","expiresAt":"2026-12-16T12:00:00.000Z",\
        "user":{"id":"6f1c2a4e-8b1d-4c3e-9f0a-2b7d5e8c1a90","username":"timmy","displayName":"Timmy","role":"admin",\
        "libraryOwnerId":"6f1c2a4e-8b1d-4c3e-9f0a-2b7d5e8c1a90"}}
        """
        let response = try APIClient.decoder.decode(AuthTokenResponse.self, from: Data(json.utf8))
        XCTAssertTrue(response.token.hasPrefix("mqt_"))
        XCTAssertEqual(response.user.id, UUID(uuidString: "6F1C2A4E-8B1D-4C3E-9F0A-2B7D5E8C1A90"))
        XCTAssertTrue(response.user.isAdmin)
        XCTAssertEqual(response.expiresAt, APIClient.parseDate("2026-12-16T12:00:00Z"))

        XCTAssertEqual(response.user.libraryOwnerId, response.user.id)
        XCTAssertEqual(response.user.label, "Timmy")
    }

    func testMemberWithoutDisplayName() throws {
        let json = #"{"id":"0a2d3c4b-5e6f-4a1b-8c9d-0e1f2a3b4c5d","username":"sam","displayName":null,"role":"member","libraryOwnerId":"6f1c2a4e-8b1d-4c3e-9f0a-2b7d5e8c1a90"}"#
        let user = try APIClient.decoder.decode(User.self, from: Data(json.utf8))
        XCTAssertNil(user.displayName)
        XCTAssertEqual(user.role, .member)
        XCTAssertEqual(user.label, "sam")
    }

    func testEncoderWritesMilliseconds() throws {
        struct Payload: Encodable { let at: Date }
        let date = try XCTUnwrap(APIClient.parseDate("2026-09-17T12:00:00.000Z"))
        let json = String(decoding: try APIClient.encoder.encode(Payload(at: date)), as: UTF8.self)
        XCTAssertEqual(json, #"{"at":"2026-09-17T12:00:00.000Z"}"#)
    }
}

final class ConnectFlowTests: XCTestCase {
    @MainActor
    func testEmptySearchFallsBackToManualEntry() {
        let connect = ConnectModel()
        connect.step = .searching
        connect.discoveryChanged(.finished)
        XCTAssertEqual(connect.step, .manual)
        XCTAssertEqual(connect.manualNotice, ConnectModel.nothingFoundMessage)
    }

    @MainActor
    func testLocalNetworkDenialAndRecovery() {
        let connect = ConnectModel()
        connect.step = .searching
        connect.discoveryChanged(.localNetworkDenied)
        XCTAssertEqual(connect.step, .localNetworkDenied)
        // Access turned on: discovery restarts itself and the card follows.
        connect.discoveryChanged(.checkingAccess)
        XCTAssertEqual(connect.step, .searching)
    }

    @MainActor
    func testDiscoveryEventsDontYankOtherSteps() {
        let connect = ConnectModel()
        connect.enterManually()
        connect.discoveryChanged(.finished)
        connect.discoveryChanged(.localNetworkDenied)
        XCTAssertEqual(connect.step, .manual)
        XCTAssertNil(connect.manualNotice)
    }

    @MainActor
    func testManualEntryRejectsBadAddressWithoutProbing() {
        let connect = ConnectModel()
        var selected: ServerAddress?
        connect.onSelect = { address, _ in selected = address }
        connect.enterManually()
        connect.manualAddress = "tower.local:abc"
        connect.connectManually()
        XCTAssertFalse(connect.isConnecting)
        XCTAssertEqual(connect.manualError, ServerAddress.ParseError.invalidPort.errorDescription)
        XCTAssertNil(selected)
    }

    @MainActor
    func testResetPrefillsPreviousServer() {
        let connect = ConnectModel()
        connect.enterManually(notice: "x")
        connect.reset(prefill: "192.168.1.20:3000")
        XCTAssertEqual(connect.step, .welcome)
        XCTAssertEqual(connect.manualAddress, "192.168.1.20:3000")
        XCTAssertNil(connect.manualNotice)
        XCTAssertEqual(connect.discovery.state, .idle)
    }
}

// MARK: - Session against a stubbed server

/// Answers every request from `handler`, keyed by path.
final class StubURLProtocol: URLProtocol {
    typealias Handler = @Sendable (URLRequest) throws -> (Int, [String: String], Data)
    nonisolated(unsafe) static var handler: Handler?
    nonisolated(unsafe) static var requests: [URLRequest] = []

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.requests.append(request)
        guard let handler = Self.handler else {
            client?.urlProtocol(self, didFailWithError: URLError(.cannotConnectToHost))
            return
        }
        do {
            let (status, headers, body) = try handler(request)
            let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: body)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}

    static func session() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        return URLSession(configuration: configuration)
    }

    static let apiHeaders = ["Content-Type": "application/json", "X-Marquee-API": "1"]

    static func json(_ status: Int, _ body: String) -> (Int, [String: String], Data) {
        (status, apiHeaders, Data(body.utf8))
    }
}

final class ServerSessionTests: XCTestCase {
    private static let userJSON = #"{"id":"6f1c2a4e-8b1d-4c3e-9f0a-2b7d5e8c1a90","username":"timmy","displayName":"Timmy","role":"admin","libraryOwnerId":"6f1c2a4e-8b1d-4c3e-9f0a-2b7d5e8c1a90"}"#
    private static let loginJSON = #"{"token":"mqt_fresh","expiresAt":"2026-12-16T12:00:00.000Z","user":\#(userJSON)}"#

    /// Port 9 (discard) on loopback: nothing listens, so the re-probe after a
    /// failed restore is refused immediately.
    private static let server = ServerAddress(host: "127.0.0.1", port: 9)

    @MainActor
    private func makeSession(
        token: String? = "mqt_saved",
        probe: @escaping @Sendable (ServerAddress) async -> ProbeOutcome = { _ in .unreachable(.noResponse) }
    ) -> (ServerSession, InMemoryTokenStore, UserDefaults) {
        let suite = "com.timmyamant.MarqueeTests.session.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.set(Self.server.baseURLString, forKey: ServerSession.serverDefaultsKey)
        let store = InMemoryTokenStore()
        if let token { store.save(token, for: Self.server.baseURLString) }
        StubURLProtocol.requests = []
        let session = ServerSession(
            defaults: defaults, tokenStore: store, urlSession: StubURLProtocol.session(), deviceName: "Test Mac",
            pinned: nil, probe: probe
        )
        return (session, store, defaults)
    }

    override func tearDown() {
        StubURLProtocol.handler = nil
        super.tearDown()
    }

    @MainActor
    func testRestoreWithValidToken() async {
        StubURLProtocol.handler = { request in
            XCTAssertEqual(request.url?.path, "/api/v1/me")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer mqt_saved")
            return StubURLProtocol.json(200, Self.userJSON)
        }
        let (session, _, _) = makeSession()
        XCTAssertEqual(session.server, Self.server)
        XCTAssertTrue(session.hasToken)

        let result = await session.restore()
        guard case let .signedIn(user) = result else { return XCTFail("Expected signedIn, got \(result)") }
        XCTAssertEqual(user.username, "timmy")
        XCTAssertEqual(session.user, user)
    }

    @MainActor
    func testRestoreWithRejectedTokenSignsOut() async {
        StubURLProtocol.handler = { _ in StubURLProtocol.json(401, #"{"error":"Unauthorized","code":"unauthorized"}"#) }
        let (session, store, _) = makeSession()
        let result = await session.restore()
        XCTAssertEqual(result, .signedOut)
        XCTAssertNil(store.token(for: Self.server.baseURLString))
        XCTAssertFalse(session.hasToken)
        XCTAssertEqual(session.server, Self.server, "A rejected token keeps the server")
    }

    @MainActor
    func testRestoreWhenServerIsDownIsUnreachableNotSignedOut() async {
        StubURLProtocol.handler = { _ in throw URLError(.cannotConnectToHost) }
        let (session, store, _) = makeSession()
        let result = await session.restore()
        guard case .unreachable(.unreachable) = result else { return XCTFail("Expected unreachable, got \(result)") }
        XCTAssertEqual(store.token(for: Self.server.baseURLString), "mqt_saved", "An offline server must not cost the token")
        XCTAssertNil(session.user)
    }

    @MainActor
    func testRestoreWithoutTokenIsSignedOut() async {
        let (session, _, _) = makeSession(token: nil)
        let result = await session.restore()
        XCTAssertEqual(result, .signedOut)
        XCTAssertTrue(StubURLProtocol.requests.isEmpty)
    }

    @MainActor
    func testLoginStoresTokenAndSendsDeviceName() async throws {
        StubURLProtocol.handler = { request in
            XCTAssertEqual(request.url?.path, "/api/v1/auth/login")
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
            let body = Self.body(of: request)
            XCTAssertEqual(body["username"] as? String, "timmy")
            XCTAssertEqual(body["deviceName"] as? String, "Test Mac")
            return StubURLProtocol.json(200, Self.loginJSON)
        }
        let (session, store, _) = makeSession(token: nil)
        let user = try await session.login(username: " timmy ", password: "hunter22")
        XCTAssertEqual(user.displayName, "Timmy")
        XCTAssertEqual(store.token(for: Self.server.baseURLString), "mqt_fresh")
        XCTAssertEqual(session.client?.token, "mqt_fresh")
        XCTAssertTrue(session.isSignedIn)
    }

    @MainActor
    func testLoginErrorsAreTyped() async {
        let (session, _, _) = makeSession(token: nil)

        StubURLProtocol.handler = { _ in StubURLProtocol.json(401, #"{"error":"Incorrect username or password","code":"invalid_credentials"}"#) }
        await assertThrows(.invalidCredentials) { _ = try await session.login(username: "timmy", password: "wrong") }

        StubURLProtocol.handler = { _ in StubURLProtocol.json(429, #"{"error":"Too many attempts.","code":"rate_limited"}"#) }
        await assertThrows(.rateLimited("Too many attempts.")) { _ = try await session.login(username: "timmy", password: "wrong") }

        // An old server redirects to its HTML login page.
        StubURLProtocol.handler = { _ in (200, ["Content-Type": "text/html"], Data("<html><title>Marquee</title></html>".utf8)) }
        await assertThrows(.notMarquee) { _ = try await session.login(username: "timmy", password: "hunter22") }

        StubURLProtocol.requests = []
        await assertThrows(.invalid("Enter your username and password.")) { _ = try await session.login(username: "  ", password: "") }
        XCTAssertTrue(StubURLProtocol.requests.isEmpty, "Empty fields never reach the server's rate limiter")
    }

    /// The sign-in screen sat open while the server restarted: the first POST
    /// dies on the dropped connection, the server checks out, and the retry
    /// signs in.
    @MainActor
    func testLoginRetriesOnceAfterADroppedConnection() async throws {
        let attempts = LockedCounter()
        StubURLProtocol.handler = { _ in
            if attempts.increment() == 1 { throw URLError(.networkConnectionLost) }
            return StubURLProtocol.json(200, Self.loginJSON)
        }
        let info = ServerInfo(app: "marquee", apiVersion: 1, version: "0.30.3", setupComplete: true, status: "ok")
        let (session, store, _) = makeSession(token: nil, probe: { _ in .marquee(info) })

        let user = try await session.login(username: "timmy", password: "hunter22")
        XCTAssertEqual(user.displayName, "Timmy")
        XCTAssertEqual(attempts.value, 2)
        XCTAssertEqual(store.token(for: Self.server.baseURLString), "mqt_fresh")
        XCTAssertEqual(session.serverInfo?.version, "0.30.3", "The check refreshes what the sign-in card shows")
    }

    /// Still unreachable after checking: the error says what the check found,
    /// and nothing is sent a second time.
    @MainActor
    func testLoginExplainsWhenTheServerIsReallyGone() async {
        let attempts = LockedCounter()
        StubURLProtocol.handler = { _ in
            attempts.increment()
            throw URLError(.cannotConnectToHost)
        }
        let (session, _, _) = makeSession(token: nil, probe: { _ in .unreachable(.refused) })
        do {
            _ = try await session.login(username: "timmy", password: "hunter22")
            XCTFail("Expected an error")
        } catch let error as SignInConnectionError {
            XCTAssertTrue(error.message.hasPrefix("Nothing is answering on port"), error.message)
        } catch {
            XCTFail("Unexpected \(error)")
        }
        XCTAssertEqual(attempts.value, 1)
    }

    @MainActor
    func testLogoutClearsTokenEvenWhenRevokeFails() async {
        StubURLProtocol.handler = { _ in throw URLError(.timedOut) }
        let (session, store, _) = makeSession()
        await session.logout()
        XCTAssertNil(store.token(for: Self.server.baseURLString))
        XCTAssertFalse(session.hasToken)
        XCTAssertEqual(StubURLProtocol.requests.first?.url?.path, "/api/v1/auth/logout")
        XCTAssertEqual(StubURLProtocol.requests.first?.value(forHTTPHeaderField: "Authorization"), "Bearer mqt_saved")
    }

    @MainActor
    func testUnauthorizedDataCallSignsOut() async {
        StubURLProtocol.handler = { _ in StubURLProtocol.json(401, #"{"error":"Token revoked","code":"unauthorized"}"#) }
        let (session, store, _) = makeSession()
        var fired = false
        session.onUnauthorized = { fired = true }

        await assertThrows(.unauthorized) { _ = try await session.client!.get("/requests", as: EmptyResponse.self) }
        XCTAssertTrue(fired)
        XCTAssertNil(store.token(for: Self.server.baseURLString))
        XCTAssertNil(session.user)
    }

    @MainActor
    func testSelectAndForgetServer() {
        let (session, store, defaults) = makeSession()
        let other = ServerAddress(host: "tower.local")
        session.select(other, info: ServerInfo(version: "0.22.0", setupComplete: false))
        XCTAssertEqual(defaults.string(forKey: ServerSession.serverDefaultsKey), "http://tower.local:3000")
        XCTAssertEqual(session.serverInfo?.setupComplete, false)
        XCTAssertFalse(session.hasToken, "Each server has its own token")

        session.select(Self.server, info: nil)
        XCTAssertTrue(session.hasToken)
        session.forgetServer()
        XCTAssertNil(session.server)
        XCTAssertNil(defaults.string(forKey: ServerSession.serverDefaultsKey))
        XCTAssertNil(store.token(for: Self.server.baseURLString))
    }

    // MARK: Helpers

    /// Remember me: after Sign Out, the sign-in card fills in the username
    /// last used on this server. The password is never kept.
    @MainActor
    func testSignInRemembersTheUsernameAcrossSignOut() async throws {
        StubURLProtocol.handler = { request in
            request.url?.path == "/api/v1/auth/logout"
                ? StubURLProtocol.json(200, "{}")
                : StubURLProtocol.json(200, Self.loginJSON)
        }
        let (session, _, defaults) = makeSession(token: nil)
        XCTAssertNil(session.rememberedUsername())

        _ = try await session.login(username: " timmy ", password: "hunter22")
        await session.logout()
        XCTAssertFalse(session.hasToken)
        XCTAssertEqual(session.rememberedUsername(), "timmy", "Trimmed, and still there after Sign Out")
        XCTAssertNil(session.rememberedUsername(jellyfin: true), "A Jellyfin username is kept apart")

        // A fresh launch (a new session on the same settings) still has it.
        let relaunched = ServerSession(defaults: defaults, tokenStore: InMemoryTokenStore(), pinned: nil)
        XCTAssertEqual(relaunched.rememberedUsername(), "timmy")

        let stored = try XCTUnwrap(defaults.dictionary(forKey: ServerSession.usernamesDefaultsKey))
        XCTAssertEqual(stored as? [String: String], [Self.server.baseURLString: "timmy"])
        XCTAssertFalse(
            defaults.dictionaryRepresentation().values.contains { "\($0)".contains("hunter22") },
            "The password is never stored"
        )
    }

    @MainActor
    func testJellyfinAndFailedSignInsAndOtherServers() async throws {
        let (session, _, _) = makeSession(token: nil)

        StubURLProtocol.handler = { _ in StubURLProtocol.json(401, #"{"error":"Incorrect username or password","code":"invalid_credentials"}"#) }
        _ = try? await session.login(username: "typo", password: "wrong")
        XCTAssertNil(session.rememberedUsername(), "Only a username that signed in is remembered")

        StubURLProtocol.handler = { _ in StubURLProtocol.json(200, Self.loginJSON) }
        _ = try await session.loginWithJellyfin(username: "tim-jf", password: "pw")
        XCTAssertEqual(session.rememberedUsername(jellyfin: true), "tim-jf")
        XCTAssertNil(session.rememberedUsername())

        session.select(ServerAddress(host: "127.0.0.1", port: 10), info: nil)
        XCTAssertNil(session.rememberedUsername(jellyfin: true), "Each server has its own")
    }

    @MainActor
    func testAPinnedRunDoesNotRememberUsernames() async throws {
        StubURLProtocol.handler = { _ in StubURLProtocol.json(200, Self.loginJSON) }
        let defaults = UserDefaults(suiteName: "com.timmyamant.MarqueeTests.pinnedName.\(UUID().uuidString)")!
        let session = ServerSession(
            defaults: defaults, tokenStore: InMemoryTokenStore(), urlSession: StubURLProtocol.session(), deviceName: "Test Mac",
            pinned: PinnedServer(address: Self.server, token: nil), probe: { _ in .unreachable(.noResponse) }
        )
        _ = try await session.login(username: "timmy", password: "hunter22")
        XCTAssertNil(defaults.object(forKey: ServerSession.usernamesDefaultsKey))
    }

    private static func body(of request: URLRequest) -> [String: Any] {
        var data = request.httpBody ?? Data()
        if data.isEmpty, let stream = request.httpBodyStream {
            stream.open()
            defer { stream.close() }
            var buffer = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable {
                let count = stream.read(&buffer, maxLength: buffer.count)
                guard count > 0 else { break }
                data.append(buffer, count: count)
            }
        }
        return (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
    }

    @MainActor
    private func assertThrows(
        _ expected: APIError,
        file: StaticString = #filePath,
        line: UInt = #line,
        _ body: () async throws -> Void
    ) async {
        do {
            try await body()
            XCTFail("Expected \(expected)", file: file, line: line)
        } catch {
            XCTAssertEqual(error as? APIError, expected, file: file, line: line)
        }
    }
}

/// A count the stub's handler (called off the main actor) can bump safely.
final class LockedCounter: @unchecked Sendable {
    private let lock = NSLock()
    private var count = 0

    var value: Int { lock.withLock { count } }

    @discardableResult
    func increment() -> Int { lock.withLock { count += 1; return count } }
}
