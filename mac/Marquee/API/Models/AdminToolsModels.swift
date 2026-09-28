import Foundation

// The admin tools of 0.58 (api-v1.md): job schedules, the server's log,
// override rules, removing a title from Sonarr/Radarr, and the blocklist's
// automatic rules. Every field an older server doesn't send is optional.

extension API {
    // MARK: Job schedules

    /// How often a job runs (`interval` of `GET /settings/jobs`, the body of
    /// `PUT /settings/jobs/{id}`): every few minutes or hours, or once a day
    /// at a time of the server's clock.
    enum JobInterval: Codable, Hashable, Sendable {
        case minutes(Int)
        case hours(Int)
        case daily(hour: Int, minute: Int)

        /// The presets the server takes (lib/jobs/schedule.ts).
        static let minutePresets = [5, 10, 15, 30]
        static let hourPresets = [1, 2, 3, 4, 6, 8, 12]

        /// Every preset, then "Once a day" at 3:00 — the menu's choices.
        static var menuChoices: [JobInterval] {
            minutePresets.map(JobInterval.minutes) + hourPresets.map(JobInterval.hours) + [.daily(hour: 3, minute: 0)]
        }

        /// The menu entry this belongs to (a daily one at any time is one entry).
        var menuKey: String {
            switch self {
            case let .minutes(count): return "minutes:\(count)"
            case let .hours(count): return "hours:\(count)"
            case .daily: return "daily"
            }
        }

        /// "Every 15 minutes", "Every 6 hours", "Once a day".
        var menuTitle: String {
            switch self {
            case let .minutes(count): return String(localized: "Every \(count) minutes")
            case let .hours(count):
                return count == 1 ? String(localized: "Every hour") : String(localized: "Every \(count) hours")
            case .daily: return String(localized: "Once a day")
            }
        }

