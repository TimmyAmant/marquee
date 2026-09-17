import Foundation
import Observation
import OSLog
import UserNotifications

/// Posts a system banner for a server notification.
@MainActor
protocol NotificationBannerPosting: AnyObject {
    /// Called when polling starts for a signed-in account: ask for permission.
    func prepare()
    func post(_ notification: API.NotificationItem)
}

/// Where the newest notification this Mac has already seen is remembered, per
/// server and account, so a relaunch only announces what arrived meanwhile.
@MainActor
protocol NotificationWatermarkStore: AnyObject {
    func watermark(for identity: String) -> Date?
    func setWatermark(_ date: Date, for identity: String)
}

/// The app's live data while signed in. The server has no push, so this polls
/// `GET /badges` every minute (and on app activation, and right after a
/// mutation that can move the counts):
///
/// - `badges` drives the sidebar's Requests badge, the bell and the Dock tile.
/// - A count that moved on its own bumps `ServerEvents` so open screens reload.
/// - When the unread count changes, the newest notifications are fetched and
///   any unread one newer than the stored watermark becomes a system banner
///   routed with `marquee://title/…` (AppDelegate opens it on click).
///
/// `stop()` on sign-out, server change or a 401 clears everything.
@MainActor
@Observable
final class LiveUpdates {
    enum Reason: Equatable, Sendable {
        /// The minute timer.
        case poll
        /// The app became active, or the user reloaded.
        case activation
        /// This app just changed notifications/requests: refresh quietly, the
        /// mutation already bumped `ServerEvents`.
        case localChange
    }

    static let pollInterval: Duration = .seconds(60)
    /// How many notifications one check looks at.
    static let notificationFetchLimit = 20
    /// More new notifications than this in one check post a single summary banner.
    static let maxBannersPerCheck = 3

    private(set) var badges = API.Badges.zero
    private(set) var isRunning = false

    var unreadCount: Int { badges.unreadNotifications }
    var pendingRequestCount: Int { badges.pendingRequests }

    @ObservationIgnored private let events: ServerEvents
    @ObservationIgnored private let banners: NotificationBannerPosting
    @ObservationIgnored private let watermarks: NotificationWatermarkStore
    @ObservationIgnored private let setDockBadge: (String?) -> Void
    @ObservationIgnored private let pollInterval: Duration

    @ObservationIgnored private var apiProvider: (() -> MarqueeAPI?)?
    @ObservationIgnored private var identity: String?
    /// nil until the first successful poll of this run.
    @ObservationIgnored private var lastBadges: API.Badges?
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var timerTask: Task<Void, Never>?
    @ObservationIgnored private var refreshTask: Task<Void, Never>?
    @ObservationIgnored private var queuedReason: Reason?

    private static let logger = Logger(subsystem: "com.timmyamant.Marquee", category: "live-updates")

    init(
        events: ServerEvents,
        banners: NotificationBannerPosting = SystemNotificationBanners(),
        watermarks: NotificationWatermarkStore = DefaultsNotificationWatermarks(),
        pollInterval: Duration = LiveUpdates.pollInterval,
        setDockBadge: @escaping (String?) -> Void = { _ in }
    ) {
        self.events = events
        self.banners = banners
        self.watermarks = watermarks
        self.pollInterval = pollInterval
        self.setDockBadge = setDockBadge
        events.onMutation = { [weak self] change in
            guard change.contains(.notifications) || change.contains(.requests) else { return }
            self?.refresh(.localChange)
        }
    }

    // MARK: Lifecycle

