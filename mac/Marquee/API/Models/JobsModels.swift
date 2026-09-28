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
        /// 0.58+ (nil from an older server, which can't change them): how
        /// often it runs, its default, when it runs next and last ran (since
        /// the server started), and whether it's running now.
        var interval: JobInterval? = nil
        var defaultInterval: JobInterval? = nil
        var nextRunAt: Date? = nil
        var lastRunAt: Date? = nil
        var running: Bool? = nil

        /// The Can't Find Check (0.46+): its row also sets the wait.
        static let notFoundCheckID = "not-found-check"
    }

    /// `GET`/`PUT /settings/not-found` (admin, 0.46+): the Can't Find
    /// Check's wait, in hours after approval.
    struct NotFoundSettings: Codable, Hashable, Sendable {
        var afterHours: Int

        static let defaultAfterHours = 24
        /// What the server takes: a whole number of hours, 1 to 720 (30 days).
        static let allowedHours = 1...720
    }
}
