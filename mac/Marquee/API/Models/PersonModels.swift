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
        /// The title they're best known for: its backdrop goes behind the
        /// header, with a "From {name}" link to it. Nil when nothing they're
        /// known for has artwork, and on a server older than this field.
        let knownForTitle: KnownForTitle?
        /// IMDb, socials, their website — only the ones they have. Nil on a
        /// server older than this field; read `links`.
        let externalLinks: [ExternalLink]?
        /// The acting filmography (`subtitle` = character) with status,
        /// favorites and quick-add. Empty → "No processed filmography found
        /// for this person yet."
        let credits: [TitleCard]

        var id: Int { tmdbId }

        var links: [ExternalLink] { (externalLinks ?? []).filter { $0.link != nil } }

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
        /// Its most-voted title with artwork, as on a person's page.
        let knownForTitle: KnownForTitle?
        /// Only ever its website. Nil on a server older than this field.
        let externalLinks: [ExternalLink]?
        /// With status, favorited and canQuickAdd. Empty → "No titles found for this studio yet."
        let titles: [TitleCard]

        var id: Int { tmdbId }

        var links: [ExternalLink] { (externalLinks ?? []).filter { $0.link != nil } }

        /// The website truncates the description at 400 characters.
        var shortDescription: String? {
            description.nonBlank.map { $0.truncated(to: 400) }
        }
    }

    /// The title a person or studio is best known for (components/entity-hero.tsx).
    struct KnownForTitle: Codable, Hashable, Sendable {
        let mediaType: MediaType
        let tmdbId: Int
        let name: String
        let backdropPath: ImageRef?

        var id: TitleID { TitleID(mediaType, tmdbId) }
    }

    /// One official link on a person's or studio's page, in display order.
    struct ExternalLink: Codable, Hashable, Sendable {
        /// `imdb`, `instagram`, `twitter`, `facebook`, `tiktok`, `youtube` or
        /// `homepage`; a kind this app doesn't know yet is labelled by its
        /// address.
        let kind: String
        let url: String

        var link: URL? {
            guard let url = URL(string: url), url.scheme == "https" || url.scheme == "http" else { return nil }
            return url
        }

        /// The brand's own name, or "Website" (lib/tmdb/entity-links.ts).
        var label: String {
            switch kind {
            case "imdb": return "IMDb"
            case "instagram": return "Instagram"
            case "twitter": return "X / Twitter"
            case "facebook": return "Facebook"
            case "tiktok": return "TikTok"
            case "youtube": return "YouTube"
            case "homepage": return String(localized: "Website")
            default: return link?.host() ?? url
            }
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
            case .newestFirst: return String(localized: "Newest first")
            case .oldestFirst: return String(localized: "Oldest first")
            case .alphabetical: return String(localized: "A–Z")
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
