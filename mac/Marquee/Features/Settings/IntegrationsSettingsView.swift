import SwiftUI

/// Which of Settings' tabs an `IntegrationsSettingsView` fills: the admin's
/// General, Media servers and Services tabs, or one household channel under
/// Notifications. They share `GET /settings/integrations`.
enum IntegrationsPart: Hashable {
    case general, mediaServers, services
    case channel(NotificationsSubTab)
}

/// The website's app/settings/{general,media-servers,services}/page.tsx and
/// app/settings/notifications/[agent]/page.tsx with their connect cards.
/// One `GET /settings/integrations` describes every provider; each card
/// writes through its own endpoint and the `.settings` event reloads the
/// overview.
struct IntegrationsSettingsView: View {
    let part: IntegrationsPart

    @Environment(AppModel.self) private var model

    @State private var overview: API.IntegrationsOverview?
    @State private var loadError: String?
    @State private var syncing = false
    @State private var syncMessage: (String, Bool)?

    var body: some View {
        Group {
            switch part {
            case .general:
                SettingsPane(
                    title: String(localized: "General"),
                    subtitle: String(localized: "Where Marquee gets its movie and TV details, API keys for other apps, and moving over from Seerr.")
                ) { loaded(general) }
            case .mediaServers:
                SettingsPane(
                    title: String(localized: "Media servers"),
                    subtitle: String(localized: "Connect Plex or Jellyfin so Marquee knows what the household already owns. Credentials are stored encrypted on your server."),
                    trailing: AnyView(syncButton)
                ) { loaded(mediaServers) }
            case .services:
                SettingsPane(
                    title: String(localized: "Services"),
                    subtitle: String(localized: "Sonarr and Radarr: where approved requests are sent. Add as many as you run; 4K ones take 4K requests.")
                ) { loaded(services) }
            case .channel(let channel):
                VStack(alignment: .leading, spacing: 16) {
                    loaded { overview in self.channel(channel, overview) }
                }
            }
        }
        .task(id: ReloadKey(token: model.reloadToken, local: model.events.revision(of: .settings))) {
            // The server re-syncs anything older than 15 minutes first, so
            // this can take a few seconds.
            do {
                let fresh = try await model.api.integrations.overview()
                if Task.isCancelled { return }
                overview = fresh
                loadError = nil
            } catch let failure as APIError where failure.isCancellation {
                return
            } catch {
                if overview == nil { loadError = error.localizedDescription }
            }
        }
    }

    @ViewBuilder
    private func loaded<Content: View>(@ViewBuilder _ content: (API.IntegrationsOverview) -> Content) -> some View {
        if let overview {
            content(overview)
        } else if let loadError {
            InlineMessage(text: loadError)
        } else {
            LoadingView(label: String(localized: "Checking your integrations…"))
        }
    }

    // MARK: General

    @ViewBuilder
    private func general(_ overview: API.IntegrationsOverview) -> some View {
        section(String(localized: "Metadata Sources")) {
            TMDbCard(settings: overview.tmdb)
            TraktCard(connected: overview.trakt.connected)
            SecretCard(
                title: "TheTVDB",
                description: String(localized: "Fills in poster art and an overview for TV shows when TMDb doesn't have them yet — Sonarr's own metadata comes from here too."),
                fieldLabel: String(localized: "API key"),
                placeholder: String(localized: "From thetvdb.com/dashboard/account/apikey"),
                removeLabel: String(localized: "Remove saved key"),
                connected: overview.tvdb.connected,
                save: { try await $0.integrations.tvdb.save($1) },
                remove: { try await $0.integrations.tvdb.remove() }
            )
            // 0.53+: IMDb / Rotten Tomatoes / Metacritic on title pages.
            if let omdb = overview.omdb {
                SecretCard(
                    title: String(localized: "OMDb (ratings)"),
                    description: String(localized: "Optional. With a key, title pages show IMDb, Rotten Tomatoes and Metacritic scores beside TMDb's."),
                    fieldLabel: String(localized: "API key"),
                    placeholder: String(localized: "From omdbapi.com/apikey.aspx"),
                    removeLabel: String(localized: "Remove saved key"),
                    connected: omdb.connected,
                    save: { try await $0.integrations.omdb.save($1) },
                    remove: { try await $0.integrations.omdb.remove() }
                )
            }
        }
        // 0.47+: keys for dashboards and scripts; nothing at all from an
        // older server.
        ApiKeysSection()
        // 0.51+: the website's Import from Seerr; the card only links there,
        // so it shows for any server.
        section(String(localized: "Coming from Seerr?")) {
            SeerrImportCard()
        }
    }

    // MARK: Media servers

    @ViewBuilder
    private func mediaServers(_ overview: API.IntegrationsOverview) -> some View {
        PlexCard(settings: overview.plex)
        JellyfinCard(settings: overview.jellyfin)
    }

    // MARK: Services

