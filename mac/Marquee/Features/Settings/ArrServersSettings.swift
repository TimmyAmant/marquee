import SwiftUI

// Settings › Integrations › Download Clients (0.43+): any number of Sonarr and
// Radarr servers, each with its own defaults and webhook URL. An older server
// omits `arrServers` and keeps the four fixed cards instead.

/// The Add / Edit server sheet's fields, and the bodies they turn into.
struct ArrServerForm: Hashable, Sendable {
    let kind: API.ArrKind
    /// The server being edited; nil when adding one.
    let editing: API.ArrServer?

    var name = ""
    var baseUrl = ""
    /// Blank while editing keeps the saved key.
    var apiKey = ""
    var is4k = false
    var isDefault = false
    var qualityProfileId: Int?
    var rootFolderPath: String?
    var tags: Set<Int> = []
    // Sonarr only.
    var seriesType: API.SeriesType = .standard
    var seasonFolders = true
    /// nil: "Same as above".
    var animeQualityProfileId: Int?
    var animeRootFolderPath: String?
    var animeTags: Set<Int> = []
    /// The pickers' lists, once tested (or loaded for a saved server).
    private(set) var options: API.ArrServerOptions?

    /// A new server.
    init(kind: API.ArrKind, is4k: Bool = false) {
        self.kind = kind
        editing = nil
        self.is4k = is4k
    }

    /// Editing a saved server: its settings, and no key.
    init(editing server: API.ArrServer) {
        kind = server.kind
        editing = server
        name = server.name
        baseUrl = server.baseUrl
        is4k = server.is4k
        isDefault = server.isDefault
        qualityProfileId = server.qualityProfileId
        rootFolderPath = server.rootFolderPath
        tags = Set(server.tags)
        seriesType = server.seriesType ?? .standard
        seasonFolders = server.seasonFolders ?? true
        animeQualityProfileId = server.animeQualityProfileId
        animeRootFolderPath = server.animeRootFolderPath
        animeTags = Set(server.animeTags)
    }

    var isEditing: Bool { editing != nil }
    var isSonarr: Bool { kind == .sonarr }

    private var trimmedURL: String {
        var url = baseUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        while url.hasSuffix("/") { url.removeLast() }
        return url
    }

    private var enteredKey: String? { apiKey.nonBlank.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) } }

    /// The URL differs from the saved one (always true for a new server).
    var urlChanged: Bool {
        guard let editing else { return true }
        var saved = editing.baseUrl
        while saved.hasSuffix("/") { saved.removeLast() }
        return trimmedURL != saved
    }

    /// The default can't be switched off directly — another server has to
    /// take it ("Make another server the default instead.").
    var canChangeDefault: Bool { editing?.isDefault != true }

    /// Why Test / Save can't go yet, in the server's own words; nil when
    /// they can.
    var problem: String? {
        if trimmedURL.isEmpty || (!isEditing && enteredKey == nil) {
            return "URL and API key are required."
        }
        if isEditing && urlChanged && enteredKey == nil {
            return "Enter the API key again to change the URL."
        }
        return nil
    }

    /// `POST /settings/arr-servers/test`: an edited server with no new key
    /// is tested with its saved one (`serverId`).
    var testRequest: API.ArrServerTestRequest {
        if let editing, enteredKey == nil {
            return API.ArrServerTestRequest(kind: kind, baseUrl: trimmedURL, serverId: editing.id)
        }
        return API.ArrServerTestRequest(kind: kind, baseUrl: trimmedURL, apiKey: enteredKey)
    }

    /// `POST` for a new server, `PATCH` for an edited one. A blank name lets
    /// the server name it; the URL goes only when it changed while editing,
    /// the key only when one was typed, and `isDefault` only to make it the
    /// default.
    var saveRequest: API.ArrServerRequest {
        API.ArrServerRequest(
            kind: isEditing ? nil : kind,
            name: name.nonBlank.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) },
            baseUrl: urlChanged ? trimmedURL : nil,
            apiKey: enteredKey,
            is4k: is4k,
            // Only to take the default over: it can't be switched off here.
            isDefault: isDefault && editing?.isDefault != true ? true : nil,
            qualityProfileId: qualityProfileId,
            rootFolderPath: rootFolderPath,
            tags: tags.sorted(),
            sonarr: isSonarr
                ? API.ArrServerRequest.SonarrSettings(
                    seriesType: seriesType,
                    seasonFolders: seasonFolders,
                    animeQualityProfileId: animeQualityProfileId,
                    animeRootFolderPath: animeRootFolderPath,
                    animeTags: animeTags.sorted()
                )
                : nil
        )
    }

    /// Fills the pickers. A pick the server doesn't list any more falls back
    /// to its first (the anime ones to "Same as above"), and tags it doesn't
    /// have are dropped.
    mutating func apply(_ loaded: API.ArrServerOptions) {
        options = loaded
        let profiles = Set(loaded.qualityProfiles.map(\.id))
        let folders = Set(loaded.rootFolders.map(\.path))
        let tagIds = Set(loaded.tags.map(\.id))
        if qualityProfileId.map({ !profiles.contains($0) }) ?? true {
            qualityProfileId = loaded.qualityProfiles.first?.id
        }
        if rootFolderPath.map({ !folders.contains($0) }) ?? true {
            rootFolderPath = loaded.rootFolders.first?.path
        }
        tags.formIntersection(tagIds)
        if let anime = animeQualityProfileId, !profiles.contains(anime) { animeQualityProfileId = nil }
        if let anime = animeRootFolderPath, !folders.contains(anime) { animeRootFolderPath = nil }
        animeTags.formIntersection(tagIds)
    }
}

