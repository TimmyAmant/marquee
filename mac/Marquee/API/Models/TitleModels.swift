import Foundation

// The title page: detail, seasons and episodes (api-v1.md §3). The library
// and action-state blocks it embeds are in LibraryModels.swift.

extension API {
    /// `GET /titles/{type}/{tmdbId}`: everything the title page renders.
    struct TitleDetail: Codable, Hashable, Sendable, Identifiable {
        /// The sidebar and the line under the title. Date labels are
        /// pre-formatted in the server's locale and time zone.
        struct Facts: Codable, Hashable, Sendable {
            let runtimeMinutes: Int?
            /// "2h 16m" for movies, "~42m/episode" (average) for TV.
            let runtimeLabel: String?
            /// TMDb vote average × 10.
            let ratingPercent: Int?
            /// At most 3.
            let genres: [String]
            /// "2011–2019" for an ended show.
            let yearRange: String?
            /// TMDb's status, "Returning Series" relabeled "Continuing".
            let statusLabel: String?
            /// TV only.
            let network: String?
            /// "Release Date" (movie) / "First Air Date" (TV).
            let releaseDateLabel: String?
            let nextAirDate: CalendarDay?
            let nextAirDateLabel: String?
            let originalLanguage: String?
            let originalLanguageLabel: String?
            let productionCountry: ProductionCountry?
            /// "Currently Streaming On": US flat-rate providers.
            let watchProviders: [WatchProvider]
        }

        struct ProductionCountry: Codable, Hashable, Sendable {
            /// ISO 3166-1, e.g. `"US"`.
            let code: String
            let name: String
            /// 🇺🇸
            let flag: String
        }

        struct WatchProvider: Codable, Hashable, Sendable {
            let name: String
            let logoPath: ImageRef?
        }

        /// Director + Screenplay/Writer (movies) or Creator + Executive Producer (TV), max 6.
        struct Credit: Codable, Hashable, Sendable {
            let role: String
            let name: String
        }

        struct Links: Codable, Hashable, Sendable {
            let trailerYoutubeKey: String?
            let imdbId: String?
            let tvdbId: Int?
            let facebookId: String?
            let instagramId: String?
            let twitterId: String?
            /// The ordered button row after "▶ Trailer".
            let external: [ExternalLink]

            /// `https://www.youtube.com/watch?v={trailerYoutubeKey}`.
            var trailerURL: URL? {
                guard let key = trailerYoutubeKey.nonBlank,
                      let encoded = key.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) else { return nil }
                return URL(string: "https://www.youtube.com/watch?v=\(encoded)")
            }
        }

        struct ExternalLink: Codable, Hashable, Sendable {
            /// "IMDb", "TheTVDB", "Instagram", "X / Twitter", "Facebook".
            let label: String
            let url: String

            var link: URL? { URL(string: url) }
        }

        /// A season row in the "Episodes" accordion.
        struct SeasonSummary: Codable, Hashable, Sendable, Identifiable {
            let seasonNumber: Int
            let name: String
            let episodeCount: Int
            let airDate: CalendarDay?
            let posterPath: ImageRef?
            /// Sonarr episode-file counts; nil when Sonarr doesn't track the show.
            let have: Int?
            let total: Int?
            /// Season requests (nil from an older server). Whether Sonarr
            /// monitors this season; nil when Sonarr doesn't track the show or
            /// isn't connected.
            let monitored: Bool?
            /// In one of the viewer's pending or approved requests for this title.
            let requested: Bool?
            /// The season picker offers a checkbox: not complete, not
            /// monitored, not already requested by this viewer.
            let requestable: Bool?

            var id: Int { seasonNumber }

            /// The season picker's row: a checkbox, or why there isn't one.
            var requestState: SeasonRequestState {
                if requestable == true { return .requestable }
                if isComplete { return .inLibrary }
                if monitored == true { return .monitored }
                if requested == true { return .requested }
                return .unavailable
            }

            /// "1 episode" / "10 episodes".
            var episodeCountLabel: String {
                "\(episodeCount) episode\(episodeCount == 1 ? "" : "s")"
            }

            /// The "3/10" badge, nil when Sonarr doesn't track the show.
            var completenessLabel: String? {
                guard let have, let total else { return nil }
                return "\(have)/\(total)"
            }

            /// Green badge: every episode has a file.
            var isComplete: Bool {
                guard let have, let total else { return false }
                return total > 0 && have >= total
            }
        }

        struct CastMember: Codable, Hashable, Sendable, Identifiable {
            let tmdbId: Int
            let name: String
            let character: String?
            let profilePath: ImageRef?
            /// Billing order.
            let order: Int
            let favorited: Bool

            var id: Int { tmdbId }
        }

        /// A TMDb collection (movies) or a curated TV crossover group.
        struct Franchise: Codable, Hashable, Sendable {
            let title: String
            /// nil for TV groups; the heading's star favorites `/favorites/collection/{collectionId}`.
            let collectionId: Int?
            let collectionFavorited: Bool?
            /// Oldest first, with status, favorited, requested, canQuickAdd, canRequest.
            let items: [TitleCard]
            /// The admin's "Add all N missing" set (empty for members).
            let addAllMissing: [TitleID]
        }

