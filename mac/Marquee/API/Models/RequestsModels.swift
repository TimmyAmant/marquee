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

    /// `POST /titles/{type}/{tmdbId}/request` response.
    struct RequestCreated: Codable, Hashable, Sendable {
        let ok: Bool
        let requestId: UUID
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
        /// Live for approved requests only.
        let libraryStatus: LibraryStatus?
        /// "Pending review", "Declined", "In your library", "Downloading",
        /// "Coming soon", "Manually approved" or "Approved".
        let statusLabel: String
        let statusTone: RequestTone
        let createdAt: Date
        let reviewedAt: Date?

        var titleID: TitleID { TitleID(mediaType, tmdbId) }
    }

    /// `GET /requests/pending`: the admin's review queue.
    struct PendingRequests: Codable, Hashable, Sendable {
        /// The admin's Sonarr base URL (nil if not connected), for "Add manually in Sonarr".
        let sonarrUrl: String?
        /// Newest first. Empty → "No pending requests."; "Approve all" only
        /// when more than one is pending.
        let results: [PendingRequest]

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

        var titleID: TitleID { TitleID(mediaType, tmdbId) }
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
        /// "Approved", "Manually approved" or "Rejected".
        let statusLabel: String
        /// `userId` is always nil here.
        let requestedBy: RequestPerson
        let createdAt: Date
        let reviewedAt: Date?

        var titleID: TitleID { TitleID(mediaType, tmdbId) }
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
