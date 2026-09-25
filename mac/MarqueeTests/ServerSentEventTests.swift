import XCTest
@testable import Marquee

// GET /notifications/stream: the event-stream parser against the doc's own
// example (Fixtures/api/notifications-stream.sse), and the client over it.

final class ServerSentEventTests: XCTestCase {
    private func fixture() throws -> Data {
        let url = Bundle(for: Self.self).resourceURL!.appendingPathComponent("Fixtures/api/notifications-stream.sse")
        return try Data(contentsOf: url)
    }

    private func parse(_ data: Data) -> (events: [ServerSentEvent], retry: Duration?) {
        var lines = ServerSentEventLineSplitter()
        var parser = ServerSentEventParser()
        var events: [ServerSentEvent] = []
        for byte in data {
            if let line = lines.feed(byte), let event = parser.consume(line) {
                events.append(event)
            }
        }
        return (events, parser.reconnectionTime)
    }

    func testTheDocExampleParses() throws {
        let (events, retry) = parse(try fixture())
        XCTAssertEqual(events.map(\.name), ["ready", "notification", "signed-out"])
        XCTAssertEqual(retry, .milliseconds(5000))
        XCTAssertEqual(events[1].id, "a23f7682-41ae-4e8a-8b17-14d903ab017a")

        let item = try APIClient.decoder.decode(API.NotificationItem.self, from: Data(events[1].data.utf8))
        XCTAssertEqual(item.title, "Inception")
        XCTAssertEqual(item.titleID.route.absoluteString, "marquee://title/movie/27205")
        XCTAssertEqual(item.createdAt, APIClient.parseDate("2026-09-25T11:25:16.885Z"))
    }

    func testCommentsLineEndingsAndMultilineData() {
        let text = ": keep-alive\r\n\r\nevent: note\rdata: one\ndata:two\r\n\r\ndata: bare\n\n: another\n\n"
        let (events, retry) = parse(Data(text.utf8))
        XCTAssertEqual(events, [
            ServerSentEvent(name: "note", data: "one\ntwo", id: nil),
            ServerSentEvent(name: "message", data: "bare", id: nil),
        ], "Comments are skipped, every line ending works, and an unnamed event is a message")
        XCTAssertNil(retry)
    }

    func testAnEventIsOnlyDispatchedByABlankLine() {
        var lines = ServerSentEventLineSplitter()
        var parser = ServerSentEventParser()
        var events: [ServerSentEvent] = []
        for byte in Data("event: ready\ndata: {}\n".utf8) {
            if let line = lines.feed(byte), let event = parser.consume(line) { events.append(event) }
        }
        XCTAssertTrue(events.isEmpty, "Not yet: the blank line hasn't arrived")
        if let line = lines.feed(0x0A), let event = parser.consume(line) { events.append(event) }
        XCTAssertEqual(events.map(\.name), ["ready"])
    }

    // MARK: The client

    override func tearDown() {
        StubURLProtocol.handler = nil
        StubURLProtocol.requests = []
        super.tearDown()
    }

    private final class Collected: @unchecked Sendable {
        private let lock = NSLock()
        private var names: [String] = []
        var all: [String] { lock.withLock { names } }
        func append(_ name: String) { lock.withLock { names.append(name) } }
    }

    func testTheClientDeliversEachEventAndTheRetryHint() async throws {
        let body = try fixture()
        StubURLProtocol.handler = { request in
            XCTAssertEqual(request.url?.path, "/api/v1/notifications/stream")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Accept"), "text/event-stream")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer mqt_test")
            return (200, ["Content-Type": "text/event-stream; charset=utf-8", "X-Marquee-API": "1"], body)
        }
        let client = APIClient(baseURL: URL(string: "http://127.0.0.1:3000")!, token: "mqt_test", session: StubURLProtocol.session())
        let collected = Collected()
        let retry = try await MarqueeAPI(client: client).notifications.stream { event in
            collected.append(event.name)
        }
        XCTAssertEqual(collected.all, ["ready", "notification", "signed-out"])
        XCTAssertEqual(retry, .milliseconds(5000))
    }

    func testARevokedTokenSignsOutThroughTheUsualPath() async {
        StubURLProtocol.handler = { _ in StubURLProtocol.json(401, #"{"error":"Your session has ended.","code":"unauthorized"}"#) }
        let signedOut = expectation(description: "onUnauthorized")
        let client = APIClient(baseURL: URL(string: "http://127.0.0.1:3000")!, token: "mqt_test", session: StubURLProtocol.session()) {
            signedOut.fulfill()
        }
        do {
            _ = try await MarqueeAPI(client: client).notifications.stream { _ in }
            XCTFail("Expected unauthorized")
        } catch {
            XCTAssertEqual(error as? APIError, .unauthorized)
        }
        await fulfillment(of: [signedOut], timeout: 1)
    }

    func testAServerWithoutTheStreamIsNotFound() async {
        StubURLProtocol.handler = { _ in StubURLProtocol.json(404, #"{"error":"Not found","code":"not_found"}"#) }
        let client = APIClient(baseURL: URL(string: "http://127.0.0.1:3000")!, token: "mqt_test", session: StubURLProtocol.session())
        do {
            _ = try await MarqueeAPI(client: client).notifications.stream { _ in }
            XCTFail("Expected notFound")
        } catch {
            XCTAssertEqual(error as? APIError, .notFound)
        }
    }

    func testAnAvatarPathMustBeOnTheSameServer() async {
        let client = APIClient(baseURL: URL(string: "http://127.0.0.1:3000")!, token: "mqt_test", session: StubURLProtocol.session())
        for path in ["https://example.com/avatar.jpg", "//example.com/avatar.jpg"] {
            do {
                _ = try await MarqueeAPI(client: client).users.avatar(at: path)
                XCTFail("\(path) should be refused")
            } catch {
                XCTAssertTrue(error is APIError, path)
            }
        }
        XCTAssertTrue(StubURLProtocol.requests.isEmpty, "The token never goes anywhere else")
    }
}
