import SwiftUI

// Settings › Services › Override rules (components/override-rules-card.tsx,
// 0.58+): a tile per rule — where matching requests go and when — an Add
// tile, and a sheet to edit one. Hidden on an older server (404).

struct OverrideRulesSection: View {
    let servers: [API.ArrServer]

    @Environment(AppModel.self) private var model
    @State private var rules: [API.OverrideRule]?
    @State private var unsupported = false
    @State private var loadError: String?
    @State private var editing: EditTarget?
    @State private var members: [API.HouseholdMember] = []

    private struct EditTarget: Identifiable {
        let id = UUID()
        let rule: API.OverrideRule
    }

    private let columns = [GridItem(.adaptive(minimum: 300), spacing: 12, alignment: .top)]

    var body: some View {
        if !unsupported {
            SettingsSection(
                title: String(localized: "Override rules"),
                subtitle: String(localized: "Send some requests to another server, profile, folder or tags — by genre, original language, keyword or who asked. Applied when a request is approved and shown as the default under Advanced; picks made by hand still win.")
            ) {
                if servers.isEmpty {
                    Text("Add a Sonarr or Radarr server first.")
                        .font(.system(size: 12.5))
                        .foregroundStyle(Theme.textSecondary)
                } else if let rules {
                    LazyVGrid(columns: columns, alignment: .leading, spacing: 12) {
                        ForEach(rules) { rule in
                            OverrideRuleTile(rule: rule, server: servers.first { $0.id == rule.serverId }, members: members) {
                                editing = EditTarget(rule: rule)
                            } onRemoved: {
                                self.rules?.removeAll { $0.id == rule.id }
                            }
                            .frame(maxWidth: .infinity, alignment: .topLeading)
                            .cardSurface(padding: 16)
                        }
                        Button {
                            editing = EditTarget(rule: .blank(serverId: servers[0].id))
                        } label: {
                            VStack(spacing: 6) {
                                Image(systemName: "plus").font(.system(size: 18))
                                Text("Add rule").font(.system(size: 12.5, weight: .medium))
                            }
                            .foregroundStyle(Theme.textSecondary)
                            .frame(maxWidth: .infinity, minHeight: 120)
                            .background(
                                RoundedRectangle(cornerRadius: 16)
                                    .strokeBorder(Theme.border, style: StrokeStyle(lineWidth: 1, dash: [5, 4]))
                            )
                            .contentShape(RoundedRectangle(cornerRadius: 16))
                        }
                        .buttonStyle(.plain)
                    }
                } else if let loadError {
                    InlineMessage(text: loadError)
                } else {
                    ProgressView().controlSize(.small)
                }
            }
            .task(id: ReloadKey(token: model.reloadToken, local: model.events.revision(of: .settings))) { await load() }
            .sheet(item: $editing) { target in
                OverrideRuleEditor(rule: target.rule, servers: servers, members: members) { saved in
                    if let index = rules?.firstIndex(where: { $0.id == saved.id }) {
                        rules?[index] = saved
                    } else {
                        rules?.append(saved)
                    }
                }
            }
        }
    }

    private func load() async {
        do {
            let fresh = try await model.api.overrideRules.list()
            if Task.isCancelled { return }
            rules = fresh
            loadError = nil
            if members.isEmpty { members = (try? await model.api.users.list()) ?? [] }
        } catch APIError.notFound {
            unsupported = true
        } catch let failure as APIError where failure.isCancellation {
            return
        } catch {
            if rules == nil { loadError = error.localizedDescription }
        }
    }
}

/// The languages a rule can pick, as Discover offers them (ISO 639-1).
private let ruleLanguages = [
    "en", "es", "fr", "de", "pt", "it", "nl", "sv", "da", "no", "fi", "pl", "cs", "hu", "ro", "el",
    "tr", "ru", "uk", "he", "ar", "hi", "ta", "te", "ja", "ko", "zh", "th", "id", "ms", "tl", "vi",
]