// MARK: - The list

/// One kind's servers ("Sonarr" or "Radarr") with "Add … server".
struct ArrServersCard: View {
    let kind: API.ArrKind
    let servers: [API.ArrServer]

    @State private var sheet: SheetTarget?

    private struct SheetTarget: Identifiable {
        let id = UUID()
        let form: ArrServerForm
    }

    private var description: String {
        switch kind {
        case .radarr:
            return "Movies are added here. Add as many as you like — a 4K one for 4K requests, a second for the kids' movies — and pick one under Advanced when approving."
        default:
            return "Shows are added here. Add as many as you like — a 4K one for 4K requests, a second for anime — and pick one under Advanced when approving."
        }
    }

    var body: some View {
        IntegrationCard(title: kind.displayName, description: description, connected: !servers.isEmpty) {
            if servers.isEmpty {
                Text("No \(kind.displayName) server yet.")
                    .font(.system(size: 12.5))
                    .foregroundStyle(Theme.textSecondary)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(servers.enumerated()), id: \.element.id) { index, server in
                        if index > 0 { Divider().overlay(Theme.border) }
                        ArrServerRow(server: server) { sheet = SheetTarget(form: ArrServerForm(editing: server)) }
                            .padding(.vertical, 12)
                    }
                }
            }
            Button("Add \(kind.displayName) server") { sheet = SheetTarget(form: ArrServerForm(kind: kind)) }
                .buttonStyle(OutlineButtonStyle())
        }
        .sheet(item: $sheet) { target in
            ArrServerSheet(form: target.form)
        }
    }
}

/// A server: name, URL and badges, its actions, and its webhook URL.
private struct ArrServerRow: View {
    let server: API.ArrServer
    let onEdit: () -> Void

    @Environment(AppModel.self) private var model
    @State private var busy: String?
    @State private var confirmingRemove = false
    @State private var confirmingRegenerate = false
    @State private var webhookUrl: String?
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text(server.name)
                            .font(.system(size: 13.5, weight: .semibold))
                            .foregroundStyle(Theme.textPrimary)
                        if server.isDefault { TonePill(text: "Default", tone: .owned, small: true) }
                        if server.is4k { TonePill(text: "4K", tone: .accent, small: true) }
                        if !server.fullyConfigured { TonePill(text: "Needs setup", tone: .danger, small: true) }
                    }
                    Text(server.baseUrl)
                        .font(.system(size: 11.5, design: .monospaced))
                        .foregroundStyle(Theme.textMuted)
                        .textSelection(.enabled)
                }
                Spacer(minLength: 12)
                actions
            }
            if !server.fullyConfigured {
                Text("Pick a quality profile and root folder before adding titles — Edit, then Test to load them.")
                    .font(.system(size: 11.5))
                    .foregroundStyle(Theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let error { InlineMessage(text: error) }
            if let url = webhookUrl ?? server.webhookUrl.nonBlank {
                CopyField(value: url, label: "Webhook URL — paste into \(server.kind.displayName) → Settings → Connect → Webhook (POST, on Grab and on Import)")
                regenerateControl
            }
        }
        .onChange(of: server.webhookUrl) { _, _ in webhookUrl = nil }
    }

    @ViewBuilder
    private var actions: some View {
        HStack(spacing: 10) {
            if confirmingRemove {
                Text("Remove \(server.name)?")
                    .foregroundStyle(Theme.textSecondary)
                Button(busy == "remove" ? "Removing…" : "Confirm") { remove() }
                    .buttonStyle(QuietButtonStyle(color: Theme.danger))
                Button("Cancel") { confirmingRemove = false }
                    .buttonStyle(QuietButtonStyle())
            } else {
                Button("Edit", action: onEdit)
                    .buttonStyle(QuietButtonStyle())
                if !server.isDefault {
                    Button(busy == "default" ? "Saving…" : "Make default") { makeDefault() }
                        .buttonStyle(QuietButtonStyle())
                }
                Button("Remove") { confirmingRemove = true }
                    .buttonStyle(QuietButtonStyle())
            }
        }
        .font(.system(size: 12))
        .disabled(busy != nil)
    }

    @ViewBuilder
    private var regenerateControl: some View {
        if confirmingRegenerate {
            HStack(spacing: 8) {
                Text("Regenerate? The URL above stops working immediately.")
                    .font(.system(size: 11.5))
                    .foregroundStyle(Theme.textSecondary)
                Button(busy == "webhook" ? "Regenerating…" : "Confirm") { regenerate() }
                    .buttonStyle(QuietButtonStyle(color: Theme.danger))
                    .font(.system(size: 12))
                Button("Cancel") { confirmingRegenerate = false }
                    .buttonStyle(QuietButtonStyle())
                    .font(.system(size: 12))
            }
            .disabled(busy != nil)
        } else {
            Button("Regenerate webhook URL") { confirmingRegenerate = true }
                .buttonStyle(QuietButtonStyle())
                .font(.system(size: 12))
        }
    }

    private func run(_ label: String, _ action: @escaping @MainActor (MarqueeAPI) async throws -> Void) {
        busy = label
        error = nil
        let api = model.api
        Task {
            do {
                try await action(api)
            } catch {
                self.error = error.localizedDescription
            }
            busy = nil
        }
    }

    private func makeDefault() {
        run("default") { [id = server.id] in
            _ = try await $0.integrations.arrServers.update(id, API.ArrServerRequest(isDefault: true))
        }
    }

    private func remove() {
        run("remove") { [id = server.id] in
            try await $0.integrations.arrServers.remove(id)
            confirmingRemove = false
        }
    }

    private func regenerate() {
        run("webhook") { [id = server.id] in
            webhookUrl = try await $0.integrations.arrServers.regenerateWebhook(id)
            confirmingRegenerate = false
        }
    }
}

