import Foundation

// Any number of Sonarr / Radarr servers (api-v1.md §12 "Sonarr / Radarr
// servers", 0.43+), and the add overrides Approve and the admin's Add take
// (§4 `add-options`, §7 approve). A server older than 0.43 answers 404 on
// every endpoint here and omits `arrServers` from the integrations overview.

extension API {
    /// `ArrServer.kind`: which app the server is.
    enum ArrKind: OpenEnum {
        case sonarr
        case radarr
        case unknown(String)

        static let knownCases: [ArrKind] = [.sonarr, .radarr]

        var rawValue: String {
            switch self {
            case .sonarr: return "sonarr"
            case .radarr: return "radarr"
            case let .unknown(raw): return raw
            }
        }

        /// "Sonarr" / "Radarr".
        var displayName: String {
            switch self {
            case .sonarr: return "Sonarr"
            case .radarr: return "Radarr"
            case let .unknown(raw): return raw.capitalized
            }
        }

        var defaultPort: Int { self == .radarr ? 7878 : 8989 }
        /// What it adds: Sonarr TV, Radarr movies.
        var mediaType: MediaType { self == .radarr ? .movie : .tv }
    }

    /// Sonarr's series type: how it names and searches episodes.
    enum SeriesType: OpenEnum {
        case standard
        case daily
        case anime
        case unknown(String)

        static let knownCases: [SeriesType] = [.standard, .daily, .anime]

        var rawValue: String {
            switch self {
            case .standard: return "standard"
            case .daily: return "daily"
            case .anime: return "anime"
            case let .unknown(raw): return raw
            }
        }

        var label: String {
            switch self {
            case .standard: return "Standard"
            case .daily: return "Daily"
            case .anime: return "Anime"
            case let .unknown(raw): return raw.capitalized
            }
        }
    }

    /// A Sonarr/Radarr tag.
    struct ArrTag: Codable, Hashable, Sendable, Identifiable {
        let id: Int
        let label: String
    }

    /// `ArrServer`: one Sonarr or Radarr server. The API key is never returned.
    struct ArrServer: Codable, Hashable, Sendable, Identifiable {
        let id: String
        let kind: ArrKind
        /// Shown everywhere a server is named ("Radarr 2").
        let name: String
        let baseUrl: String
        let hasApiKey: Bool
        /// 4K requests and "Add in 4K" go here.
        let is4k: Bool
        /// Where titles go when nobody picks a server; one per kind and 4K-ness.
        let isDefault: Bool
        let qualityProfileId: Int?
        let rootFolderPath: String?
        /// Tag ids added with every title.
        let tags: [Int]
        /// Sonarr only (nil for Radarr): for non-anime shows.
        let seriesType: SeriesType?
        /// Sonarr only (nil for Radarr).
        let seasonFolders: Bool?
        /// Sonarr only: used instead for anime shows (nil = the regular one).
        let animeQualityProfileId: Int?
        let animeRootFolderPath: String?
        /// Sonarr only: used instead of `tags` for anime shows when not empty.
        let animeTags: [Int]
        /// A quality profile and root folder are picked (needed for adding).
        let fullyConfigured: Bool
        /// This server's own webhook URL, with its own secret.
        let webhookUrl: String

        init(
            id: String, kind: ArrKind, name: String, baseUrl: String, hasApiKey: Bool = true,
            is4k: Bool = false, isDefault: Bool = false, qualityProfileId: Int? = nil, rootFolderPath: String? = nil,
            tags: [Int] = [], seriesType: SeriesType? = nil, seasonFolders: Bool? = nil,
            animeQualityProfileId: Int? = nil, animeRootFolderPath: String? = nil, animeTags: [Int] = [],
            fullyConfigured: Bool = false, webhookUrl: String = ""
        ) {
            self.id = id
            self.kind = kind
            self.name = name
            self.baseUrl = baseUrl
            self.hasApiKey = hasApiKey
            self.is4k = is4k
            self.isDefault = isDefault
            self.qualityProfileId = qualityProfileId
            self.rootFolderPath = rootFolderPath
            self.tags = tags
            self.seriesType = seriesType
            self.seasonFolders = seasonFolders
            self.animeQualityProfileId = animeQualityProfileId
            self.animeRootFolderPath = animeRootFolderPath
            self.animeTags = animeTags
            self.fullyConfigured = fullyConfigured
            self.webhookUrl = webhookUrl
        }

