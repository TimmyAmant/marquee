import Foundation

// Settings → About and the Releases page (api-v1.md §14).

extension API {
    /// `GET /settings/about`. Counts are the household library's.
    struct AboutInfo: Codable, Hashable, Sendable {
        let version: String
        /// Owned movies.
        let movieCount: Int
        /// Owned shows.
        let tvCount: Int
        /// Tracked but not owned.
        let trackedCount: Int
        let totalRequests: Int
        /// The server's IANA time zone.
        let timeZone: String
        let repoUrl: String
        let issuesUrl: String

        /// "v0.22.0".
        var versionLabel: String { "v\(version)" }
        var repoURL: URL? { URL(string: repoUrl) }
        var issuesURL: URL? { URL(string: issuesUrl) }
    }

    /// `GET /changelog`: one release, newest first.
    struct ChangelogEntry: Codable, Hashable, Sendable, Identifiable {
        let version: String
        let date: CalendarDay
        let changes: [String]

        var id: String { version }

        /// "Today", "1 day ago", "12 days ago".
        func daysAgo(now: Date = Date()) -> String {
            Format.daysAgo(date.string, now: now)
        }
    }
}
