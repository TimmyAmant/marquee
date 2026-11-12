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

    /// One title's line on a calendar day: its entries that day merged, so
    /// four episodes of a show dropping at once read as one row
    /// ("S01E03–E06") rather than four identical ones.
    struct CalendarDayTitle: Hashable, Sendable, Identifiable {
        let entries: [CalendarEntry]

        var first: CalendarEntry { entries[0] }
        var id: String { "\(first.date)|\(first.mediaType.rawValue)|\(first.tmdbId)" }
        var name: String { first.name }
        var posterPath: ImageRef? { first.posterPath }
        var titleID: TitleID { first.titleID }

        /// "S01E03", "S01E03–E06", "S01E10 · S02E01", or a movie's release
        /// types ("In theaters · Digital release").
        var subtitle: String {
            let codes = entries.map(\.subtitle)
            guard codes.count > 1 else { return codes.first ?? "" }
            let episodes = codes.compactMap(Self.episode)
            if episodes.count == codes.count,
               Set(episodes.map(\.season)).count == 1,
               let low = episodes.map(\.episode).min(), let high = episodes.map(\.episode).max() {
                let season = episodes[0].season
                return String(format: "S%02dE%02d–E%02d", season, low, high)
            }
            return codes.joined(separator: " · ")
        }

        private static func episode(_ code: String) -> (season: Int, episode: Int)? {
            let parts = code.uppercased().split(separator: "E", maxSplits: 1)
            guard parts.count == 2, parts[0].hasPrefix("S"),
                  let season = Int(parts[0].dropFirst()), let episode = Int(parts[1]) else { return nil }
            return (season, episode)
        }

        /// A day's entries, one per title, in the order each first appears.
        static func group(_ entries: [CalendarEntry]) -> [CalendarDayTitle] {
            var order: [String] = []
            var byKey: [String: [CalendarEntry]] = [:]
            for entry in entries {
                let key = "\(entry.mediaType.rawValue)|\(entry.tmdbId)"
                if byKey[key] == nil { order.append(key) }
                byKey[key, default: []].append(entry)
            }
            return order.map { CalendarDayTitle(entries: byKey[$0] ?? []) }
        }
    }
}