        /// The tag lists are read leniently (a missing one is empty); the rest
        /// is as the doc specifies.
        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            id = try container.decode(String.self, forKey: .id)
            kind = try container.decode(ArrKind.self, forKey: .kind)
            name = try container.decode(String.self, forKey: .name)
            baseUrl = try container.decode(String.self, forKey: .baseUrl)
            hasApiKey = try container.decodeIfPresent(Bool.self, forKey: .hasApiKey) ?? true
            is4k = try container.decodeIfPresent(Bool.self, forKey: .is4k) ?? false
            isDefault = try container.decodeIfPresent(Bool.self, forKey: .isDefault) ?? false
            qualityProfileId = try container.decodeIfPresent(Int.self, forKey: .qualityProfileId)
            rootFolderPath = try container.decodeIfPresent(String.self, forKey: .rootFolderPath)
            tags = try container.decodeIfPresent([Int].self, forKey: .tags) ?? []
            seriesType = try container.decodeIfPresent(SeriesType.self, forKey: .seriesType)
            seasonFolders = try container.decodeIfPresent(Bool.self, forKey: .seasonFolders)
            animeQualityProfileId = try container.decodeIfPresent(Int.self, forKey: .animeQualityProfileId)
            animeRootFolderPath = try container.decodeIfPresent(String.self, forKey: .animeRootFolderPath)
            animeTags = try container.decodeIfPresent([Int].self, forKey: .animeTags) ?? []
            fullyConfigured = try container.decodeIfPresent(Bool.self, forKey: .fullyConfigured) ?? false
            webhookUrl = try container.decodeIfPresent(String.self, forKey: .webhookUrl) ?? ""
        }

