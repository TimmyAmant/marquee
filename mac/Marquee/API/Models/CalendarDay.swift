import Foundation

extension API {
    /// A `"YYYY-MM-DD"` calendar date (release dates, birthdays, calendar grid
    /// days). It has no time or time zone, so it's kept as a day rather than a
    /// `Date` — converting would shift it a day for anyone west of UTC.
    /// Timestamps (`createdAt`, …) are `Date` instead.
    struct CalendarDay: Codable, Hashable, Comparable, Sendable, CustomStringConvertible {
        let year: Int
        let month: Int
        let day: Int

        init?(year: Int, month: Int, day: Int) {
            guard (1...12).contains(month), (1...31).contains(day) else { return nil }
            self.year = year
            self.month = month
            self.day = day
        }

        /// `"2026-09-17"`, or the date part of a longer ISO string.
        init?(_ string: String) {
            let parts = string.prefix(10).split(separator: "-", omittingEmptySubsequences: false)
            guard string.count >= 10, parts.count == 3, parts[0].count == 4, parts[1].count == 2, parts[2].count == 2,
                  let year = Int(parts[0]), let month = Int(parts[1]), let day = Int(parts[2]) else { return nil }
            self.init(year: year, month: month, day: day)
        }

        /// The day `date` falls on in `calendar`'s time zone.
        init(_ date: Date, calendar: Calendar = CalendarDay.gregorian) {
            let parts = calendar.dateComponents([.year, .month, .day], from: date)
            year = parts.year ?? 1970
            month = parts.month ?? 1
            day = parts.day ?? 1
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.singleValueContainer()
            let string = try container.decode(String.self)
            guard let value = CalendarDay(string) else {
                throw DecodingError.dataCorruptedError(in: container, debugDescription: "Expected a YYYY-MM-DD date, got \(string)")
            }
            self = value
        }

        func encode(to encoder: Encoder) throws {
            var container = encoder.singleValueContainer()
            try container.encode(string)
        }

        /// The wire format, `"2026-09-17"`.
        var string: String {
            String(format: "%04d-%02d-%02d", year, month, day)
        }

        var description: String { string }

        var yearString: String { String(format: "%04d", year) }

        static func < (lhs: CalendarDay, rhs: CalendarDay) -> Bool {
            (lhs.year, lhs.month, lhs.day) < (rhs.year, rhs.month, rhs.day)
        }

        /// Gregorian in the Mac's time zone: Radarr, Sonarr and TMDb dates are Gregorian.
        static var gregorian: Calendar {
            var calendar = Calendar(identifier: .gregorian)
            calendar.locale = .current
            calendar.timeZone = .current
            return calendar
        }

        /// Local midnight of this day, for date formatting and arithmetic.
        func date(in calendar: Calendar = CalendarDay.gregorian) -> Date? {
            calendar.date(from: DateComponents(year: year, month: month, day: day))
        }

        func adding(days: Int, calendar: Calendar = CalendarDay.gregorian) -> CalendarDay? {
            guard let start = date(in: calendar), let shifted = calendar.date(byAdding: .day, value: days, to: start) else { return nil }
            return CalendarDay(shifted, calendar: calendar)
        }

        var calendarMonth: CalendarMonth? { CalendarMonth(year: year, month: month) }

        /// "September 17, 2026" (the website's release-date wording).
        var longLabel: String {
            guard let date = date() else { return string }
            return date.formatted(.dateTime.month(.wide).day().year())
        }

        /// "Sep 17, 2026".
        var mediumLabel: String {
            guard let date = date() else { return string }
            return date.formatted(date: .abbreviated, time: .omitted)
        }

        static func today(calendar: Calendar = CalendarDay.gregorian) -> CalendarDay {
            CalendarDay(Date(), calendar: calendar)
        }
    }

    /// A `"YYYY-MM"` month: the calendar's `month`, `prevMonth`, `nextMonth`
    /// and its `?month=` query.
    struct CalendarMonth: Codable, Hashable, Comparable, Sendable, CustomStringConvertible {
        let year: Int
        let month: Int

        init?(year: Int, month: Int) {
            guard (1...12).contains(month), (0...9999).contains(year) else { return nil }
            self.year = year
            self.month = month
        }

        init?(_ string: String) {
            let parts = string.split(separator: "-", omittingEmptySubsequences: false)
            guard string.count == 7, parts.count == 2, parts[0].count == 4, parts[1].count == 2,
                  let year = Int(parts[0]), let month = Int(parts[1]) else { return nil }
            self.init(year: year, month: month)
        }

        init(containing date: Date, calendar: Calendar = CalendarDay.gregorian) {
            let parts = calendar.dateComponents([.year, .month], from: date)
            year = parts.year ?? 1970
            month = parts.month ?? 1
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.singleValueContainer()
            let string = try container.decode(String.self)
            guard let value = CalendarMonth(string) else {
                throw DecodingError.dataCorruptedError(in: container, debugDescription: "Expected a YYYY-MM month, got \(string)")
            }
            self = value
        }

        func encode(to encoder: Encoder) throws {
            var container = encoder.singleValueContainer()
            try container.encode(string)
        }

        /// The wire format, `"2026-09"`.
        var string: String { String(format: "%04d-%02d", year, month) }

        var description: String { string }

        static func < (lhs: CalendarMonth, rhs: CalendarMonth) -> Bool {
            (lhs.year, lhs.month) < (rhs.year, rhs.month)
        }

        var firstDay: CalendarDay? { CalendarDay(year: year, month: month, day: 1) }

        /// "September 2026".
        var label: String {
            guard let date = firstDay?.date() else { return string }
            return date.formatted(.dateTime.month(.wide).year())
        }
    }
}

// Lenient optional days: TMDb sometimes sends `""` for an unknown date. The
// synthesized `Decodable` of a struct with a `CalendarDay?` property calls
// this overload (it's more specific than the generic one), so a blank or
// malformed optional date decodes as nil instead of failing the response.
extension KeyedDecodingContainer {
    func decodeIfPresent(_ type: API.CalendarDay.Type, forKey key: Key) throws -> API.CalendarDay? {
        guard let string = try decodeIfPresent(String.self, forKey: key) else { return nil }
        return API.CalendarDay(string)
    }
}
