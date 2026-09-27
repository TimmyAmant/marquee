import Foundation

/// app/search/page.tsx's order, worked out from a `GET /search` answer: the
/// sections are always Movies, TV Shows, People, then Studios & Networks
/// (the server ranks inside each), empty ones left out; a genre/keyword
/// theme leads when the query is that theme ("horror"), else it comes last.
/// A server before 0.55 sends no `sections`: its `titles` are split into
/// movies and series and its `studios` stand in, with no See all. Pure.
struct SearchPageLayout: Equatable, Sendable {
    enum Block: Hashable, Sendable, Identifiable {
        case theme(API.SearchResults.Theme)
        case titles(API.SearchSectionName, API.SearchResults.Section<API.TitleCard>)
        case people(API.SearchResults.Section<API.PersonCard>)
        case studios(API.SearchResults.Section<API.SearchCompanyCard>)

        var id: String {
            switch self {
            case .theme: return "theme"
            case let .titles(name, _): return name.rawValue
            case .people: return API.SearchSectionName.people.rawValue
            case .studios: return API.SearchSectionName.studios.rawValue
            }
        }

        /// The section's See all, when it has more than it shows.
        var seeAll: API.SearchSectionName? {
            switch self {
            case .theme: return nil
            case let .titles(name, section): return section.hasMore ? name : nil
            case let .people(section): return section.hasMore ? .people : nil
            case let .studios(section): return section.hasMore ? .studios : nil
            }
        }
    }

    let blocks: [Block]

    var isEmpty: Bool { blocks.isEmpty }

    init(_ results: API.SearchResults) {
        let sections = results.sections ?? Self.fallback(results)
        let theme = results.theme.flatMap { $0.items.isEmpty ? nil : $0 }
        // The server's order (0.55+: People first when the query names a
        // person); keys this app doesn't know, and empty sections, skipped.
        if let order = results.order {
            var seen = Set<String>()
            self.blocks = order.compactMap { key -> Block? in
                guard seen.insert(key).inserted else { return nil }
                switch key {
                case "theme": return theme.map(Block.theme)
                case "movies": return sections.movies.results.isEmpty ? nil : .titles(.movies, sections.movies)
                case "series": return sections.series.results.isEmpty ? nil : .titles(.series, sections.series)
                case "people": return sections.people.results.isEmpty ? nil : .people(sections.people)
                case "studiosAndNetworks":
                    return sections.studiosAndNetworks.results.isEmpty ? nil : .studios(sections.studiosAndNetworks)
                default: return nil
                }
            }
            return
        }
        var blocks: [Block] = []
        if let theme, theme.leadsPage { blocks.append(.theme(theme)) }
        if !sections.movies.results.isEmpty { blocks.append(.titles(.movies, sections.movies)) }
        if !sections.series.results.isEmpty { blocks.append(.titles(.series, sections.series)) }
        if !sections.people.results.isEmpty { blocks.append(.people(sections.people)) }
        if !sections.studiosAndNetworks.results.isEmpty { blocks.append(.studios(sections.studiosAndNetworks)) }
        if let theme, !theme.leadsPage { blocks.append(.theme(theme)) }
        self.blocks = blocks
    }

    /// The sections an older server's flat answer amounts to (no totals
    /// beyond what came back, so no See all).
    private static func fallback(_ results: API.SearchResults) -> API.SearchResults.Sections {
        func whole<Item>(_ items: [Item]) -> API.SearchResults.Section<Item> {
            API.SearchResults.Section(totalResults: items.count, totalPages: 1, results: items)
        }
        return API.SearchResults.Sections(
            movies: whole(results.titles.filter { $0.mediaType == .movie }),
            series: whole(results.titles.filter { $0.mediaType == .tv }),
            people: whole(results.people),
            studiosAndNetworks: whole(results.studios.map(API.SearchCompanyCard.init(studio:)))
        )
    }
}
