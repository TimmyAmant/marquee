import Foundation

// Settings → Integrations (api-v1.md §12). Admin-only except `syncNow()`.

extension MarqueeAPI {
    struct IntegrationsEndpoints: Sendable {
        let transport: Transport

        /// `GET /settings/integrations` — re-syncs library data older than 15
        /// minutes first, so it can take a few seconds.
        func overview() async throws -> API.IntegrationsOverview {
            try await transport.get("/settings/integrations", timeout: Timeout.integrations)
        }

        /// `POST /settings/integrations/sync` — "Sync now" for every integration
        /// the caller has connected. `.upstream` if any failed.
        func syncNow() async throws {
            let _: API.OK = try await transport.mutate(
                .post, "/settings/integrations/sync", timeout: Timeout.longRunning, changes: [.library, .settings, .catalog]
            )
        }

        /// `POST /settings/integrations/webhook-secret` — "Regenerate secret";
        /// the old webhook URLs stop working immediately.
        func regenerateWebhookSecret() async throws -> API.ArrWebhooks {
            try await transport.mutate(.post, "/settings/integrations/webhook-secret", changes: .settings)
        }

        var sonarr: ArrEndpoints { ArrEndpoints(transport: transport, provider: .sonarr) }
        var radarr: ArrEndpoints { ArrEndpoints(transport: transport, provider: .radarr) }
        /// The optional 4K instances (0.37+): same bodies and answers.
        var sonarr4k: ArrEndpoints { ArrEndpoints(transport: transport, provider: .sonarr4k) }
        var radarr4k: ArrEndpoints { ArrEndpoints(transport: transport, provider: .radarr4k) }
        func arr(_ provider: API.ArrProvider) -> ArrEndpoints { ArrEndpoints(transport: transport, provider: provider) }

        var plex: PlexEndpoints { PlexEndpoints(transport: transport) }
        var jellyfin: JellyfinEndpoints { JellyfinEndpoints(transport: transport) }

        /// Body `{accessToken}`: a TMDb v4 read access token or v3 API key.
        /// Removing it falls back to the server's environment variables, if set.
        var tmdb: SettingEndpoints { SettingEndpoints(transport: transport, name: "tmdb", field: "accessToken", changes: [.settings, .library, .catalog]) }
        var trakt: TraktEndpoints { TraktEndpoints(transport: transport) }
        /// Body `{apiKey}`: a TheTVDB v4 API key.
        var tvdb: SettingEndpoints { SettingEndpoints(transport: transport, name: "tvdb", field: "apiKey", changes: [.settings, .library, .catalog]) }
        /// Body `{webhookUrl}`: posts a test message before saving.
        var discord: SettingEndpoints { SettingEndpoints(transport: transport, name: "discord", field: "webhookUrl", changes: .settings) }
        /// Body `{topicUrl}`, e.g. `https://ntfy.sh/my-topic`: posts a test message before saving.
        var ntfy: SettingEndpoints { SettingEndpoints(transport: transport, name: "ntfy", field: "topicUrl", changes: .settings) }
        /// Body `{botToken, chatId}`: posts a test message before saving.
        var telegram: TelegramEndpoints { TelegramEndpoints(transport: transport) }
        /// Body `{appToken, userKey}`: sends a test notification before saving.
        var pushover: PushoverEndpoints { PushoverEndpoints(transport: transport) }
        /// Body `{host, port, secure, username, password, from, to}`: sends a test email before saving.
        var email: EmailEndpoints { EmailEndpoints(transport: transport) }
        /// The generic JSON webhook. Body `{webhookUrl}`: posts a test request before saving.
        var webhook: SettingEndpoints { SettingEndpoints(transport: transport, name: "webhook", field: "webhookUrl", changes: .settings) }
    }

    /// `/settings/integrations/{sonarr|radarr|sonarr4k|radarr4k}` (default ports 8989 / 7878).
    struct ArrEndpoints: Sendable {
        let transport: Transport
        let provider: API.ArrProvider

        private var path: String { "/settings/integrations/\(provider.rawValue)" }

        /// `PUT` — "Test & save". Resets the add defaults to the first root
        /// folder and quality profile. `.upstream` when it can't connect.
        func connect(baseUrl: String, apiKey: String) async throws -> API.ArrConnectionResult {
            try await transport.mutate(
                .put, path, body: API.ServiceConnectionRequest(baseUrl: baseUrl, apiKey: apiKey),
                timeout: Timeout.integrations, changes: [.settings, .library, .catalog]
            )
        }

        /// `GET …/options` — root folders and quality profiles of the saved connection.
        func options() async throws -> API.ArrOptions {
            try await transport.get(path + "/options", timeout: Timeout.integrations)
        }

        /// `PUT …/defaults` — used when adding titles.
        func saveDefaults(rootFolderPath: String, qualityProfileId: Int) async throws {
            let _: API.OK = try await transport.mutate(
                .put, path + "/defaults",
                body: API.ArrDefaultsRequest(rootFolderPath: rootFolderPath, qualityProfileId: qualityProfileId),
                changes: [.settings, .library]
            )
        }

        /// `DELETE` — removes the connection and its cached statuses. Confirm first.
        func disconnect() async throws {
            let _: API.OK = try await transport.mutate(.delete, path, timeout: Timeout.integrations, changes: [.settings, .library, .catalog])
        }
    }

    /// Plex sign-in is a PIN flow: `startPin()`, open `authUrl`, then
    /// `pollPin(_:)` every 2.5 s for up to 2 minutes.
    struct PlexEndpoints: Sendable {
        let transport: Transport

