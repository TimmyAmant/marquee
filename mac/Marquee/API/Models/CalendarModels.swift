import Foundation

// The calendar (api-v1.md §9).

extension API {
    /// `GET /calendar`: one month's Sunday-to-Saturday grid (server local time).
    struct CalendarMonthResponse: Codable, Hashable, Sendable {
        /// false (and `entries` empty) when neither Sonarr nor Radarr is connected.
        let configured: Bool
        let month: CalendarMonth
        /// The grid's first Sunday and last Saturday.
        let gridStart: CalendarDay
        let gridEnd: CalendarDay
        /// Today in the server's time zone.
        let today: CalendarDay
        let prevMonth: CalendarMonth
        let nextMonth: CalendarMonth
        /// The server's IANA time zone, e.g. "America/New_York".
        let timeZone: String
        /// Sorted by date; a movie can appear once per matching release type.
        let entries: [CalendarEntry]

        /// Every day of the grid, `gridStart` through `gridEnd`.
        var gridDays: [CalendarDay] {
            var days: [CalendarDay] = []
            var day: CalendarDay? = gridStart
            while let current = day, current <= gridEnd, days.count < 42 {
                days.append(current)
                day = current.adding(days: 1)
            }
            return days
        }

        /// Entries keyed by day. The website shows at most 4 per day ("+N more").
        var entriesByDay: [CalendarDay: [CalendarEntry]] {
            Dictionary(grouping: entries, by: \.date)
        }
    }

    struct CalendarEntry: Codable, Hashable, Sendable, Identifiable {
        let date: CalendarDay
        let mediaType: MediaType
        let tmdbId: Int
        let name: String
        let posterPath: ImageRef?
        /// "S01E03", "In theaters", "Digital release" or "On disc".
        let subtitle: String

        /// Unique within a month: a title can appear on several days, and a
        /// movie twice on one day for different release types.
        var id: String { "\(date)|\(mediaType.rawValue)|\(tmdbId)|\(subtitle)" }

        var titleID: TitleID { TitleID(mediaType, tmdbId) }
    }
}
