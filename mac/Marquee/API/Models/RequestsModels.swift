import Foundation

// Requests (api-v1.md §7): a member's own list, the admin's review queue and history.

extension API {
    /// Who requested (or acted on) something.
    struct RequestPerson: Codable, Hashable, Sendable {
        /// nil where the underlying query doesn't carry it.
        let userId: UUID?
        let displayName: String?
        let username: String
        /// What the website prints: display name, else username.
        let label: String
    }

    /// lib/requests/labels.ts `seasonsLabel`, for when the server didn't send
    /// its own label: nil for nil (the whole series) or an empty list;
    /// `[2]` → "Season 2", `[1,2,3,5,7,8]` → "Seasons 1–3, 5, 7–8",
    /// `[0]` → "Specials", `[0,1]` → "Specials, Season 1".
    static func seasonsLabel(_ seasons: [Int]?) -> String? {
        guard let seasons else { return nil }
        let sorted = Array(Set(seasons)).sorted()
        guard !sorted.isEmpty else { return nil }
        var parts: [String] = []
        if sorted.contains(0) { parts.append("Specials") }
        let numbered = sorted.filter { $0 != 0 }
        if let first = numbered.first {
            var runs: [String] = []
            var start = first
            var end = first
            func close() { runs.append(start == end ? "\(start)" : "\(start)–\(end)") }
            for number in numbered.dropFirst() {
                if number == end + 1 {
                    end = number
                } else {
                    close()
                    start = number
                    end = number
                }
            }
            close()
            parts.append((numbered.count == 1 ? "Season " : "Seasons ") + runs.joined(separator: ", "))
        }
        return parts.joined(separator: ", ")
    }