        /// `POST /settings/integrations/plex/pin`.
        func startPin() async throws -> API.PlexPinStart {
            try await transport.post("/settings/integrations/plex/pin", timeout: Timeout.integrations)
        }

        /// `GET /settings/integrations/plex/pin/{pinId}` — one poll. The first
        /// `connected: true` runs a full library sync before answering.
        func pollPin(_ pinId: Int) async throws -> API.PlexPinStatus {
            let status: API.PlexPinStatus = try await transport.get(
                "/settings/integrations/plex/pin/\(pinId)", timeout: Timeout.longRunning
            )
            if status.connected, let events = transport.events {
                await events.record([.settings, .library, .catalog])
            }
            return status
        }

        /// `DELETE /settings/integrations/plex` — disconnect and delete the synced library.
        func disconnect() async throws {
            let _: API.OK = try await transport.mutate(
                .delete, "/settings/integrations/plex", timeout: Timeout.integrations, changes: [.settings, .library, .catalog]
            )
        }
    }

    struct JellyfinEndpoints: Sendable {
        let transport: Transport

        /// `PUT /settings/integrations/jellyfin` — test and save.
        func connect(baseUrl: String, apiKey: String) async throws {
            let _: API.OK = try await transport.mutate(
                .put, "/settings/integrations/jellyfin", body: API.ServiceConnectionRequest(baseUrl: baseUrl, apiKey: apiKey),
                timeout: Timeout.longRunning, changes: [.settings, .library, .catalog]
            )
        }

        /// `DELETE /settings/integrations/jellyfin` — disconnect and delete the synced library.
        func disconnect() async throws {
            let _: API.OK = try await transport.mutate(
                .delete, "/settings/integrations/jellyfin", timeout: Timeout.integrations, changes: [.settings, .library, .catalog]
            )
        }
    }

    /// An instance-wide setting verified against its service before saving:
    /// `PUT` with one body field, `DELETE` to remove.
    struct SettingEndpoints: Sendable {
        let transport: Transport
        let name: String
        let field: String
        let changes: ServerEvents.Change

        private var path: String { "/settings/integrations/\(name)" }

        /// `PUT` — `.invalid` with the website's message when verification fails.
        func save(_ value: String) async throws {
            let _: API.OK = try await transport.mutate(
                .put, path, body: [field: value], timeout: Timeout.integrations, changes: changes
            )
        }

        /// `DELETE`.
        func remove() async throws {
            let _: API.OK = try await transport.mutate(.delete, path, changes: changes)
        }
    }

    struct TraktEndpoints: Sendable {
        let transport: Transport

        private var setting: SettingEndpoints {
            SettingEndpoints(transport: transport, name: "trakt", field: "clientId", changes: .settings)
        }

        /// `PUT /settings/integrations/trakt` — body `{clientId}` from trakt.tv/oauth/applications.
        func save(_ clientId: String) async throws {
            try await setting.save(clientId)
        }

        /// `DELETE /settings/integrations/trakt`.
        func remove() async throws {
            try await setting.remove()
        }

        /// `POST /settings/integrations/trakt/import` — a public list or
        /// watchlist URL becomes pending requests from the admin.
        func importList(url: String) async throws -> API.TraktImportResult {
            try await transport.mutate(
                .post, "/settings/integrations/trakt/import", body: ["url": url],
                timeout: Timeout.longRunning, changes: [.requests, .settings]
            )
        }
    }

    /// A notification channel with a multi-field body (Telegram, Pushover,
    /// email): `PUT` tests and saves, `DELETE` removes. Blank secrets keep the
    /// saved one.
    struct ChannelEndpoints: Sendable {
        let transport: Transport
        let name: String

        private var path: String { "/settings/integrations/\(name)" }

        /// `PUT` — `.invalid` with the server's message when the test fails.
        func save(_ body: some Encodable & Sendable) async throws {
            let _: API.OK = try await transport.mutate(
                .put, path, body: body, timeout: Timeout.integrations, changes: .settings
            )
        }

        /// `DELETE`.
        func remove() async throws {
            let _: API.OK = try await transport.mutate(.delete, path, changes: .settings)
        }
    }

    struct TelegramEndpoints: Sendable {
        let transport: Transport

        private var channel: ChannelEndpoints { ChannelEndpoints(transport: transport, name: "telegram") }

        /// `PUT /settings/integrations/telegram`.
        func save(botToken: String, chatId: String) async throws {
            try await channel.save(API.TelegramRequest(botToken: botToken, chatId: chatId))
        }

        /// `DELETE /settings/integrations/telegram`.
        func remove() async throws {
            try await channel.remove()
        }
    }

    struct PushoverEndpoints: Sendable {
        let transport: Transport

        private var channel: ChannelEndpoints { ChannelEndpoints(transport: transport, name: "pushover") }

        /// `PUT /settings/integrations/pushover`.
        func save(appToken: String, userKey: String) async throws {
            try await channel.save(API.PushoverRequest(appToken: appToken, userKey: userKey))
        }

        /// `DELETE /settings/integrations/pushover`.
        func remove() async throws {
            try await channel.remove()
        }
    }

    struct EmailEndpoints: Sendable {
        let transport: Transport

        private var channel: ChannelEndpoints { ChannelEndpoints(transport: transport, name: "email") }

        /// `PUT /settings/integrations/email`.
        func save(_ request: API.EmailRequest) async throws {
            try await channel.save(request)
        }

        /// `DELETE /settings/integrations/email`.
        func remove() async throws {
            try await channel.remove()
        }
    }
}
