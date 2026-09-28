import Foundation

// API keys and dashboard counts (api-v1.md §16, 0.47+): Settings ›
// Integrations › API keys (admin, signed in on this Mac — never with a key).
// All of it is `.notFound` from an older server.

extension MarqueeAPI {
    struct ApiKeysEndpoints: Sendable {
        let transport: Transport

        /// `GET /settings/api-keys` (admin) — every key, oldest first.
        func list() async throws -> [API.ApiKey] {
            let list: API.ListResponse<API.ApiKey> = try await transport.get("/settings/api-keys")
            return list.results
        }

        /// `POST /settings/api-keys` (admin) — "Create key". The answer holds
        /// the secret, the only time it's ever sent. `.invalid("Give the key
        /// a name, like Homepage.")` and the like; `.notFound` for a member
        /// that's gone.
        func create(_ request: API.CreateApiKeyRequest) async throws -> API.ApiKeyCreated {
            try await transport.mutate(.post, "/settings/api-keys", body: request, changes: .settings)
        }

        /// `DELETE /settings/api-keys/{id}` (admin) — "Revoke": its next call
        /// answers 401. `.notFound` when it's already gone.
        func revoke(_ id: String) async throws {
            let _: API.OK = try await transport.mutate(
                .delete, "/settings/api-keys/\(MarqueeAPI.segment(id))", changes: .settings
            )
        }
    }
}
