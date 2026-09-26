import Foundation

// The request blocklist (api-v1.md §7, 0.41+): Settings → Account's "Request
// blocklist" (admin). Blocking a single title is `titles.block`. All of it
// 404s on an older server.

extension MarqueeAPI {
    struct BlocklistEndpoints: Sendable {
        let transport: Transport

        /// `GET /settings/blocklist` (admin) — keywords first, then titles.
        func list() async throws -> [API.BlocklistEntry] {
            let list: API.ListResponse<API.BlocklistEntry> = try await transport.get("/settings/blocklist")
            return list.results
        }

        /// `POST /settings/blocklist` (admin) — "Block a keyword or genre".
        /// `.invalid("Enter a keyword or genre, like anime.")`. A blank reason
        /// sends no `reason` key.
        func blockKeyword(_ keyword: String, reason: String? = nil) async throws {
            let body = API.BlockKeywordRequest(
                keyword: keyword.trimmingCharacters(in: .whitespacesAndNewlines),
                reason: reason.nonBlank?.trimmingCharacters(in: .whitespacesAndNewlines)
            )
            let _: API.OK = try await transport.mutate(.post, "/settings/blocklist", body: body, changes: [.library, .settings])
        }

        /// `DELETE /settings/blocklist/{id}` (admin) — "Remove".
        /// `.notFound("Not on the blocklist.")`.
        func remove(_ id: String) async throws {
            let _: API.OK = try await transport.mutate(
                .delete, "/settings/blocklist/\(MarqueeAPI.segment(id))", changes: [.library, .settings]
            )
        }
    }
}
