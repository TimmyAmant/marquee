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
    /// How long to keep waiting before showing the can't-reach card.
    var limit: Duration

    /// ~2, 3, 5 s, then every 5 s, for about two minutes.
    static let standard = ReconnectSchedule(
        steps: [.seconds(2), .seconds(3), .seconds(5)],
        interval: .seconds(5),
        limit: .seconds(120)
    )

    /// The wait before attempt `attempt` (0 = the first retry), or nil when
    /// that attempt would start after `limit` — time to stop waiting.
    /// - Parameter elapsed: Time since the server was first found down.
    func delay(beforeAttempt attempt: Int, elapsed: Duration) -> Duration? {
        let wait = attempt < steps.count ? steps[max(attempt, 0)] : interval
        return elapsed + wait <= limit ? wait : nil
    }
}
