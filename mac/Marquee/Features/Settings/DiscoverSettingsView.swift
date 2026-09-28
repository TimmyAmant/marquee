import SwiftUI

/// app/settings/discover/page.tsx — Settings › Discover (0.49+, the admin
/// only): every Discover row in order, hidden ones included. Move them with
/// the arrows (or drag), show or hide each, rename or remove the admin's own
/// rows, and add new ones. Everyone in the household sees this order.
struct DiscoverSettingsView: View {
    @Environment(AppModel.self) private var model
    @State private var discover = DiscoverSettingsModel()
    @State private var adding = false
    @State private var confirmingReset = false
    @State private var renamingId: String?
    @State private var renameText = ""

    var body: some View {
        SettingsPane(
            title: String(localized: "Discover"),
            subtitle: String(localized: "Choose which rows Discover shows, and in what order. Everyone in your household sees the same page."),
            trailing: discover.settings == nil ? nil : AnyView(headerButtons)
        ) {
            if discover.isUnavailable {
                Text("This server doesn't have Discover settings yet. Update it to Marquee 0.49 or later.")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.textMuted)
            } else if let settings = discover.settings {
                if let error = discover.error { InlineMessage(text: error) }
                VStack(spacing: 0) {
                    ForEach(Array(settings.shelves.enumerated()), id: \.element.id) { index, row in
                        if index > 0 { Divider().overlay(Theme.border) }
                        rowView(row, index: index, count: settings.shelves.count)
                    }
                }
                .frame(maxWidth: .infinity)
                .cardSurface(padding: 0)

                Text(footnote(settings))
                    .font(.system(size: 11.5))
                    .foregroundStyle(Theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)

                // 0.53+: which country streaming and Discover are for.
                DiscoverLocaleCard()
            } else if let loadError = discover.loadError {
                InlineMessage(text: loadError)
            } else {
                LoadingView()
            }
        }
        .task(id: ReloadKey(token: model.reloadToken, remote: model.events.remoteRevision(of: .settings))) {
            await discover.load(model.api)
        }
        .sheet(isPresented: $adding) {
            AddDiscoverRowSheet(traktConfigured: discover.settings?.traktConfigured ?? true) { row in
                discover.added(row)
            }
            .environment(model)
        }
        .confirmationDialog("Reset Discover to the default rows?", isPresented: $confirmingReset) {
            Button("Reset") {
                let api = model.api
                Task { await discover.reset(api) }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("The built-in rows go back to their usual order, all shown. Your own rows stay, after them.")
        }
        .confirmationDialog(
            removingRow.map { String(localized: "Remove \($0.title)?") } ?? String(localized: "Remove this row?"),
            isPresented: Binding(
                get: { discover.confirmingRemoveId != nil },
                set: { if !$0 { discover.confirmingRemoveId = nil } }
            ),
            presenting: removingRow
        ) { row in
            Button("Remove", role: .destructive) {
                let api = model.api
                Task { await discover.remove(row.id, api) }
            }
            Button("Cancel", role: .cancel) {}
        } message: { _ in
            Text("It comes off Discover for everyone.")
        }
    }

    private var removingRow: API.DiscoverRowSetting? {
        discover.rows.first { $0.id == discover.confirmingRemoveId }
    }

    private var headerButtons: some View {
        HStack(spacing: 8) {
            Button("Reset to default") { confirmingReset = true }
                .buttonStyle(OutlineButtonStyle(compact: true))
                .disabled(discover.isSaving)
            Button {
                adding = true
            } label: {
                Label("Add row", systemImage: "plus")
            }
            .buttonStyle(AccentButtonStyle(compact: true))
            .disabled(!discover.canAddRow)
            .help(discover.canAddRow ? "Add a row of your own" : "Discover can have up to \(discover.settings?.maxCustomShelves ?? 30) rows of your own. Remove one first.")
        }
    }

    private func footnote(_ settings: API.DiscoverSettings) -> String {
        let count = discover.customCount
        let limit = settings.maxCustomShelves
        var sentences = [String(localized: "Your own rows: \(count) of \(limit). Drag a row, or use the arrows, to move it.")]
        if !settings.traktConfigured, settings.shelves.contains(where: { $0.rowKind == .traktList }) {
            sentences.append(String(localized: "Trakt rows stay empty until Trakt is connected in Settings › General."))
        }
        return sentences.joined(separator: " ")
    }

    // MARK: Rows