private func languageName(_ code: String) -> String {
    Locale.current.localizedString(forLanguageCode: code) ?? code.uppercased()
}

private func serverLabel(_ server: API.ArrServer?) -> String {
    guard let server else { return String(localized: "A removed server") }
    let kind = server.is4k ? "4K \(server.kind.displayName)" : server.kind.displayName
    return "\(server.name) · \(kind)"
}

/// A rule's tile: its name, where it sends, what it matches, On/Off, Edit and Remove.
private struct OverrideRuleTile: View {
    let rule: API.OverrideRule
    let server: API.ArrServer?
    let members: [API.HouseholdMember]
    let onEdit: () -> Void
    let onRemoved: () -> Void

    @Environment(AppModel.self) private var model
    @State private var confirming = false
    @State private var removing = false
    @State private var error: String?

    private var conditions: [String] {
        rule.languages.map(languageName)
            + rule.keywords.map(\.name)
            + rule.userIds.map { id in
                members.first { $0.id.uuidString.lowercased() == id.lowercased() }.map { $0.displayName.nonBlank ?? $0.username }
                    ?? String(localized: "Former member")
            }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(rule.name)
                        .font(.system(size: 13.5, weight: .semibold))
                        .foregroundStyle(Theme.textPrimary)
                    Text("To \(serverLabel(server))")
                        .font(.system(size: 11.5))
                        .foregroundStyle(Theme.textMuted)
                }
                Spacer()
                Label(rule.enabled ? String(localized: "On") : String(localized: "Off"), systemImage: "circle.fill")
                    .labelStyle(RuleStatusLabelStyle())
                    .font(.system(size: 11.5))
                    .foregroundStyle(rule.enabled ? Theme.owned : Theme.textMuted)
            }
            FlowLayout(spacing: 6, lineSpacing: 6) {
                if !rule.hasConditions {
                    Text("Every request").font(.system(size: 11.5)).foregroundStyle(Theme.textMuted)
                }
                if !rule.genres.isEmpty {
                    TonePill(text: String(localized: "\(rule.genres.count) genres"), small: true)
                }
                ForEach(conditions, id: \.self) { condition in
                    TonePill(text: condition, small: true)
                }
            }
            Divider().overlay(Theme.border)
            HStack(spacing: 10) {
                if confirming {
                    Text("Remove “\(rule.name)”?").foregroundStyle(Theme.textSecondary)
                    Button(removing ? "Removing…" : "Remove") { remove() }
                        .buttonStyle(QuietButtonStyle(color: Theme.danger))
                    Button("Keep") { confirming = false }
                        .buttonStyle(QuietButtonStyle())
                } else {
                    Button("Edit", action: onEdit).buttonStyle(QuietButtonStyle())
                    Spacer(minLength: 0)
                    Button("Remove") { confirming = true }.buttonStyle(QuietButtonStyle(color: Theme.danger))
                }
            }
            .font(.system(size: 12))
            .disabled(removing)
            if let error { InlineMessage(text: error) }
        }
    }

    private func remove() {
        removing = true
        let api = model.api
        let id = rule.id
        Task {
            do {
                try await api.overrideRules.delete(id)
                onRemoved()
            } catch {
                self.error = error.localizedDescription
            }
            removing = false
        }
    }
}

/// The sheet that adds or edits a rule: its rows (the website's) and Save.
private struct OverrideRuleEditor: View {
    let servers: [API.ArrServer]
    let members: [API.HouseholdMember]
    let onSaved: (API.OverrideRule) -> Void

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var rule: API.OverrideRule
    @State private var genres: [API.RuleKeyword] = []
    @State private var options: API.ArrServerOptions?
    @State private var optionsError: String?
    @State private var keywordQuery = ""
    @State private var found: [API.RuleKeyword] = []
    @State private var saving = false
    @State private var error: String?

