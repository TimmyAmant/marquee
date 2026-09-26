import Foundation

// Requests (api-v1.md §7). Members see `mine()`; the admin reviews `pending()`
// and `history()`.

extension MarqueeAPI {
    struct RequestsEndpoints: Sendable {
        let transport: Transport

        /// `POST /titles/{type}/{tmdbId}/request` — "Request". Auto-approved when
        /// the admin enabled that for you. `.conflict("You've already requested this.")`.
        ///
        /// `seasons` (TV only) requests just those seasons, as `{"seasons": [1, 2]}`;
        /// the server drops the ones already monitored or complete and answers
        /// `.conflict` when nothing is left, `.invalid` for a season TMDb doesn't
        /// list. nil sends no body at all: the whole series, which is also all
        /// a server older than season requests understands.
        ///
        /// `is4k` (0.37+, `viewer.fourK.canRequest`) is "Request in 4K": sends
        /// `{"is4k": true}` and always asks for the whole title, so `seasons`
        /// is ignored. `.conflict("You've already requested this in 4K.")` etc.
        @discardableResult
        func create(_ type: API.MediaType, id tmdbId: Int, seasons: [Int]? = nil, is4k: Bool = false) async throws -> UUID {
            struct Body: Encodable, Sendable { let seasons: [Int] }
            let body: (any Encodable & Sendable)? = is4k
                ? API.FourKBody()
                : seasons.map { Body(seasons: Array(Set($0)).sorted()) }
            let result: API.RequestCreated = try await transport.mutate(
                .post, TitlesEndpoints.path(type, tmdbId) + "/request", body: body, timeout: Timeout.integrations,
                changes: [.requests, .library]
            )
            return result.requestId
        }

        /// `POST /titles/{type}/{tmdbId}/request-all-missing` — a franchise row's
        /// "Request all N missing" (members; `.forbidden` for the admin). The
        /// server works the set out from this title's collection itself and
        /// requests each; a partial result still succeeds, with `message`.
        func requestAllMissing(_ type: API.MediaType, id tmdbId: Int) async throws -> API.RequestAllMissingResult {
            try await transport.mutate(
                .post, TitlesEndpoints.path(type, tmdbId) + "/request-all-missing", body: nil, timeout: Timeout.integrations,
                changes: [.requests, .library]
            )
        }

        /// `GET /requests/mine` — your own requests, newest first.
        func mine() async throws -> [API.MyRequest] {
            let list: API.ListResponse<API.MyRequest> = try await transport.get("/requests/mine", timeout: Timeout.integrations)
            return list.results
        }

        /// `GET /requests/pending` (admin) — the review queue. Loading it first
        /// auto-approves pending requests whose title is already in the library.
        func pending() async throws -> API.PendingRequests {
            try await transport.get("/requests/pending", timeout: Timeout.integrations)
        }

        /// `GET /requests/history` (admin) — "Past requests".
        func history() async throws -> [API.ReviewedRequest] {
            let list: API.ListResponse<API.ReviewedRequest> = try await transport.get("/requests/history")
            return list.results
        }

        /// `GET /requests/not-found` (reviewers, 0.46+) — "Can't find": approved,
        /// released requests Sonarr/Radarr still has nothing for. `.notFound`
        /// from an older server (hide the section), `.forbidden` for members.
        func notFound() async throws -> API.NotFoundRequests {
            try await transport.get("/requests/not-found")
        }

        /// `POST /requests/{id}/not-found/search` (reviewers, 0.46+) — "Search
        /// again": its Sonarr/Radarr searches now; it stays listed until
        /// something is grabbed. `.notFound("That request isn't in Can't find
        /// any more.")`, `.conflict` (server gone or title missing), `.upstream`.
        func searchNotFound(_ id: UUID) async throws {
            let _: API.OK = try await transport.mutate(
                .post, "/requests/\(MarqueeAPI.segment(id))/not-found/search", timeout: Timeout.integrations, changes: .library
            )
        }

        /// `POST /requests/{id}/not-found/dismiss` (reviewers, 0.46+) — "Mark as
        /// found": off the list for good, its alerts marked read for everyone.
        func dismissNotFound(_ id: UUID) async throws {
            let _: API.OK = try await transport.mutate(
                .post, "/requests/\(MarqueeAPI.segment(id))/not-found/dismiss", changes: [.requests, .notifications]
            )
        }

