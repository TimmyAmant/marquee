import Foundation
import Observation
import OSLog
import UserNotifications

/// Posts a system banner for a server notification. Only called while
/// `LiveUpdates.bannersEnabled` (see `NotificationConsent`).
@MainActor
protocol NotificationBannerPosting: AnyObject {
    func post(_ notification: API.NotificationItem)
}

/// Where the newest notification this Mac has already seen is remembered, per
/// server and account, so a relaunch only announces what arrived meanwhile.
@MainActor
protocol NotificationWatermarkStore: AnyObject {
    func watermark(for identity: String) -> Date?
    func setWatermark(_ date: Date, for identity: String)
}

/// The app's live data while signed in, straight from the Marquee server
/// (no outside push service):
///
/// - `GET /notifications/stream` stays open, and each notification the server
///   creates arrives on it at once: it becomes a system banner routed with
///   `marquee://title/…` (AppDelegate opens it on click) and bumps
///   `ServerEvents` so the bell and open screens reload. A dropped stream
///   reconnects after 5 seconds, doubling to a minute, and catches up.
/// - `GET /badges` is polled every minute as the safety net (and on app
///   activation, and right after a mutation that can move the counts): it
///   drives the navigation menu's Requests badge, the bell and the Dock tile,
///   and a count that moved on its own bumps `ServerEvents`. When the unread
///   count changes, the newest notifications are fetched and any unread one
///   newer than the stored watermark becomes a banner.
///
/// A notification is announced once, whichever path saw it first: both check
/// its id and the watermark. One with `alert: false` (the account turned
/// device push off for its kind) updates the bell but posts no banner. `stop()` on sign-out, server change or a 401
/// clears everything.
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
        /// The stream came back after a drop: look for anything it missed,
        /// even if the unread count ended up where it was.
        case catchUp
    }

    static let pollInterval: Duration = .seconds(60)
    /// The stream's first reconnection delay (the server's own `retry: 5000`),
    /// doubled after each failed attempt up to `streamRetryMax`.
    static let streamRetryInitial: Duration = .seconds(5)
    static let streamRetryMax: Duration = .seconds(60)
    /// How many notifications one check looks at.
    static let notificationFetchLimit = 20
    /// More new notifications than this in one check post a single summary banner.
    static let maxBannersPerCheck = 3
    /// Polls in a row that couldn't reach the server before `isOffline`.
    static let offlineThreshold = 3

    private(set) var badges = API.Badges.zero
    private(set) var isRunning = false
    /// The last `offlineThreshold` polls couldn't reach the server at all.
    /// The main window shows a slim "retrying" strip; the next poll that gets
    /// any answer clears it.
    private(set) var isOffline = false
    /// The notification stream is open (it said `ready`), so new ones arrive
    /// the moment they happen rather than at the next poll.
    private(set) var isStreaming = false
    /// The server predates the stream (404): only the poll brings news.
    private(set) var streamUnsupported = false

    var unreadCount: Int { badges.unreadNotifications }
    /// The Requests rail badge: pending requests plus open problem reports.
    var pendingRequestCount: Int { badges.requestsPageCount }

    /// Whether new notifications become system banners: the account's choice
    /// in `NotificationConsent`. Off, they still reach the bell, and the
    /// watermark still moves, so turning banners on later doesn't replay them.
    @ObservationIgnored var bannersEnabled = false

    @ObservationIgnored private let events: ServerEvents
    @ObservationIgnored private let banners: NotificationBannerPosting
    @ObservationIgnored private let watermarks: NotificationWatermarkStore
    @ObservationIgnored private let setDockBadge: (String?) -> Void
    @ObservationIgnored private let pollInterval: Duration
    @ObservationIgnored private let streamsNotifications: Bool

    @ObservationIgnored private var apiProvider: (() -> MarqueeAPI?)?
    @ObservationIgnored private var identity: String?
    /// nil until the first successful poll of this run.
    @ObservationIgnored private var lastBadges: API.Badges?
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var timerTask: Task<Void, Never>?
    @ObservationIgnored private var refreshTask: Task<Void, Never>?
    @ObservationIgnored private var queuedReason: Reason?
    @ObservationIgnored private var consecutiveFailures = 0
    /// Every notification this run has announced (or would have, with banners
    /// off), so the stream and the poll never post the same one twice.
    @ObservationIgnored private var announcedIDs: Set<UUID> = []

    @ObservationIgnored private var streamTask: Task<Void, Never>?
    /// Between connections, waiting out the backoff.
    @ObservationIgnored private(set) var streamWaiting = false
    /// What the current connection has said so far.
    @ObservationIgnored private var streamSaidReady = false
    @ObservationIgnored private var streamSignedOut = false

    private static let logger = Logger(subsystem: "com.timmyamant.Marquee", category: "live-updates")

    /// - Parameter streamsNotifications: false leaves only the poll (tests of the poll).
    init(
        events: ServerEvents,
        banners: NotificationBannerPosting = SystemNotificationBanners(),
        watermarks: NotificationWatermarkStore = DefaultsNotificationWatermarks(),
        pollInterval: Duration = LiveUpdates.pollInterval,
        streamsNotifications: Bool = true,
        setDockBadge: @escaping (String?) -> Void = { _ in }
    ) {
        self.events = events
        self.banners = banners
        self.watermarks = watermarks
        self.pollInterval = pollInterval
        self.streamsNotifications = streamsNotifications
        self.setDockBadge = setDockBadge
        events.onMutation = { [weak self] change in
            guard change.contains(.notifications) || change.contains(.requests) else { return }
            self?.refresh(.localChange)
        }
    }

    // MARK: Lifecycle

    /// Starts the stream and the poll for one signed-in account. `identity`
    /// keys the stored watermark (server + user id); `api` is asked for a
    /// fresh facade (the current token) on every poll and connection.
    func start(identity: String, api: @escaping () -> MarqueeAPI?) {
        stop()
        self.identity = identity
        apiProvider = api
        isRunning = true

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
        if streamsNotifications {
            startStream()
        }
    }

    /// Sign-out, server change, 401: stop the stream and the poll and clear the counts.
    func stop() {
        generation &+= 1
        timerTask?.cancel()
        timerTask = nil
        refreshTask?.cancel()
        refreshTask = nil
        streamTask?.cancel()
        streamTask = nil
        streamWaiting = false
        if isStreaming { isStreaming = false }
        if streamUnsupported { streamUnsupported = false }
        queuedReason = nil
        apiProvider = nil
        identity = nil
        lastBadges = nil
        consecutiveFailures = 0
        announcedIDs = []
        if isOffline { isOffline = false }
        isRunning = false
        if badges != .zero { badges = .zero }
        setDockBadge(nil)
    }

    /// Polls now. Coalesced: while a refresh is in flight one more is queued.
    func refresh(_ reason: Reason = .activation) {
        guard isRunning else { return }
        // Waking up or coming back to the app: a stream waiting out its
        // backoff reconnects now rather than when the timer says.
        if reason == .activation, streamsNotifications, streamWaiting {
            startStream()
        }
        guard refreshTask == nil else {
            // A quiet refresh never replaces one that should record changes,
            // and nothing replaces a catch-up.
            if queuedReason == nil || queuedReason == .localChange || reason == .catchUp { queuedReason = reason }
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
            let failure = APIError.wrapping(error)
            guard !(error is CancellationError), !failure.isCancellation, generation == self.generation else { return }
            Self.logger.info("Badge poll failed: \(failure.localizedDescription, privacy: .public)")
            // Only "no answer at all" counts: a server that answers with an
            // error is still reachable.
            recordReachability(!failure.isConnectivityFailure)
            return
        }
        guard generation == self.generation else { return }
        recordReachability(true)

        let previous = lastBadges
        lastBadges = fresh
        if fresh != badges { badges = fresh }
        setDockBadge(fresh.dockLabel)

        if let previous, reason != .localChange {
            var change: ServerEvents.Change = []
            if fresh.unreadNotifications != previous.unreadNotifications { change.insert(.notifications) }
            if fresh.pendingRequests != previous.pendingRequests || fresh.openIssues != previous.openIssues
                || fresh.notFoundRequests != previous.notFoundRequests {
                change.insert(.requests)
            }
            if !change.isEmpty { events.record(change, source: .server) }
        }

        // The first poll of a run always checks (to announce what arrived
        // while Marquee was closed, or to set the first watermark), as does a
        // catch-up after the stream dropped; others only when the unread
        // count moved and something is unread.
        let shouldCheck = previous == nil
            || reason == .catchUp
            || (fresh.unreadNotifications != previous?.unreadNotifications && fresh.unreadNotifications > 0)
        if shouldCheck {
            await checkForNewNotifications(api, generation: generation)
        }
    }

    private func recordReachability(_ reached: Bool) {
        if reached {
            consecutiveFailures = 0
            if isOffline { isOffline = false }
        } else {
            consecutiveFailures += 1
            if consecutiveFailures >= Self.offlineThreshold, !isOffline { isOffline = true }
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
        let fresh = arrivals.filter { !announcedIDs.contains($0.id) }
        announcedIDs.formUnion(fresh.map(\.id))
        // The account turned device push off for these kinds (0.45+): the
        // bell has them, but no banner.
        let arrivals = fresh.filter(\.showsBanner)
        guard bannersEnabled, !arrivals.isEmpty else { return }
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
                alert: newest.alert,
                createdAt: newest.createdAt,
                sharedBy: newest.sharedBy,
                note: newest.note
            ))
        }
    }
}

