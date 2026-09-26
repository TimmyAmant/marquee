import SwiftUI

/// app/settings/integrations/page.tsx and its connect cards. One
/// `GET /settings/integrations` describes every provider; each card writes
/// through its own endpoint and the `.settings` event reloads the overview.
struct IntegrationsSettingsView: View {
    @Environment(AppModel.self) private var model

    @State private var overview: API.IntegrationsOverview?
    @State private var loadError: String?
    @State private var syncing = false
    @State private var syncMessage: (String, Bool)?

    var body: some View {
        SettingsPane(
            title: "Integrations",
            subtitle: "Connect Plex, Jellyfin, Sonarr, and Radarr so Marquee knows what you already own and can send the rest straight to your download queue. Credentials are stored encrypted on your server and only ever used on your behalf.",
            trailing: AnyView(syncButton)
        ) {
            if let overview {
                section("Media Libraries") {
                    PlexCard(settings: overview.plex)
                    JellyfinCard(settings: overview.jellyfin)
                }
                // 0.44+: single sign-on; nothing at all from an older server.
                SsoSettingsSection()
                section("Download Clients") {
                    // 0.43+: any number of servers. An older server omits
                    // the list and keeps the four fixed cards.
                    if overview.usesServerList {
                        ArrServersCard(kind: .sonarr, servers: overview.arrServers(of: .sonarr))
                        ArrServersCard(kind: .radarr, servers: overview.arrServers(of: .radarr))
                    } else {
                        fixedArrCards(overview)
                    }
                }
                section("Metadata Sources") {
                    TMDbCard(settings: overview.tmdb)
                    TraktCard(connected: overview.trakt.connected)
                    SecretCard(
                        title: "TheTVDB",
                        description: "Fills in poster art and an overview for TV shows when TMDb doesn't have them yet — Sonarr's own metadata comes from here too.",
                        fieldLabel: "API key",
                        placeholder: "From thetvdb.com/dashboard/account/apikey",
                        removeLabel: "Remove saved key",
                        connected: overview.tvdb.connected,
                        save: { try await $0.integrations.tvdb.save($1) },
                        remove: { try await $0.integrations.tvdb.remove() }
                    )
                }
                section("Household channels") {
                    // 0.45+: what these channels post.
                    HouseholdEventsCard()
                    ArrWebhooksCard(
                        webhooks: overview.arrWebhooks,
                        radarr4kConnected: overview.radarr4k?.connected == true,
                        sonarr4kConnected: overview.sonarr4k?.connected == true,
                        isLegacy: overview.usesServerList
                    )
                    SecretCard(
                        title: "Discord notifications",
                        description: "Posts a message to a Discord channel whenever something is grabbed, downloaded, or a request is approved/rejected.",
                        fieldLabel: "Webhook URL",
                        placeholder: "From a channel's Integrations → Webhooks settings in Discord",
                        successMessage: "Connected — check the channel for a test message.",
                        removeLabel: "Remove saved webhook",
                        connected: overview.discord.connected,
                        save: { try await $0.integrations.discord.save($1) },
                        remove: { try await $0.integrations.discord.remove() }
                    )
                    SecretCard(
                        title: "ntfy notifications",
                        description: "Sends a push notification via ntfy.sh (or a self-hosted ntfy server) for the same events.",
                        fieldLabel: "Topic URL",
                        placeholder: "https://ntfy.sh/your-topic-name",
                        successMessage: "Connected — check the topic for a test message.",
                        removeLabel: "Remove saved topic",
                        connected: overview.ntfy.connected,
                        save: { try await $0.integrations.ntfy.save($1) },
                        remove: { try await $0.integrations.ntfy.remove() }
                    )
                    // 0.36+; an older server omits them.
                    if let telegram = overview.telegram { TelegramCard(settings: telegram) }
                    if let pushover = overview.pushover { PushoverCard(connected: pushover.connected) }
                    if let email = overview.email { EmailCard(settings: email) }
                    SecretCard(
                        title: "Custom webhook",
                        description: "Posts a JSON payload ({ event, title, message }) to any URL for the same events — for your own automation or a notification gateway.",
                        fieldLabel: "Webhook URL",
                        placeholder: "https://your-endpoint.example.com/hook",
                        successMessage: "Connected — check your endpoint for a test request.",
                        removeLabel: "Remove saved webhook",
                        connected: overview.genericWebhook.connected,
                        save: { try await $0.integrations.webhook.save($1) },
                        remove: { try await $0.integrations.webhook.remove() }
                    )
                }
            } else if let loadError {
                InlineMessage(text: loadError)
            } else {
                LoadingView(label: "Checking your integrations…")
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
                syncMessage = ("Synced.", false)
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
                title: "4K Sonarr (optional)",
                description: "A second Sonarr for 4K copies. Once it's set up, members can request shows in 4K, and approving those adds them here instead of to the main Sonarr."
            )
        }
        if let radarr4k = overview.radarr4k {
            ArrCard(
                provider: .radarr4k,
                settings: radarr4k,
                title: "4K Radarr (optional)",
                description: "A second Radarr for 4K copies. Once it's set up, members can request movies in 4K, and approving those adds them here instead of to the main Radarr."
            )
        }
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SettingsSectionLabel(text: title)
            content()
        }
        .padding(.top, 8)
    }
}

