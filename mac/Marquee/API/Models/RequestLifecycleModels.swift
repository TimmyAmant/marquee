import Foundation

// The request lifecycle and conversations (api-v1.md §7, 0.46+, deviation
// 16): changing or cancelling a pending request, "Couldn't add" and Retry,
// your requests on the title page, and the comment thread on each request
// and problem report. A server older than 0.46 answers 404 on all of it and
// leaves the new fields out; the app then hides Edit, Cancel, Retry and
// the comments.

extension API {
    // MARK: Changing a request

    /// `PATCH /requests/{id}`'s `seasons`: absent (unchanged), `null` (the
    /// whole series) or the seasons to ask for — three different bodies.
    enum SeasonsChange: Hashable, Sendable {
        /// No `seasons` key at all.
        case unchanged
        /// `"seasons": null`.
        case wholeSeries
        /// `"seasons": [1, 2]`, sorted and without repeats.
        case seasons([Int])
    }

    /// `PATCH /requests/{id}` body: every field optional, absent = unchanged.
    struct RequestEdit: Encodable, Hashable, Sendable {
        var seasons: SeasonsChange = .unchanged
        /// Ask for the 4K copy (always the whole title), or back to the
        /// regular one; nil leaves it as it is.
        var is4k: Bool?

        init(seasons: SeasonsChange = .unchanged, is4k: Bool? = nil) {
            self.seasons = seasons
            self.is4k = is4k
        }

