import Foundation

// Customisable Discover rows (api-v1.md §2, 0.49+): `GET /discover`'s
// `shelves`, and Settings › Discover (admin) where the rows are arranged,
// hidden and added. A server older than 0.49 sends no `shelves` and answers
// 404 on `/settings/discover`.

extension API {
    /// One row of `GET /discover`'s `shelves`, in the admin's order.
    /// Exactly one of `results`, `genres` and `logos` is non-null. An app
    /// that doesn't know `kind` shows `results` as a poster row and skips
    /// the row when that's null, so `kind` stays a plain string here.
    struct DiscoverRow: Codable, Hashable, Sendable, Identifiable {
        /// A built-in row's key (`trending`, `movieGenres`, …) or a custom row's uuid.
        let id: String
        /// The built-in row's key, or a custom row's kind (`keyword`, `genre`, …).
        let kind: String
        let title: String
        let custom: Bool
        /// A poster row: every custom row and the built-in poster rows.
        let results: [TitleCard]?
        /// `movieGenres` / `seriesGenres`.
        let genres: [GenreTile]?
        /// `studios` / `networks`.
        let logos: [NetworkCard]?
        /// A custom row's is always `{ "type": "list", "list": <its id> }`.
        let seeAll: SeeAllTarget?

        init(
            id: String, kind: String, title: String, custom: Bool = false,
            results: [TitleCard]? = nil, genres: [GenreTile]? = nil, logos: [NetworkCard]? = nil,
            seeAll: SeeAllTarget? = nil
        ) {
            self.id = id
            self.kind = kind
            self.title = title
            self.custom = custom
            self.results = results
            self.genres = genres
            self.logos = logos
            self.seeAll = seeAll
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            id = try container.decode(String.self, forKey: .id)
            kind = try container.decodeIfPresent(String.self, forKey: .kind) ?? ""
            title = try container.decodeIfPresent(String.self, forKey: .title) ?? ""
            custom = try container.decodeIfPresent(Bool.self, forKey: .custom) ?? false
            results = try container.decodeIfPresent([TitleCard].self, forKey: .results)
            genres = try container.decodeIfPresent([GenreTile].self, forKey: .genres)
            logos = try container.decodeIfPresent([NetworkCard].self, forKey: .logos)
            // A "See all" this app can't read only drops that row's chevron.
            seeAll = try? container.decodeIfPresent(SeeAllTarget.self, forKey: .seeAll)
        }
    }

    /// Which titles a custom row shows. Keyword, studio and library rows can
    /// be `all`; a genre row is one or the other; a network row is `tv`.
    enum DiscoverRowMediaType: OpenEnum {
        case movie
        case tv
        case all
        case unknown(String)

        static let knownCases: [DiscoverRowMediaType] = [.movie, .tv, .all]

        var rawValue: String {
            switch self {
            case .movie: return "movie"
            case .tv: return "tv"
            case .all: return "all"
            case let .unknown(raw): return raw
            }
        }

        /// "Movies" / "Series" / "Both".
        var label: String {
            switch self {
            case .movie: return String(localized: "Movies")
            case .tv: return String(localized: "Series")
            case .all: return String(localized: "Both")
            case let .unknown(raw): return raw.capitalized
            }
        }
    }

    /// A custom row's kind (`POST /settings/discover/shelves`' `kind`).
    enum DiscoverRowKind: OpenEnum {
        case keyword
        case genre
        case company
        case network
        case tmdbList
        case traktList
        case library
        case unknown(String)

        static let knownCases: [DiscoverRowKind] = [.keyword, .genre, .company, .network, .tmdbList, .traktList, .library]

        var rawValue: String {
            switch self {
            case .keyword: return "keyword"
            case .genre: return "genre"
            case .company: return "company"
            case .network: return "network"
            case .tmdbList: return "tmdbList"
            case .traktList: return "traktList"
            case .library: return "library"
            case let .unknown(raw): return raw
            }
        }

        /// The website's label for the kind.
        var label: String {
            switch self {
            case .keyword: return String(localized: "TMDb keyword")
            case .genre: return String(localized: "Genre")
            case .company: return String(localized: "Studio")
            case .network: return String(localized: "Network")
            case .tmdbList: return String(localized: "TMDb list")
            case .traktList: return String(localized: "Trakt list")
            case .library: return String(localized: "Recently added to Plex/Jellyfin")
            case let .unknown(raw): return raw
            }
        }

        /// What the row picks from `GET /settings/discover/lookup`; nil for
        /// kinds built from a link or number instead.
        var lookupType: DiscoverLookupType? {
            switch self {
            case .keyword: return .keyword
            case .genre: return .genre
            case .company: return .company
            case .network: return .network
            case .tmdbList, .traktList, .library, .unknown: return nil
            }
        }

        /// The movies/series choices it offers; empty when there's no choice.
        var mediaTypeChoices: [DiscoverRowMediaType] {
            switch self {
            case .keyword, .company, .library: return [.movie, .tv, .all]
            case .genre: return [.movie, .tv]
            case .network, .tmdbList, .traktList, .unknown: return []
            }
        }
    }

    /// What a custom Discover row is built from; one flat shape for every kind.
    struct DiscoverRowSource: Codable, Hashable, Sendable {
        let mediaType: DiscoverRowMediaType?
        /// The keyword, genre, company, network or TMDb list.
        let tmdbId: Int?
        let name: String?
        /// A Trakt row's list on trakt.tv.
        let url: String?

