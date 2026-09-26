import Foundation

/// A string enum the server may grow. An unrecognized value decodes as
/// `.unknown(raw)` instead of failing the whole response, so an older app
/// keeps working against a newer server (it just can't name the new case).
///
/// Deliberately not `RawRepresentable`: its failable `init?(rawValue:)` would
/// make `init(rawValue:)` below ambiguous at call sites.
protocol OpenEnum: Codable, Hashable, Sendable, CustomStringConvertible {
    /// Every named case, in declaration order (never `.unknown`).
    static var knownCases: [Self] { get }
    /// The fallback case; enum cases satisfy this (SE-0280).
    static func unknown(_ rawValue: String) -> Self
    /// The wire value.
    var rawValue: String { get }
}

extension OpenEnum {
    init(rawValue: String) {
        self = Self.knownCases.first { $0.rawValue == rawValue } ?? .unknown(rawValue)
    }

    init(from decoder: Decoder) throws {
        self.init(rawValue: try decoder.singleValueContainer().decode(String.self))
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }

    var description: String { rawValue }

    /// False for a value this version of the app doesn't know.
    var isKnown: Bool { Self.knownCases.contains(self) }
}

// Swift counterparts of the string unions in lib/api/types.ts.

extension API {
    enum MediaType: OpenEnum {
        case movie
        case tv
        case unknown(String)

        static let knownCases: [MediaType] = [.movie, .tv]

        var rawValue: String {
            switch self {
            case .movie: return "movie"
            case .tv: return "tv"
            case let .unknown(raw): return raw
            }
        }

        /// "Movie" / "TV" (the search suggestion pill wording).
        var label: String {
            switch self {
            case .movie: return "Movie"
            case .tv: return "TV"
            case let .unknown(raw): return raw.capitalized
            }
        }

        /// "Movies" / "Series" (navigation menu and page titles).
        var pluralLabel: String {
            switch self {
            case .movie: return "Movies"
            case .tv: return "Series"
            case let .unknown(raw): return raw.capitalized
            }
        }

        /// "Radarr" / "Sonarr": who adds and tracks this media type.
        var arrName: String {
            switch self {
            case .movie: return "Radarr"
            case .tv: return "Sonarr"
            case .unknown: return "Sonarr/Radarr"
            }
        }
    }

    enum UserRole: OpenEnum {
        case admin
        case member
        /// 0.39+: a member who also works the review queue (requests and
        /// problem reports). Everything else stays admin-only.
        case trusted
        case unknown(String)

        static let knownCases: [UserRole] = [.admin, .member, .trusted]

        var rawValue: String {
            switch self {
            case .admin: return "admin"
            case .member: return "member"
            case .trusted: return "trusted"
            case let .unknown(raw): return raw
            }
        }

        var label: String {
            switch self {
            case .admin: return "Admin"
            case .member: return "Member"
            case .trusted: return "Trusted"
            case let .unknown(raw): return raw.capitalized
            }
        }

        /// Whether the role reviews requests and problem reports (the queue,
        /// history, approve/reject, "Reported problems"): the admin and
        /// trusted members (lib/users/roles.ts `canReviewRequests`). An
        /// unknown role acts as a member.
        var canReviewRequests: Bool {
            switch self {
            case .admin, .trusted: return true
            case .member, .unknown: return false
            }
        }
    }

    enum RequestStatus: OpenEnum {
        case pending
        case approved
        case rejected
        case unknown(String)

        static let knownCases: [RequestStatus] = [.pending, .approved, .rejected]

        var rawValue: String {
            switch self {
            case .pending: return "pending"
            case .approved: return "approved"
            case .rejected: return "rejected"
            case let .unknown(raw): return raw
            }
        }
    }

    /// components/status-badge.tsx's union. `null` on the wire (not in the
    /// library at all) is a nil `LibraryStatus?`, not a case.
    enum LibraryStatus: OpenEnum {
        case owned
        case trackedDownloading
        case trackedMonitored
        case comingSoon
        case untracked
        case unknown(String)

        static let knownCases: [LibraryStatus] = [.owned, .trackedDownloading, .trackedMonitored, .comingSoon, .untracked]

