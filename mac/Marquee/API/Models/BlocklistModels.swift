import Foundation

// The request blocklist (api-v1.md §7 "Request blocklist (0.41+)"): titles and
// TMDb keywords/genres nobody may request. A server older than 0.41 has none
// of it (`viewer.blocked` is missing, `GET /settings/blocklist` is a 404), and
// the app then shows none of it.

extension API {
    /// `viewer.blocked`: this title is on the admin's blocklist.
    struct TitleBlock: Codable, Hashable, Sendable {
        /// The admin's reason, shown to whoever asks.
        let reason: String?
        /// Set when a blocked keyword or genre did it (unblock it in Settings).
        let keyword: String?

        /// The member's pill: "Requests are closed for this title — Already on Max."
        var closedLine: String {
            if let reason = reason.nonBlank {
                return "Requests are closed for this title — \(reason)"
            }
            return "Requests are closed for this title"
        }
    }

    /// `viewer.blocked` as sent: `null` is `.notBlocked`, so a server that
    /// omits the key (older than 0.41, which can't block) stays tellable
    /// apart as a nil `TitleViewerState.blocked`.
    enum BlockState: Codable, Hashable, Sendable {
        case notBlocked
        case blocked(TitleBlock)

        var block: TitleBlock? {
            if case let .blocked(block) = self { return block }
            return nil
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.singleValueContainer()
            self = container.decodeNil() ? .notBlocked : .blocked(try container.decode(TitleBlock.self))
        }

        func encode(to encoder: Encoder) throws {
            var container = encoder.singleValueContainer()
            switch self {
            case .notBlocked: try container.encodeNil()
            case let .blocked(block): try container.encode(block)
            }
        }
    }

    enum BlocklistKind: OpenEnum {
        case title
        case keyword
        case unknown(String)

        static let knownCases: [BlocklistKind] = [.title, .keyword]

        var rawValue: String {
            switch self {
            case .title: return "title"
            case .keyword: return "keyword"
            case let .unknown(raw): return raw
            }
        }
    }

    /// One row of `GET /settings/blocklist` (keywords first, then titles).
    struct BlocklistEntry: Codable, Hashable, Sendable, Identifiable {
        /// Kept as the server's string, like `IssueReporter.userId`.
        let id: String
        let kind: BlocklistKind
        /// Titles only.
        let mediaType: MediaType?
        let tmdbId: Int?
        /// The title's name when it was blocked.
        let title: String?
        /// Keywords only, lower-case.
        let keyword: String?
        let reason: String?
        let createdAt: Date

        /// The title page this row links to; nil for a keyword.
        var titleID: TitleID? {
            guard kind == .title, let mediaType, let tmdbId else { return nil }
            return TitleID(mediaType, tmdbId)
        }

        /// The title's name ("#438631" without one), or "Keyword: anime".
        var label: String {
            if titleID != nil, let tmdbId {
                return title.nonBlank ?? "#\(tmdbId)"
            }
            return "Keyword: \(keyword ?? "")"
        }
    }

    /// `POST /titles/{type}/{tmdbId}/block` body. nil `reason` sends no key.
    struct BlockTitleRequest: Codable, Hashable, Sendable {
        let reason: String?

        /// The server's limit on `reason`.
        static let maxReasonLength = 200
    }

    /// `POST /settings/blocklist` body.
    struct BlockKeywordRequest: Codable, Hashable, Sendable {
        let keyword: String
        let reason: String?
    }
}

extension KeyedDecodingContainer {
    /// `viewer.blocked`: a present `null` is `.notBlocked` rather than nil
    /// (the synthesized `TitleViewerState` decoder picks this overload).
    func decodeIfPresent(_ type: API.BlockState.Type, forKey key: Key) throws -> API.BlockState? {
        guard contains(key) else { return nil }
        if try decodeNil(forKey: key) { return .notBlocked }
        return .blocked(try decode(API.TitleBlock.self, forKey: key))
    }
}