// MARK: - The notification stream

extension LiveUpdates {
    /// How one connection to the stream ended.
    private enum StreamEnd {
        /// The server closed it, or it dropped: reconnect after the backoff.
        case dropped(retryHint: Duration?)
        /// The server sent `signed-out`.
        case signedOut
        /// A 401: the session is already signing out.
        case unauthorized
        /// A server from before the stream (404): the poll carries on alone.
        case unsupported
    }

    /// (Re)opens the stream, replacing any connection or wait in progress.
    private func startStream() {
        streamTask?.cancel()
        streamWaiting = false
        let generation = self.generation
        streamTask = Task { [weak self] in
            var delay = LiveUpdates.streamRetryInitial
            while !Task.isCancelled {
                guard let self, self.generation == generation, let api = self.apiProvider?() else { return }
                let end = await self.connect(api, generation: generation)
                guard !Task.isCancelled, self.generation == generation else { return }
                // A connection that got as far as `ready` resets the backoff.
                if self.streamSaidReady {
                    delay = LiveUpdates.streamRetryInitial
                }
                switch end {
                case .unauthorized:
                    return
                case .unsupported:
                    LiveUpdates.logger.info("This server has no notification stream; polling only")
                    self.streamUnsupported = true
                    return
                case .signedOut:
                    // Revoked (Sign out elsewhere, a password change). A 401
                    // from /me takes the app's usual way back to sign-in; if
                    // /me still answers, it was a blip and the stream reopens.
                    _ = try? await api.me()
                    guard self.generation == generation else { return }
                case let .dropped(retryHint):
                    if let retryHint, retryHint > delay { delay = retryHint }
                }

                self.streamWaiting = true
                try? await Task.sleep(for: delay)
                guard !Task.isCancelled, self.generation == generation else { return }
                self.streamWaiting = false
                delay = min(delay * 2, LiveUpdates.streamRetryMax)
            }
        }
    }

