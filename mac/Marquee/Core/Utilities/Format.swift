import Foundation

/// Port of lib/format.ts.
enum Format {
    static func bytes(_ bytes: Int64?) -> String {
        guard let bytes, bytes > 0 else { return String(localized: "0 B") }
        let exponent = min(Int(floor(log(Double(bytes)) / log(1024))), 4)
        let value = Double(bytes) / pow(1024, Double(exponent))
        let number = value.formatted(.number.precision(.fractionLength(1)).grouping(.never))
        switch exponent {
        case 0: return String(localized: "\(number) B")
        case 1: return String(localized: "\(number) KB")
        case 2: return String(localized: "\(number) MB")
        case 3: return String(localized: "\(number) GB")
        default: return String(localized: "\(number) TB")
        }
    }

    private static let isoDayParser: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    /// Parses a TMDb "2026-07-17" date (or a longer ISO string's date part).
    static func isoDay(_ string: String?) -> Date? {
        guard let string, string.count >= 10 else { return nil }
        return isoDayParser.date(from: String(string.prefix(10)))
    }

    static func shortDate(_ date: Date) -> String {
        date.formatted(date: .abbreviated, time: .omitted)
    }

    static func dateTime(_ date: Date) -> String {
        date.formatted(date: .abbreviated, time: .shortened)
    }

    /// notifications-bell.tsx timeAgo.
    static func timeAgo(_ date: Date, now: Date = Date()) -> String {
        let seconds = Int(now.timeIntervalSince(date))
        if seconds < 60 { return String(localized: "just now") }
        let minutes = seconds / 60
        if minutes < 60 { return String(localized: "\(minutes)m ago") }
        let hours = minutes / 60
        if hours < 24 { return String(localized: "\(hours)h ago") }
        let days = hours / 24
        return String(localized: "\(days)d ago")
    }

    /// changelog-list.tsx daysAgo.
    static func daysAgo(_ isoDate: String, now: Date = Date()) -> String {
        guard let date = isoDay(isoDate) else { return isoDate }
        let days = max(0, Int(now.timeIntervalSince(date) / 86_400))
        if days == 0 { return String(localized: "Today") }
        return String(localized: "\(days) days ago")
    }

    static func twoDigits(_ value: Int) -> String {
        value < 10 ? "0\(value)" : "\(value)"
    }
}

/// Port of lib/quality.ts.
enum Quality {
    static func hdrLabel(_ dynamicRange: String?) -> String? {
        guard let dynamicRange, !dynamicRange.isEmpty else { return nil }
        if dynamicRange.caseInsensitiveCompare("dv") == .orderedSame { return "Dolby Vision" }
        if dynamicRange.caseInsensitiveCompare("hdr10plus") == .orderedSame { return "HDR10+" }
        return dynamicRange
    }

    static func audioLabel(_ audioCodec: String?) -> String? {
        guard let audioCodec, !audioCodec.isEmpty else { return nil }
        if audioCodec.range(of: "atmos", options: .caseInsensitive) != nil { return "Atmos" }
        return audioCodec
    }
}