// MARK: - Add / Edit

private struct ArrServerSheet: View {
    @State var form: ArrServerForm

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var testing = false
    @State private var loadingOptions = false
    @State private var saving = false
    @State private var testMessage: (String, Bool)?
    @State private var saveError: String?

    private var kindName: String { form.kind.displayName }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(form.editing.map { "Edit \($0.name)" } ?? "Add \(kindName) server")
                .font(.marqueeDisplay(22))
                .foregroundStyle(Theme.textPrimary)
                .padding([.horizontal, .top], 24)
                .padding(.bottom, 12)
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    connectionFields
                    Divider().overlay(Theme.border)
                    addSettings
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 16)
            }
            Divider().overlay(Theme.border)
            footer
                .padding(.horizontal, 24)
                .padding(.vertical, 14)
        }
        .frame(width: 540, height: 640)
        .background(Theme.bg1)
        .task { await loadSavedOptions() }
    }

    @ViewBuilder
    private var connectionFields: some View {
        SettingsField(label: "Name", text: $form.name, placeholder: form.is4k ? "4K \(kindName)" : kindName)
        SettingsField(label: "Server URL", text: $form.baseUrl, placeholder: "http://localhost:\(form.kind.defaultPort)")
        VStack(alignment: .leading, spacing: 5) {
            SettingsField(
                label: "API key",
                text: $form.apiKey,
                placeholder: form.isEditing ? "Saved — enter to replace" : "From Settings → General in \(kindName)",
                secure: true
            )
            if form.isEditing {
                hint("Changing the URL needs the API key again, so a saved key is never sent anywhere new.")
            }
        }
        Toggle("4K server — 4K requests and Add in 4K go here", isOn: $form.is4k)
            .toggleStyle(.checkbox)
            .font(.system(size: 12.5))
        VStack(alignment: .leading, spacing: 4) {
            Toggle("Default — titles go here when nobody picks a server", isOn: $form.isDefault)
                .toggleStyle(.checkbox)
                .font(.system(size: 12.5))
                .disabled(!form.canChangeDefault)
            if !form.canChangeDefault {
                hint("Make another server the default instead.")
            }
        }
        HStack(spacing: 12) {
            Button(testing ? "Testing…" : "Test") { test() }
                .buttonStyle(OutlineButtonStyle())
                .disabled(testing || saving)
            if loadingOptions {
                ProgressView().controlSize(.small)
            }
        }
        if let testMessage { InlineMessage(text: testMessage.0, isError: testMessage.1) }
    }

    @ViewBuilder
    private var addSettings: some View {
        Text("Used when adding titles")
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(Theme.textPrimary)
        if let options = form.options {
            if options.qualityProfiles.isEmpty || options.rootFolders.isEmpty {
                hint("\(kindName) has no quality profiles or root folders yet — add them there, then Test again.")
            }
            Picker("Quality profile", selection: $form.qualityProfileId) {
                ForEach(options.qualityProfiles) { profile in
                    Text(profile.name).tag(Optional(profile.id))
                }
            }
            Picker("Root folder", selection: $form.rootFolderPath) {
                ForEach(options.rootFolders) { folder in
                    Text(folder.path).tag(Optional(folder.path))
                }
            }
            tagChecklist("Tags", tags: options.tags, selection: $form.tags)
            if form.isSonarr {
                Picker("Series type", selection: $form.seriesType) {
                    ForEach(API.SeriesType.knownCases, id: \.self) { type in
                        Text(type.label).tag(type)
                    }
                }
                hint("For shows that aren't anime. Anime shows are added as Anime unless you pick otherwise when approving.")
                Toggle("Season folders", isOn: $form.seasonFolders)
                    .toggleStyle(.checkbox)
                    .font(.system(size: 12.5))
                Text("Anime")
                    .font(.system(size: 12.5, weight: .semibold))
                    .foregroundStyle(Theme.textPrimary)
                    .padding(.top, 4)
                Picker("Anime quality profile", selection: $form.animeQualityProfileId) {
                    Text("Same as above").tag(Int?.none)
                    ForEach(options.qualityProfiles) { profile in
                        Text(profile.name).tag(Optional(profile.id))
                    }
                }
                Picker("Anime root folder", selection: $form.animeRootFolderPath) {
                    Text("Same as above").tag(String?.none)
                    ForEach(options.rootFolders) { folder in
                        Text(folder.path).tag(Optional(folder.path))
                    }
                }
                tagChecklist("Anime tags", tags: options.tags, selection: $form.animeTags)
                hint("Used instead of the tags above for anime shows, when any are ticked.")
            }
        } else {
            hint(loadingOptions
                ? "Loading \(kindName)'s quality profiles, root folders and tags…"
                : "Test the connection to pick a quality profile, root folder and tags.")
        }
    }

    private var footer: some View {
        HStack(spacing: 10) {
            if let saveError {
                InlineMessage(text: saveError)
            }
            Spacer()
            Button("Cancel") { dismiss() }
                .buttonStyle(OutlineButtonStyle())
                .keyboardShortcut(.cancelAction)
            Button(saving ? "Saving…" : (form.isEditing ? "Save" : "Add server")) { save() }
                .buttonStyle(AccentButtonStyle())
                .keyboardShortcut(.defaultAction)
                .disabled(saving || testing)
        }
    }

    private func hint(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 11.5))
            .foregroundStyle(Theme.textMuted)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func tagChecklist(_ label: String, tags: [API.ArrTag], selection: Binding<Set<Int>>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: 12))
                .foregroundStyle(Theme.textSecondary)
            if tags.isEmpty {
                hint("No tags in \(kindName) yet.")
            } else {
                FlowLayout(spacing: 12, lineSpacing: 6) {
                    ForEach(tags) { tag in
                        Toggle(tag.label, isOn: Binding(
                            get: { selection.wrappedValue.contains(tag.id) },
                            set: { on in
                                if on { selection.wrappedValue.insert(tag.id) } else { selection.wrappedValue.remove(tag.id) }
                            }
                        ))
                        .toggleStyle(.checkbox)
                        .font(.system(size: 12))
                    }
                }
            }
        }
    }

    /// Editing: the saved server's lists, so the pickers work without a Test.
    private func loadSavedOptions() async {
        guard let editing = form.editing, form.options == nil else { return }
        loadingOptions = true
        defer { loadingOptions = false }
        do {
            let options = try await model.api.integrations.arrServers.options(editing.id)
            if Task.isCancelled { return }
            form.apply(options)
        } catch let failure as APIError where failure.isCancellation {
            return
        } catch {
            testMessage = (error.localizedDescription, true)
        }
    }

    private func test() {
        if let problem = form.problem {
            testMessage = (problem, true)
            return
        }
        testing = true
        testMessage = nil
        let api = model.api
        let request = form.testRequest
        Task {
            do {
                let result = try await api.integrations.arrServers.test(request)
                form.apply(result.options)
                let version = result.version.nonBlank.map { " \($0)" } ?? ""
                testMessage = ("Connected to \(kindName)\(version).", false)
            } catch {
                testMessage = (error.localizedDescription, true)
            }
            testing = false
        }
    }

    private func save() {
        if let problem = form.problem {
            saveError = problem
            return
        }
        saving = true
        saveError = nil
        let api = model.api
        let request = form.saveRequest
        let editingId = form.editing?.id
        Task {
            do {
                if let editingId {
                    _ = try await api.integrations.arrServers.update(editingId, request)
                } else {
                    _ = try await api.integrations.arrServers.add(request)
                }
                dismiss()
            } catch {
                saveError = error.localizedDescription
            }
            saving = false
        }
    }
}
