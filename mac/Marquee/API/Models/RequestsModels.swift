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

        var titleID: TitleID { TitleID(mediaType, tmdbId) }
        /// The seasons in words, sent or computed locally.
        var seasonsText: String? { seasonsLabel.nonBlank ?? API.seasonsLabel(seasons) }
        /// What the requests screens print under the title: "Season 2 · In 4K",
        /// "In 4K", "Seasons 1–3", or nil.
        var detailLine: String? { API.requestDetailLine(seasonsText, is4k: is4k == true) }
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

        var titleID: TitleID { TitleID(mediaType, tmdbId) }
        /// The seasons in words, sent or computed locally.
        var seasonsText: String? { seasonsLabel.nonBlank ?? API.seasonsLabel(seasons) }
        /// What the requests screens print under the title: "Season 2 · In 4K",
        /// "In 4K", "Seasons 1–3", or nil.
        var detailLine: String? { API.requestDetailLine(seasonsText, is4k: is4k == true) }
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

        var titleID: TitleID { TitleID(mediaType, tmdbId) }
        /// The seasons in words, sent or computed locally.
        var seasonsText: String? { seasonsLabel.nonBlank ?? API.seasonsLabel(seasons) }
        /// What the requests screens print under the title: "Season 2 · In 4K",
        /// "In 4K", "Seasons 1–3", or nil.
        var detailLine: String? { API.requestDetailLine(seasonsText, is4k: is4k == true) }
        /// "Added to Radarr 2", under the Approved badge; nil when the server
        /// wasn't recorded or has since been removed.
        var addedToLine: String? { addedTo?.serverName.nonBlank.map { "Added to \($0)" } }
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