        init(mediaType: DiscoverRowMediaType? = nil, tmdbId: Int? = nil, name: String? = nil, url: String? = nil) {
            self.mediaType = mediaType
            self.tmdbId = tmdbId
            self.name = name
            self.url = url
        }
    }

    /// A row as Settings › Discover lists it, hidden ones included.
    struct DiscoverRowSetting: Codable, Hashable, Sendable, Identifiable {
        let id: String
        let kind: String
        var title: String
        let custom: Bool
        var hidden: Bool
        /// nil for a built-in row.
        let source: DiscoverRowSource?

        init(id: String, kind: String, title: String, custom: Bool = false, hidden: Bool = false, source: DiscoverRowSource? = nil) {
            self.id = id
            self.kind = kind
            self.title = title
            self.custom = custom
            self.hidden = hidden
            self.source = source
        }

        var rowKind: DiscoverRowKind { DiscoverRowKind(rawValue: kind) }

        /// A custom row's subtitle: "TMDb keyword · anime · Both",
        /// "Trakt list · trakt.tv/users/someone/lists/best-of-2024". nil for
        /// a built-in row.
        var sourceLine: String? {
            guard custom else { return nil }
            var parts = [rowKind.label]
            if let source {
                if let name = source.name.nonBlank {
                    parts.append(name)
                } else if let url = source.url.nonBlank {
                    parts.append(url.replacingOccurrences(of: "https://", with: "").replacingOccurrences(of: "http://", with: ""))
                } else if let tmdbId = source.tmdbId {
                    parts.append("#\(tmdbId)")
                }
                if let mediaType = source.mediaType, mediaType.isKnown, rowKind.mediaTypeChoices.count > 0 {
                    parts.append(mediaType.label)
                }
            }
            return parts.joined(separator: " · ")
        }
    }

    /// `GET /settings/discover` (and the answer of every change to it).
    struct DiscoverSettings: Codable, Hashable, Sendable {
        var shelves: [DiscoverRowSetting]
        /// Trakt rows need Trakt connected (Settings › Integrations).
        let traktConfigured: Bool
        let maxCustomShelves: Int
    }

    /// `GET /settings/discover/locale` (0.53+, admin): Settings › Discover ›
    /// Region & language. nil is the default for each: the server's country
    /// (else US) for `streamingRegion`, worldwide for `discoverRegion`,
    /// English for `discoverLanguage` (`"any"`: no limit).
    struct DiscoverLocale: Codable, Hashable, Sendable {
        /// What those come to.
        struct Effective: Codable, Hashable, Sendable {
            let streamingRegion: String
            let discoverRegion: String?
            let discoverLanguage: String?
        }

        var streamingRegion: String?
        var discoverRegion: String?
        var discoverLanguage: String?
        let effective: Effective
        /// ISO 3166-1 codes that may be chosen.
        let regions: [String]
        /// ISO 639-1 codes, with `"any"` first.
        let languages: [String]

        /// The choice as `PUT` sends it: every field, nil as JSON null (the
        /// default).
        var update: DiscoverLocaleUpdate {
            DiscoverLocaleUpdate(streamingRegion: streamingRegion, discoverRegion: discoverRegion, discoverLanguage: discoverLanguage)
        }
    }

    /// `PUT /settings/discover/locale`: all three, nil sent as null.
    struct DiscoverLocaleUpdate: Encodable, Hashable, Sendable {
        var streamingRegion: String?
        var discoverRegion: String?
        var discoverLanguage: String?

        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(streamingRegion, forKey: .streamingRegion)
            try container.encode(discoverRegion, forKey: .discoverRegion)
            try container.encode(discoverLanguage, forKey: .discoverLanguage)
        }

        private enum CodingKeys: String, CodingKey {
            case streamingRegion, discoverRegion, discoverLanguage
        }
    }

    /// `PUT /settings/discover`: the rows in their new order, each shown or hidden.
    struct ArrangeDiscoverRequest: Codable, Hashable, Sendable {
        struct Row: Codable, Hashable, Sendable {
            let id: String
            let hidden: Bool
        }

        let shelves: [Row]

        init(_ rows: [DiscoverRowSetting]) {
            shelves = rows.map { Row(id: $0.id, hidden: $0.hidden) }
        }
    }

    /// `POST /settings/discover/shelves` body. nil fields send no key.
    struct AddDiscoverRowRequest: Codable, Hashable, Sendable {
        let kind: String
        var tmdbId: Int?
        var mediaType: String?
        var name: String?
        var url: String?
        /// Up to 60 characters; the server names it when left out.
        var title: String?

        /// The server's limit on `title`.
        static let maxTitleLength = 60
    }

    /// `PATCH /settings/discover/shelves/{id}` body: only what changes.
    struct UpdateDiscoverRowRequest: Codable, Hashable, Sendable {
        var hidden: Bool?
        var title: String?
    }

    /// `GET /settings/discover/lookup`'s `type`.
    enum DiscoverLookupType: String, Codable, Hashable, Sendable {
        case keyword
        case company
        case network
        case genre
    }

    /// One thing a row can be built from: a keyword, studio, network or genre.
    struct DiscoverLookupResult: Codable, Hashable, Sendable, Identifiable {
        let tmdbId: Int
        let name: String
        let logoPath: ImageRef?
        /// Tells same-named ones apart (a company's country); nil otherwise.
        let detail: String?

        var id: Int { tmdbId }
    }
}
