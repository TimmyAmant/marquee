import Foundation

// "Active 3 hours ago" under each member in Settings → Household members.
// A port of the website's lib/users/last-active-label.ts: same wording, same
// thresholds. Anything within the last ten minutes is "Active now" (the
// server records activity to within 5 minutes).

/// Pure; unit tested. `nil` means the account has never been used.
func lastActiveLabel(
    _ lastActiveAt: Date?,
    now: Date,
    timeZone: TimeZone = .current,
    locale: Locale = .current
) -> String {
    guard let lastActiveAt else { return String(localized: "Never signed in") }
    let minute: TimeInterval = 60
    let hour = 60 * minute
    let day = 24 * hour
    let ago = now.timeIntervalSince(lastActiveAt)
    if ago < 10 * minute { return String(localized: "Active now") }
    if ago < hour {
        let minutes = Int((ago / minute).rounded(.down))
        return String(localized: "Active \(minutes) minutes ago")
    }
    if ago < day {
        let hours = Int((ago / hour).rounded(.down))
        return String(localized: "Active \(hours) hours ago")
    }
    if ago < 2 * day { return String(localized: "Active yesterday") }
    if ago < 30 * day {
        let days = Int((ago / day).rounded(.down))
        return String(localized: "Active \(days) days ago")
    }
    let formatter = DateFormatter()
    formatter.locale = locale
    formatter.timeZone = timeZone
    formatter.setLocalizedDateFormatFromTemplate("MMMdyyyy")
    let date = formatter.string(from: lastActiveAt)
    return String(localized: "Last active \(date)")
}