    @ViewBuilder
    private func services(_ overview: API.IntegrationsOverview) -> some View {
        // 0.43+: any number of servers, as tiles. An older server omits the
        // list and keeps the four fixed cards.
        if overview.usesServerList {
            ArrServersCard(kind: .sonarr, servers: overview.arrServers(of: .sonarr))
            ArrServersCard(kind: .radarr, servers: overview.arrServers(of: .radarr))
        } else {
            fixedArrCards(overview)
        }
        ArrWebhooksCard(
            webhooks: overview.arrWebhooks,
            radarr4kConnected: overview.radarr4k?.connected == true,
            sonarr4kConnected: overview.sonarr4k?.connected == true,
            isLegacy: overview.usesServerList
        )
    }

    // MARK: Notifications › a household channel

    @ViewBuilder
    private func channel(_ channel: NotificationsSubTab, _ overview: API.IntegrationsOverview) -> some View {
        switch channel {
        case .personal:
            EmptyView()
        case .household:
            // 0.45+: what these channels post.
            HouseholdEventsCard()
        case .discord:
            SecretCard(
                title: String(localized: "Discord notifications"),
                description: String(localized: "Posts a message to a Discord channel for the events picked under Household events."),
                fieldLabel: String(localized: "Webhook URL"),
                placeholder: String(localized: "From a channel's Integrations → Webhooks settings in Discord"),
                successMessage: String(localized: "Connected — check the channel for a test message."),
                removeLabel: String(localized: "Remove saved webhook"),
                connected: overview.discord.connected,
                save: { try await $0.integrations.discord.save($1) },
                remove: { try await $0.integrations.discord.remove() }
            )
        case .ntfy:
            SecretCard(
                title: String(localized: "ntfy notifications"),
                description: String(localized: "Sends a push notification via ntfy.sh (or a self-hosted ntfy server) for the events picked under Household events."),
                fieldLabel: String(localized: "Topic URL"),
                placeholder: "https://ntfy.sh/your-topic-name",
                successMessage: String(localized: "Connected — check the topic for a test message."),
                removeLabel: String(localized: "Remove saved topic"),
                connected: overview.ntfy.connected,
                save: { try await $0.integrations.ntfy.save($1) },
                remove: { try await $0.integrations.ntfy.remove() }
            )
        // 0.36+; an older server omits them.
        case .telegram:
            if let telegram = overview.telegram { TelegramCard(settings: telegram) }
        case .pushover:
            if let pushover = overview.pushover { PushoverCard(connected: pushover.connected) }
        case .email:
            if let email = overview.email { EmailCard(settings: email) }
        case .webhook:
            SecretCard(
                title: String(localized: "Custom webhook"),
                description: String(localized: "Posts a JSON payload ({ event, title, message }) to any URL for the events picked under Household events — for your own automation or a notification gateway."),
                fieldLabel: String(localized: "Webhook URL"),
                placeholder: "https://your-endpoint.example.com/hook",
                successMessage: String(localized: "Connected — check your endpoint for a test request."),
                removeLabel: String(localized: "Remove saved webhook"),
                connected: overview.genericWebhook.connected,
                save: { try await $0.integrations.webhook.save($1) },
                remove: { try await $0.integrations.webhook.remove() }
            )
        }
    }

    private var syncButton: some View {
        VStack(alignment: .trailing, spacing: 4) {
            Button(syncing ? "Syncing…" : "Sync now") { syncNow() }
                .buttonStyle(OutlineButtonStyle())
                .disabled(syncing)
            if let syncMessage {
                InlineMessage(text: syncMessage.0, isError: syncMessage.1)
                    .frame(maxWidth: 240, alignment: .trailing)
            }
        }
    }

    private func syncNow() {
        syncing = true
        syncMessage = nil
        let api = model.api
        Task {
            do {
                try await api.integrations.syncNow()
                syncMessage = (String(localized: "Synced."), false)
            } catch {
                syncMessage = (error.localizedDescription, true)
            }
            syncing = false
        }
    }

    /// The fixed Sonarr / Radarr / 4K cards, for a server before 0.43.
    @ViewBuilder
    private func fixedArrCards(_ overview: API.IntegrationsOverview) -> some View {
        ArrCard(provider: .sonarr, settings: overview.sonarr)
        ArrCard(provider: .radarr, settings: overview.radarr)
        // 0.37+; an older server omits them.
        if let sonarr4k = overview.sonarr4k {
            ArrCard(
                provider: .sonarr4k,
                settings: sonarr4k,
                title: String(localized: "4K Sonarr (optional)"),
                description: String(localized: "A second Sonarr for 4K copies. Once it's set up, members can request shows in 4K, and approving those adds them here instead of to the main Sonarr.")
            )
        }
        if let radarr4k = overview.radarr4k {
            ArrCard(
                provider: .radarr4k,
                settings: radarr4k,
                title: String(localized: "4K Radarr (optional)"),
                description: String(localized: "A second Radarr for 4K copies. Once it's set up, members can request movies in 4K, and approving those adds them here instead of to the main Radarr.")
            )
        }
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: @escaping () -> Content) -> some View {
        SettingsSection(title: title, content: content)
    }
}

