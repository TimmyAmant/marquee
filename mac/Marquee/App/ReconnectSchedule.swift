import Foundation

/// When to try a saved server again while it's down — the "Waiting for your
/// server to come back…" card. Quick at first (a container restart after an
/// update takes seconds), then steady, and after a couple of minutes it
/// hands over to the can't-reach card.
struct ReconnectSchedule: Equatable, Sendable {
    /// The waits before the first few attempts.
    var steps: [Duration]
    /// The wait between attempts once `steps` run out.
    var interval: Duration
    /// How long to keep waiting before showing the can't-reach card; nil
    /// never stops (`signedIn`).
    var limit: Duration?

    /// ~2, 3, 5 s, then every 5 s, for about two minutes.
    static let standard = ReconnectSchedule(
        steps: [.seconds(2), .seconds(3), .seconds(5)],
        interval: .seconds(5),
        limit: .seconds(120)
    )

    /// Signed in, and the server stopped answering ("Reconnecting to your
    /// server…"): 1, 2, 3, 5 s, then every 10 s for as long as it takes.
    static let signedIn = ReconnectSchedule(
        steps: [.seconds(1), .seconds(2), .seconds(3), .seconds(5)],
        interval: .seconds(10),
        limit: nil
    )

    /// How often the can't-reach card tries again by itself, quietly (no
    /// spinner), so a server that comes back later is picked up without a click.
    static let quietRetryInterval: Duration = .seconds(30)

    /// The wait before attempt `attempt` (0 = the first retry), or nil when
    /// that attempt would start after `limit` — time to stop waiting.
    /// - Parameter elapsed: Time since the server was first found down.
    func delay(beforeAttempt attempt: Int, elapsed: Duration) -> Duration? {
        let wait = attempt < steps.count ? steps[max(attempt, 0)] : interval
        if let limit, elapsed + wait > limit { return nil }
        return wait
    }
}

/// The signed-in outage's bookkeeping ("Reconnecting to your server…" at the
/// top of the window), apart from any timer so it can be tested. A call that
/// couldn't reach the server starts checks on `schedule`; the banner goes up
/// once a check fails too (so one dropped request doesn't flash it), and any
/// answer from the server ends it.
struct SignedInOutage: Equatable, Sendable {
    var schedule: ReconnectSchedule
    /// Checks are under way.
    private(set) var isChecking = false
    /// A check failed as well: the banner is up.
    private(set) var isReconnecting = false
    private var attempts = 0
    private var elapsed: Duration = .zero

    init(schedule: ReconnectSchedule = .signedIn) {
        self.schedule = schedule
    }

    /// A call couldn't reach the server: the wait before the first check, or
    /// nil when checks are already under way.
    mutating func suspect() -> Duration? {
        guard !isChecking else { return nil }
        isChecking = true
        attempts = 0
        elapsed = .zero
        return next()
    }

    /// A check couldn't reach it either: the banner goes up, and the wait
    /// before the next check.
    mutating func checkFailed() -> Duration? {
        guard isChecking else { return nil }
        isReconnecting = true
        return next()
    }

    /// The server answered. True when the banner was up, so the screens
    /// should reload what they couldn't load meanwhile.
    mutating func answered() -> Bool {
        let wasReconnecting = isReconnecting
        isChecking = false
        isReconnecting = false
        attempts = 0
        elapsed = .zero
        return wasReconnecting
    }

    private mutating func next() -> Duration? {
        guard let wait = schedule.delay(beforeAttempt: attempts, elapsed: elapsed) else {
            isChecking = false
            return nil
        }
        attempts += 1
        elapsed += wait
        return wait
    }
}
