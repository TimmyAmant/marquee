import Foundation

// The Library page (api-v1.md §17, 0.51+): everything the household owns
// across Plex, Jellyfin, Sonarr and Radarr, the franchises it has part of,
// the admin's duplicates and the disks. A server older than 0.51 answers
// `.notFound` on each call.

extension API {
    /// `LibraryEntry.resolution` and the `?resolution=` filter: the file's
    /// tier; `SD` is a known file below 720p.
    enum LibraryResolution: OpenEnum {
        case uhd
        case fullHD
        case hd
        case sd
        case unknown(String)

        static let knownCases: [LibraryResolution] = [.uhd, .fullHD, .hd, .sd]

        var rawValue: String {
            switch self {
            case .uhd: return "4K"
            case .fullHD: return "1080p"
            case .hd: return "720p"
            case .sd: return "SD"
            case let .unknown(raw): return raw
            }
        }

        /// The wire value doubles as the label ("4K", "1080p"…).
        var label: String { rawValue }
    }

    /// `GET /library` sort. Client-chosen, so a closed enum.
    enum LibrarySort: String, Codable, CaseIterable, Hashable, Sendable, Identifiable {
        case recent
        case title
        case year
        case size
        case rating

        var id: String { rawValue }

        var label: String {
            switch self {
            case .recent: return String(localized: "Recently added")
            case .title: return String(localized: "Title")
            case .year: return String(localized: "Year")
            case .size: return String(localized: "Size")
            case .rating: return String(localized: "Rating")
            }
        }
    }

    /// The Library page's filters (`GET /library`). Defaults (sort `recent`,
    /// page 1, nothing set) are left out of the query.
    struct LibraryQuery: Hashable, Sendable {
        var type: MediaType?
        /// Never `untracked`: the library only lists what's in it.
        var status: LibraryStatus?
        var source: LibraryProvider?
        var resolution: LibraryResolution?
        /// Only files with HDR or Dolby Vision.
        var hdr = false
        /// A video codec as the media server spells it (`HEVC`), from `LibraryFilters.codecs`.
        var codec: String?
        /// A TMDb genre name, from `LibraryFilters.genres`.
        var genre: String?
        var year: Int?
        /// Title contains.
        var q = ""
        var sort: LibrarySort = .recent

        init(
            type: MediaType? = nil, status: LibraryStatus? = nil, source: LibraryProvider? = nil,
            resolution: LibraryResolution? = nil, hdr: Bool = false, codec: String? = nil, genre: String? = nil,
            year: Int? = nil, q: String = "", sort: LibrarySort = .recent
        ) {
            self.type = type
            self.status = status
            self.source = source
            self.resolution = resolution
            self.hdr = hdr
            self.codec = codec
            self.genre = genre
            self.year = year
            self.q = q
            self.sort = sort
        }

        /// Anything besides the defaults: "Clear filters" shows, and an empty
        /// page reads "No titles match these filters." rather than "Still syncing".
        var hasFilters: Bool { self != LibraryQuery() }

        func queryItems(page: Int) -> [String: String?] {
            [
                "type": type?.rawValue,
                "status": status?.rawValue,
                "source": source?.rawValue,
                "resolution": resolution?.rawValue,
                "hdr": hdr ? "1" : nil,
                "codec": codec.nonBlank,
                "genre": genre.nonBlank,
                "year": year.map(String.init),
                "q": q.trimmingCharacters(in: .whitespaces).nonBlank,
                "sort": sort == .recent ? nil : sort.rawValue,
                "page": page == 1 ? nil : String(page),
            ]
        }
    }

    /// One title in the household library: a `TitleCard` (with `status`
    /// always set) plus what's known about its file.
    struct LibraryEntry: Codable, Hashable, Sendable, Identifiable {
        let mediaType: MediaType
        let tmdbId: Int
        let name: String
        let posterPath: ImageRef?
        let year: String?
        let subtitle: String?
        let overview: String?
        let rating: Double?
        var status: LibraryStatus?
        let favorited: Bool?
        var requested: Bool?
        var canQuickAdd: Bool
        let canRequest: Bool
        /// TheTVDB id (series).
        let tvdbId: Int?
        /// Where the row came from; a media server wins over Sonarr/Radarr
        /// for a title both have (unless it's downloading).
        let source: LibraryProvider
        let sizeBytes: Int64?
        /// When the media server added it; nil for a Sonarr/Radarr-only title.
        let addedAt: Date?
        let genres: [String]
        /// nil when nothing describes a file (a monitored-only title).
        let resolution: LibraryResolution?
        /// "HDR10", "HDR10+", "Dolby Vision"…; nil for SDR or unknown.
        let hdr: String?
        let videoCodec: String?
        let audioCodec: String?
        /// Radarr's quality profile name for the file ("Bluray-2160p").
        let quality: String?
        /// The admin only; nil for members.
        let filePath: String?
        /// Series: episode files on disk; nil when unknown.
        let episodeCount: Int?
        /// Series: aired episodes on disk against aired episodes (the poster's
        /// "96/96"); nil for movies and from older servers.
        var episodes: EpisodeCounts?
        /// Radarr: the file is below the quality cutoff.
        let upgradeAvailable: Bool
        /// Sonarr/Radarr and the media server report different paths.
        let possibleDuplicate: Bool
        /// The admin only: Radarr/Sonarr has it ("Search now", "Stop/Start
        /// monitoring"). nil for members and a media-server-only title.
        var arrTracking: ArrTracking?

