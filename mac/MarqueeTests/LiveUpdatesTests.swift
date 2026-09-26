import XCTest
@testable import Marquee

// The notification stream, badge polling and notification banners against a
// stubbed server.

@MainActor
final class LiveUpdatesTests: XCTestCase {
    /// The counts and notifications the stub answers with, mutable between polls.
    private final class StubServer: @unchecked Sendable {
        private let lock = NSLock()
        private var unread = 0
        private var pending = 0
        private var notifications: [(id: UUID, createdAt: String, read: Bool)] = []
        /// What `GET /notifications/stream` sends before closing; nil is a
        /// server from before the stream (404).
        private var stream: [(id: UUID, createdAt: String)]? = []
        private var streamSignsOut = false
        /// Notifications of a kind the account turned device push off for
        /// (`"alert": false`, 0.45+).
        private var quiet: Set<UUID> = []
        private(set) var meRequests = 0

        func set(unread: Int, pending: Int = 0) {
            lock.withLock {
                self.unread = unread
                self.pending = pending
            }
        }

        func add(_ count: Int, from minute: Int) {
            lock.withLock {
                for offset in 0..<count {
                    notifications.insert(
                        (UUID(), String(format: "2026-09-17T10:%02d:00.000Z", minute + offset), false),
                        at: 0
                    )
                }
                unread = notifications.filter { !$0.read }.count
            }
        }

        /// One notification the server created just now.
        func add(_ id: UUID, at createdAt: String) {
            lock.withLock {
                notifications.insert((id, createdAt, false), at: 0)
                unread = notifications.filter { !$0.read }.count
            }
        }

        /// The next stream connection delivers these (after `ready`).
        func streamNext(_ items: [(id: UUID, createdAt: String)], signsOut: Bool = false) {
            lock.withLock {
                stream = items
                streamSignsOut = signsOut
            }
        }

        /// Sends this one with `"alert": false`.
        func silence(_ id: UUID) {
            lock.withLock { _ = quiet.insert(id) }
        }

        func removeStream() {
            lock.withLock { stream = nil }
        }

        func markAllRead() {
            lock.withLock {
                notifications = notifications.map { ($0.id, $0.createdAt, true) }
                unread = 0
            }
        }

        /// Without `alert` unless it's one of `quiet`, like a server before 0.45.
        private func render(_ id: UUID, _ createdAt: String, read: Bool) -> String {
            let alert = quiet.contains(id) ? #""alert":false,"# : ""
            return """
            {"id":"\(id.uuidString.lowercased())","mediaType":"movie","tmdbId":603,"title":"The Matrix",\
            "eventType":"downloaded","message":"\\"The Matrix\\" finished downloading.","read":\(read),\
            \(alert)"createdAt":"\(createdAt)"}
            """
        }