    /// components/request-title.tsx: the small line under a request's title,
    /// the seasons and "In 4K" joined with " · "; nil when there's neither.
    static func requestDetailLine(_ seasons: String?, is4k: Bool) -> String? {
        let parts = [seasons.nonBlank, is4k ? "In 4K" : nil].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    /// `POST /titles/{type}/{tmdbId}/request` response.
    struct RequestCreated: Codable, Hashable, Sendable {
        let ok: Bool
        let requestId: UUID
    }

    /// `POST /titles/{type}/{tmdbId}/request-all-missing` response: some titles
    /// can be refused (request limits, the blocklist) while the rest go through.
    struct RequestAllMissingResult: Codable, Hashable, Sendable {
        struct Refusal: Codable, Hashable, Sendable {
            let mediaType: MediaType
            let tmdbId: Int
            let title: String
            let error: String
        }

        let ok: Bool
        /// How many titles were in the set.
        let total: Int
        /// How many requests were filed.
        let requested: Int
        let refused: [Refusal]
        /// The line to show: "Requested 2 of 4. You've used your 2 movie requests…"
        let message: String
    }

    /// `GET /requests/mine`: your own requests, newest first.
    struct MyRequest: Codable, Hashable, Sendable, Identifiable {
        let id: UUID
        let mediaType: MediaType
        let tmdbId: Int
        let title: String
        let posterPath: ImageRef?
        let status: RequestStatus
        let manuallyApproved: Bool
        /// Why the admin declined it; nil unless `status` is `.rejected` and a
        /// reason was given. Shown under the "Declined" pill.
        let rejectionReason: String?
        /// Live for approved requests only.
        let libraryStatus: LibraryStatus?
        /// "Pending review", "Declined", "In your library", "Downloading",
        /// "Coming soon", "Manually approved" or "Approved".
        let statusLabel: String
        let statusTone: RequestTone
        let createdAt: Date
        let reviewedAt: Date?
        /// The requested seasons (TV); nil for a whole series, a movie, or a
        /// server older than season requests.
        let seasons: [Int]?
        /// "Seasons 1–3", nil when `seasons` is.
        let seasonsLabel: String?
        /// Asked for in 4K (0.37+); nil from an older server, meaning no.
        let is4k: Bool?
        /// 0.46+: true while it's pending — "Edit" (`PATCH /requests/{id}`)
        /// and "Cancel request" (`DELETE /requests/{id}`). nil from an older
        /// server, meaning neither.
        var canEdit: Bool? = nil
        var canCancel: Bool? = nil
        /// 0.46+: when its seasons or 4K last changed; nil if never.
        var editedAt: Date? = nil
        /// 0.46+: comments in its conversation. nil from an older server,
        /// which has no conversations (no "Comments" then).
        var commentCount: Int? = nil

        var titleID: TitleID { TitleID(mediaType, tmdbId) }
        /// The seasons in words, sent or computed locally.
        var seasonsText: String? { seasonsLabel.nonBlank ?? API.seasonsLabel(seasons) }
        /// What the requests screens print under the title: "Season 2 · In 4K",
        /// "In 4K", "Seasons 1–3", or nil.
        var detailLine: String? { API.requestDetailLine(seasonsText, is4k: is4k == true) }
        /// Offer "Edit".
        var offersEdit: Bool { canEdit == true }
        /// Offer "Cancel request".
        var offersCancel: Bool { canCancel == true }
        /// The server has conversations (0.46+): show "Comments (N)".
        var hasConversation: Bool { commentCount != nil }
        /// An approved request on a 0.46+ server says "Need a change? Ask in its comments."
        var showsAskInCommentsHint: Bool { hasConversation && status == .approved }
    }

    /// `GET /requests/pending`: the admin's review queue.
    struct PendingRequests: Codable, Hashable, Sendable {
        /// The admin's Sonarr base URL (nil if not connected), for "Add manually in Sonarr".
        let sonarrUrl: String?
        /// The preset reasons the website's Reject chooser offers, in order.
        /// Empty from a server older than 0.28, which didn't send any.
        let rejectionReasons: [String]
        /// Newest first. Empty → "No pending requests."; "Approve all" only
        /// when more than one is pending.
        let results: [PendingRequest]

        /// The website's presets as of 0.28, offered when the server sent no
        /// list: an older server still takes the reason as free text, so the
        /// chooser works against it too.
        static let defaultRejectionReasons: [String] = [
            "Already available on a streaming service we have",
            "Not released yet, ask again once it's out",
            "Not enough space on the server right now",
            "Not a fit for the household library",
            "Couldn't find a good copy of it",
        ]

        /// What the Reject chooser lists: the server's reasons, else the built-in ones.
        var rejectionReasonChoices: [String] {
            rejectionReasons.isEmpty ? Self.defaultRejectionReasons : rejectionReasons
        }

        init(sonarrUrl: String?, rejectionReasons: [String] = [], results: [PendingRequest]) {
            self.sonarrUrl = sonarrUrl
            self.rejectionReasons = rejectionReasons
            self.results = results
        }

        /// `rejectionReasons` is optional on the wire so a pre-0.28 server's
        /// queue still decodes; everything else is as the doc specifies.
        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            sonarrUrl = try container.decodeIfPresent(String.self, forKey: .sonarrUrl)
            rejectionReasons = try container.decodeIfPresent([String].self, forKey: .rejectionReasons) ?? []
            results = try container.decode([PendingRequest].self, forKey: .results)
        }

        private enum CodingKeys: String, CodingKey {
            case sonarrUrl, rejectionReasons, results
        }

        /// `{sonarrUrl}/add/new?term={title}`: offered when approving a TV
        /// request fails with "Couldn't resolve this show for Sonarr."
        func manualSonarrAddURL(for request: PendingRequest) -> URL? {
            guard let base = sonarrUrl.nonBlank else { return nil }
            var trimmed = base
            while trimmed.hasSuffix("/") { trimmed.removeLast() }
            guard var components = URLComponents(string: trimmed + "/add/new") else { return nil }
            components.queryItems = [URLQueryItem(name: "term", value: request.title)]
            // encodeURIComponent semantics: a literal "+" would read as a space.
            let query = components.percentEncodedQuery?.replacingOccurrences(of: "+", with: "%2B")
            components.percentEncodedQuery = query
            return components.url
        }
    }

    struct PendingRequest: Codable, Hashable, Sendable, Identifiable {
        let id: UUID
        let mediaType: MediaType
        let tmdbId: Int
        let title: String
        let posterPath: ImageRef?
        let requestedBy: RequestPerson
        let createdAt: Date
        /// The requested seasons (TV); nil for a whole series, a movie, or a
        /// server older than season requests.
        let seasons: [Int]?
        /// "Seasons 1–3", nil when `seasons` is.
        let seasonsLabel: String?
        /// Asked for in 4K (0.37+); nil from an older server, meaning no.
        let is4k: Bool?
        /// 0.46+: when the requester (or a reviewer) last changed its seasons
        /// or 4K — "Changed since asking". nil if never, and from an older server.
        var editedAt: Date? = nil
        /// 0.46+: comments in its conversation; nil from an older server
        /// (no "Comments" and no "Edit" then).
        var commentCount: Int? = nil

