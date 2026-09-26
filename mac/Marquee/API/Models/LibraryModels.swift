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
        /// The "File details" card; non-nil for `owned` titles and for a show
        /// Sonarr has some episodes of.
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
        /// TV: at least one season can be requested (season picker, "Request
        /// more seasons"). nil from a server older than season requests,
        /// which only takes whole-series requests.
        let canRequestSeasons: Bool?
        /// The seasons of your pending request; nil when there's none or it's
        /// for the whole series.
        let requestedSeasons: [Int]?
        /// The 4K copy (0.37+): non-nil when the admin has a 4K Radarr (movies)
        /// / 4K Sonarr (TV). nil from an older server or without one.
        let fourK: FourKViewerState?
        /// "Report a problem" (0.38+): the title (or its 4K copy) is owned or
        /// downloading. nil from an older server, which takes no reports.
        let canReport: Bool?
        /// Your own open problem reports for this title (0.38+).
        let openReports: Int?
        /// The request blocklist (0.41+). When `.blocked`, `canRequest`,
        /// `canRequestSeasons` and `fourK.canRequest` are already false. nil
        /// from an older server, which can't block (no admin buttons then).
        let blocked: BlockState?
        /// Reviewers only (0.46+): Sonarr/Radarr hasn't found the approved
        /// request since then, the "Can't find" pill. nil otherwise, and
        /// from an older server.
        var notFoundSince: Date? = nil

        /// On the admin's blocklist: the member's "Requests are closed" pill,
        /// the admin's "Unblock requests".
        var block: TitleBlock? { blocked?.block }

        /// The admin's "Block requests" / "Unblock requests" is on offer.
        var offersBlocking: Bool { isAdmin && blocked != nil }

        /// Show the "Report a problem" button.
        var showsReportProblem: Bool { canReport == true }

        /// "Requested Seasons 1–3 — waiting for approval", or without the
        /// seasons for a whole-series request.
        var pendingRequestLine: String {
            if let label = API.seasonsLabel(requestedSeasons) {
                return "Requested \(label) — waiting for approval"
            }
            return "Requested — waiting for approval"
        }

        /// "Also requested by A, B", or nil when it shouldn't show.
        var otherRequestersLine: String? {
            guard !otherRequesters.isEmpty, !alreadyRequested else { return nil }
            return "Also requested by \(otherRequesters.joined(separator: ", "))"
        }
    }

    /// `viewer.fourK`: the title in the 4K Radarr/Sonarr (components/fourk-controls.tsx).
    struct FourKViewerState: Codable, Hashable, Sendable {
        /// How the 4K instance has the title, read live; `.untracked` when it doesn't.
        let status: LibraryStatus
        /// Your own 4K request (`pending`/`approved`); nil when none or declined.
        let requestStatus: RequestStatus?
        /// "Request in 4K" (`requests.create(…, is4k: true)`).
        let canRequest: Bool
        /// "Add to 4K Radarr/Sonarr" (`titles.add(…, is4k: true)`, admin).
        let canAdd: Bool

        /// The gold outline chip: "In 4K", "4K downloading", "4K missing",
        /// "4K coming soon"; nil when the 4K instance doesn't have it.
        var statusLabel: String? {
            switch status {
            case .owned: "In 4K"
            case .trackedDownloading: "4K downloading"
            case .trackedMonitored: "4K missing"
            case .comingSoon: "4K coming soon"
            case .untracked, .unknown: nil
            }
        }

        /// The "4K requested" chip: your 4K request is still pending.
        var isRequestPending: Bool { requestStatus == .pending }
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

    /// `{"is4k": true}`: the body of "Request in 4K" and "Add to 4K Radarr/Sonarr".
    struct FourKBody: Encodable, Hashable, Sendable {
        var is4k = true
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