    private func rowView(_ row: API.DiscoverRowSetting, index: Int, count: Int) -> some View {
        HStack(alignment: .center, spacing: 12) {
            Image(systemName: "line.3.horizontal")
                .font(.system(size: 12))
                .foregroundStyle(Theme.textMuted)
                .help("Drag to move")

            VStack(alignment: .leading, spacing: 2) {
                if renamingId == row.id {
                    HStack(spacing: 8) {
                        TextField("Name", text: $renameText)
                            .textFieldStyle(.roundedBorder)
                            .frame(maxWidth: 260)
                            .onSubmit { commitRename(row) }
                        Button("Save") { commitRename(row) }
                            .buttonStyle(AccentButtonStyle(compact: true))
                            .disabled(discover.isSaving)
                        Button("Cancel") { renamingId = nil }
                            .buttonStyle(QuietButtonStyle())
                            .font(.system(size: 12))
                    }
                } else {
                    Text(row.title)
                        .font(.system(size: 13.5, weight: .medium))
                        .foregroundStyle(row.hidden ? Theme.textMuted : Theme.textPrimary)
                }
                Text(row.sourceLine ?? String(localized: "Built-in"))
                    .font(.system(size: 11.5))
                    .foregroundStyle(Theme.textMuted)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }

            Spacer(minLength: 8)

            if row.custom, renamingId != row.id {
                Button("Rename") {
                    renameText = row.title
                    renamingId = row.id
                }
                .buttonStyle(QuietButtonStyle())
                .font(.system(size: 12))
                Button("Remove") { discover.confirmingRemoveId = row.id }
                    .buttonStyle(QuietButtonStyle(color: Theme.danger))
                    .font(.system(size: 12))
            }

            Toggle("Show", isOn: Binding(
                get: { !row.hidden },
                set: { shown in
                    let api = model.api
                    Task { await discover.setHidden(row.id, !shown, api) }
                }
            ))
            .toggleStyle(.switch)
            .controlSize(.small)
            .labelsHidden()
            .help(row.hidden ? "Hidden — turn on to show it" : "Shown — turn off to hide it")

            HStack(spacing: 2) {
                moveButton("chevron.up", String(localized: "Move up"), row, by: -1, disabled: index == 0)
                moveButton("chevron.down", String(localized: "Move down"), row, by: 1, disabled: index == count - 1)
            }
        }
        .disabled(discover.isSaving && renamingId != row.id)
        .padding(.horizontal, 18)
        .padding(.vertical, 10)
        .contentShape(Rectangle())
        .draggable(row.id)
        .dropDestination(for: String.self) { ids, _ in
            drop(ids.first, onto: row)
        }
    }

    private func moveButton(_ systemImage: String, _ label: String, _ row: API.DiscoverRowSetting, by offset: Int, disabled: Bool) -> some View {
        Button {
            let api = model.api
            Task { await discover.move(row.id, by: offset, api) }
        } label: {
            Image(systemName: systemImage)
                .font(.system(size: 11, weight: .semibold))
                .frame(width: 22, height: 22)
                .contentShape(Rectangle())
        }
        .buttonStyle(QuietButtonStyle())
        .disabled(disabled)
        .help(label)
        .accessibilityLabel("\(label): \(row.title)")
    }

    /// A row dragged onto `target` takes its place.
    private func drop(_ id: String?, onto target: API.DiscoverRowSetting) -> Bool {
        let rows = discover.rows
        guard let id, id != target.id,
              let from = rows.firstIndex(where: { $0.id == id }),
              let to = rows.firstIndex(where: { $0.id == target.id })
        else { return false }
        let api = model.api
        Task { await discover.move(fromOffsets: [from], toOffset: to > from ? to + 1 : to, api) }
        return true
    }

    private func commitRename(_ row: API.DiscoverRowSetting) {
        let api = model.api
        let title = renameText
        Task {
            if await discover.rename(row.id, to: title, api) { renamingId = nil }
        }
    }
}

// MARK: - Add row

/// "Add row": what the row shows (a TMDb keyword, genre, studio, network or
/// list, a Trakt list, or what was added to Plex/Jellyfin lately), and an
/// optional name.
struct AddDiscoverRowSheet: View {
    let traktConfigured: Bool
    let onAdded: (API.DiscoverRowSetting) -> Void

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var draft = DiscoverRowDraft()
    @State private var results: [API.DiscoverLookupResult] = []
    @State private var searching = false
    @State private var lookupError: String?
    @State private var adding = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Add a Discover row")
                .font(.marqueeDisplay(22))

            Picker("Shows", selection: Binding(get: { draft.kind }, set: { draft.setKind($0) })) {
                ForEach(DiscoverRowDraft.kinds, id: \.self) { kind in
                    Text(kind.label).tag(kind)
                }
            }
            .pickerStyle(.menu)

            if !draft.kind.mediaTypeChoices.isEmpty {
                Picker("Titles", selection: $draft.mediaType) {
                    ForEach(draft.kind.mediaTypeChoices, id: \.self) { choice in
                        Text(choice.label).tag(choice)
                    }
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 280)
            }

            source