        private enum CodingKeys: String, CodingKey {
            case id, kind, name, baseUrl, hasApiKey, is4k, isDefault, qualityProfileId, rootFolderPath, tags
            case seriesType, seasonFolders, animeQualityProfileId, animeRootFolderPath, animeTags, fullyConfigured, webhookUrl
        }
    }

    /// The pickers' choices for a server: `GET …/arr-servers/{id}/options`,
    /// and what `POST …/arr-servers/test` returns besides `ok` / `version`.
    struct ArrServerOptions: Codable, Hashable, Sendable {
        let qualityProfiles: [QualityProfile]
        let rootFolders: [RootFolder]
        let tags: [ArrTag]

        init(qualityProfiles: [QualityProfile], rootFolders: [RootFolder], tags: [ArrTag] = []) {
            self.qualityProfiles = qualityProfiles
            self.rootFolders = rootFolders
            self.tags = tags
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            qualityProfiles = try container.decodeIfPresent([QualityProfile].self, forKey: .qualityProfiles) ?? []
            rootFolders = try container.decodeIfPresent([RootFolder].self, forKey: .rootFolders) ?? []
            tags = try container.decodeIfPresent([ArrTag].self, forKey: .tags) ?? []
        }

        private enum CodingKeys: String, CodingKey {
            case qualityProfiles, rootFolders, tags
        }
    }

    /// `POST /settings/arr-servers/test` response.
    struct ArrServerTestResult: Codable, Hashable, Sendable {
        let ok: Bool
        /// Sonarr/Radarr's own version, e.g. "5.26.2.10099".
        let version: String?
        let qualityProfiles: [QualityProfile]
        let rootFolders: [RootFolder]
        let tags: [ArrTag]

        var options: ArrServerOptions {
            ArrServerOptions(qualityProfiles: qualityProfiles, rootFolders: rootFolders, tags: tags)
        }
    }

    /// `POST /settings/arr-servers/test` body. Editing a saved server, send
    /// `serverId` (and no `apiKey`) to test with its saved key — only while
    /// `baseUrl` is the saved one or omitted.
    struct ArrServerTestRequest: Encodable, Hashable, Sendable {
        let kind: ArrKind
        var baseUrl: String?
        var apiKey: String?
        var serverId: String?
    }

    /// `POST /settings/arr-servers` (every field but `kind`, `baseUrl` and
    /// `apiKey` optional) and `PATCH /settings/arr-servers/{id}` (no `kind`;
    /// omitted = unchanged, a blank `apiKey` keeps the saved key). nil fields
    /// are left out, except the Sonarr anime profile and folder, which are
    /// sent as `null` ("same as the regular one") whenever `sonarr` is set.
    struct ArrServerRequest: Encodable, Hashable, Sendable {
        /// POST only.
        var kind: ArrKind?
        var name: String?
        var baseUrl: String?
        var apiKey: String?
        var is4k: Bool?
        var isDefault: Bool?
        var qualityProfileId: Int?
        var rootFolderPath: String?
        var tags: [Int]?
        /// Sonarr's own settings; nil for Radarr.
        var sonarr: SonarrSettings?

        struct SonarrSettings: Hashable, Sendable {
            var seriesType: SeriesType
            var seasonFolders: Bool
            var animeQualityProfileId: Int?
            var animeRootFolderPath: String?
            var animeTags: [Int]
        }

        private enum CodingKeys: String, CodingKey {
            case kind, name, baseUrl, apiKey, is4k, isDefault, qualityProfileId, rootFolderPath, tags
            case seriesType, seasonFolders, animeQualityProfileId, animeRootFolderPath, animeTags
        }

        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encodeIfPresent(kind, forKey: .kind)
            try container.encodeIfPresent(name, forKey: .name)
            try container.encodeIfPresent(baseUrl, forKey: .baseUrl)
            try container.encodeIfPresent(apiKey, forKey: .apiKey)
            try container.encodeIfPresent(is4k, forKey: .is4k)
            try container.encodeIfPresent(isDefault, forKey: .isDefault)
            try container.encodeIfPresent(qualityProfileId, forKey: .qualityProfileId)
            try container.encodeIfPresent(rootFolderPath, forKey: .rootFolderPath)
            try container.encodeIfPresent(tags, forKey: .tags)
            if let sonarr {
                try container.encode(sonarr.seriesType, forKey: .seriesType)
                try container.encode(sonarr.seasonFolders, forKey: .seasonFolders)
                try container.encode(sonarr.animeQualityProfileId, forKey: .animeQualityProfileId)
                try container.encode(sonarr.animeRootFolderPath, forKey: .animeRootFolderPath)
                try container.encode(sonarr.animeTags, forKey: .animeTags)
            }
        }
    }

    /// `POST /settings/arr-servers` and `PATCH …/{id}` response.
    struct ArrServerSaved: Codable, Hashable, Sendable {
        let ok: Bool
        let server: ArrServer
    }

    /// `POST /settings/arr-servers/{id}/webhook-secret` response.
    struct ArrServerWebhook: Codable, Hashable, Sendable {
        let ok: Bool
        let webhookUrl: String
    }

    // MARK: Add overrides

    /// `GET /titles/{type}/{tmdbId}/add-options`: what "Advanced" under
    /// Approve (and the admin's Add) can pick from.
    struct AddOptions: Codable, Hashable, Sendable {
        let mediaType: MediaType
        let tmdbId: Int
        let is4k: Bool
        /// The show counts as anime: `defaults` are then the anime ones.
        let isAnime: Bool
        /// Default first. Empty when none is set up for this type.
        let servers: [AddOptionsServer]
    }

    struct AddOptionsServer: Codable, Hashable, Sendable, Identifiable {
        let id: String
        let name: String
        let isDefault: Bool
        let is4k: Bool
        /// false: it didn't answer in time, so its lists are empty (its
        /// `defaults` still hold the saved choices).
        let reachable: Bool
        let qualityProfiles: [QualityProfile]
        let rootFolders: [RootFolder]
        let tags: [ArrTag]
        /// What it would use if nothing is changed.
        let defaults: AddDefaults

        /// "Radarr 2", or "Radarr 2 (not responding)".
        var pickerLabel: String { reachable ? name : "\(name) (not responding)" }
    }

    struct AddDefaults: Codable, Hashable, Sendable {
        let qualityProfileId: Int?
        let rootFolderPath: String?
        let tags: [Int]
        /// nil for movies.
        let seriesType: SeriesType?

        init(qualityProfileId: Int?, rootFolderPath: String?, tags: [Int] = [], seriesType: SeriesType? = nil) {
            self.qualityProfileId = qualityProfileId
            self.rootFolderPath = rootFolderPath
            self.tags = tags
            self.seriesType = seriesType
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            qualityProfileId = try container.decodeIfPresent(Int.self, forKey: .qualityProfileId)
            rootFolderPath = try container.decodeIfPresent(String.self, forKey: .rootFolderPath)
            tags = try container.decodeIfPresent([Int].self, forKey: .tags) ?? []
            seriesType = try container.decodeIfPresent(SeriesType.self, forKey: .seriesType)
        }

        private enum CodingKeys: String, CodingKey {
            case qualityProfileId, rootFolderPath, tags, seriesType
        }
    }

    /// The optional body of `POST /requests/{id}/approve` and (with `is4k`)
    /// `POST /titles/{type}/{tmdbId}/add`: where and how the title is added.
    /// Omitted fields use the server's defaults.
    struct AddOverrides: Codable, Hashable, Sendable {
        var serverId: String?
        var qualityProfileId: Int?
        var rootFolderPath: String?
        /// `[]` = no tags.
        var tags: [Int]?
        /// TV only.
        var seriesType: SeriesType?
    }

    /// `POST /titles/{type}/{tmdbId}/add` body: `{"is4k": true}` and/or the
    /// overrides, flat.
    struct TitleAddBody: Encodable, Sendable {
        var is4k: Bool?
        var overrides: AddOverrides?

        private enum CodingKeys: String, CodingKey {
            case is4k, serverId, qualityProfileId, rootFolderPath, tags, seriesType
        }

        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encodeIfPresent(is4k, forKey: .is4k)
            guard let overrides else { return }
            try container.encodeIfPresent(overrides.serverId, forKey: .serverId)
            try container.encodeIfPresent(overrides.qualityProfileId, forKey: .qualityProfileId)
            try container.encodeIfPresent(overrides.rootFolderPath, forKey: .rootFolderPath)
            try container.encodeIfPresent(overrides.tags, forKey: .tags)
            try container.encodeIfPresent(overrides.seriesType, forKey: .seriesType)
        }
    }

    /// `/requests/history`'s `addedTo` (0.43+): where an approved request
    /// was added, and with what.
    struct AddedTo: Codable, Hashable, Sendable {
        let serverId: String?
        /// nil once that server has been removed.
        let serverName: String?
        let qualityProfileId: Int?
        let rootFolderPath: String?
        let tags: [Int]?
        let seriesType: SeriesType?
    }
}

extension API.IntegrationsOverview {
    /// The "Download Clients" list (0.43+) instead of the four fixed cards;
    /// false for an older server, which omits `arrServers`.
    var usesServerList: Bool { arrServers != nil }

    /// One kind's servers, in the server's order (standard before 4K, the
    /// default first).
    func arrServers(of kind: API.ArrKind) -> [API.ArrServer] {
        (arrServers ?? []).filter { $0.kind == kind }
    }
}