    /// One connection, from opening until it ends.
    private func connect(_ api: MarqueeAPI, generation: Int) async -> StreamEnd {
        streamSaidReady = false
        streamSignedOut = false
        defer {
            if isStreaming, generation == self.generation { isStreaming = false }
        }
        do {
            let retryHint = try await api.notifications.stream { [weak self] event in
                await self?.handle(event, generation: generation)
            }
            return streamSignedOut ? .signedOut : .dropped(retryHint: retryHint)
        } catch let error as APIError {
            switch error {
            case .unauthorized: return .unauthorized
            case .notFound: return .unsupported
            default:
                if !error.isCancellation {
                    Self.logger.info("Notification stream dropped: \(error.localizedDescription, privacy: .public)")
                }
                return streamSignedOut ? .signedOut : .dropped(retryHint: nil)
            }
        } catch {
            return .dropped(retryHint: nil)
        }
    }

    private func handle(_ event: ServerSentEvent, generation: Int) {
        guard generation == self.generation else { return }
        switch event.name {
        case "ready":
            streamSaidReady = true
            if !isStreaming { isStreaming = true }
            // Anything that arrived while the stream was down (or, the first
            // time, between the first poll and the stream opening).
            refresh(.catchUp)
        case "notification":
            do {
                receive(try APIClient.decoder.decode(API.NotificationItem.self, from: Data(event.data.utf8)))
            } catch {
                Self.logger.error("Couldn't read a streamed notification: \(String(describing: error), privacy: .public)")
            }
        case "signed-out":
            streamSignedOut = true
        default:
            break
        }
    }

    /// A notification the stream just delivered: announce it (unless a poll
    /// already did), move the watermark past it, and refresh the counts.
    private func receive(_ notification: API.NotificationItem) {
        guard let identity else { return }
        Self.logger.info("Streamed notification \(notification.id.uuidString.lowercased(), privacy: .public)")
        events.record([.notifications, .requests], source: .server)

        let stored = watermarks.watermark(for: identity)
        let isNew = stored.map { notification.createdAt > $0 } ?? true
        if isNew {
            announce([notification])
            watermarks.setWatermark(notification.createdAt, for: identity)
        }
        // The bell and the Dock tile; the change is already recorded.
        refresh(.localChange)
    }
}

// MARK: - System implementations

/// `UNUserNotificationCenter` banners, clicked through AppDelegate's
/// `userInfo["route"]` handling (the same route the old engine posted).
/// Permission is asked for by `NotificationConsent`, never from here.
@MainActor
final class SystemNotificationBanners: NotificationBannerPosting {
    func post(_ notification: API.NotificationItem) {
        let content = UNMutableNotificationContent()
        content.title = notification.bannerTitle
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