            SettingsField(label: String(localized: "Name (optional)"), text: $draft.title, placeholder: String(localized: "Named after what it shows"))
                .onChange(of: draft.title) { _, value in
                    if value.count > API.AddDiscoverRowRequest.maxTitleLength {
                        draft.title = String(value.prefix(API.AddDiscoverRowRequest.maxTitleLength))
                    }
                }

            if let error { InlineMessage(text: error) }

            HStack {
                Spacer()
                Button("Cancel") { dismiss() }
                    .buttonStyle(OutlineButtonStyle())
                    .keyboardShortcut(.cancelAction)
                Button(adding ? "Adding…" : "Add row") { add() }
                    .buttonStyle(AccentButtonStyle())
                    .keyboardShortcut(.defaultAction)
                    .disabled(adding)
            }
        }
        .font(.system(size: 12.5))
        .padding(24)
        .frame(width: 480)
        .background(Theme.bg1)
        .task(id: LookupKey(kind: draft.kind, query: draft.query, mediaType: draft.kind == .genre ? draft.genreMediaType : nil)) {
            await lookUp()
        }
    }

    // MARK: What it's built from

    @ViewBuilder
    private var source: some View {
        switch draft.kind {
        case .keyword, .company, .network, .genre:
            VStack(alignment: .leading, spacing: 8) {
                SettingsField(label: searchLabel, text: $draft.query, placeholder: searchPlaceholder)
                lookupResults
                if let picked = draft.picked {
                    Text("Picked: \(picked.name)")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.textSecondary)
                }
            }
        case .tmdbList:
            VStack(alignment: .leading, spacing: 5) {
                SettingsField(label: String(localized: "TMDb list"), text: $draft.tmdbList, placeholder: String(localized: "8136 or https://www.themoviedb.org/list/8136"))
                hint(String(localized: "The list's number, or its link on themoviedb.org. It has to be public."))
            }
        case .traktList:
            VStack(alignment: .leading, spacing: 5) {
                SettingsField(label: String(localized: "Trakt link"), text: $draft.traktURL, placeholder: "https://trakt.tv/users/someone/lists/favourites")
                hint(String(localized: "A public list or watchlist on trakt.tv."))
                if !traktConfigured {
                    InlineMessage(text: String(localized: "Trakt isn't connected, so this row stays empty until the admin connects it in Settings › General."))
                }
            }
        case .library:
            hint(String(localized: "The newest titles on your Plex or Jellyfin server."))
        case .unknown:
            EmptyView()
        }
    }

    private var searchLabel: String {
        switch draft.kind {
        case .keyword: return String(localized: "Search TMDb keywords")
        case .company: return String(localized: "Search studios")
        case .network: return String(localized: "Search networks")
        default: return String(localized: "Filter genres")
        }
    }

    private var searchPlaceholder: String {
        switch draft.kind {
        case .keyword: return String(localized: "e.g. anime, time travel")
        case .company: return String(localized: "e.g. A24")
        case .network: return String(localized: "e.g. HBO, or a TMDb network number")
        default: return String(localized: "e.g. Comedy")
        }
    }

    @ViewBuilder
    private var lookupResults: some View {
        if let lookupError {
            InlineMessage(text: lookupError)
        } else if searching && results.isEmpty {
            ProgressView().controlSize(.small)
        } else if results.isEmpty {
            if draft.kind == .genre || draft.query.nonBlank != nil {
                Text("Nothing found.")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.textMuted)
            }
        } else {
            ScrollView {
                VStack(spacing: 0) {
                    ForEach(results) { result in
                        resultRow(result)
                    }
                }
            }
            .frame(height: min(CGFloat(results.count) * 34, 204))
            .background(Theme.bg0, in: RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Theme.border))
        }
    }

    private func resultRow(_ result: API.DiscoverLookupResult) -> some View {
        let isPicked = draft.picked?.tmdbId == result.tmdbId
        return Button {
            draft.picked = result
        } label: {
            HStack(spacing: 8) {
                Image(systemName: isPicked ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(isPicked ? Theme.accent : Theme.textMuted)
                Text(result.name)
                    .foregroundStyle(Theme.textPrimary)
                if let detail = result.detail.nonBlank {
                    Text(detail)
                        .foregroundStyle(Theme.textMuted)
                }
                Spacer()
            }
            .font(.system(size: 12.5))
            .padding(.horizontal, 10)
            .frame(height: 34)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func hint(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 11.5))
            .foregroundStyle(Theme.textMuted)
            .fixedSize(horizontal: false, vertical: true)
    }

    // MARK: Actions

    /// Searches as you type (after a short pause); the genre list loads
    /// straight away.
    private func lookUp() async {
        lookupError = nil
        guard let type = draft.kind.lookupType else {
            results = []
            return
        }
        let query = draft.query
        if type != .genre, type != .network, query.nonBlank == nil {
            results = []
            return
        }
        if query.nonBlank != nil {
            try? await Task.sleep(for: .milliseconds(300))
            if Task.isCancelled { return }
        }
        searching = true
        defer { searching = false }
        do {
            let fresh = try await model.api.discoverSettings.lookup(type, query: query, mediaType: draft.genreMediaType)
            if Task.isCancelled { return }
            results = fresh
            if let picked = draft.picked, !fresh.contains(where: { $0.tmdbId == picked.tmdbId }), draft.kind == .genre {
                draft.picked = nil
            }
        } catch let failure as APIError where failure.isCancellation {
            return
        } catch {
            if Task.isCancelled { return }
            results = []
            lookupError = error.localizedDescription
        }
    }

    private func add() {
        guard !adding else { return }
        guard let request = draft.request else {
            error = draft.missingMessage
            return
        }
        error = nil
        adding = true
        let api = model.api
        Task {
            do {
                let row = try await api.discoverSettings.add(request)
                onAdded(row)
                dismiss()
            } catch {
                self.error = error.localizedDescription
            }
            adding = false
        }
    }
}