        let mediaType: MediaType
        let tmdbId: Int
        let tvdbId: Int?
        let imdbId: String?
        let name: String
        let overview: String?
        let tagline: String?
        let posterPath: ImageRef?
        let backdropPath: ImageRef?
        let year: String?
        /// Raw TMDb release / first-air date.
        let releaseDate: CalendarDay?
        /// TMDb's own status, e.g. "Released", "Returning Series".
        let tmdbStatus: String?
        let facts: Facts
        let credits: [Credit]
        let keywords: [String]
        let links: Links
        let library: TitleLibraryInfo
        /// Decides the action area under the title (see `TitleViewerState`).
        let viewer: TitleViewerState
        /// TV only: seasons with episodes, newest first. Load episodes with `titles.season`.
        let seasons: [SeasonSummary]
        /// Top 20 by billing order.
        let cast: [CastMember]
        let franchise: Franchise?
        /// Heading "Studio".
        let studios: [CompanyCard]
        /// TMDb recommendations, heading "More like this".
        let similar: [TitleCard]

        var id: TitleID { TitleID(mediaType, tmdbId) }

        /// What the action area's Request button does for this viewer, or nil
        /// when there's no Request button (see `TitleRequestAction`).
        var requestAction: TitleRequestAction? {
            guard !viewer.alreadyRequested else { return nil }
            // A server from before season requests doesn't send
            // `canRequestSeasons`: today's whole-series Request, unchanged.
            let seasonsOffered = mediaType == .tv
                && viewer.canRequestSeasons == true
                && seasons.contains { $0.requestState == .requestable }
            if viewer.canRequest, viewer.requestStatus == nil {
                return seasonsOffered ? .pickSeasons(more: false) : .wholeSeries
            }
            if seasonsOffered {
                // Already tracked, or an earlier request was approved: more
                // seasons of a show that's partly in the library or on its way.
                return .pickSeasons(more: true)
            }
            return nil
        }

        /// The same title with a fresh `library` + `viewer` from `titles.status`,
        /// for updating the page after add / request / monitor / favorite.
        func updating(_ status: TitleStatus) -> TitleDetail {
            TitleDetail(
                mediaType: mediaType, tmdbId: tmdbId, tvdbId: tvdbId, imdbId: imdbId, name: name,
                overview: overview, tagline: tagline, posterPath: posterPath, backdropPath: backdropPath,
                year: year, releaseDate: releaseDate, tmdbStatus: tmdbStatus, facts: facts, credits: credits,
                keywords: keywords, links: links, library: status.library, viewer: status.viewer,
                seasons: seasons, cast: cast, franchise: franchise, studios: studios, similar: similar
            )
        }
    }

    /// A row of the season picker.
    enum SeasonRequestState: Hashable, Sendable {
        /// A checkbox.
        case requestable
        /// "In library": every episode has a file.
        case inLibrary
        /// "Monitored": Sonarr is already after it.
        case monitored
        /// "Requested": in one of your requests.
        case requested
        /// Not offered, for no reason the server spelled out.
        case unavailable

        /// The tag in place of the checkbox.
        var tag: String? {
            switch self {
            case .requestable, .unavailable: nil
            case .inLibrary: "In library"
            case .monitored: "Monitored"
            case .requested: "Requested"
            }
        }
    }

    /// The title page's Request button.
    enum TitleRequestAction: Hashable, Sendable {
        /// `POST …/request` with no body: a movie, a whole series, or a
        /// server too old to take seasons.
        case wholeSeries
        /// Opens the season picker. `more`: the show is already tracked or
        /// partly requested, so the button reads "Request more seasons".
        case pickSeasons(more: Bool)

        var buttonTitle: String {
            switch self {
            case .wholeSeries, .pickSeasons(more: false): "Request"
            case .pickSeasons(more: true): "Request more seasons"
            }
        }
    }

    /// `GET /titles/tv/{tmdbId}/seasons/{n}`: one expanded accordion row.
    struct SeasonEpisodes: Codable, Hashable, Sendable {
        let tmdbId: Int
        let seasonNumber: Int
        /// Empty → "No episode data for this season."
        let episodes: [Episode]
    }

    struct Episode: Codable, Hashable, Sendable, Identifiable {
        /// TMDb episode id.
        let id: Int
        let episodeNumber: Int
        let name: String
        let overview: String?
        let airDate: CalendarDay?
        let stillPath: ImageRef?
        /// Sonarr's "Have it" / "Missing"; nil when Sonarr doesn't track the show.
        let hasFile: Bool?

        /// "S01E03".
        func code(season: Int) -> String {
            "S\(Format.twoDigits(season))E\(Format.twoDigits(episodeNumber))"
        }

        /// The website truncates episode overviews at 220 characters.
        var shortOverview: String? {
            overview.map { $0.truncated(to: 220) }
        }
    }
}

extension String {
    /// Cut at `limit` characters with a trailing "…" (the website's line clamps).
    func truncated(to limit: Int) -> String {
        guard count > limit else { return self }
        return String(prefix(limit)).trimmingCharacters(in: .whitespaces) + "…"
    }
}
