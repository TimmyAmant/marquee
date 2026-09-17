import Foundation

// Person and studio pages (api-v1.md §5). Their list controls (sort, type
// filter, title search, grid/table) are client-side: see `TitleListOrder`.

extension API {
    /// `GET /people/{tmdbId}`.
    struct PersonDetail: Codable, Hashable, Sendable, Identifiable {
        let tmdbId: Int
        let name: String
        let alsoKnownAs: [String]
        let biography: String?
        let birthday: CalendarDay?
        let deathday: CalendarDay?
        let placeOfBirth: String?
        let profilePath: ImageRef?
        let favorited: Bool
        /// The acting filmography (`subtitle` = character) with status,
        /// favorites and quick-add. Empty → "No processed filmography found
        /// for this person yet."
        let credits: [TitleCard]

        var id: Int { tmdbId }

        /// Age today, or at death.
        var age: Int? {
            guard let born = birthday?.date() else { return nil }
            let end = deathday?.date() ?? Date()
            return CalendarDay.gregorian.dateComponents([.year], from: born, to: end).year
        }
    }

    /// `GET /companies/{tmdbId}`.
    struct CompanyDetail: Codable, Hashable, Sendable, Identifiable {
        let tmdbId: Int
        let name: String
        let description: String?
        let logoPath: ImageRef?
        /// "{titleCount} titles in the catalog".
        let titleCount: Int
        let favorited: Bool
        /// With status, favorited and canQuickAdd. Empty → "No titles found for this studio yet."
        let titles: [TitleCard]

        var id: Int { tmdbId }

        /// The website truncates the description at 400 characters.
        var shortDescription: String? {
            description.nonBlank.map { $0.truncated(to: 400) }
        }
    }

    /// The person/studio list's client-side sorts.
    enum TitleListOrder: String, CaseIterable, Hashable, Sendable, Identifiable {
        /// By year, unknown years last (the website's default).
        case newestFirst
        case oldestFirst
        case alphabetical

        var id: String { rawValue }

        var label: String {
            switch self {
            case .newestFirst: return "Newest first"
            case .oldestFirst: return "Oldest first"
            case .alphabetical: return "A–Z"
            }
        }
    }
}

extension Array where Element == API.TitleCard {
    /// Sorted the way the person/studio list offers; stable for equal keys.
    func sorted(by order: API.TitleListOrder) -> [API.TitleCard] {
        let indexed = enumerated().map { ($0.offset, $0.element) }
        let sorted = indexed.sorted { lhs, rhs in
            let (a, b) = (lhs.1, rhs.1)
            switch order {
            case .alphabetical:
                let result = a.name.localizedStandardCompare(b.name)
                return result == .orderedSame ? lhs.0 < rhs.0 : result == .orderedAscending
            case .newestFirst, .oldestFirst:
                switch (a.year.nonBlank, b.year.nonBlank) {
                case (nil, nil): return lhs.0 < rhs.0
                case (nil, _): return false
                case (_, nil): return true
                case let (ya?, yb?):
                    if ya == yb { return lhs.0 < rhs.0 }
                    return order == .newestFirst ? ya > yb : ya < yb
                }
            }
        }
        return sorted.map(\.1)
    }
}