        var rawValue: String {
            switch self {
            case .owned: return "owned"
            case .trackedDownloading: return "tracked_downloading"
            case .trackedMonitored: return "tracked_monitored"
            case .comingSoon: return "coming_soon"
            case .untracked: return "untracked"
            case let .unknown(raw): return raw
            }
        }

        /// The title page badge.
        var label: String {
            switch self {
            case .owned: return "Already in your library"
            case .trackedDownloading: return "Downloading"
            case .trackedMonitored: return "Missing"
            case .comingSoon: return "Coming soon"
            case .untracked: return "Not in your library"
            case let .unknown(raw): return raw
            }
        }

        /// The poster card badge.
        var compactLabel: String {
            switch self {
            case .owned: return "Owned"
            case .trackedDownloading: return "Downloading"
            case .trackedMonitored: return "Missing"
            case .comingSoon: return "Coming soon"
            case .untracked: return "Not owned"
            case let .unknown(raw): return raw
            }
        }

        /// In the library in any form (owned or tracked by Sonarr/Radarr).
        var isInLibrary: Bool {
            switch self {
            case .owned, .trackedDownloading, .trackedMonitored, .comingSoon: return true
            case .untracked, .unknown: return false
            }
        }
    }

    /// Where a title's library status came from (`library.provider`).
    enum LibraryProvider: OpenEnum {
        case plex
        case jellyfin
        case sonarr
        case radarr
        case unknown(String)

        static let knownCases: [LibraryProvider] = [.plex, .jellyfin, .sonarr, .radarr]

        var rawValue: String {
            switch self {
            case .plex: return "plex"
            case .jellyfin: return "jellyfin"
            case .sonarr: return "sonarr"
            case .radarr: return "radarr"
            case let .unknown(raw): return raw
            }
        }

        var displayName: String {
            switch self {
            case .plex: return "Plex"
            case .jellyfin: return "Jellyfin"
            case .sonarr: return "Sonarr"
            case .radarr: return "Radarr"
            case let .unknown(raw): return raw.capitalized
            }
        }
    }

    /// `/favorites/{entityType}/{tmdbId}`.
    enum FavoriteEntityType: OpenEnum {
        case movie
        case tv
        case person
        case company
        case collection
        case unknown(String)

        static let knownCases: [FavoriteEntityType] = [.movie, .tv, .person, .company, .collection]

        init(_ mediaType: MediaType) {
            switch mediaType {
            case .movie: self = .movie
            case .tv: self = .tv
            case let .unknown(raw): self = .unknown(raw)
            }
        }

        var rawValue: String {
            switch self {
            case .movie: return "movie"
            case .tv: return "tv"
            case .person: return "person"
            case .company: return "company"
            case .collection: return "collection"
            case let .unknown(raw): return raw
            }
        }
    }

    enum NotificationEventType: OpenEnum {
        case grabbed
        case downloaded
        case requestApproved
        case requestRejected
        /// 0.38+: someone reported a problem with a title (to the admin).
        case issueReported
        /// 0.38+: the admin marked your problem report fixed.
        case issueResolved
        /// 0.45.1+: someone in the household shared a title with you.
        case titleShared
        case unknown(String)

        static let knownCases: [NotificationEventType] = [
            .grabbed, .downloaded, .requestApproved, .requestRejected, .issueReported, .issueResolved, .titleShared,
        ]

        var rawValue: String {
            switch self {
            case .grabbed: return "grabbed"
            case .downloaded: return "downloaded"
            case .requestApproved: return "request_approved"
            case .requestRejected: return "request_rejected"
            case .issueReported: return "issue_reported"
            case .issueResolved: return "issue_resolved"
            case .titleShared: return "title_shared"
            case let .unknown(raw): return raw
            }
        }

        var emoji: String {
            switch self {
            case .grabbed: return "⬇️"
            case .downloaded: return "✅"
            case .requestApproved: return "👍"
            case .requestRejected: return "👎"
            case .issueReported: return "⚠️"
            case .issueResolved: return "🛠️"
            case .titleShared: return "📨"
            case .unknown: return "🔔"
            }
        }
    }