        var id: TitleID { TitleID(mediaType, tmdbId) }

        /// The poster card, for `PosterCard(card:)`.
        var card: TitleCard {
            TitleCard(
                mediaType: mediaType, tmdbId: tmdbId, name: name, posterPath: posterPath, year: year,
                subtitle: subtitle, overview: overview, rating: rating, status: status, favorited: favorited,
                requested: requested, canQuickAdd: canQuickAdd, canRequest: canRequest, episodes: episodes
            )
        }

        /// "Plex · 29.1 GB · 61 episodes", then "Upgrade available" and
        /// "Possible duplicate" when they apply (library-results.tsx metaLine).
        var metaLine: String {
            var parts = [source.displayName]
            if let sizeBytes, sizeBytes > 0 { parts.append(Format.bytes(sizeBytes)) }
            if mediaType == .tv, let episodeCount, episodeCount > 0 {
                parts.append(String(localized: "\(episodeCount) episodes"))
            }
            if upgradeAvailable { parts.append(String(localized: "Upgrade available")) }
            if possibleDuplicate { parts.append(String(localized: "Possible duplicate")) }
            return parts.joined(separator: " · ")
        }

        /// "4K · Dolby Vision · HEVC · TrueHD Atmos": what's known about the
        /// file's quality, nil when nothing is.
        var qualityLabel: String? {
            let parts = [resolution?.label, hdr.nonBlank, videoCodec.nonBlank, audioCodec.nonBlank].compactMap { $0 }
            return parts.isEmpty ? nil : parts.joined(separator: " · ")
        }

        /// "29.1 GB", or nil without a size.
        var sizeLabel: String? {
            guard let sizeBytes, sizeBytes > 0 else { return nil }
            return Format.bytes(sizeBytes)
        }
    }

    /// The header counts: owned movies and series, episode files on disk,
    /// bytes on disk, and rows not on disk yet.
    struct LibrarySummary: Codable, Hashable, Sendable {
        let movies: Int
        let series: Int
        /// Episode files on disk (Sonarr and Plex report them; Jellyfin doesn't).
        let episodes: Int
        let totalBytes: Int64
        /// Downloading, missing or coming soon: not counted above.
        let tracked: Int

        /// "640 movies · 172 series · 9840 episodes · 43.7 TB on disk";
        /// episodes and the size only when there are any.
        var line: String {
            var parts = [String(localized: "\(movies) movies"), String(localized: "\(series) series")]
            if episodes > 0 { parts.append(String(localized: "\(episodes) episodes")) }
            if totalBytes > 0 { parts.append(String(localized: "\(Format.bytes(totalBytes)) on disk")) }
            return parts.joined(separator: " · ")
        }

        /// "+ 23 more downloading, missing or coming soon, not counted above", nil at zero.
        var trackedNote: String? {
            guard tracked > 0 else { return nil }
            return String(localized: "+ \(tracked) more downloading, missing or coming soon, not counted above")
        }
    }

    /// What the filter pickers offer: only values present in this library.
    struct LibraryFilters: Codable, Hashable, Sendable {
        let sources: [LibraryProvider]
        let genres: [String]
        let codecs: [String]
        let years: [Int]
        let resolutions: [LibraryResolution]
        let hasHdr: Bool

        static let empty = LibraryFilters(sources: [], genres: [], codecs: [], years: [], resolutions: [], hasHdr: false)
    }

    /// `GET /library`: one page of the library, with the counts and filter
    /// choices of the whole of it.
    struct LibraryPageResponse: Codable, Hashable, Sendable {
        let page: Int
        let pageSize: Int
        let totalPages: Int
        let totalResults: Int
        let results: [LibraryEntry]
        let summary: LibrarySummary
        let filters: LibraryFilters
        /// False when neither Plex, Jellyfin, Sonarr nor Radarr is connected.
        let connected: Bool

        /// Continue while `page < totalPages`.
        var hasMorePages: Bool { page < totalPages }
    }

