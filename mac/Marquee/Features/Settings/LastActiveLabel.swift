import Foundation

// "Active 3 hours ago" under each member in Settings → Household members.
// A port of the website's lib/users/last-active-label.ts: same wording, same
// thresholds. Anything within the last ten minutes is "Active now" (the
// server records activity to within 5 minutes).

/// Pure; unit tested. `nil` means the account has never been used.
func lastActiveLabel(
    _ lastActiveAt: Date?,
    now: Date,
    timeZone: TimeZone = .current
) -> String {
    guard let lastActiveAt else { return "Never signed in" }
    let minute: TimeInterval = 60
    let hour = 60 * minute
    let day = 24 * hour
    let ago = now.timeIntervalSince(lastActiveAt)
    if ago < 10 * minute { return "Active now" }
    if ago < hour { return "Active \(Int((ago / minute).rounded(.down))) minutes ago" }
    if ago < day {
        let hours = Int((ago / hour).rounded(.down))
        return "Active \(hours) \(hours == 1 ? "hour" : "hours") ago"
    }
    if ago < 2 * day { return "Active yesterday" }
    if ago < 30 * day { return "Active \(Int((ago / day).rounded(.down))) days ago" }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = timeZone
    formatter.dateFormat = "MMM d, yyyy"
    return "Last active \(formatter.string(from: lastActiveAt))"
}