    enum ActivityEventType: OpenEnum {
        case requestCreated
        case requestApproved
        case requestRejected
        case requestManuallyApproved
        case unknown(String)

        static let knownCases: [ActivityEventType] = [.requestCreated, .requestApproved, .requestRejected, .requestManuallyApproved]

        var rawValue: String {
            switch self {
            case .requestCreated: return "request_created"
            case .requestApproved: return "request_approved"
            case .requestRejected: return "request_rejected"
            case .requestManuallyApproved: return "request_manually_approved"
            case let .unknown(raw): return raw
            }
        }
    }

    /// `MyRequest.statusTone`: which badge colors the Requests page uses.
    enum RequestTone: OpenEnum {
        case pending
        case declined
        case owned
        case downloading
        case comingSoon
        case approved
        case unknown(String)

        static let knownCases: [RequestTone] = [.pending, .declined, .owned, .downloading, .comingSoon, .approved]

        var rawValue: String {
            switch self {
            case .pending: return "pending"
            case .declined: return "declined"
            case .owned: return "owned"
            case .downloading: return "downloading"
            case .comingSoon: return "coming_soon"
            case .approved: return "approved"
            case let .unknown(raw): return raw
            }
        }
    }

    /// `SearchSuggestion.mediaType`: a person or a title.
    enum SuggestionKind: OpenEnum {
        case person
        case movie
        case tv
        case unknown(String)

        static let knownCases: [SuggestionKind] = [.person, .movie, .tv]

        var rawValue: String {
            switch self {
            case .person: return "person"
            case .movie: return "movie"
            case .tv: return "tv"
            case let .unknown(raw): return raw
            }
        }

        /// The website's pill: "Actor", "Movie", "TV".
        var label: String {
            switch self {
            case .person: return "Actor"
            case .movie: return "Movie"
            case .tv: return "TV"
            case let .unknown(raw): return raw.capitalized
            }
        }

        /// The title's media type, nil for a person.
        var mediaType: MediaType? {
            switch self {
            case .movie: return .movie
            case .tv: return .tv
            case .person, .unknown: return nil
            }
        }
    }

    /// What's wrong with a title, in a problem report (0.38+). The labels are
    /// lib/issues/labels.ts's; `GET /issues` also sends them as `kinds`.
    enum IssueKind: OpenEnum {
        case video
        case audio
        case subtitles
        case wontPlay
        case wrongTitle
        case other
        case unknown(String)

        static let knownCases: [IssueKind] = [.video, .audio, .subtitles, .wontPlay, .wrongTitle, .other]

        var rawValue: String {
            switch self {
            case .video: return "video"
            case .audio: return "audio"
            case .subtitles: return "subtitles"
            case .wontPlay: return "wont_play"
            case .wrongTitle: return "wrong_title"
            case .other: return "other"
            case let .unknown(raw): return raw
            }
        }

        /// The report dialog's radio buttons and the Requests page rows.
        var label: String {
            switch self {
            case .video: return "Bad video quality"
            case .audio: return "Audio problem"
            case .subtitles: return "Subtitles missing or wrong"
            case .wontPlay: return "Won't play"
            case .wrongTitle: return "Wrong movie or episode"
            case .other: return "Something else"
            case let .unknown(raw): return raw
            }
        }
    }

    /// A problem report's state: open until the admin marks it fixed.
    enum IssueStatus: OpenEnum {
        case open
        case resolved
        case unknown(String)

        static let knownCases: [IssueStatus] = [.open, .resolved]

        var rawValue: String {
            switch self {
            case .open: return "open"
            case .resolved: return "resolved"
            case let .unknown(raw): return raw
            }
        }
    }

    /// `FileDetails.resolutionTier`, derived from the quality name (lib/quality.ts).
    enum ResolutionTier: OpenEnum {
        case uhd
        case fullHD
        case hd
        case unknown(String)

        static let knownCases: [ResolutionTier] = [.uhd, .fullHD, .hd]

        var rawValue: String {
            switch self {
            case .uhd: return "4K"
            case .fullHD: return "1080p"
            case .hd: return "720p"
            case let .unknown(raw): return raw
            }
        }
    }
}
