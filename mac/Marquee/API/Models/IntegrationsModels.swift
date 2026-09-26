import Foundation

// Settings → Integrations (api-v1.md §12). Secrets are never returned, only
// whether they're set.

extension API {
    /// `GET /settings/integrations`. Page sections: Media Libraries (Plex,
    /// Jellyfin), Download Clients (Sonarr, Radarr), Metadata Sources (TMDb,
    /// Trakt, TheTVDB), Notifications (webhooks, Discord, ntfy, Telegram,
    /// Pushover, email, generic webhook).
    struct IntegrationsOverview: Codable, Hashable, Sendable {
        let plex: PlexSettings
        let jellyfin: JellyfinSettings
        let sonarr: ArrSettings
        let radarr: ArrSettings
        let tmdb: TMDbSettings
        let trakt: ConnectionState
        let tvdb: ConnectionState
        let discord: ConnectionState
        let ntfy: ConnectionState
        /// 0.36+; nil from an older server, which hides the card.
        let telegram: TelegramSettings?
        /// 0.36+; nil from an older server, which hides the card.
        let pushover: ConnectionState?
        /// 0.36+; nil from an older server, which hides the card.
        let email: EmailSettings?
        let genericWebhook: ConnectionState
        let arrWebhooks: ArrWebhooks

        func arr(_ provider: ArrProvider) -> ArrSettings {
            provider == .sonarr ? sonarr : radarr
        }
    }

    /// A Plex or Jellyfin server whose library was synced.
    struct SyncedServer: Codable, Hashable, Sendable {
        let name: String?
        let lastSyncedAt: Date?
    }

    struct PlexSettings: Codable, Hashable, Sendable {
        let connected: Bool
        let servers: [SyncedServer]
        let movieCount: Int
        let tvCount: Int
        let totalBytes: Int64
    }

    struct JellyfinSettings: Codable, Hashable, Sendable {
        let connected: Bool
        let baseUrl: String?
        let hasApiKey: Bool
        let servers: [SyncedServer]
        let movieCount: Int
        let tvCount: Int
        let totalBytes: Int64
    }

    struct ArrSettings: Codable, Hashable, Sendable {
        let connected: Bool
        let baseUrl: String?
        let hasApiKey: Bool
        let rootFolderPath: String?
        let qualityProfileId: Int?
        /// A root folder and quality profile are picked (required for adding titles).
        let fullyConfigured: Bool
    }

    struct TMDbSettings: Codable, Hashable, Sendable {
        /// TMDb is usable at all.
        let connected: Bool
        /// The "Connected" chip.
        let savedInSettings: Bool
        /// Without `savedInSettings`: "Using environment variable".
        let configuredFromEnv: Bool
    }

    struct ConnectionState: Codable, Hashable, Sendable {
        let connected: Bool
    }

    /// The bot token is never returned; the chat it posts to is, to prefill the form.
    struct TelegramSettings: Codable, Hashable, Sendable {
        let connected: Bool
        let chatId: String?
    }

    /// Everything but the SMTP password, to prefill the form.
    struct EmailSettings: Codable, Hashable, Sendable {
        let connected: Bool
        let host: String?
        let port: Int?
        /// TLS from the start (usually 465); otherwise STARTTLS when offered.
        let secure: Bool
        let username: String?
        let from: String?
        let to: [String]
    }

    /// `PUT …/telegram` body. `botToken` `""` keeps the saved one.
    struct TelegramRequest: Encodable, Hashable, Sendable {
        let botToken: String
        let chatId: String
    }

    /// `PUT …/pushover` body (both 30 characters). `appToken` `""` keeps the saved one.
    struct PushoverRequest: Encodable, Hashable, Sendable {
        let appToken: String
        let userKey: String
    }

    /// `PUT …/email` body. `username`/`password` both or neither; `password`
    /// `""` keeps the saved one when `host` and `username` are unchanged.
    struct EmailRequest: Encodable, Hashable, Sendable {
        let host: String
        let port: Int
        let secure: Bool
        let username: String
        let password: String
        let from: String
        /// At most 20.
        let to: [String]
    }

    /// Paste into Radarr/Sonarr → Settings → Connect → Add → Webhook (method
    /// POST, trigger on Grab + Download). Built from the address this Mac used
    /// to reach the server. Also `POST …/webhook-secret`'s response.
    struct ArrWebhooks: Codable, Hashable, Sendable {
        let secret: String
        let radarrUrl: String
        let sonarrUrl: String

        func url(for provider: ArrProvider) -> String {
            provider == .sonarr ? sonarrUrl : radarrUrl
        }
    }

    /// `{provider}` in `/settings/integrations/{sonarr|radarr}`.
    enum ArrProvider: String, Codable, CaseIterable, Hashable, Sendable, Identifiable {
        case sonarr
        case radarr

        var id: String { rawValue }
        var displayName: String { self == .sonarr ? "Sonarr" : "Radarr" }
        var defaultPort: Int { self == .sonarr ? 8989 : 7878 }
        /// The media type this provider adds.
        var mediaType: MediaType { self == .sonarr ? .tv : .movie }
    }

    struct RootFolder: Codable, Hashable, Sendable, Identifiable {
        let id: Int
        let path: String
    }

    struct QualityProfile: Codable, Hashable, Sendable, Identifiable {
        let id: Int
        let name: String
    }

    /// `GET …/{provider}/options`: the defaults pickers' choices.
    struct ArrOptions: Codable, Hashable, Sendable {
        let rootFolders: [RootFolder]
        let qualityProfiles: [QualityProfile]
    }

    /// `PUT …/{provider}` ("Test & save") response. The add defaults were
    /// reset to the first root folder and quality profile.
    struct ArrConnectionResult: Codable, Hashable, Sendable {
        let ok: Bool
        /// Trailing slashes trimmed.
        let baseUrl: String
        let rootFolders: [RootFolder]
        let qualityProfiles: [QualityProfile]
        let selectedRootFolder: String?
        let selectedQualityProfileId: Int?

        var options: ArrOptions { ArrOptions(rootFolders: rootFolders, qualityProfiles: qualityProfiles) }
    }

    /// `PUT …/{sonarr|radarr|jellyfin}` body.
    struct ServiceConnectionRequest: Encodable, Hashable, Sendable {
        let baseUrl: String
        let apiKey: String
    }

    /// `PUT …/{provider}/defaults` body.
    struct ArrDefaultsRequest: Encodable, Hashable, Sendable {
        let rootFolderPath: String
        let qualityProfileId: Int
    }

    /// `POST …/plex/pin`: open `authUrl` in the browser, then poll `pinId`.
    struct PlexPinStart: Codable, Hashable, Sendable {
        let authUrl: String
        let pinId: Int

        var url: URL? { API.plexWebURL(authUrl) }
    }

    /// `GET …/plex/pin/{pinId}`: one poll. The website polls every 2.5 s and
    /// gives up after 2 minutes ("Timed out waiting for Plex sign-in. Try again.").
    struct PlexPinStatus: Codable, Hashable, Sendable {
        /// The first `true` has already saved the token and run a first library sync.
        let connected: Bool
        let movieCount: Int?
        let tvCount: Int?
    }

    /// `POST …/trakt/import` response: "Imported 12 titles (3 skipped — already owned or requested)."
    struct TraktImportResult: Codable, Hashable, Sendable {
        let ok: Bool
        let importedCount: Int
        let skippedCount: Int
    }
}
