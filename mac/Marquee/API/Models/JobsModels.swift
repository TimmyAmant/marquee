import Foundation

// Settings → Jobs (api-v1.md §13).

extension API {
    /// A scheduled maintenance job ("Run now" → `jobs.run(id)`).
    struct Job: Codable, Hashable, Sendable, Identifiable {
        /// `plex-sync`, `jellyfin-sync`, `arr-sync`, `disk-space-snapshot`.
        let id: String
        let name: String
        /// "Every hour", "Daily at 3:00 AM".
        let schedule: String
        let description: String
    }
}