        func handle(_ request: URLRequest) -> (Int, [String: String], Data) {
            lock.withLock {
                switch request.url?.path {
                case "/api/v1/badges":
                    return StubURLProtocol.json(200, #"{"unreadNotifications":\#(unread),"pendingRequests":\#(pending)}"#)
                case "/api/v1/notifications":
                    let items = notifications.map { render($0.id, $0.createdAt, read: $0.read) }
                    return StubURLProtocol.json(200, #"{"unreadCount":\#(unread),"results":[\#(items.joined(separator: ","))]}"#)
                case "/api/v1/notifications/stream":
                    guard let stream else {
                        return StubURLProtocol.json(404, #"{"error":"Not found","code":"not_found"}"#)
                    }
                    var body = "retry: 5000\n\nevent: ready\ndata: {}\n\n: keep-alive\n\n"
                    for item in stream {
                        body += "event: notification\nid: \(item.id.uuidString.lowercased())\ndata: \(render(item.id, item.createdAt, read: false))\n\n"
                    }
                    if streamSignsOut { body += "event: signed-out\ndata: {}\n\n" }
                    // Each connection delivers them once.
                    self.stream = []
                    streamSignsOut = false
                    return (200, ["Content-Type": "text/event-stream; charset=utf-8", "X-Marquee-API": "1"], Data(body.utf8))
                case "/api/v1/me":
                    meRequests += 1
                    return StubURLProtocol.json(401, #"{"error":"Your session has ended.","code":"unauthorized"}"#)
                default:
                    return StubURLProtocol.json(404, #"{"error":"Not found","code":"not_found"}"#)
                }
            }
        }
    }

    private final class FakeBanners: NotificationBannerPosting {
        var posted: [API.NotificationItem] = []

        func post(_ notification: API.NotificationItem) { posted.append(notification) }
    }

    private final class MemoryWatermarks: NotificationWatermarkStore {
        var values: [String: Date] = [:]

        func watermark(for identity: String) -> Date? { values[identity] }
        func setWatermark(_ date: Date, for identity: String) { values[identity] = date }
    }

    private let identity = "http://127.0.0.1:3000|user"
    private var server = StubServer()
    private var banners = FakeBanners()
    private var watermarks = MemoryWatermarks()
    private var events = ServerEvents()
    /// The last label handed to the Dock tile.
    private var dockLabel: String?

    /// - Parameter streams: Opens the notification stream too; the poll
    ///   tests leave it closed so every request is one they made. A test
    ///   that streams stops `live` before it returns, so no connection
    ///   outlives it.
    private func makeLive(streams: Bool = false) -> LiveUpdates {
        server = StubServer()
        banners = FakeBanners()
        watermarks = MemoryWatermarks()
        events = ServerEvents()
        dockLabel = nil
        let server = self.server
        StubURLProtocol.handler = { request in server.handle(request) }
        // An hour between ticks: every poll in these tests is an explicit one.
        let live = LiveUpdates(
            events: events,
            banners: banners,
            watermarks: watermarks,
            pollInterval: .seconds(3600),
            streamsNotifications: streams,
            setDockBadge: { [weak self] label in self?.dockLabel = label }
        )
        live.bannersEnabled = true
        return live
    }

    private func start(_ live: LiveUpdates) async {
        let client = APIClient(baseURL: URL(string: "http://127.0.0.1:3000")!, token: "mqt_test", session: StubURLProtocol.session())
        let events = self.events
        live.start(identity: identity) { MarqueeAPI(client: client, events: events) }
        await live.settle()
    }

    /// For what the stream does in the background.
    private func waitUntil(_ what: String, _ condition: () -> Bool) async {
        let deadline = ContinuousClock.now + .seconds(3)
        while !condition() {
            guard ContinuousClock.now < deadline else {
                XCTFail("Timed out waiting until \(what)")
                return
            }
            try? await Task.sleep(for: .milliseconds(10))
        }
    }

    override func tearDown() {
        StubURLProtocol.handler = nil
        super.tearDown()
    }

    func testFirstPollAdoptsCountsWithoutAnnouncingOldNotifications() async {
        let live = makeLive()
        server.add(2, from: 10)
        await start(live)

        XCTAssertEqual(live.badges, API.Badges(unreadNotifications: 2, pendingRequests: 0))
        XCTAssertEqual(live.unreadCount, 2)
        XCTAssertEqual(banners.posted.count, 0, "Unread notifications from before this run aren't announced")
        XCTAssertEqual(dockLabel, "2")
        XCTAssertEqual(watermarks.values[identity], APIClient.parseDate("2026-09-17T10:11:00.000Z"))
        XCTAssertEqual(events.revision(of: .all), 0, "The first poll has nothing to compare against")
    }

    func testNewNotificationsBecomeBanners() async {
        let live = makeLive()
        server.add(1, from: 10)
        await start(live)

        server.add(2, from: 20)
        live.refresh(.poll)
        await live.settle()

        XCTAssertEqual(live.unreadCount, 3)
        XCTAssertEqual(banners.posted.count, 2)
        XCTAssertEqual(banners.posted.first?.titleID.route.absoluteString, "marquee://title/movie/603")
        XCTAssertEqual(banners.posted.map(\.createdAt).sorted(), banners.posted.map(\.createdAt), "Oldest announced first")
        XCTAssertEqual(events.notifications, 1, "Screens reload when the server's count moved")
        XCTAssertEqual(watermarks.values[identity], APIClient.parseDate("2026-09-17T10:21:00.000Z"))

        // Nothing new: no second announcement.
        live.refresh(.poll)
        await live.settle()
        XCTAssertEqual(banners.posted.count, 2)
        XCTAssertEqual(events.notifications, 1)
    }

    func testManyArrivalsCollapseIntoOneBanner() async {
        let live = makeLive()
        await start(live)

        server.add(5, from: 30)
        live.refresh(.poll)
        await live.settle()

        XCTAssertEqual(banners.posted.count, 1)
        XCTAssertTrue(banners.posted.first?.message.hasSuffix("(+4 more)") == true)
    }

    func testNotificationsFromWhileTheAppWasClosedAreAnnounced() async {
        let live = makeLive()
        server.add(2, from: 40)
        watermarks.values[identity] = APIClient.parseDate("2026-09-17T10:40:30.000Z")
        await start(live)

        XCTAssertEqual(banners.posted.count, 1, "Only the one newer than the stored watermark")
        XCTAssertEqual(banners.posted.first?.createdAt, APIClient.parseDate("2026-09-17T10:41:00.000Z"))
    }

    func testLocalChangeRefreshesQuietly() async {
        let live = makeLive()
        server.add(2, from: 10)
        await start(live)
        XCTAssertEqual(events.notifications, 0)

        // "Mark all read" through the API: the mutation already bumped the
        // counter, so the follow-up poll must not bump it again.
        server.markAllRead()
        events.record(.notifications)
        await live.settle()

        XCTAssertEqual(live.unreadCount, 0)
        XCTAssertEqual(events.notifications, 1)
        XCTAssertNil(dockLabel)
        XCTAssertEqual(banners.posted.count, 0)
    }

    func testPendingRequestCountBumpsRequests() async {
        let live = makeLive()
        await start(live)

        server.set(unread: 0, pending: 3)
        live.refresh(.activation)
        await live.settle()

        XCTAssertEqual(live.pendingRequestCount, 3)
        XCTAssertEqual(events.requests, 1)
        XCTAssertEqual(events.notifications, 0)
    }

    func testStopClearsEverything() async {
        let live = makeLive()
        server.add(3, from: 10)
        await start(live)
        XCTAssertEqual(live.unreadCount, 3)

        live.stop()
        XCTAssertFalse(live.isRunning)
        XCTAssertEqual(live.badges, .zero)
        XCTAssertNil(dockLabel)

        // A refresh after stopping is ignored, even if the server has news.
        server.add(1, from: 50)
        live.refresh(.poll)
        await live.settle()
        XCTAssertEqual(live.unreadCount, 0)
        XCTAssertEqual(banners.posted.count, 0)
    }

    func testUnreachableServerKeepsTheLastCounts() async {
        let live = makeLive()
        server.add(2, from: 10)
        await start(live)

        StubURLProtocol.handler = { _ in throw URLError(.cannotConnectToHost) }
        live.refresh(.poll)
        await live.settle()

        XCTAssertEqual(live.unreadCount, 2)
        XCTAssertTrue(live.isRunning)
    }

    func testRepeatedUnreachablePollsGoOfflineUntilTheNextAnswer() async {
        let live = makeLive()
        await start(live)
        let server = self.server

        StubURLProtocol.handler = { _ in throw URLError(.cannotConnectToHost) }
        for poll in 1...LiveUpdates.offlineThreshold {
            XCTAssertFalse(live.isOffline, "Not offline after \(poll - 1) failed poll(s)")
            live.refresh(.poll)
            await live.settle()
        }
        XCTAssertTrue(live.isOffline)

        StubURLProtocol.handler = { request in server.handle(request) }
        live.refresh(.poll)
        await live.settle()
        XCTAssertFalse(live.isOffline, "The next answer clears it")
    }

    func testAServerErrorIsNotOffline() async {
        let live = makeLive()
        await start(live)

        StubURLProtocol.handler = { _ in StubURLProtocol.json(500, #"{"error":"Boom","code":"internal"}"#) }
        for _ in 0..<LiveUpdates.offlineThreshold {
            live.refresh(.poll)
            await live.settle()
        }
        XCTAssertFalse(live.isOffline, "A server that answers is reachable")
    }

    func testWithBannersOffTheWatermarkStillMoves() async {
        let live = makeLive()
        live.bannersEnabled = false
        await start(live)

        server.add(2, from: 20)
        live.refresh(.poll)
        await live.settle()
        XCTAssertEqual(banners.posted.count, 0, "\"Not now\": the bell has them, no banners")
        XCTAssertEqual(live.unreadCount, 2)
        XCTAssertEqual(watermarks.values[identity], APIClient.parseDate("2026-09-17T10:21:00.000Z"))

        // Turning banners on later doesn't replay what was already there.
        live.bannersEnabled = true
        live.refresh(.poll)
        await live.settle()
        XCTAssertEqual(banners.posted.count, 0)
    }

    // MARK: The stream

    func testAStreamedNotificationIsAnnouncedAtOnceAndOnlyOnce() async {
        let live = makeLive(streams: true)
        defer { live.stop() }
        // Marquee ran before; one old notification is already known.
        watermarks.values[identity] = APIClient.parseDate("2026-09-17T10:05:00.000Z")
        server.add(1, from: 0)
        let fresh = UUID()
        server.streamNext([(fresh, "2026-09-17T10:30:00.000Z")])
        await start(live)

        await waitUntil("the streamed notification is announced") { banners.posted.count == 1 }
        XCTAssertEqual(banners.posted.first?.id, fresh)
        XCTAssertEqual(banners.posted.first?.titleID.route.absoluteString, "marquee://title/movie/603")
        XCTAssertEqual(watermarks.values[identity], APIClient.parseDate("2026-09-17T10:30:00.000Z"))
        XCTAssertGreaterThanOrEqual(events.remoteRevision(of: .notifications), 1, "The bell reloads")
        XCTAssertGreaterThanOrEqual(events.remoteRevision(of: .requests), 1)

        // The next poll finds it on the server: no second banner.
        server.add(fresh, at: "2026-09-17T10:30:00.000Z")
        live.refresh(.poll)
        await live.settle()
        XCTAssertEqual(banners.posted.count, 1)
        XCTAssertEqual(live.unreadCount, 2)
    }

    func testAPolledNotificationIsNotAnnouncedAgainByTheStream() async {
        let live = makeLive(streams: true)
        defer { live.stop() }
        watermarks.values[identity] = APIClient.parseDate("2026-09-17T10:05:00.000Z")
        await start(live)
        await waitUntil("the first connection ends and waits to reconnect") { live.streamWaiting }

        // The poll sees it first (the stream was down)...
        let fresh = UUID()
        server.add(fresh, at: "2026-09-17T10:40:00.000Z")
        live.refresh(.poll)
        await live.settle()
        XCTAssertEqual(banners.posted.map(\.id), [fresh])

        // ...then the stream reconnects and delivers it too.
        let before = events.remoteRevision(of: .notifications)
        server.streamNext([(fresh, "2026-09-17T10:40:00.000Z")])
        live.refresh(.activation)
        await waitUntil("the stream delivers it") { events.remoteRevision(of: .notifications) > before }
        await live.settle()
        XCTAssertEqual(banners.posted.map(\.id), [fresh], "Announced once")
    }

    func testSignedOutOnTheStreamChecksTheSession() async {
        let live = makeLive(streams: true)
        defer { live.stop() }
        server.streamNext([], signsOut: true)
        await start(live)

        // The token was revoked: /me answers 401, which is what signs the app out.
        await waitUntil("/me is asked") { server.meRequests == 1 }
    }

    /// 0.45+: `"alert": false` (device push off for that kind) reaches the
    /// bell but posts no banner, on the stream and on the poll alike.
    func testNotificationsWithoutAlertPostNoBanner() async {
        let live = makeLive(streams: true)
        defer { live.stop() }
        watermarks.values[identity] = APIClient.parseDate("2026-09-17T10:05:00.000Z")
        let quietStreamed = UUID()
        let loudStreamed = UUID()
        server.silence(quietStreamed)
        server.streamNext([(quietStreamed, "2026-09-17T10:30:00.000Z"), (loudStreamed, "2026-09-17T10:31:00.000Z")])
        await start(live)

        await waitUntil("the loud streamed notification is announced") { banners.posted.count == 1 }
        await waitUntil("the watermark passes both") {
            watermarks.values[identity] == APIClient.parseDate("2026-09-17T10:31:00.000Z")
        }
        XCTAssertEqual(banners.posted.map(\.id), [loudStreamed], "The quiet one only reaches the bell")

        // The poll: a quiet one and a loud one.
        let quietPolled = UUID()
        let loudPolled = UUID()
        server.silence(quietPolled)
        server.add(quietPolled, at: "2026-09-17T10:40:00.000Z")
        server.add(loudPolled, at: "2026-09-17T10:41:00.000Z")
        live.refresh(.catchUp)
        await live.settle()
        XCTAssertEqual(banners.posted.map(\.id), [loudStreamed, loudPolled])
        XCTAssertEqual(live.unreadCount, 2, "Both are in the bell")
        XCTAssertEqual(watermarks.values[identity], APIClient.parseDate("2026-09-17T10:41:00.000Z"))
    }

    func testAServerWithoutTheStreamKeepsPolling() async {
        let live = makeLive(streams: true)
        defer { live.stop() }
        server.removeStream()
        await start(live)

        await waitUntil("the stream gives up") { live.streamUnsupported }
        XCTAssertFalse(live.isStreaming)
        server.add(1, from: 50)
        live.refresh(.poll)
        await live.settle()
        XCTAssertEqual(live.unreadCount, 1, "The poll carries on")
    }
}
