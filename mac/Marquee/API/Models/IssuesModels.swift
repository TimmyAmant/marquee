import Foundation

// Problem reports (api-v1.md §7 "Problem reports (0.38+)"): "Report a problem"
// on a title, and the Requests page's "Reported problems" / "Your problem
// reports". A server older than 0.38 has none of this (`GET /issues` is a 404,
// `viewer.canReport` is missing), and the app then shows none of it.

extension API {
    /// `POST /titles/{type}/{tmdbId}/issues` body.
    struct IssueReport: Codable, Hashable, Sendable {
        let kind: IssueKind
        /// Up to 1000 characters; required for `.other`. nil sends no key.
        let message: String?
        /// TV only: the season (0 = specials), and optionally an episode of it.
        let seasonNumber: Int?
        let episodeNumber: Int?

        /// The server's limit on `message`.
        static let maxMessageLength = 1000

        init(kind: IssueKind, message: String? = nil, seasonNumber: Int? = nil, episodeNumber: Int? = nil) {
            self.kind = kind
            self.message = message.nonBlank
            self.seasonNumber = seasonNumber
            // An episode needs its season.
            self.episodeNumber = seasonNumber == nil ? nil : episodeNumber
        }
    }

    /// `GET /issues`: the admin's open reports then the 30 latest fixed, or a
    /// member's own.
    struct IssueList: Codable, Hashable, Sendable {
        let results: [Issue]
        /// The kinds and their labels, in the report dialog's order.
        let kinds: [IssueKindOption]

        var open: [Issue] { results.filter { $0.status == .open } }
        var fixed: [Issue] { results.filter { $0.status == .resolved } }

        init(results: [Issue], kinds: [IssueKindOption] = []) {
            self.results = results
            self.kinds = kinds
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            results = try container.decode([Issue].self, forKey: .results)
            kinds = try container.decodeIfPresent([IssueKindOption].self, forKey: .kinds) ?? []
        }

        private enum CodingKeys: String, CodingKey {
            case results, kinds
        }
    }

    struct IssueKindOption: Codable, Hashable, Sendable, Identifiable {
        let id: IssueKind
        let label: String
    }

    /// One problem report (components/issues-section.tsx `IssueCard`).
    struct Issue: Codable, Hashable, Sendable, Identifiable {
        let id: UUID
        let mediaType: MediaType
        let tmdbId: Int
        let title: String
        let posterPath: ImageRef?
        let seasonNumber: Int?
        let episodeNumber: Int?
        /// "S2 E5", "Season 2", "Specials" or nil.
        let episodeLabel: String?
        let kind: IssueKind
        /// "Audio problem".
        let kindLabel: String
        let message: String?
        let status: IssueStatus
        /// The admin's note, once fixed.
        let resolution: String?
        let reportedBy: IssueReporter
        /// Yours: a member may withdraw it while it's open.
        let isMine: Bool
        let createdAt: Date
        let resolvedAt: Date?
        /// 0.46+: comments in its conversation; nil from an older server,
        /// which has no conversations (no "Comments" then).
        var commentCount: Int? = nil

        var titleID: TitleID { TitleID(mediaType, tmdbId) }

        /// "Audio problem · Member · 9/26/2026" (the reporter only for the admin).
        func summaryLine(showingReporter: Bool) -> String {
            var parts = [kindLabel.nonBlank ?? kind.label]
            if showingReporter { parts.append(reportedBy.label) }
            parts.append(Format.shortDate(createdAt))
            return parts.joined(separator: " · ")
        }

        /// "Fixed: Replaced the file", or just "Fixed" without a note.
        var fixedLine: String? {
            guard status == .resolved else { return nil }
            if let note = resolution.nonBlank { return "Fixed: \(note)" }
            return "Fixed"
        }
    }

    /// Who reported a problem. Like `RequestPerson`, but the id is kept as
    /// the server's string: nothing here needs it as a UUID, and the doc's
    /// example abbreviates it.
    struct IssueReporter: Codable, Hashable, Sendable {
        let userId: String?
        let displayName: String?
        let username: String
        /// What the website prints: display name, else username.
        let label: String
    }

    /// `POST /issues/{id}/resolve` body.
    struct IssueResolution: Codable, Hashable, Sendable {
        let note: String
        /// The server's limit on `note`.
        static let maxNoteLength = 500
    }
}
