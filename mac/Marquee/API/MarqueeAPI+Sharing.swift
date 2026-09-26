import Foundation

// Sharing a title with someone in the household (api-v1.md §3, 0.45.1+). Both
// calls 404 on an older server.

extension MarqueeAPI.TitlesEndpoints {
    /// `POST /titles/{type}/{tmdbId}/share` — "Send": each recipient gets a
    /// `title_shared` notification. `.invalid` ("Pick who to share it with."
    /// etc.), `.notFound` (someone picked has left the household),
    /// `.rateLimited` (30 recipients an hour), `.upstream` (TMDb unreachable).
    /// Nothing this account's screens show changes, so nothing is recorded.
    func share(_ type: API.MediaType, id tmdbId: Int, _ request: API.ShareTitleRequest) async throws -> API.ShareResult {
        try await transport.post(Self.path(type, tmdbId) + "/share", body: request)
    }
}

extension MarqueeAPI.UsersEndpoints {
    /// `GET /users/shareable` — who a share can go to (everyone but you),
    /// and the public address to build outside links on.
    func shareable() async throws -> API.ShareableUsers {
        try await transport.get("/users/shareable")
    }
}