/// components/seerr-import-card.tsx: the way to the website's importer
/// (app/settings/integrations/import-seerr), which does the connect →
/// preview → import steps. Opened in the browser on the server's own
/// address, signed in there.
private struct SeerrImportCard: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL

    private var importerURL: URL? {
        model.session.server?.baseURL.appending(path: "settings/integrations/import-seerr") // i18n-ignore
    }

    var body: some View {
        IntegrationCard(
            title: String(localized: "Import from Seerr"),
            description: String(localized: "Switching from Seerr, Overseerr or Jellyseerr? Bring your household's accounts, requests, problem reports and blocklist over from its API. Nothing is sent to Sonarr or Radarr, and running it again only picks up what's new. The importer runs on the website.")
        ) {
            if let importerURL {
                Button(String(localized: "Open the importer in your browser")) { openURL(importerURL) }
                    .buttonStyle(OutlineButtonStyle())
            }
        }
    }
}

/// Card chrome shared by every integration.
struct IntegrationCard<Content: View>: View {
    let title: String
    var description: String?
    var connected = false
    var connectedLabel = String(localized: "Connected")
    var headerAccessory: AnyView?
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.textPrimary)
                    if let description {
                        Text(description)
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer(minLength: 12)
                HStack(spacing: 10) {
                    if connected { ConnectedPill(text: connectedLabel) }
                    if let headerAccessory { headerAccessory }
                }
            }
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
    }
}

/// components/disconnect-button.tsx — confirm inline before removing.
private struct DisconnectButton: View {
    let name: String
    let disconnect: @MainActor (MarqueeAPI) async throws -> Void

    @Environment(AppModel.self) private var model
    @State private var confirming = false
    @State private var pending = false
    @State private var error: String?

    var body: some View {
        HStack(spacing: 8) {
            if let error {
                Text(error).font(.system(size: 11)).foregroundStyle(Theme.danger)
            }
            if confirming {
                Text("Disconnect \(name)?")
                    .font(.system(size: 11.5))
                    .foregroundStyle(Theme.textSecondary)
                Button(pending ? "Disconnecting…" : "Confirm") { run() }
                    .buttonStyle(QuietButtonStyle(color: Theme.danger))
                    .disabled(pending)
                Button("Cancel") { confirming = false }
                    .buttonStyle(QuietButtonStyle())
                    .disabled(pending)
            } else {
                Button("Disconnect") { confirming = true }
                    .buttonStyle(QuietButtonStyle())
            }
        }
        .font(.system(size: 11.5))
    }

    private func run() {
        pending = true
        error = nil
        let api = model.api
        Task {
            do {
                try await disconnect(api)
                confirming = false
            } catch {
                self.error = error.localizedDescription
            }
            pending = false
        }
    }
}

// MARK: - Plex (components/plex-connect-card.tsx)

private struct PlexCard: View {
    let settings: API.PlexSettings

    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL
    @State private var waiting = false
    @State private var error: String?
    @State private var pollTask: Task<Void, Never>?

    /// The website polls every 2.5s and gives up after 2 minutes.
    private static let pollInterval: Duration = .milliseconds(2500)
    private static let timeout: TimeInterval = 120

    var body: some View {
        IntegrationCard(
            title: "Plex",
            connected: settings.connected,
            headerAccessory: settings.connected
                ? AnyView(DisconnectButton(name: "Plex") { try await $0.integrations.plex.disconnect() })
                : nil
        ) {
            if settings.connected {
                VStack(alignment: .leading, spacing: 4) {
                    Text(summaryLine(settings.servers, movieCount: settings.movieCount, tvCount: settings.tvCount, totalBytes: settings.totalBytes))
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.textPrimary)
                    Text(lastSyncedLine(settings.servers))
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.textMuted)
                }
            } else {
                Text("Sign in with your Plex account to see what's already in your library.")
                    .font(.system(size: 12.5))
                    .foregroundStyle(Theme.textSecondary)
                HStack(spacing: 12) {
                    Button(waiting ? "Waiting for Plex…" : "Connect Plex") { connect() }
                        .buttonStyle(AccentButtonStyle())
                        .disabled(waiting)
                    if waiting {
                        Text("Finish signing in in the browser window that just opened.")
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.textMuted)
                    }
                }
            }
            if let error { InlineMessage(text: error) }
        }
        .onDisappear {
            pollTask?.cancel()
            pollTask = nil
        }
    }

    private func connect() {
        pollTask?.cancel()
        waiting = true
        error = nil
        let api = model.api
        pollTask = Task {
            do {
                let pin = try await api.integrations.plex.startPin()
                if let url = pin.url { openURL(url) }
                let deadline = Date().addingTimeInterval(Self.timeout)
                while Date() < deadline {
                    try await Task.sleep(for: Self.pollInterval)
                    if try await api.integrations.plex.pollPin(pin.pinId).connected {
                        waiting = false
                        return
                    }
                }
                error = String(localized: "Timed out waiting for Plex sign-in. Try again.")
            } catch is CancellationError {
                // Settings closed mid-sign-in; nothing to report.
            } catch {
                self.error = error.localizedDescription
            }
            waiting = false
        }
    }
}