    /// Starts polling for one signed-in account. `identity` keys the stored
    /// watermark (server + user id); `api` is asked for a fresh facade (the
    /// current token) on every poll.
    func start(identity: String, api: @escaping () -> MarqueeAPI?) {
        stop()
        self.identity = identity
        apiProvider = api
        isRunning = true
        banners.prepare()

        let generation = self.generation
        let interval = pollInterval
        timerTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: interval)
                guard !Task.isCancelled, let self, self.generation == generation else { return }
                self.refresh(.poll)
            }
        }
        refresh(.activation)
    }

    /// Sign-out, server change, 401: stop polling and clear the counts.
    func stop() {
        generation &+= 1
        timerTask?.cancel()
        timerTask = nil
        refreshTask?.cancel()
        refreshTask = nil
        queuedReason = nil
        apiProvider = nil
        identity = nil
        lastBadges = nil
        isRunning = false
        if badges != .zero { badges = .zero }
        setDockBadge(nil)
    }

    /// Polls now. Coalesced: while a refresh is in flight one more is queued.
    func refresh(_ reason: Reason = .activation) {
        guard isRunning else { return }
        guard refreshTask == nil else {
            // A quiet refresh never replaces one that should record changes.
            if queuedReason == nil || queuedReason == .localChange { queuedReason = reason }
            return
        }
        let generation = self.generation
        refreshTask = Task { [weak self] in
            await self?.poll(reason, generation: generation)
            self?.refreshFinished(generation: generation)
        }
    }

    /// Waits until no refresh is running or queued (tests, and callers that
    /// want fresh counts before continuing).
    func settle() async {
        while let task = refreshTask {
            await task.value
        }
    }

    private func refreshFinished(generation: Int) {
        guard generation == self.generation else { return }
        refreshTask = nil
        if let next = queuedReason {
            queuedReason = nil
            refresh(next)
        }
    }

    // MARK: Polling

    private func poll(_ reason: Reason, generation: Int) async {
        guard let api = apiProvider?() else { return }
        let fresh: API.Badges
        do {
            fresh = try await api.badges()
        } catch {
            // A 401 already signed the session out (and stopped us); anything
            // else just waits for the next tick.
            if let error = error as? APIError, !error.isCancellation {
                Self.logger.info("Badge poll failed: \(error.localizedDescription, privacy: .public)")
            }
            return
        }
        guard generation == self.generation else { return }

        let previous = lastBadges
        lastBadges = fresh
        if fresh != badges { badges = fresh }
        setDockBadge(fresh.dockLabel)

        if let previous, reason != .localChange {
            var change: ServerEvents.Change = []
            if fresh.unreadNotifications != previous.unreadNotifications { change.insert(.notifications) }
            if fresh.pendingRequests != previous.pendingRequests { change.insert(.requests) }
            if !change.isEmpty { events.record(change, source: .server) }
        }

        // The first poll of a run always checks (to announce what arrived
        // while Marquee was closed, or to set the first watermark); later ones
        // only when the unread count moved and something is unread.
        let shouldCheck = previous == nil
            || (fresh.unreadNotifications != previous?.unreadNotifications && fresh.unreadNotifications > 0)
        if shouldCheck {
            await checkForNewNotifications(api, generation: generation)
        }
    }

    private func checkForNewNotifications(_ api: MarqueeAPI, generation: Int) async {
        guard let identity else { return }
        let list: API.NotificationList
        do {
            list = try await api.notifications.list(limit: Self.notificationFetchLimit)
        } catch {
            return
        }
        guard generation == self.generation else { return }

        let stored = watermarks.watermark(for: identity)
        if let stored {
            let arrivals = list.results
                .filter { !$0.read && $0.createdAt > stored }
                .sorted { $0.createdAt < $1.createdAt }
            announce(arrivals)
        }

        // Server timestamps only, never this Mac's clock. With nothing to go
        // on yet, everything that arrives from now on counts as new.
        let newest = list.results.map(\.createdAt).max()
        let next = [stored, newest].compactMap { $0 }.max() ?? .distantPast
        if next != stored {
            watermarks.setWatermark(next, for: identity)
        }
    }

    private func announce(_ arrivals: [API.NotificationItem]) {
        guard !arrivals.isEmpty else { return }
        if arrivals.count <= Self.maxBannersPerCheck {
            for notification in arrivals {
                banners.post(notification)
            }
        } else if let newest = arrivals.last {
            // One banner for the newest; its message notes the rest.
            banners.post(API.NotificationItem(
                id: newest.id,
                mediaType: newest.mediaType,
                tmdbId: newest.tmdbId,
                title: newest.title,
                eventType: newest.eventType,
                message: "\(newest.message) (+\(arrivals.count - 1) more)",
                read: newest.read,
                createdAt: newest.createdAt
            ))
        }
    }
}

// MARK: - System implementations

/// `UNUserNotificationCenter` banners, clicked through AppDelegate's
/// `userInfo["route"]` handling (the same route the old engine posted).
@MainActor
final class SystemNotificationBanners: NotificationBannerPosting {
    private var requestedAuthorization = false
    private nonisolated static let logger = Logger(subsystem: "com.timmyamant.Marquee", category: "notifications")

    func prepare() {
        guard !requestedAuthorization else { return }
        requestedAuthorization = true
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            if let error {
                Self.logger.error("Notification authorization failed: \(error.localizedDescription, privacy: .public)")
            } else if !granted {
                Self.logger.info("Notification banners declined")
            }
        }
    }

    func post(_ notification: API.NotificationItem) {
        let content = UNMutableNotificationContent()
        content.title = notification.title
        content.body = notification.message
        content.sound = .default
        content.threadIdentifier = "marquee.notifications"
        content.userInfo = ["route": notification.titleID.route.absoluteString]
        // The server id: a notification is never announced twice.
        let request = UNNotificationRequest(identifier: notification.id.uuidString.lowercased(), content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }
}

@MainActor
final class DefaultsNotificationWatermarks: NotificationWatermarkStore {
    static let keyPrefix = "marquee.notifications.watermark."
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func watermark(for identity: String) -> Date? {
        defaults.object(forKey: Self.keyPrefix + identity) as? Date
    }

    func setWatermark(_ date: Date, for identity: String) {
        defaults.set(date, forKey: Self.keyPrefix + identity)
    }
}