        private enum CodingKeys: String, CodingKey {
            case seasons, is4k
        }

        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            switch seasons {
            case .unchanged: break
            case .wholeSeries: try container.encodeNil(forKey: .seasons)
            case let .seasons(list): try container.encode(Array(Set(list)).sorted(), forKey: .seasons)
            }
            try container.encodeIfPresent(is4k, forKey: .is4k)
        }
    }

    /// `GET /requests/{id}/edit-options`: what "Edit" can offer.
    struct RequestEditOptions: Codable, Hashable, Sendable {
        /// One season picker row.
        struct SeasonRow: Codable, Hashable, Sendable, Identifiable {
            let seasonNumber: Int
            let name: String
            let episodeCount: Int
            let state: EditSeasonState

            var id: Int { seasonNumber }

            /// The picker's row: a checkbox, or why there isn't one.
            var requestState: SeasonRequestState {
                switch state {
                case .requestable: .requestable
                case .complete: .inLibrary
                case .monitored: .monitored
                case .requested: .requested
                case .unavailable, .unknown: .unavailable
                }
            }
        }

        let requestId: UUID
        let mediaType: MediaType
        let title: String
        /// As it is now: nil is the whole series (and every movie).
        let seasons: [Int]?
        let is4k: Bool
        /// TV: the show's seasons, newest first; `requestable` ones can be
        /// ticked (this request's own included). Empty for a movie.
        let seasonRows: [SeasonRow]
        /// "In 4K" can be offered.
        let fourKAvailable: Bool

        var isTV: Bool { mediaType == .tv }
        /// A movie without 4K has nothing to change.
        var hasAnythingToChange: Bool { isTV || fourKAvailable }
    }

    /// `seasonRows[].state`.
    enum EditSeasonState: OpenEnum {
        case requestable
        case complete
        case monitored
        case requested
        case unavailable
        case unknown(String)

        static let knownCases: [EditSeasonState] = [.requestable, .complete, .monitored, .requested, .unavailable]

        var rawValue: String {
            switch self {
            case .requestable: return "requestable"
            case .complete: return "complete"
            case .monitored: return "monitored"
            case .requested: return "requested"
            case .unavailable: return "unavailable"
            case let .unknown(raw): return raw
            }
        }
    }

    // MARK: Your requests on the title page

    /// `viewer.myRequests[]`: one of the viewer's own requests for the title.
    struct TitleRequestSummary: Codable, Hashable, Sendable, Identifiable {
        let id: UUID
        let status: RequestStatus
        let seasons: [Int]?
        let seasonsLabel: String?
        let is4k: Bool
        /// Still pending: "Edit" and "Cancel request".
        let canEdit: Bool
        let canCancel: Bool
        let commentCount: Int
        let createdAt: Date

        /// "Season 2 · In 4K", "In 4K", or nil.
        var detailLine: String? {
            API.requestDetailLine(seasonsLabel.nonBlank ?? API.seasonsLabel(seasons), is4k: is4k)
        }

        /// components/my-title-requests.tsx: "Your request (Season 2) is
        /// waiting for review" / "is approved" / "is declined".
        var sentence: String {
            let what = detailLine.map { " (\($0))" } ?? ""
            let standing: String
            switch status {
            case .pending: standing = "waiting for review"
            case .approved: standing = "approved"
            case .rejected: standing = "declined"
            case let .unknown(raw): standing = raw
            }
            return "Your request\(what) is \(standing)"
        }
    }

    // MARK: Conversations

    /// Whose conversation: a request's or a problem report's.
    enum CommentParent: Hashable, Sendable {
        case request(UUID)
        case issue(UUID)

        /// `/requests/{id}/comments` or `/issues/{id}/comments`.
        var path: String {
            switch self {
            case let .request(id): "/requests/\(MarqueeAPI.segment(id))/comments"
            case let .issue(id): "/issues/\(MarqueeAPI.segment(id))/comments"
            }
        }
    }

    /// `GET /requests/{id}/comments` · `GET /issues/{id}/comments`.
    struct CommentThread: Codable, Hashable, Sendable {
        /// The viewer may add to it (the requester or reporter, and reviewers).
        let canComment: Bool
        /// The server's limit on a comment, in characters.
        let maxLength: Int
        /// Oldest first.
        let results: [Comment]

        /// What "Comments (N)" counts: real comments, not the notes.
        var commentCount: Int { results.filter { $0.kind == .comment }.count }
    }

    /// One message in a thread: a real comment, or one of the notes it
    /// starts with (the report, the fix note, why it was declined).
    struct Comment: Codable, Hashable, Sendable, Identifiable {
        /// A comment's id, or `report:<issue id>` etc. for the notes.
        let id: String
        let kind: CommentKind
        let author: CommentAuthor
        let body: String
        let createdAt: Date
        let editedAt: Date?
        let isMine: Bool
        /// Yours, within 15 minutes of posting.
        let canEdit: Bool
        /// As `canEdit`, or the admin at any time.
        let canDelete: Bool
        /// When `canEdit` runs out; nil for the notes.
        let editableUntil: Date?

        /// The line over the text: "Tess · Reviewer · Sep 26, 3:02 AM · edited",
        /// with "Reported" / "Marked fixed" / "Declined" for the notes.
        var headerParts: [String] {
            var parts: [String] = []
            if let role = author.role?.tag { parts.append(role) }
            if let note = kind.noteLabel { parts.append(note) }
            parts.append(Format.dateTime(createdAt))
            if editedAt != nil { parts.append("edited") }
            return parts
        }
    }

    /// `Comment.author`.
    struct CommentAuthor: Codable, Hashable, Sendable {
        /// nil once the account is gone.
        let userId: String?
        /// "Someone" once the account is gone.
        let label: String
        let avatarUrl: String?
        /// nil once the account is gone.
        let role: CommentRole?
    }

    enum CommentKind: OpenEnum {
        case comment
        /// A problem report's own note, by the reporter.
        case report
        /// The note it was marked fixed with.
        case resolution
        /// Why a request was declined.
        case declined
        case unknown(String)

        static let knownCases: [CommentKind] = [.comment, .report, .resolution, .declined]

        var rawValue: String {
            switch self {
            case .comment: return "comment"
            case .report: return "report"
            case .resolution: return "resolution"
            case .declined: return "declined"
            case let .unknown(raw): return raw
            }
        }

        /// "Reported" / "Marked fixed" / "Declined"; nil for a comment.
        var noteLabel: String? {
            switch self {
            case .report: return "Reported"
            case .resolution: return "Marked fixed"
            case .declined: return "Declined"
            case .comment, .unknown: return nil
            }
        }
    }

    enum CommentRole: OpenEnum {
        case admin
        /// A trusted member.
        case reviewer
        case member
        case unknown(String)

        static let knownCases: [CommentRole] = [.admin, .reviewer, .member]

        var rawValue: String {
            switch self {
            case .admin: return "admin"
            case .reviewer: return "reviewer"
            case .member: return "member"
            case let .unknown(raw): return raw
            }
        }

        /// "Admin" / "Reviewer" beside the name; nil for a member.
        var tag: String? {
            switch self {
            case .admin: return "Admin"
            case .reviewer: return "Reviewer"
            case .member, .unknown: return nil
            }
        }
    }

    /// `POST …/comments` and `PATCH …/comments/{commentId}` body.
    struct CommentBody: Codable, Hashable, Sendable {
        let body: String
    }

    /// `POST …/comments` response.
    struct CommentCreated: Codable, Hashable, Sendable {
        let ok: Bool
        let commentId: String
    }
}