        /// `GET /requests/pending-count` — always 0 for members (`badges()` has it too).
        func pendingCount() async throws -> Int {
            let count: API.Count = try await transport.get("/requests/pending-count")
            return count.count
        }

        /// `POST /requests/{id}/approve` (admin) — adds with the admin's
        /// Radarr/Sonarr and notifies the requester. On a TV request,
        /// `error.isSonarrUnresolvable` means: offer `manuallyApprove`.
        /// `overrides` (0.43+, "Advanced") pick where and how it's added; nil
        /// sends no body at all, the plain Approve it always was.
        func approve(_ id: UUID, overrides: API.AddOverrides? = nil) async throws {
            let _: API.OK = try await transport.mutate(
                .post, "/requests/\(MarqueeAPI.segment(id))/approve", body: overrides, timeout: Timeout.integrations,
                changes: [.requests, .library, .notifications]
            )
        }

        /// `POST /requests/{id}/manual-approve` (admin) — approved without touching Sonarr/Radarr.
        func manuallyApprove(_ id: UUID) async throws {
            let _: API.OK = try await transport.mutate(
                .post, "/requests/\(MarqueeAPI.segment(id))/manual-approve", changes: [.requests, .notifications]
            )
        }

        /// `POST /requests/{id}/reject` (admin): declines and notifies the
        /// requester. `reason` is free text, one of the queue's
        /// `rejectionReasons` or the admin's own words, and ends up in the
        /// requester's notification. nil sends no body at all, which is also
        /// what a pre-0.28 server expects.
        func reject(_ id: UUID, reason: String?) async throws {
            struct Body: Encodable, Sendable { let reason: String }
            let body: (any Encodable & Sendable)? = reason.map { Body(reason: $0) }
            let _: API.OK = try await transport.mutate(
                .post, "/requests/\(MarqueeAPI.segment(id))/reject", body: body, changes: [.requests, .notifications]
            )
        }

        /// Declines without saying why.
        func reject(_ id: UUID) async throws {
            try await reject(id, reason: nil)
        }

        /// `PATCH /requests/{id}` (0.46+) — "Save changes" in Edit: your own
        /// pending request, or (reviewers) anyone's before approving. A field
        /// left `.unchanged` / nil sends no key. `.conflict("It's already been
        /// reviewed, so it can't be changed. …")`, `.invalid`, `.notFound`.
        func edit(_ id: UUID, _ edit: API.RequestEdit) async throws {
            let _: API.OK = try await transport.mutate(
                .patch, "/requests/\(MarqueeAPI.segment(id))", body: edit, timeout: Timeout.integrations,
                changes: [.requests, .notifications]
            )
        }

        /// `GET /requests/{id}/edit-options` (0.46+) — what "Edit" can offer.
        /// `.notFound` (not yours, or an older server), `.conflict` once reviewed.
        func editOptions(_ id: UUID) async throws -> API.RequestEditOptions {
            try await transport.get("/requests/\(MarqueeAPI.segment(id))/edit-options", timeout: Timeout.integrations)
        }

        /// `DELETE /requests/{id}` (0.46+) — "Cancel request": your own, while
        /// it's pending. `.forbidden` for a reviewer on someone else's,
        /// `.conflict` once reviewed.
        func cancel(_ id: UUID) async throws {
            let _: API.OK = try await transport.mutate(
                .delete, "/requests/\(MarqueeAPI.segment(id))", changes: [.requests, .library, .notifications]
            )
        }

        /// `POST /requests/{id}/retry` (reviewers, 0.46+) — "Retry" under
        /// "Couldn't add": adds it again with the picks it was approved with,
        /// or `overrides` ("Advanced"); nil sends no body at all.
        func retry(_ id: UUID, overrides: API.AddOverrides? = nil) async throws {
            let _: API.OK = try await transport.mutate(
                .post, "/requests/\(MarqueeAPI.segment(id))/retry", body: overrides, timeout: Timeout.integrations,
                changes: [.requests, .library, .notifications]
            )
        }

        /// `POST /requests/approve-all` (admin) — one at a time; failures stay
        /// pending. Throws the first failure when none could be approved.
        func approveAll() async throws -> API.ApproveAllResult {
            try await transport.mutate(
                .post, "/requests/approve-all", timeout: Timeout.longRunning,
                changes: [.requests, .library, .notifications]
            )
        }
    }
}
