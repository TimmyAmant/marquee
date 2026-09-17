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

        /// "Movies" / "Series" (sidebar and page titles).
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
        case unknown(String)

        static let knownCases: [UserRole] = [.admin, .member]

        var rawValue: String {
            switch self {
            case .admin: return "admin"
            case .member: return "member"
            case let .unknown(raw): return raw
            }
        }

        var label: String {
            switch self {
            case .admin: return "Admin"
            case .member: return "Member"
            case let .unknown(raw): return raw.capitalized
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
        case unknown(String)

        static let knownCases: [NotificationEventType] = [.grabbed, .downloaded, .requestApproved, .requestRejected]

        var rawValue: String {
            switch self {
            case .grabbed: return "grabbed"
            case .downloaded: return "downloaded"
            case .requestApproved: return "request_approved"
            case .requestRejected: return "request_rejected"
            case let .unknown(raw): return raw
            }
        }

        var emoji: String {
            switch self {
            case .grabbed: return "⬇️"
            case .downloaded: return "✅"
            case .requestApproved: return "👍"
            case .requestRejected: return "👎"
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
