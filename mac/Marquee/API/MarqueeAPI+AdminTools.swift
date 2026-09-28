import Foundation

// The admin tools of 0.58 (api-v1.md): the server's log, override rules,
// job schedules and the blocklist's automatic rules. Each answers `.notFound`
// from an older server; the Settings tabs then say so.

extension MarqueeAPI {
    var logs: LogsEndpoints { LogsEndpoints(transport: transport) }
    var overrideRules: OverrideRulesEndpoints { OverrideRulesEndpoints(transport: transport) }

    struct LogsEndpoints: Sendable {
        let transport: Transport

        /// `GET /settings/logs` (admin) — the lines at `level` and up that
        /// contain `query`, newer than `after`, oldest first.
        func list(level: API.LogLevel?, query: String?, after: Int? = nil) async throws -> API.LogsResponse {
            try await transport.get(
                "/settings/logs",
                query: [
                    "level": level?.rawValue,
                    "q": query.nonBlank,
                    "after": after.map(String.init),
                ]
            )
        }
    }

    struct OverrideRulesEndpoints: Sendable {
        let transport: Transport

        /// `GET /settings/override-rules` (admin), in order.
        func list() async throws -> [API.OverrideRule] {
            let list: API.ListResponse<API.OverrideRule> = try await transport.get("/settings/override-rules")
            return list.results
        }

        /// Adds (`rule.id` empty) or replaces a rule; answers it as saved.
        @discardableResult
        func save(_ rule: API.OverrideRule) async throws -> API.OverrideRule {
            let saved: API.OverrideRuleSaved = rule.id.isEmpty
                ? try await transport.mutate(.post, "/settings/override-rules", body: API.OverrideRuleBody(rule), changes: .settings)
                : try await transport.mutate(
                    .put, "/settings/override-rules/\(MarqueeAPI.segment(rule.id))", body: API.OverrideRuleBody(rule), changes: .settings
                )
            return saved.rule
        }

        func delete(_ id: String) async throws {
            let _: API.OK = try await transport.mutate(.delete, "/settings/override-rules/\(MarqueeAPI.segment(id))", changes: .settings)
        }

        /// TMDb keywords by name (`GET /settings/discover/lookup?type=keyword`).
        func searchKeywords(_ query: String) async throws -> [API.RuleKeyword] {
            let list: API.ListResponse<API.LookupResult> = try await transport.get(
                "/settings/discover/lookup", query: ["type": "keyword", "q": query], timeout: Timeout.tmdb
            )
            return list.results.map { API.RuleKeyword(id: $0.tmdbId, name: $0.name) }
        }

        /// TMDb's genres for movies or shows.
        func genres(_ type: API.MediaType) async throws -> [API.RuleKeyword] {
            let list: API.ListResponse<API.LookupResult> = try await transport.get(
                "/settings/discover/lookup", query: ["type": "genre", "mediaType": type.rawValue, "q": ""], timeout: Timeout.tmdb
            )
            return list.results.map { API.RuleKeyword(id: $0.tmdbId, name: $0.name) }
        }
    }
}

extension MarqueeAPI.JobsEndpoints {
    /// `PUT /settings/jobs/{id}` (admin, 0.58+) — how often it runs (nil:
    /// its default). Answers the job as it is now.
    func setInterval(_ interval: API.JobInterval?, of id: String) async throws -> API.Job {
        try await transport.mutate(
            .put, "/settings/jobs/\(MarqueeAPI.segment(id))", body: API.JobIntervalBody(interval: interval), changes: .settings
        )
    }
}

extension MarqueeAPI.BlocklistEndpoints {
    /// `POST /settings/blocklist` with a `kind` (0.58+): a keyword or genre,
    /// a rating in a country, or adult titles.
    func block(_ rule: API.BlockRuleBody) async throws {
        let _: API.OK = try await transport.mutate(.post, "/settings/blocklist", body: rule, changes: [.library, .settings])
    }

    /// `POST /settings/blocklist/preview` (0.58+) — what it would block.
    func preview(_ rule: API.BlockRuleBody) async throws -> API.BlockPreview {
        try await transport.post("/settings/blocklist/preview", body: rule)
    }
}
