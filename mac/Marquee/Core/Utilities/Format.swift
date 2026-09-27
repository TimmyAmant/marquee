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

    static func runtime(minutes: Int) -> String {
        let hours = minutes / 60
        let mins = minutes % 60
        if hours == 0 { return String(localized: "\(mins)m") }
        if mins == 0 { return String(localized: "\(hours)h") }
        return String(localized: "\(hours)h \(mins)m")
    }

    /// "US" → 🇺🇸 via regional indicator symbols.
    static func flagEmoji(countryCode: String) -> String {
        countryCode.uppercased().unicodeScalars.compactMap { scalar -> String? in
            guard let indicator = Unicode.Scalar(127_397 + scalar.value) else { return nil }
            return String(indicator)
        }.joined()
    }

    private static let isoDayParser: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    private static let longDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = .autoupdatingCurrent
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateStyle = .long
        formatter.timeStyle = .none
        return formatter
    }()

    /// Parses a TMDb "2026-07-17" date (or a longer ISO string's date part).
    static func isoDay(_ string: String?) -> Date? {
        guard let string, string.count >= 10 else { return nil }
        return isoDayParser.date(from: String(string.prefix(10)))
    }

    /// "2026-07-17" → "July 17, 2026".
    static func dateLabel(_ string: String?) -> String? {
        guard let date = isoDay(string) else { return nil }
        return longDateFormatter.string(from: date)
    }

    /// "en" → "English" (in the app's language) via the system's own locale data.
    static func languageLabel(_ code: String?) -> String? {
        guard let code, !code.isEmpty else { return nil }
        return Locale.current.localizedString(forLanguageCode: code) ?? code.uppercased()
    }

    static func year(_ string: String?) -> String? {
        guard let string, string.count >= 4 else { return nil }
        let prefix = String(string.prefix(4))
        return prefix.isEmpty ? nil : prefix
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

    static func todayISO(_ date: Date = Date()) -> String {
        isoDayParser.string(from: date)
    }

    static func twoDigits(_ value: Int) -> String {
        value < 10 ? "0\(value)" : "\(value)"
    }
}

/// Port of lib/quality.ts.
enum Quality {
    enum Tier: String {
        case uhd = "4K"
        case fullHD = "1080p"
        case hd = "720p"
    }

    static func resolutionTier(_ qualityName: String?) -> Tier? {
        guard let name = qualityName?.lowercased() else { return nil }
        if name.contains("2160p") || name.contains("4k") { return .uhd }
        if name.contains("1080p") { return .fullHD }
        if name.contains("720p") { return .hd }
        return nil
    }

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

/// Port of lib/title-meta.ts.
enum TitleMeta {
    struct CreditEntry: Hashable {
        let role: String
        let name: String
    }

    static func yearRange(start: String?, end: String?) -> String? {
        if let start, let end, end != start { return "\(start)–\(end)" }
        return start ?? end
    }

    static func relabelTvStatus(_ status: String?) -> String? {
        status == "Returning Series" ? String(localized: "Continuing") : status // i18n-ignore
    }

    static func movieCredits(_ crew: [(id: Int, name: String, job: String, department: String)]) -> [CreditEntry] {
        var seen = Set<Int>()
        var entries: [CreditEntry] = []
        for member in crew where member.job == "Director" && !seen.contains(member.id) { // i18n-ignore
            entries.append(CreditEntry(role: String(localized: "Director"), name: member.name))
            seen.insert(member.id)
        }
        for member in crew where !seen.contains(member.id) {
            if member.department == "Writing" && (member.job == "Screenplay" || member.job == "Writer") { // i18n-ignore
                let role = member.job == "Screenplay" ? String(localized: "Screenplay") : String(localized: "Writer") // i18n-ignore
                entries.append(CreditEntry(role: role, name: member.name))
                seen.insert(member.id)
            }
        }
        return Array(entries.prefix(6))
    }

    static func tvCredits(
        createdBy: [(id: Int, name: String)],
        crew: [(id: Int, name: String, job: String)]
    ) -> [CreditEntry] {
        var seen = Set<Int>()
        var entries: [CreditEntry] = []
        for person in createdBy where !seen.contains(person.id) {
            entries.append(CreditEntry(role: String(localized: "Creator"), name: person.name))
            seen.insert(person.id)
        }
        for member in crew where member.job == "Executive Producer" && !seen.contains(member.id) { // i18n-ignore
            entries.append(CreditEntry(role: String(localized: "Executive Producer"), name: member.name))
            seen.insert(member.id)
        }
        return Array(entries.prefix(6))
    }
}