private func summaryLine(_ servers: [API.SyncedServer], movieCount: Int, tvCount: Int, totalBytes: Int64) -> String {
    let names = servers.compactMap(\.name).joined(separator: ", ")
    var parts = [String(localized: "\(movieCount) movies"), String(localized: "\(tvCount) TV shows")]
    if totalBytes > 0 { parts.append(Format.bytes(totalBytes)) }
    if !names.isEmpty { parts.insert(names, at: 0) }
    return parts.joined(separator: " · ")
}

private func lastSyncedLine(_ servers: [API.SyncedServer]) -> String {
    guard let last = servers.compactMap(\.lastSyncedAt).max() else {
        return String(localized: "Your library is kept in sync automatically.")
    }
    let when = Format.timeAgo(last)
    return String(localized: "Last synced \(when) · kept in sync automatically.")
}

// MARK: - Jellyfin (components/jellyfin-connect-card.tsx)

private struct JellyfinCard: View {
    let settings: API.JellyfinSettings

    @Environment(AppModel.self) private var model
    @State private var baseUrl = ""
    @State private var apiKey = ""
    @State private var pending = false
    @State private var message: (String, Bool)?

    var body: some View {
        IntegrationCard(
            title: String(localized: "Jellyfin or Emby"),
            description: settings.connectedName.map { name in
                String(localized: "Emby speaks the same language as Jellyfin, so either works here — connected to \(name).")
            } ?? String(localized: "Emby speaks the same language as Jellyfin, so either works here."),
            connected: settings.connected,
            headerAccessory: settings.connected
                ? AnyView(DisconnectButton(name: settings.connectedName ?? "Jellyfin") { try await $0.integrations.jellyfin.disconnect() })
                : nil
        ) {
            if settings.connected {
                Text(summaryLine(settings.servers, movieCount: settings.movieCount, tvCount: settings.tvCount, totalBytes: settings.totalBytes))
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.textPrimary)
            }
            Text("Generate an API key from the dashboard: Administration → API Keys in Jellyfin, or Advanced → API Keys in Emby.")
                .font(.system(size: 12))
                .foregroundStyle(Theme.textSecondary)
            SettingsField(label: String(localized: "Server URL"), text: $baseUrl, placeholder: "http://localhost:8096")
            SettingsField(
                label: String(localized: "API key"),
                text: $apiKey,
                placeholder: settings.hasApiKey ? String(localized: "•••••••••••••••• (enter to replace)") : "",
                secure: true
            )
            if let message { InlineMessage(text: message.0, isError: message.1) }
            Button(pending ? "Testing…" : "Test & save") { save() }
                .buttonStyle(AccentButtonStyle())
                .disabled(pending)
        }
        .onAppear {
            if baseUrl.isEmpty { baseUrl = settings.baseUrl ?? "" }
        }
    }

    private func save() {
        pending = true
        message = nil
        let api = model.api
        let url = baseUrl
        let key = apiKey
        Task {
            do {
                try await api.integrations.jellyfin.connect(baseUrl: url, apiKey: key)
                apiKey = ""
                message = (String(localized: "Connected successfully."), false)
            } catch {
                message = (error.localizedDescription, true)
            }
            pending = false
        }
    }
}

// MARK: - Sonarr / Radarr (components/arr-credential-form.tsx)

private struct ArrCard: View {
    let provider: API.ArrProvider
    let settings: API.ArrSettings
    /// The card's heading; the provider's name unless given ("4K Sonarr (optional)").
    var title: String?
    var description: String?

    @Environment(AppModel.self) private var model
    @State private var baseUrl = ""
    @State private var apiKey = ""
    @State private var pending = false
    @State private var message: (String, Bool)?
    @State private var options: API.ArrOptions?
    @State private var rootFolder = ""
    @State private var qualityProfileId = 0
    @State private var savingDefaults = false
    @State private var savedDefaults = false