/// Card chrome shared by every integration.
struct IntegrationCard<Content: View>: View {
    let title: String
    var description: String?
    var connected = false
    var connectedLabel = "Connected"
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
                error = "Timed out waiting for Plex sign-in. Try again."
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
    var counts = "\(movieCount) movies · \(tvCount) TV shows"
    if totalBytes > 0 { counts += " · \(Format.bytes(totalBytes))" }
    return names.isEmpty ? counts : "\(names) · \(counts)"
}

private func lastSyncedLine(_ servers: [API.SyncedServer]) -> String {
    guard let last = servers.compactMap(\.lastSyncedAt).max() else {
        return "Your library is kept in sync automatically."
    }
    return "Last synced \(Format.timeAgo(last)) · kept in sync automatically."
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
            title: "Jellyfin or Emby",
            description: "Emby speaks the same language as Jellyfin, so either works here"
                + (settings.connectedName.map { " — connected to \($0)" } ?? "") + ".",
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
            SettingsField(label: "Server URL", text: $baseUrl, placeholder: "http://localhost:8096")
            SettingsField(
                label: "API key",
                text: $apiKey,
                placeholder: settings.hasApiKey ? "•••••••••••••••• (enter to replace)" : "",
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
                message = ("Connected successfully.", false)
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
            SettingsField(label: "Server URL", text: $baseUrl, placeholder: "http://localhost:\(provider.defaultPort)")
            SettingsField(
                label: "API key",
                text: $apiKey,
                placeholder: settings.hasApiKey ? "•••••••••••••••• (enter to replace)" : "",
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
                        InlineMessage(text: "Saved.", isError: false)
                    }
                }
            } else if settings.connected && !settings.fullyConfigured {
                InlineMessage(text: "Pick a root folder and quality profile before adding titles — test the connection to load them.")
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
                message = ("Connected successfully.", false)
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
            description: "Shared by everyone on this server — every poster, search, and title page comes from here.",
            fieldLabel: "API key or access token",
            placeholder: "v3 API key or v4 access token, from themoviedb.org/settings/api",
            removeLabel: "Remove saved token",
            connected: settings.savedInSettings,
            connectedLabel: settings.savedInSettings
                ? "Connected"
                : (settings.configuredFromEnv ? "Using environment variable" : "Connected"),
            note: settings.savedInSettings
                ? nil
                : (settings.configuredFromEnv
                    ? "Using the TMDB_ACCESS_TOKEN environment variable set on your server. Saving a token here overrides it."
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
    var successMessage = "Connected successfully."
    let removeLabel: String
    let connected: Bool
    var connectedLabel = "Connected"
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
    private var showsChip: Bool { connected || connectedLabel != "Connected" }

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
                placeholder: connected ? "•••••••••••••••• (enter to replace)" : placeholder,
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

private let channelWhat = "whenever something is grabbed, downloaded, or a request is approved/rejected."
private let keepSavedPlaceholder = "•••••••••••••••• (leave blank to keep)"

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
            title: "Telegram notifications",
            description: "Posts to a Telegram chat, group or channel through your own bot \(channelWhat)",
            removeLabel: "Remove Telegram",
            successMessage: "Connected — check the chat for a test message.",
            connected: settings.connected,
            save: { [botToken, chatId] in try await $0.integrations.telegram.save(botToken: botToken, chatId: chatId) },
            remove: { try await $0.integrations.telegram.remove() },
            reset: { botToken = "" }
        ) {
            ChannelField(
                label: "Bot token",
                text: $botToken,
                placeholder: settings.connected ? keepSavedPlaceholder : "123456789:AA…",
                secure: true,
                hint: "Message @BotFather on Telegram, send /newbot, and paste the token it gives you."
            )
            ChannelField(
                label: "Chat ID",
                text: $chatId,
                placeholder: "123456789, -100…, or @channelname",
                hint: "Send your bot a message (or add it to the group), then open api.telegram.org/bot<token>/getUpdates to find the chat's id."
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
            title: "Pushover notifications",
            description: "Sends a push notification through Pushover \(channelWhat)",
            removeLabel: "Remove Pushover",
            successMessage: "Connected — a test notification is on its way.",
            connected: connected,
            save: { [appToken, userKey] in try await $0.integrations.pushover.save(appToken: appToken, userKey: userKey) },
            remove: { try await $0.integrations.pushover.remove() },
            reset: {
                appToken = ""
                userKey = ""
            }
        ) {
            ChannelField(
                label: "Application token",
                text: $appToken,
                placeholder: connected ? keepSavedPlaceholder : "",
                secure: true,
                hint: "Create an application at pushover.net/apps/build and copy its API token."
            )
            ChannelField(
                label: "User or group key",
                text: $userKey,
                secure: true,
                hint: "Your user key is at the top of your pushover.net dashboard."
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
            title: "Email notifications",
            description: "Emails one or more addresses through your own mail server (SMTP) \(channelWhat)",
            removeLabel: "Remove Email",
            successMessage: "Connected — check the inbox for a test email.",
            connected: settings.connected,
            save: { [request] in try await $0.integrations.email.save(request) },
            remove: { try await $0.integrations.email.remove() },
            reset: { password = "" }
        ) {
            ChannelField(label: "SMTP server", text: $host, placeholder: "smtp.gmail.com")
            ChannelField(label: "Port", text: $port, placeholder: "587", hint: "587 for most servers; 465 with \"Secure connection\" on.")
            ChannelField(label: "Username", text: $username, placeholder: "Leave blank if the server needs none")
            ChannelField(
                label: "Password",
                text: $password,
                placeholder: settings.connected ? keepSavedPlaceholder : "",
                secure: true,
                hint: "For Gmail, an app password (myaccount.google.com/apppasswords), not your normal one."
            )
            ChannelField(label: "From address", text: $from, placeholder: "marquee@example.com")
            ChannelField(
                label: "Send to",
                text: $to,
                placeholder: "you@example.com, partner@example.com",
                hint: "One or more addresses, separated by commas."
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
                description: "Import a public Trakt list or watchlist as requests — doesn't require Trakt sign-in, just a free API app.",
                fieldLabel: "Client ID",
                placeholder: "From a Trakt API app at trakt.tv/oauth/applications",
                removeLabel: "Remove saved client ID",
                connected: connected,
                save: { try await $0.integrations.trakt.save($1) },
                remove: { try await $0.integrations.trakt.remove() }
            )
            if connected {
                VStack(alignment: .leading, spacing: 10) {
                    SettingsField(label: "Import a list", text: $listURL, placeholder: "https://trakt.tv/users/username/lists/best-of-2024")
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
                let skipped = result.skippedCount > 0 ? " (\(result.skippedCount) skipped — already owned or requested)." : "."
                importMessage = ("Imported \(result.importedCount) title\(result.importedCount == 1 ? "" : "s")\(skipped)", false)
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
            title: isLegacy ? "Older shared webhook URLs" : "Sonarr / Radarr webhooks",
            description: isLegacy
                ? "Each server under Download Clients now has its own webhook URL — use those for anything new. These shared URLs from before keep working for servers already set up with them."
                : "Your server listens for these so Radarr/Sonarr can tell it the moment something starts or finishes downloading. Paste them into Radarr/Sonarr → Settings → Connect → Add → Webhook (method POST, trigger on Grab + Download).",
            connected: true,
            connectedLabel: "Listening"
        ) {
            CopyField(value: live.radarrUrl, label: "Radarr webhook URL")
            CopyField(value: live.sonarrUrl, label: "Sonarr webhook URL")
            if radarr4kConnected, let url = live.radarr4kUrl {
                CopyField(value: url, label: "4K Radarr webhook URL")
            }
            if sonarr4kConnected, let url = live.sonarr4kUrl {
                CopyField(value: url, label: "4K Sonarr webhook URL")
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
