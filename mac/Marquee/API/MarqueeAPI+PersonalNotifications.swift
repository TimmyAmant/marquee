import Foundation

// Personal notifications (api-v1.md §8, 0.45+): Settings › Account ›
// Notifications › "Your channels" and "What you hear about", and the admin's
// Settings › Integrations › Household channels choices. A server older than
// 0.45 answers 404 on all of them: the reads return nil and the screens hide.

extension MarqueeAPI {
    var notificationChannels: NotificationChannelsEndpoints { NotificationChannelsEndpoints(transport: transport) }
    var notificationPreferences: NotificationPreferencesEndpoints { NotificationPreferencesEndpoints(transport: transport) }

    /// The signed-in account's own channels. Every id-based call answers
    /// `.notFound` for one that isn't this account's.
    struct NotificationChannelsEndpoints: Sendable {
        let transport: Transport

        /// `GET /me/notification-channels`. nil from a server before 0.45.
        func list() async throws -> API.PersonalNotificationChannels? {
            do {
                return try await transport.get("/me/notification-channels")
            } catch APIError.notFound {
                return nil
            }
        }

        /// `POST /me/notification-channels` — "Test & add": a test message
        /// goes out first and the channel is saved only if it arrives
        /// (`.invalid` with the reason otherwise). Email gets a code instead
        /// (`verified: false`). `.conflict` for a kind the household hasn't
        /// set up or past 10 channels; `.rateLimited` after 10 adds in 10 minutes.
        func add(_ request: API.CreateNotificationChannelRequest) async throws -> API.PersonalNotificationChannel {
            try await transport.mutate(
                .post, "/me/notification-channels", body: request, timeout: Timeout.integrations, changes: []
            )
        }

        /// `PATCH /me/notification-channels/{id}` — new details are tested
        /// before they're kept; a secret left out keeps the saved one.
        func update(_ id: String, _ request: API.UpdateNotificationChannelRequest) async throws -> API.PersonalNotificationChannel {
            try await transport.mutate(
                .patch, Self.path(id), body: request, timeout: Timeout.integrations, changes: []
            )
        }

        /// `DELETE /me/notification-channels/{id}`.
        func remove(_ id: String) async throws {
            let _: API.OK = try await transport.mutate(.delete, Self.path(id), changes: [])
        }

        /// `POST /me/notification-channels/{id}/test` — "Send a test": the
        /// channel with `lastSuccessAt` updated, or `.invalid` with the reason
        /// (also kept as `lastError`).
        func test(_ id: String) async throws -> API.PersonalNotificationChannel {
            try await transport.mutate(.post, Self.path(id, "test"), timeout: Timeout.integrations, changes: [])
        }

        /// `POST /me/notification-channels/{id}/verify` — the emailed 6-digit code.
        func verify(_ id: String, code: String) async throws -> API.PersonalNotificationChannel {
            try await transport.mutate(
                .post, Self.path(id, "verify"),
                body: API.NotificationChannelCode(code: code.trimmingCharacters(in: .whitespacesAndNewlines)),
                changes: []
            )
        }

        /// `POST /me/notification-channels/{id}/resend-code` — "Send a new code".
        func resendCode(_ id: String) async throws -> API.PersonalNotificationChannel {
            try await transport.mutate(.post, Self.path(id, "resend-code"), timeout: Timeout.integrations, changes: [])
        }

        /// `POST /me/notification-channels/telegram-link` — one-tap
        /// Telegram: open `url`, then `pollTelegramLink`.
        func startTelegramLink() async throws -> API.TelegramLinkStart {
            try await transport.post("/me/notification-channels/telegram-link")
        }

        /// `POST /me/notification-channels/telegram-link/poll` — one poll:
        /// nil while the bot hasn't seen Start (202), the new channel once it
        /// has (201). Throws `MediaSignInError.expiredWith` after 10 minutes
        /// (410) and `.conflict` when the household bot's messages go to a
        /// webhook of its own (enter the chat ID instead).
        func pollTelegramLink(code: String, name: String? = nil) async throws -> API.PersonalNotificationChannel? {
            let path = "/me/notification-channels/telegram-link/poll"
            let (status, body) = try await transport.exchange(
                .post, path,
                body: API.TelegramLinkPollRequest(code: code, name: name.nonBlank),
                accepting: [202, 410],
                timeout: Timeout.integrations
            )
            switch status {
            case 202:
                return nil
            case 410:
                let message = (try? JSONDecoder().decode(APIError.Body.self, from: body))?.error.nonBlank
                throw MediaSignInError.expiredWith(message ?? TelegramLink.expiredMessage)
            default:
                return try APIClient.decode(API.PersonalNotificationChannel.self, from: body, path: path)
            }
        }

        private static func path(_ id: String, _ action: String? = nil) -> String {
            let base = "/me/notification-channels/\(MarqueeAPI.segment(id))"
            return action.map { "\(base)/\($0)" } ?? base
        }
    }

    /// "What you hear about": which events reach the bell, device push and
    /// each of the account's channels.
    struct NotificationPreferencesEndpoints: Sendable {
        let transport: Transport

        /// `GET /me/notification-preferences`. nil from a server before 0.45.
        func get() async throws -> API.NotificationPreferences? {
            do {
                return try await transport.get("/me/notification-preferences")
            } catch APIError.notFound {
                return nil
            }
        }

        /// `PUT /me/notification-preferences` — only what's sent changes;
        /// answers the whole list. What the bell keeps can change with it.
        func save(_ changes: [API.NotificationPreferenceChange]) async throws -> API.NotificationPreferences {
            try await transport.mutate(
                .put, "/me/notification-preferences",
                body: API.NotificationPreferencesUpdate(events: changes), changes: .notifications
            )
        }
    }
}

extension MarqueeAPI.IntegrationsEndpoints {
    /// `GET /settings/notification-events` (admin) — what the household
    /// channels post. nil from a server before 0.45.
    func householdEvents() async throws -> API.HouseholdNotificationEvents? {
        do {
            return try await transport.get("/settings/notification-events")
        } catch APIError.notFound {
            return nil
        }
    }

    /// `PUT /settings/notification-events` (admin) — only what's sent
    /// changes; answers as `householdEvents()`.
    func saveHouseholdEvents(_ changes: [String: Bool]) async throws -> API.HouseholdNotificationEvents {
        try await transport.mutate(
            .put, "/settings/notification-events",
            body: API.HouseholdNotificationEventsUpdate(events: changes), changes: .settings
        )
    }
}

/// One-tap Telegram (`telegram-link`): how often to ask and for how long.
enum TelegramLink {
    /// personal-notifications.tsx polls every 3 seconds…
    static let interval: Duration = .seconds(3)
    /// …120 times: about 6 minutes, inside the server's 10.
    static let maxPolls = 120
    static let expiredMessage = "That Telegram link expired. Try again."
    static let timedOutMessage = "Telegram didn't hear from you in time. Try again, or enter your chat ID."

    /// Calls `poll` every `interval` until it returns a channel, it throws,
    /// the task is cancelled, or `maxPolls` pass (`MediaSignInError.expiredWith`).
    static func run<Result: Sendable>(
        interval: Duration = interval,
        maxPolls: Int = maxPolls,
        poll: () async throws -> Result?
    ) async throws -> Result {
        for _ in 0..<maxPolls {
            try await Task.sleep(for: interval)
            if let result = try await poll() { return result }
        }
        throw MediaSignInError.expiredWith(timedOutMessage)
    }
}
