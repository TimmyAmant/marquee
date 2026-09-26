import Foundation

// Problem reports (api-v1.md §7, 0.38+). A member reports a problem from the
// title page; the admin sees it on the Requests page, can have Radarr/Sonarr
// look for another copy, and marks it fixed. All of it 404s on an older server.

extension MarqueeAPI {
    struct IssuesEndpoints: Sendable {
        let transport: Transport

        /// `POST /titles/{type}/{tmdbId}/issues` — "Send report". `.invalid`
        /// ("Say what's wrong." etc.), `.rateLimited` (20 open per person),
        /// `.upstream` (TMDb unreachable).
        func report(_ type: API.MediaType, id tmdbId: Int, _ report: API.IssueReport) async throws {
            let _: API.OK = try await transport.mutate(
                .post, TitlesEndpoints.path(type, tmdbId) + "/issues", body: report, changes: [.requests, .notifications]
            )
        }

        /// `GET /issues` — the admin's open reports (then the latest fixed),
        /// or a member's own.
        func list() async throws -> API.IssueList {
            try await transport.get("/issues")
        }

        /// `POST /issues/{id}/resolve` (admin) — "Mark fixed", with an optional
        /// note for the reporter. A blank note sends no body.
        func resolve(_ id: UUID, note: String? = nil) async throws {
            let body: (any Encodable & Sendable)? = note.nonBlank.map { API.IssueResolution(note: $0) }
            let _: API.OK = try await transport.mutate(
                .post, "/issues/\(MarqueeAPI.segment(id))/resolve", body: body, changes: [.requests, .notifications]
            )
        }

        /// `POST /issues/{id}/search` (admin) — "Search again": Radarr/Sonarr
        /// looks for another copy. `.conflict("Not tracked in Radarr/Sonarr.")`.
        func searchAgain(_ id: UUID) async throws {
            let _: API.OK = try await transport.mutate(
                .post, "/issues/\(MarqueeAPI.segment(id))/search", timeout: Timeout.integrations, changes: .library
            )
        }

        /// `DELETE /issues/{id}` — "Withdraw" your own open report, or (admin) "Remove" any.
        func delete(_ id: UUID) async throws {
            let _: API.OK = try await transport.mutate(
                .delete, "/issues/\(MarqueeAPI.segment(id))", changes: .requests
            )
        }
    }
}