    /// `GET /library/collections-missing`: a franchise the library has part
    /// of but not all of.
    struct LibraryCollection: Codable, Hashable, Sendable, Identifiable {
        let key: String
        let title: String
        /// The TMDb collection (movies); nil for a hand-curated TV group.
        let collectionId: Int?
        let collectionFavorited: Bool?
        /// Every part, in release order, with the library status of each.
        let items: [TitleCard]
        let missingCount: Int
        /// The admin's "Add all N missing" set; empty for members.
        let addAllMissing: [TitleID]
        /// A member's "Request all N missing" set; empty for the admin.
        let requestAllMissing: [TitleID]
        /// An owned part, for `POST /titles/{type}/{id}/request-all-missing`.
        let requestAllTarget: TitleID

        var id: String { key }

        /// "The Matrix Collection · 2 missing".
        var heading: String {
            "\(title) · \(String(localized: "\(missingCount) missing"))"
        }
    }

    /// Why a title is on the Duplicates tab.
    enum LibraryDuplicateReason: OpenEnum {
        /// Two or more copies name different files.
        case paths
        /// Two media servers list it.
        case servers
        case unknown(String)

        static let knownCases: [LibraryDuplicateReason] = [.paths, .servers]

        var rawValue: String {
            switch self {
            case .paths: return "paths"
            case .servers: return "servers"
            case let .unknown(raw): return raw
            }
        }

        var label: String {
            switch self {
            case .paths: return String(localized: "Different files")
            case .servers: return String(localized: "On several servers")
            case let .unknown(raw): return raw
            }
        }
    }

    /// One copy of a duplicated title.
    struct LibraryCopy: Codable, Hashable, Sendable {
        let source: LibraryProvider
        /// The server's name in Settings.
        let server: String
        let filePath: String?
        let sizeBytes: Int64?
        /// A media server's resolution or the arr's quality profile.
        let quality: String?
    }

    /// `GET /library/duplicates` (admin): a title in more than one file or on
    /// more than one media server, with every copy.
    struct LibraryDuplicate: Codable, Hashable, Sendable, Identifiable {
        let mediaType: MediaType
        let tmdbId: Int
        let name: String
        let posterPath: ImageRef?
        let year: String?
        let reason: LibraryDuplicateReason
        let copies: [LibraryCopy]

        var id: TitleID { TitleID(mediaType, tmdbId) }
    }

    /// A Sonarr/Radarr root folder and its free space.
    struct LibraryStorageFolder: Codable, Hashable, Sendable, Identifiable {
        let path: String
        let freeBytes: Int64
        /// The Sonarr/Radarr servers with this root folder.
        let servers: [String]

        var id: String { path }
    }

    /// From the daily `disk-space-snapshot` job: when the disks run out at
    /// the current rate.
    struct LibraryStorageForecast: Codable, Hashable, Sendable {
        let daysRemaining: Int
        let bytesPerDay: Int64
        /// The calendar day they're full.
        let fullOn: CalendarDay?
    }

    /// `GET /library/storage`: the Storage card.
    struct LibraryStorage: Codable, Hashable, Sendable {
        let folders: [LibraryStorageFolder]
        let totalFreeBytes: Int64
        /// When the figures were read; nil when there's nothing.
        let measuredAt: Date?
        /// True: read from the servers just now; false: the newest daily snapshot.
        let live: Bool
        /// nil until two days of snapshots show free space shrinking.
        let forecast: LibraryStorageForecast?

        /// Nothing connected and no snapshots: the "Connect Sonarr or Radarr" text.
        var isEmpty: Bool { folders.isEmpty && measuredAt == nil }

        /// "Full in about 42 days at the current rate (11.5 GB/day)." — or
        /// today, or that there's no forecast yet (lib/library/storage.ts).
        var forecastLine: String {
            guard let forecast else {
                return String(localized: "No forecast yet — it needs a couple of days of readings from the daily disk-space snapshot.")
            }
            let perDay = Format.bytes(forecast.bytesPerDay)
            if forecast.daysRemaining <= 0 {
                return String(localized: "Full today at the current rate (\(perDay)/day).")
            }
            return String(localized: "Full in about \(forecast.daysRemaining) days at the current rate (\(perDay)/day).")
        }

        /// "Around November 7, 2026.", beside the line above; nil without a
        /// forecast or when it's full today.
        func fullOnLine(now: Date = Date()) -> String? {
            guard let forecast, forecast.daysRemaining > 0 else { return nil }
            let day = forecast.fullOn ?? CalendarDay(now).adding(days: forecast.daysRemaining) ?? CalendarDay(now)
            return String(localized: "Around \(day.longLabel).")
        }

        /// "Read from your servers just now." or "From the last daily
        /// snapshot, Sep 26, 2026."; nil when nothing was measured.
        var measuredLine: String? {
            if live { return String(localized: "Read from your servers just now.") }
            guard let measuredAt else { return nil }
            return String(localized: "From the last daily snapshot, \(Format.shortDate(measuredAt)).")
        }
    }
}