        var titleID: TitleID { TitleID(mediaType, tmdbId) }
        /// The seasons in words, sent or computed locally.
        var seasonsText: String? { seasonsLabel.nonBlank ?? API.seasonsLabel(seasons) }
        /// What the requests screens print under the title: "Season 2 · In 4K",
        /// "In 4K", "Seasons 1–3", or nil.
        var detailLine: String? { API.requestDetailLine(seasonsText, is4k: is4k == true) }
        /// The server has the request lifecycle (0.46+): "Edit" and "Comments (N)".
        var hasConversation: Bool { commentCount != nil }
        /// "Changed since asking".
        var wasChanged: Bool { editedAt != nil }
    }

    /// `GET /requests/history`: "Past requests", the 50 most recently reviewed.
    struct ReviewedRequest: Codable, Hashable, Sendable, Identifiable {
        let id: UUID
        let mediaType: MediaType
        let tmdbId: Int
        let title: String
        let posterPath: ImageRef?
        let status: RequestStatus
        let manuallyApproved: Bool
        /// Why it was declined; nil unless `status` is `.rejected` and the
        /// admin gave one. Shown under the "Rejected" pill.
        let rejectionReason: String?
        /// "Approved", "Manually approved" or "Rejected".
        let statusLabel: String
        /// `userId` is always nil here.
        let requestedBy: RequestPerson
        let createdAt: Date
        let reviewedAt: Date?
        /// The requested seasons (TV); nil for a whole series, a movie, or a
        /// server older than season requests.
        let seasons: [Int]?
        /// "Seasons 1–3", nil when `seasons` is.
        let seasonsLabel: String?
        /// Asked for in 4K (0.37+); nil from an older server, meaning no.
        let is4k: Bool?
        /// Where an approved request was added (0.43+); nil for rejected and
        /// manually approved ones, anything approved earlier, and older servers.
        var addedTo: AddedTo? = nil
        /// When Sonarr/Radarr's failure to find it put it under "Can't find"
        /// (0.46+); nil otherwise, and from an older server. A red "Can't
        /// find" pill next to "Approved".
        var notFoundSince: Date? = nil
        /// 0.46+: approved, but Sonarr/Radarr couldn't be reached or errored
        /// when adding it — listed under "Couldn't add" instead of "Past
        /// requests". nil otherwise, and from an older server.
        var addFailed: AddFailure? = nil
        /// 0.46+: comments in its conversation; nil from an older server.
        var commentCount: Int? = nil

        /// `addFailed`: the error, and when adding it was last tried.
        struct AddFailure: Codable, Hashable, Sendable {
            let error: String
            let since: Date
        }

        var titleID: TitleID { TitleID(mediaType, tmdbId) }
        /// Listed under "Couldn't add" rather than "Past requests".
        var couldntAdd: Bool { addFailed != nil }
        /// The server has conversations (0.46+): "Comments (N)".
        var hasConversation: Bool { commentCount != nil }
        /// "Susan · approved Sep 17, 2026 · last tried Sep 17, 2026 at 7:02 PM",
        /// under a "Couldn't add" row's title; nil when it isn't one.
        var couldntAddLine: String? {
            guard let addFailed else { return nil }
            return [
                requestedBy.label,
                "approved \(Format.shortDate(reviewedAt ?? addFailed.since))",
                "last tried \(Format.dateTime(addFailed.since))",
            ].joined(separator: " · ")
        }
        /// Show the "Can't find" pill.
        var isNotFound: Bool { status == .approved && notFoundSince != nil }
        /// The seasons in words, sent or computed locally.
        var seasonsText: String? { seasonsLabel.nonBlank ?? API.seasonsLabel(seasons) }
        /// What the requests screens print under the title: "Season 2 · In 4K",
        /// "In 4K", "Seasons 1–3", or nil.
        var detailLine: String? { API.requestDetailLine(seasonsText, is4k: is4k == true) }
        /// "Added to Radarr 2", under the Approved badge; nil when the server
        /// wasn't recorded or has since been removed.
        var addedToLine: String? { addedTo?.serverName.nonBlank.map { "Added to \($0)" } }
    }

    /// `GET /requests/not-found` (reviewers, 0.46+): "Can't find", approved
    /// and released requests Sonarr/Radarr still has nothing for.
    struct NotFoundRequests: Codable, Hashable, Sendable {
        /// The Can't Find Check's wait, for the section's blurb.
        let afterHours: Int
        /// Longest-missing first. Empty → the section is hidden.
        let results: [NotFoundRequest]

