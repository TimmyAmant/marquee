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
        if sorted.contains(0) { parts.append(String(localized: "Specials")) }
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
            let list = runs.joined(separator: ", ")
            parts.append(numbered.count == 1 ? String(localized: "Season \(list)") : String(localized: "Seasons \(list)"))
        }
        return parts.joined(separator: ", ")
    }

    /// components/request-title.tsx: the small line under a request's title,
    /// the seasons and "In 4K" joined with " · "; nil when there's neither.
    static func requestDetailLine(_ seasons: String?, is4k: Bool) -> String? {
        let parts = [seasons.nonBlank, is4k ? String(localized: "In 4K") : nil].compactMap { $0 }
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
        /// 0.53+: the title's backdrop, faded behind the row.
        var backdropPath: ImageRef? = nil
        /// 0.53+: who approved or declined it by hand.
        var reviewedBy: RequestPerson? = nil
        /// 0.68+: approved, then the admin removed the title from
        /// Sonarr/Radarr ("Removed", in the declined tone); nil otherwise.
        var removedAt: Date? = nil
        /// 0.68+: why it was removed, when the admin said.
        var removedReason: String? = nil

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
        /// Taken off Sonarr/Radarr again since it was approved.
        var isRemoved: Bool { status == .approved && removedAt != nil }
        /// "Reason: …" under the pill: why it was declined, or removed.
        var reason: String? { isRemoved ? removedReason.nonBlank : rejectionReason.nonBlank }
        /// An approved request on a 0.46+ server says "Need a change? Ask in its comments."
        var showsAskInCommentsHint: Bool { hasConversation && status == .approved && !isRemoved }
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
            String(localized: "Already available on a streaming service we have"),
            String(localized: "Not released yet, ask again once it's out"),
            String(localized: "Not enough space on the server right now"),
            String(localized: "Not a fit for the household library"),
            String(localized: "Couldn't find a good copy of it"),
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
        /// 0.53+: the title's backdrop, faded behind the row.
        var backdropPath: ImageRef? = nil

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

    /// `GET /requests/history`: "Past requests", the 500 most recently reviewed (50 before 0.76.3).
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
        /// "Approved", "Manually approved", "Removed" (0.68+) or "Rejected".
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
        /// 0.53+: the title's backdrop, faded behind the row.
        var backdropPath: ImageRef? = nil
        /// 0.53+: who approved or declined it by hand; nil when it was
        /// approved automatically.
        var reviewedBy: RequestPerson? = nil
        /// 0.68+: approved, then the admin removed the title from
        /// Sonarr/Radarr ("Removed", neutral like Rejected); nil otherwise.
        var removedAt: Date? = nil
        /// 0.68+: why it was removed, when the admin said.
        var removedReason: String? = nil

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
                String(localized: "approved \(Format.shortDate(reviewedAt ?? addFailed.since))"),
                String(localized: "last tried \(Format.dateTime(addFailed.since))"),
            ].joined(separator: " · ")
        }
        /// Show the "Can't find" pill.
        var isNotFound: Bool { status == .approved && notFoundSince != nil && !isRemoved }
        /// Taken off Sonarr/Radarr again since it was approved.
        var isRemoved: Bool { status == .approved && removedAt != nil }
        /// "Reason: …" under the pill: why it was declined, or removed.
        var reason: String? { isRemoved ? removedReason.nonBlank : rejectionReason.nonBlank }
        /// The pill: approved (and still there) in the owned tone, anything
        /// else — rejected, removed — neutral.
        var statusTone: BadgeTone { status == .approved && !isRemoved ? .owned : .neutral }
        /// 0.68+ "Can't get it": approved and still on the server (not under
        /// "Couldn't add", which has its own Decline) — decline it after all.
        var offersCantGetIt: Bool { status == .approved && !isRemoved && !couldntAdd }
        /// The seasons in words, sent or computed locally.
        var seasonsText: String? { seasonsLabel.nonBlank ?? API.seasonsLabel(seasons) }
        /// What the requests screens print under the title: "Season 2 · In 4K",
        /// "In 4K", "Seasons 1–3", or nil.
        var detailLine: String? { API.requestDetailLine(seasonsText, is4k: is4k == true) }
        /// "Added to Radarr 2", under the Approved badge; nil when the server
        /// wasn't recorded or has since been removed.
        var addedToLine: String? {
            guard !isRemoved else { return nil }
            return addedTo?.serverName.nonBlank.map { String(localized: "Added to \($0)") }
        }
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
            String(localized: "Approved and released, but Sonarr/Radarr still has nothing \(afterHours) hours or more after approval. Most often no indexer has a copy yet.")
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
        var openInArrTitle: String { String(localized: "Open in \(server.kindName)") }
        /// "Radarr is searching again…" after Search again, with the server's
        /// own name when it has one ("Radarr 4K is searching again…").
        var searchingAgainLine: String { String(localized: "\(server.name.nonBlank ?? server.kindName) is searching again…") }

        /// "Susan · can't find for 3 days (since 9/18/2026) · Radarr".
        func summaryLine(now: Date = Date()) -> String {
            var parts = [
                requestedBy.label,
                String(localized: "can't find for \(API.notFoundAgeLabel(since: notFoundSince, now: now)) (since \(Format.shortDate(notFoundSince)))"),
            ]
            if let name = server.name.nonBlank { parts.append(name) }
            return parts.joined(separator: " · ")
        }
    }

    /// lib/requests/not-found-rules.ts `notFoundAgeLabel`: "under an hour",
    /// "1 hour", "30 hours" (under 48), then whole days: "3 days".
    static func notFoundAgeLabel(since: Date, now: Date) -> String {
        let hours = max(0, Int((now.timeIntervalSince(since) / 3600).rounded(.down)))
        if hours < 1 { return String(localized: "under an hour") }
        if hours < 48 { return String(localized: "\(hours) hours") }
        let days = hours / 24
        return String(localized: "\(days) days")
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
    static let sonarrUnresolvableMessage = "Couldn't resolve this show for Sonarr." // i18n-ignore

    /// Approving a TV request failed because Sonarr couldn't resolve the show:
    /// offer "Manually approve" and "Add manually in Sonarr".
    var isSonarrUnresolvable: Bool {
        if case .sonarrUnresolvable = self { return true }
        // A server older than 0.50 sends no reason, and always English.
        if case let .conflict(message) = self { return message == Self.sonarrUnresolvableMessage }
        return false
    }

    static var sonarrUnresolvableFallback: String {
        String(localized: "Couldn't resolve this show for Sonarr.")
    }
}