    init(rule: API.OverrideRule, servers: [API.ArrServer], members: [API.HouseholdMember], onSaved: @escaping (API.OverrideRule) -> Void) {
        self.servers = servers
        self.members = members
        self.onSaved = onSaved
        _rule = State(initialValue: rule)
    }

    private var server: API.ArrServer? { servers.first { $0.id == rule.serverId } }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(rule.id.isEmpty ? "Add rule" : "Edit rule")
                .font(.system(size: 17, weight: .semibold))
                .padding(.horizontal, 20)
                .padding(.top, 18)
            Text("A request matches when every condition you set holds; any one entry in a list will do. When several rules match, the one with the most conditions wins.")
                .font(.system(size: 12))
                .foregroundStyle(Theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 20)
                .padding(.top, 4)
                .padding(.bottom, 12)
            ScrollView {
                SettingsGroup {
                    SettingsRow(label: String(localized: "Name")) {
                        TextField("Anime to the anime folder", text: $rule.name)
                            .textFieldStyle(.roundedBorder)
                            .frame(width: 260)
                    }
                    SettingsRow(label: String(localized: "Server"), help: String(localized: "Where matching requests go. A 4K server's rules apply to 4K requests.")) {
                        Picker("Server", selection: $rule.serverId) {
                            ForEach(servers) { server in
                                Text(serverLabel(server)).tag(server.id)
                            }
                        }
                        .labelsHidden()
                        .frame(width: 260)
                    }
                    chipsRow(String(localized: "Genres"), help: String(localized: "None picked: any.")) {
                        ForEach(genres) { genre in
                            chip(genre.name, on: rule.genres.contains(genre.id)) { toggle(&rule.genres, genre.id) }
                        }
                    }
                    chipsRow(String(localized: "Original language"), help: String(localized: "None picked: any.")) {
                        ForEach(ruleLanguages, id: \.self) { code in
                            chip(languageName(code), on: rule.languages.contains(code)) { toggle(&rule.languages, code) }
                        }
                    }
                    keywordsRow
                    chipsRow(String(localized: "Requested by"), help: String(localized: "None picked: anyone.")) {
                        ForEach(members) { member in
                            let id = member.id.uuidString.lowercased()
                            chip(member.displayName.nonBlank ?? member.username, on: rule.userIds.contains(id)) { toggle(&rule.userIds, id) }
                        }
                    }
                    if let optionsError {
                        SettingsRow(label: String(localized: "The server didn't answer"), help: optionsError) { EmptyView() }
                    }
                    SettingsRow(label: String(localized: "Quality profile")) {
                        Picker("Quality profile", selection: $rule.qualityProfileId) {
                            Text("The server's default").tag(Int?.none)
                            ForEach(options?.qualityProfiles ?? []) { profile in
                                Text(profile.name).tag(Optional(profile.id))
                            }
                        }
                        .labelsHidden()
                        .frame(width: 260)
                    }
                    SettingsRow(label: String(localized: "Root folder")) {
                        Picker("Root folder", selection: $rule.rootFolderPath) {
                            Text("The server's default").tag(String?.none)
                            ForEach(options?.rootFolders ?? [], id: \.path) { folder in
                                Text(folder.path).tag(Optional(folder.path))
                            }
                        }
                        .labelsHidden()
                        .frame(width: 260)
                    }
                    chipsRow(String(localized: "Tags"), help: String(localized: "None picked: the server's default tags.")) {
                        ForEach(options?.tags ?? []) { tag in
                            chip(tag.label, on: rule.tags?.contains(tag.id) == true) {
                                var tags = rule.tags ?? []
                                toggle(&tags, tag.id)
                                rule.tags = tags.isEmpty ? nil : tags
                            }
                        }
                    }
                    SettingsRow(label: String(localized: "On")) {
                        Toggle("On", isOn: $rule.enabled).labelsHidden().toggleStyle(.switch)
                    }
                }
                .padding(.horizontal, 20)
            }
            if let error {
                InlineMessage(text: error).padding(.horizontal, 20).padding(.top, 8)
            }
            HStack {
                Spacer()
                Button("Cancel") { dismiss() }
                    .keyboardShortcut(.cancelAction)
                Button(saving ? String(localized: "Saving…") : (rule.id.isEmpty ? String(localized: "Add rule") : String(localized: "Save"))) { save() }
                    .buttonStyle(AccentButtonStyle(compact: true))
                    .keyboardShortcut(.defaultAction)
                    .disabled(saving || rule.name.nonBlank == nil)
            }
            .padding(20)
        }
        .frame(width: 640, height: 640)
        .background(Theme.bg0)
        .task(id: rule.serverId) { await loadServer() }
        .onChange(of: rule.serverId) { _, _ in
            // Another server's profiles, folders, tags and genres.
            rule.qualityProfileId = nil
            rule.rootFolderPath = nil
            rule.tags = nil
            rule.genres = []
        }
    }

    private var keywordsRow: some View {
        SettingsRow(
            label: String(localized: "Keywords"),
            help: String(localized: "TMDb keywords. An anime show only matches a rule that lists the “anime” keyword.")
        ) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    TextField("Search TMDb keywords", text: $keywordQuery)
                        .textFieldStyle(.roundedBorder)
                        .onSubmit { search() }
                    Button("Search") { search() }
                        .buttonStyle(OutlineButtonStyle(compact: true))
                }
                FlowLayout(spacing: 6, lineSpacing: 6) {
                    ForEach(rule.keywords) { keyword in
                        chip("\(keyword.name) ×", on: true) { rule.keywords.removeAll { $0.id == keyword.id } }
                    }
                    ForEach(found.filter { item in !rule.keywords.contains { $0.id == item.id } }.prefix(12)) { keyword in
                        chip("+ \(keyword.name)", on: false) { rule.keywords.append(keyword) }
                    }
                }
            }
            .frame(width: 300)
        }
    }

    private func chipsRow<Chips: View>(_ label: String, help: String, @ViewBuilder chips: @escaping () -> Chips) -> some View {
        SettingsRow(label: label, help: help) {
            ScrollView {
                FlowLayout(spacing: 6, lineSpacing: 6) { chips() }
            }
            .frame(width: 300, height: 96)
        }
    }

    private func chip(_ title: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 11.5))
                .padding(.horizontal, 9)
                .padding(.vertical, 4)
                .foregroundStyle(on ? Theme.accent : Theme.textSecondary)
                .background(Capsule().fill(on ? Theme.accent.opacity(0.15) : .clear))
                .overlay(Capsule().strokeBorder(on ? Theme.accent : Theme.border))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func toggle<T: Equatable>(_ list: inout [T], _ value: T) {
        if let index = list.firstIndex(of: value) { list.remove(at: index) } else { list.append(value) }
    }

    private func loadServer() async {
        guard let server else { return }
        let api = model.api
        let type: API.MediaType = server.kind == .sonarr ? .tv : .movie
        genres = (try? await api.overrideRules.genres(type)) ?? []
        do {
            options = try await api.integrations.arrServers.options(server.id)
            optionsError = nil
        } catch let failure as APIError where failure.isCancellation {
            return
        } catch {
            options = nil
            optionsError = error.localizedDescription
        }
    }

    private func search() {
        guard let query = keywordQuery.nonBlank else { return }
        let api = model.api
        Task { found = (try? await api.overrideRules.searchKeywords(query)) ?? [] }
    }

    private func save() {
        saving = true
        error = nil
        let api = model.api
        let rule = rule
        Task {
            do {
                let saved = try await api.overrideRules.save(rule)
                onSaved(saved)
                dismiss()
            } catch {
                self.error = error.localizedDescription
            }
            saving = false
        }
    }
}

/// A small dot before the status, like the server tiles'.
private struct RuleStatusLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 5) {
            configuration.icon.font(.system(size: 6))
            configuration.title
        }
    }
}