    var body: some View {
        IntegrationCard(
            title: title ?? provider.displayName,
            description: description,
            connected: settings.connected,
            headerAccessory: settings.connected
                ? AnyView(DisconnectButton(name: provider.displayName) { try await $0.integrations.arr(provider).disconnect() })
                : nil
        ) {
            SettingsField(label: String(localized: "Server URL"), text: $baseUrl, placeholder: "http://localhost:\(provider.defaultPort)")
            SettingsField(
                label: String(localized: "API key"),
                text: $apiKey,
                placeholder: settings.hasApiKey ? String(localized: "•••••••••••••••• (enter to replace)") : "",
                secure: true
            )
            if let message { InlineMessage(text: message.0, isError: message.1) }
            Button(pending ? "Testing…" : "Test & save") { save() }
                .buttonStyle(AccentButtonStyle())
                .disabled(pending)

            if let options, !options.rootFolders.isEmpty, !options.qualityProfiles.isEmpty {
                Divider().overlay(Theme.border).padding(.vertical, 4)
                Text("Defaults used when adding new titles:")
                    .font(.system(size: 12.5))
                    .foregroundStyle(Theme.textSecondary)
                Picker("Root folder", selection: $rootFolder) {
                    ForEach(options.rootFolders) { folder in
                        Text(folder.path).tag(folder.path)
                    }
                }
                Picker("Quality profile", selection: $qualityProfileId) {
                    ForEach(options.qualityProfiles) { profile in
                        Text(profile.name).tag(profile.id)
                    }
                }
                HStack {
                    Button(savingDefaults ? "Saving…" : "Save defaults") { saveDefaults() }
                        .buttonStyle(OutlineButtonStyle())
                        .disabled(savingDefaults)
                    if savedDefaults {
                        InlineMessage(text: String(localized: "Saved."), isError: false)
                    }
                }
            } else if settings.connected && !settings.fullyConfigured {
                InlineMessage(text: String(localized: "Pick a root folder and quality profile before adding titles — test the connection to load them."))
            }
        }
        .task(id: settings) {
            if baseUrl.isEmpty { baseUrl = settings.baseUrl ?? "" }
            guard settings.connected else {
                // Disconnected — don't leave stale defaults pickers behind.
                options = nil
                savedDefaults = false
                return
            }
            guard options == nil else { return }
            if let loaded = try? await model.api.integrations.arr(provider).options(), !Task.isCancelled {
                apply(loaded, selectedRootFolder: settings.rootFolderPath, selectedQualityProfileId: settings.qualityProfileId)
            }
        }
    }

    private func apply(_ loaded: API.ArrOptions, selectedRootFolder: String?, selectedQualityProfileId: Int?) {
        options = loaded
        rootFolder = selectedRootFolder ?? loaded.rootFolders.first?.path ?? ""
        qualityProfileId = selectedQualityProfileId ?? loaded.qualityProfiles.first?.id ?? 0
    }

    private func save() {
        pending = true
        message = nil
        savedDefaults = false
        let api = model.api
        let url = baseUrl
        let key = apiKey
        Task {
            do {
                let result = try await api.integrations.arr(provider).connect(baseUrl: url, apiKey: key)
                apiKey = ""
                baseUrl = result.baseUrl
                apply(result.options, selectedRootFolder: result.selectedRootFolder, selectedQualityProfileId: result.selectedQualityProfileId)
                message = (String(localized: "Connected successfully."), false)
            } catch {
                message = (error.localizedDescription, true)
            }
            pending = false
        }
    }

    private func saveDefaults() {
        savingDefaults = true
        savedDefaults = false
        let api = model.api
        let path = rootFolder
        let profile = qualityProfileId
        Task {
            do {
                try await api.integrations.arr(provider).saveDefaults(rootFolderPath: path, qualityProfileId: profile)
                savedDefaults = true
            } catch {
                message = (error.localizedDescription, true)
            }
            savingDefaults = false
        }
    }
}

// MARK: - TMDb

private struct TMDbCard: View {
    let settings: API.TMDbSettings

    var body: some View {
        SecretCard(
            title: "TMDb",
            description: String(localized: "Shared by everyone on this server — every poster, search, and title page comes from here."),
            fieldLabel: String(localized: "API key or access token"),
            placeholder: String(localized: "v3 API key or v4 access token, from themoviedb.org/settings/api"),
            removeLabel: String(localized: "Remove saved token"),
            connected: settings.savedInSettings,
            connectedLabel: settings.savedInSettings
                ? String(localized: "Connected")
                : (settings.configuredFromEnv ? String(localized: "Using environment variable") : String(localized: "Connected")),
            note: settings.savedInSettings
                ? nil
                : (settings.configuredFromEnv
                    ? String(localized: "Using the TMDB_ACCESS_TOKEN environment variable set on your server. Saving a token here overrides it.")
                    : nil),
            save: { try await $0.integrations.tmdb.save($1) },
            remove: { try await $0.integrations.tmdb.remove() }
        )
    }
}

// MARK: - Test & save secret cards (tmdb/tvdb/discord/ntfy/webhook)

private struct SecretCard: View {
    let title: String
    let description: String
    let fieldLabel: String
    let placeholder: String
    var successMessage = String(localized: "Connected successfully.")
    let removeLabel: String
    let connected: Bool
    var connectedLabel = String(localized: "Connected")
    /// An extra line under the field (TMDb's "using environment variable").
    var note: String?
    /// The setting's `PUT` ("Test & save") and `DELETE` (remove).
    let save: @MainActor (MarqueeAPI, String) async throws -> Void
    let remove: @MainActor (MarqueeAPI) async throws -> Void

    @Environment(AppModel.self) private var model
    @State private var value = ""
    @State private var pending = false
    @State private var removing = false
    @State private var message: (String, Bool)?

    /// The chip shows for a saved secret *or* a server-side environment value.
    private var showsChip: Bool { connected || connectedLabel != String(localized: "Connected") }

