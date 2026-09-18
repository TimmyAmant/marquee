import Foundation

// Library status and the Sonarr/Radarr actions on a title (api-v1.md §4).

extension API {
    /// `library` on the title page and `GET …/status`.
    struct TitleLibraryInfo: Codable, Hashable, Sendable {
        /// Always shown as the title's status badge.
        let status: LibraryStatus
        /// Where ownership came from; nil when nothing has the title.
        let provider: LibraryProvider?
        /// The library owner's Radarr (movies) / Sonarr (TV) has a root folder and quality profile.
        let configured: Bool
        /// The "File details" card; non-nil only for `owned` titles.
        let file: FileDetails?
    }

    /// The "File details" card. Movie-only fields are nil for TV.
    struct FileDetails: Codable, Hashable, Sendable {
        /// "Location" (with Copy).
        let path: String?
        let sizeBytes: Int64
        /// The quality profile name, e.g. "Bluray-2160p".
        let quality: String?
        let resolutionTier: ResolutionTier?
        /// e.g. "3840x1600".
        let resolution: String?
        let videoCodec: String?
        let dynamicRange: String?
        let audioCodec: String?
        /// e.g. 7.1.
        let audioChannels: Double?
        let dateAdded: Date?
        let releaseGroup: String?
        let edition: String?
        /// "MKV"/"MP4" — from Plex or Jellyfin; the *arrs don't report it.
        let container: String?
        /// Whole-file bitrate in kbps, e.g. 58421. Media servers only.
        let bitrateKbps: Int?

        /// "29.1 GB".
        var sizeLabel: String { Format.bytes(sizeBytes) }

        /// The "Resolution" row: `resolutionTier ?? resolution`.
        var resolutionLabel: String? { resolutionTier?.rawValue ?? resolution.nonBlank }

        /// "Dynamic range": "Dolby Vision", "HDR10+", or as sent.
        var dynamicRangeLabel: String? { Quality.hdrLabel(dynamicRange) }

        /// "58.4 Mbps", or "820 kbps" below a megabit.
        var bitrateLabel: String? {
            guard let bitrateKbps, bitrateKbps > 0 else { return nil }
            if bitrateKbps < 1000 { return "\(bitrateKbps) kbps" }
            return String(format: "%.1f Mbps", Double(bitrateKbps) / 1000)
        }

        /// The "Audio" row: "TrueHD Atmos 7.1ch".
        var audioLabel: String? {
            guard let codec = audioCodec.nonBlank else { return nil }
            guard let audioChannels else { return codec }
            let channels = audioChannels.rounded() == audioChannels ? String(Int(audioChannels)) : String(audioChannels)
            return "\(codec) \(channels)ch"
        }
    }

    /// Radarr/Sonarr has the title (admin only).
    struct ArrTracking: Codable, Hashable, Sendable {
        /// The movie/series id inside Radarr/Sonarr.
        let arrId: Int
        let monitored: Bool
    }

    /// `viewer` on the title page: which actions to show under the title.
    struct TitleViewerState: Codable, Hashable, Sendable {
        let isAdmin: Bool
        /// The star (`favorites.set`).
        let favorited: Bool
        /// Your active request, if any.
        let requestStatus: RequestStatus?
        /// Show "Requested — waiting for approval" instead of Request.
        let alreadyRequested: Bool
        /// "Also requested by A, B" when non-empty and you haven't requested.
        let otherRequesters: [String]
        /// "Add to Radarr/Sonarr" (`titles.add`).
        let canAdd: Bool
        /// "Connect Radarr/Sonarr to add this title" (admin → Integrations).
        let needsArrSetup: Bool
        /// "Request" (`requests.create`).
        let canRequest: Bool
        /// "Wrong match? Fix ID" (`titles.relink`).
        let canRelink: Bool
        /// "Search now" and "Stop/Start monitoring" when non-nil.
        let arrTracking: ArrTracking?

        /// "Also requested by A, B", or nil when it shouldn't show.
        var otherRequestersLine: String? {
            guard !otherRequesters.isEmpty, !alreadyRequested else { return nil }
            return "Also requested by \(otherRequesters.joined(separator: ", "))"
        }
    }

    /// `GET /titles/{type}/{tmdbId}/status`: just `library` + `viewer`, the
    /// cheap refresh after add / request / monitor / favorite.
    struct TitleStatus: Codable, Hashable, Sendable {
        let mediaType: MediaType
        let tmdbId: Int
        let library: TitleLibraryInfo
        let viewer: TitleViewerState

        var id: TitleID { TitleID(mediaType, tmdbId) }
    }

    /// `PUT …/monitored` response.
    struct MonitoredResult: Codable, Hashable, Sendable {
        let ok: Bool
        let monitored: Bool
    }

    /// "Wrong match? Fix ID": the id to repoint the title to. The server
    /// checks `tmdbId`, then `imdbId`, then `tvdbId` (TV only).
    enum RelinkTarget: Encodable, Hashable, Sendable {
        case tmdb(Int)
        /// `tt0133093` or `0133093`.
        case imdb(String)
        case tvdb(Int)

        private enum CodingKeys: String, CodingKey {
            case tmdbId, imdbId, tvdbId
        }

        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            switch self {
            case let .tmdb(id): try container.encode(id, forKey: .tmdbId)
            case let .imdb(id): try container.encode(id, forKey: .imdbId)
            case let .tvdb(id): try container.encode(id, forKey: .tvdbId)
            }
        }
    }

    /// `POST …/relink` response: navigate to `newTmdbId` afterwards.
    struct RelinkResult: Codable, Hashable, Sendable {
        let ok: Bool
        let newTmdbId: Int
    }
}