        static let empty = NotFoundRequests(afterHours: NotFoundSettings.defaultAfterHours, results: [])

        /// The section's blurb, as on the website.
        var blurb: String {
            "Approved and released, but Sonarr/Radarr still has nothing \(afterHours) hour\(afterHours == 1 ? "" : "s") or more after approval. Most often no indexer has a copy yet."
        }
    }

    /// One "Can't find" row (components/not-found-section.tsx `NotFoundCard`).
    struct NotFoundRequest: Codable, Hashable, Sendable, Identifiable {
        /// The Sonarr/Radarr the approval added it to; `id`/`name` nil when
        /// unknown. `kind` is kept as the server's string.
        struct Server: Codable, Hashable, Sendable {
            let id: String?
            let name: String?
            /// "sonarr" or "radarr".
            let kind: String

            /// "Radarr" or "Sonarr", for "Open in Radarr" and "Radarr is searching again…".
            var kindName: String { kind.lowercased() == "radarr" ? "Radarr" : "Sonarr" }
        }

        let id: UUID
        let mediaType: MediaType
        let tmdbId: Int
        let title: String
        let posterPath: ImageRef?
        let seasons: [Int]?
        let seasonsLabel: String?
        let is4k: Bool?
        let requestedBy: RequestPerson
        let createdAt: Date
        let reviewedAt: Date?
        let notFoundSince: Date
        let server: Server
        /// The title's page in Sonarr/Radarr, for "Open in Radarr"; nil when unknown.
        let arrUrl: String?
        /// The tip under the actions.
        let hint: String?

        var titleID: TitleID { TitleID(mediaType, tmdbId) }
        /// The seasons in words, sent or computed locally.
        var seasonsText: String? { seasonsLabel.nonBlank ?? API.seasonsLabel(seasons) }
        /// "Season 2 · In 4K", "In 4K", "Seasons 1–3", or nil.
        var detailLine: String? { API.requestDetailLine(seasonsText, is4k: is4k == true) }
        /// "Open in Radarr"'s address, when the server sent one a browser can open.
        var arrURL: URL? {
            guard let raw = arrUrl.nonBlank, let url = URL(string: raw),
                  let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else { return nil }
            return url
        }
        /// "Open in Radarr" / "Open in Sonarr".
        var openInArrTitle: String { "Open in \(server.kindName)" }
        /// "Radarr is searching again…" after Search again, with the server's
        /// own name when it has one ("Radarr 4K is searching again…").
        var searchingAgainLine: String { "\(server.name.nonBlank ?? server.kindName) is searching again…" }

        /// "Susan · can't find for 3 days (since 9/18/2026) · Radarr".
        func summaryLine(now: Date = Date()) -> String {
            var parts = [
                requestedBy.label,
                "can't find for \(API.notFoundAgeLabel(since: notFoundSince, now: now)) (since \(Format.shortDate(notFoundSince)))",
            ]
            if let name = server.name.nonBlank { parts.append(name) }
            return parts.joined(separator: " · ")
        }
    }

    /// lib/requests/not-found-rules.ts `notFoundAgeLabel`: "under an hour",
    /// "1 hour", "30 hours" (under 48), then whole days: "3 days".
    static func notFoundAgeLabel(since: Date, now: Date) -> String {
        let hours = max(0, Int((now.timeIntervalSince(since) / 3600).rounded(.down)))
        if hours < 1 { return "under an hour" }
        if hours < 48 { return hours == 1 ? "1 hour" : "\(hours) hours" }
        return "\(hours / 24) days"
    }

    /// `POST /requests/approve-all`.
    struct ApproveAllResult: Codable, Hashable, Sendable {
        let ok: Bool
        let approvedCount: Int
        let failedCount: Int
        /// "1 request(s) couldn't be approved.", nil when nothing failed.
        let message: String?
    }
}

extension APIError {
    /// The server's message when approving (or adding) a TV title Sonarr can't
    /// resolve; control flow depends on it.
    static let sonarrUnresolvableMessage = "Couldn't resolve this show for Sonarr."

    /// Approving a TV request failed because Sonarr couldn't resolve the show:
    /// offer "Manually approve" and "Add manually in Sonarr".
    var isSonarrUnresolvable: Bool {
        if case let .conflict(message) = self { return message == Self.sonarrUnresolvableMessage }
        return false
    }
}