    var body: some View {
        IntegrationCard(
            title: title,
            description: description,
            connected: showsChip,
            connectedLabel: connectedLabel
        ) {
            if let note {
                Text(note)
                    .font(.system(size: 11.5))
                    .foregroundStyle(Theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            SettingsField(
                label: fieldLabel,
                text: $value,
                placeholder: connected ? String(localized: "•••••••••••••••• (enter to replace)") : placeholder,
                secure: true
            )
            if let message { InlineMessage(text: message.0, isError: message.1) }
            HStack(spacing: 12) {
                Button(pending ? "Testing…" : "Test & save") { submit() }
                    .buttonStyle(AccentButtonStyle())
                    .disabled(pending)
                if connected {
                    Button(removing ? "Removing…" : removeLabel) { removeSaved() }
                        .buttonStyle(QuietButtonStyle())
                        .font(.system(size: 12))
                        .disabled(removing)
                }
            }
        }
    }

    private func submit() {
        pending = true
        message = nil
        let entered = value
        let api = model.api
        Task {
            do {
                try await save(api, entered)
                value = ""
                message = (successMessage, false)
            } catch {
                message = (error.localizedDescription, true)
            }
            pending = false
        }
    }

    private func removeSaved() {
        removing = true
        message = nil
        let api = model.api
        Task {
            do {
                try await remove(api)
                value = ""
                message = nil
            } catch {
                message = (error.localizedDescription, true)
            }
            removing = false
        }
    }
}

// MARK: - Telegram / Pushover / email (components/notification-channel-cards.tsx)

private let keepSavedPlaceholder = String(localized: "•••••••••••••••• (leave blank to keep)")

/// A labelled field with the website's hint line under it.
private struct ChannelField: View {
    let label: String
    @Binding var text: String
    var placeholder = ""
    var secure = false
    var hint: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            SettingsField(label: label, text: $text, placeholder: placeholder, secure: secure)
            if let hint {
                Text(hint)
                    .font(.system(size: 11.5))
                    .foregroundStyle(Theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

/// The card around a channel's fields: "Test & save" (`PUT`) and
/// "Remove {name}" (`DELETE`). Blank secrets keep the saved ones.
private struct ChannelCard<Fields: View>: View {
    let title: String
    let description: String
    let removeLabel: String
    let successMessage: String
    let connected: Bool
    let save: @MainActor (MarqueeAPI) async throws -> Void
    let remove: @MainActor (MarqueeAPI) async throws -> Void
    /// Clears the secret fields after a save or removal.
    let reset: @MainActor () -> Void
    @ViewBuilder let fields: () -> Fields

    @Environment(AppModel.self) private var model
    @State private var pending = false
    @State private var removing = false
    @State private var message: (String, Bool)?

    var body: some View {
        IntegrationCard(title: title, description: description, connected: connected) {
            fields()
            if let message { InlineMessage(text: message.0, isError: message.1) }
            HStack(spacing: 12) {
                Button(pending ? "Testing…" : "Test & save") { submit() }
                    .buttonStyle(AccentButtonStyle())
                    .disabled(pending)
                if connected {
                    Button(removing ? "Removing…" : removeLabel) { removeSaved() }
                        .buttonStyle(QuietButtonStyle())
                        .font(.system(size: 12))
                        .disabled(removing)
                }
            }
        }
    }

    private func submit() {
        pending = true
        message = nil
        let api = model.api
        Task {
            do {
                try await save(api)
                reset()
                message = (successMessage, false)
            } catch {
                message = (error.localizedDescription, true)
            }
            pending = false
        }
    }

    private func removeSaved() {
        removing = true
        message = nil
        let api = model.api
        Task {
            do {
                try await remove(api)
                reset()
            } catch {
                message = (error.localizedDescription, true)
            }
            removing = false
        }
    }
}

private struct TelegramCard: View {
    let settings: API.TelegramSettings

    @State private var botToken = ""
    @State private var chatId = ""

    var body: some View {
        ChannelCard(
            title: String(localized: "Telegram notifications"),
            description: String(localized: "Posts to a Telegram chat, group or channel through your own bot whenever something is grabbed, downloaded, or a request is approved/rejected."),
            removeLabel: String(localized: "Remove Telegram"),
            successMessage: String(localized: "Connected — check the chat for a test message."),
            connected: settings.connected,
            save: { [botToken, chatId] in try await $0.integrations.telegram.save(botToken: botToken, chatId: chatId) },
            remove: { try await $0.integrations.telegram.remove() },
            reset: { botToken = "" }
        ) {
            ChannelField(
                label: String(localized: "Bot token"),
                text: $botToken,
                placeholder: settings.connected ? keepSavedPlaceholder : "123456789:AA…",
                secure: true,
                hint: String(localized: "Message @BotFather on Telegram, send /newbot, and paste the token it gives you.")
            )
            ChannelField(
                label: String(localized: "Chat ID"),
                text: $chatId,
                placeholder: String(localized: "123456789, -100…, or @channelname"),
                hint: String(localized: "Send your bot a message (or add it to the group), then open api.telegram.org/bot<token>/getUpdates to find the chat's id.")
            )
        }
        .onAppear {
            if chatId.isEmpty { chatId = settings.chatId ?? "" }
        }
        .onChange(of: settings) { _, fresh in
            if let saved = fresh.chatId { chatId = saved }
        }
    }
}

private struct PushoverCard: View {
    let connected: Bool

    @State private var appToken = ""
    @State private var userKey = ""

    var body: some View {
        ChannelCard(
            title: String(localized: "Pushover notifications"),
            description: String(localized: "Sends a push notification through Pushover whenever something is grabbed, downloaded, or a request is approved/rejected."),
            removeLabel: String(localized: "Remove Pushover"),
            successMessage: String(localized: "Connected — a test notification is on its way."),
            connected: connected,
            save: { [appToken, userKey] in try await $0.integrations.pushover.save(appToken: appToken, userKey: userKey) },
            remove: { try await $0.integrations.pushover.remove() },
            reset: {
                appToken = ""
                userKey = ""
            }
        ) {
            ChannelField(
                label: String(localized: "Application token"),
                text: $appToken,
                placeholder: connected ? keepSavedPlaceholder : "",
                secure: true,
                hint: String(localized: "Create an application at pushover.net/apps/build and copy its API token.")
            )
            ChannelField(
                label: String(localized: "User or group key"),
                text: $userKey,
                secure: true,
                hint: String(localized: "Your user key is at the top of your pushover.net dashboard.")
            )
        }
    }
}

private struct EmailCard: View {
    let settings: API.EmailSettings

    @State private var host = ""
    @State private var port = ""
    @State private var secure = false
    @State private var username = ""
    @State private var password = ""
    @State private var from = ""
    @State private var to = ""
    @State private var prefilled = false

    var body: some View {
        ChannelCard(
            title: String(localized: "Email notifications"),
            description: String(localized: "Emails one or more addresses through your own mail server (SMTP) whenever something is grabbed, downloaded, or a request is approved/rejected."),
            removeLabel: String(localized: "Remove Email"),
            successMessage: String(localized: "Connected — check the inbox for a test email."),
            connected: settings.connected,
            save: { [request] in try await $0.integrations.email.save(request) },
            remove: { try await $0.integrations.email.remove() },
            reset: { password = "" }
        ) {
            ChannelField(label: String(localized: "SMTP server"), text: $host, placeholder: "smtp.gmail.com")
            ChannelField(label: String(localized: "Port"), text: $port, placeholder: "587", hint: String(localized: "587 for most servers; 465 with \"Secure connection\" on."))
            ChannelField(label: String(localized: "Username"), text: $username, placeholder: String(localized: "Leave blank if the server needs none"))
            ChannelField(
                label: String(localized: "Password"),
                text: $password,
                placeholder: settings.connected ? keepSavedPlaceholder : "",
                secure: true,
                hint: String(localized: "For Gmail, an app password (myaccount.google.com/apppasswords), not your normal one.")
            )
            ChannelField(label: String(localized: "From address"), text: $from, placeholder: "marquee@example.com")
            ChannelField(
                label: String(localized: "Send to"),
                text: $to,
                placeholder: "you@example.com, partner@example.com", // i18n-ignore
                hint: String(localized: "One or more addresses, separated by commas.")
            )
            Toggle("Secure connection from the start (TLS, usually port 465)", isOn: $secure)
                .toggleStyle(.checkbox)
                .font(.system(size: 12))
                .foregroundStyle(Theme.textSecondary)
        }
        .onAppear { prefill(settings) }
        .onChange(of: settings) { _, fresh in
            prefilled = false
            prefill(fresh)
        }
    }

    /// The form as the server expects it. An unreadable port goes as 0 so
    /// the server answers with its own message.
    private var request: API.EmailRequest {
        API.EmailRequest(
            host: host.trimmingCharacters(in: .whitespaces),
            port: Int(port.trimmingCharacters(in: .whitespaces)) ?? 0,
            secure: secure,
            username: username.trimmingCharacters(in: .whitespaces),
            password: password,
            from: from.trimmingCharacters(in: .whitespaces),
            // Like the server's parseRecipients: commas, semicolons or spaces.
            to: to.split(whereSeparator: { $0 == "," || $0 == ";" || $0.isWhitespace }).map(String.init)
        )
    }

    private func prefill(_ saved: API.EmailSettings) {
        guard !prefilled else { return }
        prefilled = true
        host = saved.host ?? ""
        port = String(saved.port ?? 587)
        secure = saved.secure
        username = saved.username ?? ""
        from = saved.from ?? ""
        to = saved.to.joined(separator: ", ")
    }
}

// MARK: - Trakt (components/trakt-connect-card.tsx)

private struct TraktCard: View {
    let connected: Bool

    @Environment(AppModel.self) private var model
    @State private var listURL = ""
    @State private var importing = false
    @State private var importMessage: (String, Bool)?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SecretCard(
                title: "Trakt",
                description: String(localized: "Import a public Trakt list or watchlist as requests — doesn't require Trakt sign-in, just a free API app."),
                fieldLabel: String(localized: "Client ID"),
                placeholder: String(localized: "From a Trakt API app at trakt.tv/oauth/applications"),
                removeLabel: String(localized: "Remove saved client ID"),
                connected: connected,
                save: { try await $0.integrations.trakt.save($1) },
                remove: { try await $0.integrations.trakt.remove() }
            )
            if connected {
                VStack(alignment: .leading, spacing: 10) {
                    SettingsField(label: String(localized: "Import a list"), text: $listURL, placeholder: "https://trakt.tv/users/username/lists/best-of-2024")
                    Text("Also works with a watchlist URL (…/users/username/watchlist). The list must be public on Trakt's side. Matching titles not already owned or requested are added to your pending Requests queue.")
                        .font(.system(size: 11.5))
                        .foregroundStyle(Theme.textMuted)
                        .fixedSize(horizontal: false, vertical: true)
                    if let importMessage { InlineMessage(text: importMessage.0, isError: importMessage.1) }
                    Button(importing ? "Importing…" : "Import") { runImport() }
                        .buttonStyle(OutlineButtonStyle())
                        .disabled(importing)
                }
                .cardSurface()
            }
        }
    }

    private func runImport() {
        importing = true
        importMessage = nil
        let api = model.api
        let url = listURL
        Task {
            do {
                let result = try await api.integrations.trakt.importList(url: url)
                let imported = result.importedCount
                let skipped = result.skippedCount
                let text = skipped > 0
                    ? String(localized: "Imported \(imported) titles (\(skipped) skipped — already owned or requested).")
                    : String(localized: "Imported \(imported) titles.")
                importMessage = (text, false)
            } catch {
                importMessage = (error.localizedDescription, true)
            }
            importing = false
        }
    }
}

// MARK: - Sonarr/Radarr webhooks (components/webhook-settings-card.tsx)

private struct ArrWebhooksCard: View {
    let webhooks: API.ArrWebhooks
    /// A connected 4K instance shows its own URL too (0.37+).
    var radarr4kConnected = false
    var sonarr4kConnected = false
    /// 0.43+: every server has its own URL under Download Clients, so these
    /// are the older shared ones (they keep working).
    var isLegacy = false

    @Environment(AppModel.self) private var model
    @State private var current: API.ArrWebhooks?
    @State private var regenerating = false
    @State private var confirming = false
    @State private var error: String?

    private var live: API.ArrWebhooks { current ?? webhooks }

    var body: some View {
        IntegrationCard(
            title: isLegacy ? String(localized: "Older shared webhook URLs") : String(localized: "Sonarr / Radarr webhooks"),
            description: isLegacy
                ? String(localized: "Each server under Download Clients now has its own webhook URL — use those for anything new. These shared URLs from before keep working for servers already set up with them.")
                : String(localized: "Your server listens for these so Radarr/Sonarr can tell it the moment something starts or finishes downloading. Paste them into Radarr/Sonarr → Settings → Connect → Add → Webhook (method POST, trigger on Grab + Download)."),
            connected: true,
            connectedLabel: String(localized: "Listening")
        ) {
            CopyField(value: live.radarrUrl, label: String(localized: "Radarr webhook URL"))
            CopyField(value: live.sonarrUrl, label: String(localized: "Sonarr webhook URL"))
            if radarr4kConnected, let url = live.radarr4kUrl {
                CopyField(value: url, label: String(localized: "4K Radarr webhook URL"))
            }
            if sonarr4kConnected, let url = live.sonarr4kUrl {
                CopyField(value: url, label: String(localized: "4K Sonarr webhook URL"))
            }
            if let error { InlineMessage(text: error) }
            if confirming {
                HStack(spacing: 8) {
                    Text("Regenerate? The URLs above stop working immediately.")
                        .font(.system(size: 11.5))
                        .foregroundStyle(Theme.textSecondary)
                    Button(regenerating ? "Regenerating…" : "Confirm") { regenerate() }
                        .buttonStyle(QuietButtonStyle(color: Theme.danger))
                        .font(.system(size: 12))
                        .disabled(regenerating)
                    Button("Cancel") { confirming = false }
                        .buttonStyle(QuietButtonStyle())
                        .font(.system(size: 12))
                        .disabled(regenerating)
                }
            } else {
                Button("Regenerate secret") { confirming = true }
                    .buttonStyle(QuietButtonStyle())
                    .font(.system(size: 12))
            }
        }
        .onChange(of: webhooks) { _, fresh in
            current = fresh
        }
    }

    private func regenerate() {
        regenerating = true
        error = nil
        let api = model.api
        Task {
            do {
                current = try await api.integrations.regenerateWebhookSecret()
                confirming = false
            } catch {
                self.error = error.localizedDescription
            }
            regenerating = false
        }
    }
}