        private enum CodingKeys: String, CodingKey { case every, count, dailyAt }
        private struct DailyAt: Codable, Hashable { let hour: Int; let minute: Int }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            if let daily = try container.decodeIfPresent(DailyAt.self, forKey: .dailyAt) {
                self = .daily(hour: daily.hour, minute: daily.minute)
                return
            }
            let every = try container.decode(String.self, forKey: .every)
            let count = try container.decode(Int.self, forKey: .count)
            self = every == "minutes" ? .minutes(count) : .hours(count)
        }

        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            switch self {
            case let .minutes(count):
                try container.encode("minutes", forKey: .every)
                try container.encode(count, forKey: .count)
            case let .hours(count):
                try container.encode("hours", forKey: .every)
                try container.encode(count, forKey: .count)
            case let .daily(hour, minute):
                try container.encode(DailyAt(hour: hour, minute: minute), forKey: .dailyAt)
            }
        }
    }

    /// `PUT /settings/jobs/{id}` body: nil puts the job back to its default.
    struct JobIntervalBody: Encodable, Sendable {
        let interval: JobInterval?

        func encode(to encoder: Encoder) throws {
            enum Key: String, CodingKey { case interval }
            var container = encoder.container(keyedBy: Key.self)
            // null, not a missing key: "back to the default".
            try container.encode(interval, forKey: .interval)
        }
    }

    // MARK: Logs

    enum LogLevel: OpenEnum {
        case debug
        case info
        case warn
        case error
        case unknown(String)

        static let knownCases: [LogLevel] = [.debug, .info, .warn, .error]

        var rawValue: String {
            switch self {
            case .debug: return "debug"
            case .info: return "info"
            case .warn: return "warn"
            case .error: return "error"
            case let .unknown(raw): return raw
            }
        }

        var title: String {
            switch self {
            case .debug: return String(localized: "Debug")
            case .info: return String(localized: "Info")
            case .warn: return String(localized: "Warning")
            case .error: return String(localized: "Error")
            case let .unknown(raw): return raw
            }
        }
    }

    /// One line of `GET /settings/logs`, secrets already masked.
    struct LogEntry: Codable, Hashable, Sendable, Identifiable {
        let id: Int
        let time: Date
        let level: LogLevel
        /// The subsystem ("plex-sync"), or "server".
        let source: String
        let message: String

        /// How Copy and Download write it.
        var textLine: String {
            "\(time.formatted(.iso8601)) \(level.rawValue.uppercased()) [\(source)] \(message)"
        }
    }

    struct LogsResponse: Codable, Hashable, Sendable {
        let results: [LogEntry]
        /// The newest line's id, whatever the filter: the next `after`.
        let latestId: Int
    }

    // MARK: Override rules

    struct RuleKeyword: Codable, Hashable, Sendable, Identifiable {
        let id: Int
        let name: String
    }

    /// A rule of `GET /settings/override-rules`: requests whose title and
    /// requester match go to `serverId` with these picks (nil keeps the
    /// server's default). Empty lists are "any".
    struct OverrideRule: Codable, Hashable, Sendable, Identifiable {
        var id: String
        var serverId: String
        var name: String
        var enabled: Bool
        var genres: [Int]
        var languages: [String]
        var keywords: [RuleKeyword]
        var userIds: [String]
        var qualityProfileId: Int?
        var rootFolderPath: String?
        var tags: [Int]?
        var position: Int

        /// A new rule for this server, matching every request.
        static func blank(serverId: String) -> OverrideRule {
            OverrideRule(
                id: "", serverId: serverId, name: "", enabled: true, genres: [], languages: [], keywords: [],
                userIds: [], qualityProfileId: nil, rootFolderPath: nil, tags: nil, position: 0
            )
        }

        var hasConditions: Bool { !(genres.isEmpty && languages.isEmpty && keywords.isEmpty && userIds.isEmpty) }
    }

    /// The body of `POST /settings/override-rules` and `PUT …/{id}`.
    struct OverrideRuleBody: Encodable, Sendable {
        let serverId: String
        let name: String
        let enabled: Bool
        let genres: [Int]
        let languages: [String]
        let keywords: [RuleKeyword]
        let userIds: [String]
        let qualityProfileId: Int?
        let rootFolderPath: String?
        let tags: [Int]?

        init(_ rule: OverrideRule) {
            serverId = rule.serverId
            name = rule.name.trimmingCharacters(in: .whitespacesAndNewlines)
            enabled = rule.enabled
            genres = rule.genres
            languages = rule.languages
            keywords = rule.keywords
            userIds = rule.userIds
            qualityProfileId = rule.qualityProfileId
            rootFolderPath = rule.rootFolderPath
            tags = (rule.tags ?? []).isEmpty ? nil : rule.tags
        }

        func encode(to encoder: Encoder) throws {
            enum Key: String, CodingKey {
                case serverId, name, enabled, genres, languages, keywords, userIds, qualityProfileId, rootFolderPath, tags
            }
            var container = encoder.container(keyedBy: Key.self)
            try container.encode(serverId, forKey: .serverId)
            try container.encode(name, forKey: .name)
            try container.encode(enabled, forKey: .enabled)
            try container.encode(genres, forKey: .genres)
            try container.encode(languages, forKey: .languages)
            try container.encode(keywords, forKey: .keywords)
            try container.encode(userIds, forKey: .userIds)
            // null clears a pick (the server's default again).
            try container.encode(qualityProfileId, forKey: .qualityProfileId)
            try container.encode(rootFolderPath, forKey: .rootFolderPath)
            try container.encode(tags, forKey: .tags)
        }
    }

    struct OverrideRuleSaved: Codable, Hashable, Sendable {
        let rule: OverrideRule
    }

    /// `GET /settings/discover/lookup?type=keyword|genre` rows, as a rule
    /// uses them.
    struct LookupResult: Codable, Hashable, Sendable {
        let tmdbId: Int
        let name: String
    }

    // MARK: Remove from Sonarr/Radarr

    struct RemoveFromArrBody: Encodable, Sendable {
        let deleteFiles: Bool
        let is4k: Bool?
    }

    struct RemoveFromArrResult: Codable, Hashable, Sendable {
        /// The servers that took it off.
        let removedFrom: [String]
        /// The ones that had it but didn't.
        let failed: [String]
        let requestsMarked: Int
    }

    // MARK: Blocking automatically

    /// `POST /settings/blocklist` (and `/preview`) with a `kind` (0.58+).
    struct BlockRuleBody: Encodable, Sendable {
        let kind: String
        var keyword: String?
        var region: String?
        var certification: String?
        var reason: String?
    }

    struct BlockPreviewTitle: Codable, Hashable, Sendable, Identifiable {
        let mediaType: MediaType
        let tmdbId: Int
        let name: String
        let year: String?

        var id: String { "\(mediaType.rawValue):\(tmdbId)" }
        var label: String { year.map { "\(name) (\($0))" } ?? name }
    }

    struct BlockPreviewRequest: Codable, Hashable, Sendable, Identifiable {
        let id: String
        let title: String
    }

    /// `POST /settings/blocklist/preview`: what a rule would block.
    struct BlockPreview: Codable, Hashable, Sendable {
        let titles: [BlockPreviewTitle]
        let scanned: Int
        let matched: Int
        let pendingRequests: [BlockPreviewRequest]
    }
}
