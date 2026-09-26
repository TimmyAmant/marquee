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
        /// The optional 4K Sonarr / Radarr (0.37+); nil from an older server,
        /// which hides their cards.
        let sonarr4k: ArrSettings?
        let radarr4k: ArrSettings?

        /// nil only for a 4K instance an older server doesn't know about.
        func arr(_ provider: ArrProvider) -> ArrSettings? {
            switch provider {
            case .sonarr: sonarr
            case .radarr: radarr
            case .sonarr4k: sonarr4k
            case .radarr4k: radarr4k
            }
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
        /// 0.40+: "Jellyfin", or "Emby" when the connected server is Emby
        /// (it speaks the same API). Nil from older servers.
        var name: String? = nil
        let baseUrl: String?
        let hasApiKey: Bool
        let servers: [SyncedServer]
        let movieCount: Int
        let tvCount: Int
        let totalBytes: Int64

        /// What it's connected to, once connected and synced ("Emby" or
        /// "Jellyfin"); nil before, like the website's card.
        var connectedName: String? {
            guard connected, !servers.isEmpty else { return nil }
            return name?.nonBlank ?? "Jellyfin"
        }
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
        /// The 4K instances' webhooks (0.37+, same secret); nil from an older server.
        let radarr4kUrl: String?
        let sonarr4kUrl: String?

        /// nil only for a 4K instance an older server doesn't know about.
        func url(for provider: ArrProvider) -> String? {
            switch provider {
            case .sonarr: sonarrUrl
            case .radarr: radarrUrl
            case .sonarr4k: sonarr4kUrl
            case .radarr4k: radarr4kUrl
            }
        }
    }

    /// `{provider}` in `/settings/integrations/{sonarr|radarr|sonarr4k|radarr4k}`.
    /// The 4K ones (0.37+) are optional second instances for 4K copies,
    /// configured exactly like the main ones.
    enum ArrProvider: String, Codable, CaseIterable, Hashable, Sendable, Identifiable {
        case sonarr
        case radarr
        case sonarr4k
        case radarr4k

        var id: String { rawValue }
        /// "Sonarr", "4K Radarr" — as the server's own error messages say it.
        var displayName: String {
            switch self {
            case .sonarr: "Sonarr"
            case .radarr: "Radarr"
            case .sonarr4k: "4K Sonarr"
            case .radarr4k: "4K Radarr"
            }
        }
        var defaultPort: Int { mediaType == .tv ? 8989 : 7878 }
        /// The media type this provider adds.
        var mediaType: MediaType { self == .sonarr || self == .sonarr4k ? .tv : .movie }
        var is4k: Bool { self == .sonarr4k || self == .radarr4k }
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
