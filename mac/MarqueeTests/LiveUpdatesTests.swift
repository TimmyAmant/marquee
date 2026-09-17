import XCTest
@testable import Marquee

// Badge polling and notification banners against a stubbed server.

@MainActor
final class LiveUpdatesTests: XCTestCase {
    /// The counts and notifications the stub answers with, mutable between polls.
    private final class StubServer: @unchecked Sendable {
        private let lock = NSLock()
        private var unread = 0
        private var pending = 0
        private var notifications: [(id: UUID, createdAt: String, read: Bool)] = []

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

        func markAllRead() {
            lock.withLock {
                notifications = notifications.map { ($0.id, $0.createdAt, true) }
                unread = 0
            }
        }

        func handle(_ request: URLRequest) -> (Int, [String: String], Data) {
            lock.withLock {
                switch request.url?.path {
                case "/api/v1/badges":
                    return StubURLProtocol.json(200, #"{"unreadNotifications":\#(unread),"pendingRequests":\#(pending)}"#)
                case "/api/v1/notifications":
                    let items = notifications.map { item in
                        """
                        {"id":"\(item.id.uuidString.lowercased())","mediaType":"movie","tmdbId":603,"title":"The Matrix",\
                        "eventType":"downloaded","message":"\\"The Matrix\\" finished downloading.","read":\(item.read),\
                        "createdAt":"\(item.createdAt)"}
                        """
                    }
                    return StubURLProtocol.json(200, #"{"unreadCount":\#(unread),"results":[\#(items.joined(separator: ","))]}"#)
                default:
                    return StubURLProtocol.json(404, #"{"error":"Not found","code":"not_found"}"#)
                }
            }
        }
    }

    private final class FakeBanners: NotificationBannerPosting {
        var prepareCalls = 0
        var posted: [API.NotificationItem] = []

        func prepare() { prepareCalls += 1 }
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

    private func makeLive() -> LiveUpdates {
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
            setDockBadge: { [weak self] label in self?.dockLabel = label }
        )
        return live
    }

    private func start(_ live: LiveUpdates) async {
        let client = APIClient(baseURL: URL(string: "http://127.0.0.1:3000")!, token: "mqt_test", session: StubURLProtocol.session())
        let events = self.events
        live.start(identity: identity) { MarqueeAPI(client: client, events: events) }
        await live.settle()
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
        XCTAssertEqual(banners.prepareCalls, 1)
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
}
