import Foundation

// Settings → Jobs, About, the Releases page and the Error reference (api-v1.md §13–15).

extension MarqueeAPI {
    struct JobsEndpoints: Sendable {
        let transport: Transport

        /// `GET /settings/jobs` (admin).
        func list() async throws -> [API.Job] {
            let list: API.ListResponse<API.Job> = try await transport.get("/settings/jobs")
            return list.results
        }

        /// `POST /settings/jobs/{id}/run` (admin) — "Run now"; waits for the job
        /// to finish. `.server("Job failed — check the server logs.")` on failure.
        func run(_ id: String) async throws {
            let _: API.OK = try await transport.mutate(
                .post, "/settings/jobs/\(MarqueeAPI.segment(id))/run", timeout: Timeout.longRunning,
                changes: [.library, .settings]
            )
        }
    }

    struct AboutEndpoints: Sendable {
        let transport: Transport

        /// `GET /settings/about` — version, library counts, time zone, support links.
        func info() async throws -> API.AboutInfo {
            try await transport.get("/settings/about")
        }

        /// `GET /changelog` — the Releases page, newest first.
        func changelog() async throws -> [API.ChangelogEntry] {
            let list: API.ListResponse<API.ChangelogEntry> = try await transport.get("/changelog")
            return list.results
        }
    }

    struct HelpEndpoints: Sendable {
        let transport: Transport

        /// `GET /help/errors` — the Error reference, grouped by area.
        func errors() async throws -> [API.ErrorReferenceCategory] {
            let list: API.ListResponse<API.ErrorReferenceCategory> = try await transport.get("/help/errors")
            return list.results
        }
    }
}