private struct LookupKey: Hashable {
    let kind: API.DiscoverRowKind
    let query: String
    let mediaType: API.MediaType?
}

/// app/settings/discover/region-language-settings.tsx (0.53+): the country
/// "Currently streaming on" and a movie's release dates are for, and the
/// region and original language TMDb's Popular and Upcoming rows are picked
/// from. Saves as each is changed; hidden on an older server.
private struct DiscoverLocaleCard: View {
    @Environment(AppModel.self) private var model
    @State private var locale: API.DiscoverLocale?
    @State private var error: String?
    @State private var saving = false

    var body: some View {
        Group {
            if let locale {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Region & language")
                        .font(.system(size: 14, weight: .semibold))
                    Text("Which country streaming providers and release dates are for, and where and in what language TMDb's Popular and Upcoming rows are picked from.")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 10) {
                        GridRow {
                            Text("Streaming region")
                            Picker("Streaming region", selection: binding(\.streamingRegion)) {
                                Text("Automatic — \(Self.regionName(locale.effective.streamingRegion))").tag(String?.none)
                                ForEach(locale.regions, id: \.self) { code in
                                    Text(Self.regionName(code)).tag(String?.some(code))
                                }
                            }
                            .labelsHidden()
                            .frame(width: 260)
                        }
                        GridRow {
                            Text("Discover region")
                            Picker("Discover region", selection: binding(\.discoverRegion)) {
                                Text("Worldwide").tag(String?.none)
                                ForEach(locale.regions, id: \.self) { code in
                                    Text(Self.regionName(code)).tag(String?.some(code))
                                }
                            }
                            .labelsHidden()
                            .frame(width: 260)
                        }
                        GridRow {
                            Text("Discover language")
                            Picker("Discover language", selection: languageBinding) {
                                ForEach(locale.languages, id: \.self) { code in
                                    Text(Self.languageName(code)).tag(code)
                                }
                            }
                            .labelsHidden()
                            .frame(width: 260)
                        }
                    }
                    .font(.system(size: 13))
                    .disabled(saving)
                    if let error { InlineMessage(text: error) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .cardSurface()
            }
        }
        .task(id: model.reloadToken) {
            // An older server answers 404: no card.
            locale = try? await model.api.discoverSettings.locale()
        }
    }

    /// "United Kingdom (GB)".
    static func regionName(_ code: String) -> String {
        let name = Locale.current.localizedString(forRegionCode: code) ?? code
        return "\(name) (\(code))"
    }

    static func languageName(_ code: String) -> String {
        if code == "any" { return String(localized: "Any language") }
        return Locale.current.localizedString(forLanguageCode: code)?.localizedCapitalized ?? code
    }

    private func binding(_ key: WritableKeyPath<API.DiscoverLocale, String?>) -> Binding<String?> {
        Binding(
            get: { locale?[keyPath: key] },
            set: { value in
                guard var next = locale else { return }
                next[keyPath: key] = value
                save(next)
            }
        )
    }

    /// English is the default, sent as null.
    private var languageBinding: Binding<String> {
        Binding(
            get: { locale?.discoverLanguage ?? "en" },
            set: { value in
                guard var next = locale else { return }
                next.discoverLanguage = value == "en" ? nil : value
                save(next)
            }
        )
    }

    private func save(_ next: API.DiscoverLocale) {
        let previous = locale
        locale = next
        saving = true
        error = nil
        let api = model.api
        Task {
            do {
                locale = try await api.discoverSettings.saveLocale(next.update)
            } catch {
                locale = previous
                self.error = error.localizedDescription
            }
            saving = false
        }
    }
}
