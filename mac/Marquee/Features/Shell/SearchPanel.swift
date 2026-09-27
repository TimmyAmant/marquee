import SwiftUI

/// components/search-bar.tsx as a floating panel, Spotlight-style: the rail's
/// Search button and Edit › Find (⌘F) open it over the page. Type-ahead
/// suggestions appear as you type (↑↓ to pick one); Return opens the picked
/// suggestion or searches for the text; Escape or a click outside closes it.
struct SearchPanel: View {
    @Environment(AppModel.self) private var model

    @State private var query = ""
    @State private var suggestions: [API.SearchSuggestion] = []
    /// The suggestion ↑↓ has picked; nil means Return searches the text.
    @State private var highlighted: Int?
    @FocusState private var fieldFocused: Bool

    static let width: CGFloat = 560

    var body: some View {
        ZStack(alignment: .top) {
            // The click outside that closes it; a light dim so the panel reads
            // as on top of the page.
            Color.black.opacity(0.28)
                .ignoresSafeArea()
                .contentShape(Rectangle())
                .onTapGesture { close() }
                .accessibilityHidden(true)

            VStack(spacing: 0) {
                field
                if !suggestions.isEmpty {
                    Divider().overlay(Theme.glassBorder)
                    results
                }
            }
            .frame(width: Self.width)
            .glassSurface(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .shadow(color: .black.opacity(0.35), radius: 30, y: 12)
            .padding(.top, 90)
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Search")
        }
        .onAppear { fieldFocused = true }
        .onKeyPress(.escape) {
            close()
            return .handled
        }
        .task(id: query) { await suggest(query) }
    }

    private var field: some View {
        HStack(spacing: 12) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 18, weight: .medium))
                .foregroundStyle(Theme.textSecondary)
            TextField("Search an actor, a studio, a title…", text: $query)
                .textFieldStyle(.plain)
                .font(.system(size: 19))
                .foregroundStyle(Theme.textPrimary)
                .focused($fieldFocused)
                .onSubmit(submit)
                .onKeyPress(.downArrow) { move(1) }
                .onKeyPress(.upArrow) { move(-1) }
            if !query.isEmpty {
                Button {
                    query = ""
                    fieldFocused = true
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 15))
                        .foregroundStyle(Theme.textMuted)
                }
                .buttonStyle(.plain)
                .help("Clear")
            }
        }
        .padding(.horizontal, 18)
        .frame(height: 58)
    }

    /// Grouped like the website's dropdown — Movies, TV Shows, People,
    /// Studios & Networks — each under a small label; ↑↓ walk straight
    /// across the groups.
    private var results: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(Self.groups(suggestions), id: \.group) { run in
                        Text(run.group.label)
                            .font(.system(size: 10.5, weight: .semibold))
                            .textCase(.uppercase)
                            .kerning(0.6)
                            .foregroundStyle(Theme.textMuted)
                            .padding(.horizontal, 10)
                            .padding(.top, run.group == Self.groups(suggestions).first?.group ? 4 : 10)
                            .padding(.bottom, 2)
                            .accessibilityAddTraits(.isHeader)
                        ForEach(run.items, id: \.suggestion.stableId) { item in
                            SearchPanelRow(suggestion: item.suggestion, highlighted: highlighted == item.index) {
                                open(item.suggestion)
                            }
                            .id(item.index)
                            .onHover { if $0 { highlighted = item.index } }
                        }
                    }
                }
                .padding(6)
            }
            .frame(maxHeight: 460)
            .scrollBounceBehavior(.basedOnSize)
            .onChange(of: highlighted) { _, index in
                if let index { proxy.scrollTo(index) }
            }
        }
    }

    /// The suggestions as labelled runs, in the order the server sent them
    /// (already grouped), each keeping its index in the flat list; a kind
    /// this app can't open is left out. Pure; unit tested.
    nonisolated static func groups(
        _ suggestions: [API.SearchSuggestion]
    ) -> [(group: API.SuggestionGroup, items: [(index: Int, suggestion: API.SearchSuggestion)])] {
        var runs: [(group: API.SuggestionGroup, items: [(index: Int, suggestion: API.SearchSuggestion)])] = []
        for (index, suggestion) in suggestions.enumerated() {
            guard let group = suggestion.mediaType.group else { continue }
            if let last = runs.indices.last, runs[last].group == group {
                runs[last].items.append((index, suggestion))
            } else if let existing = runs.firstIndex(where: { $0.group == group }) {
                // An out-of-order row (an older server mixes kinds) joins its group.
                runs[existing].items.append((index, suggestion))
            } else {
                runs.append((group, [(index, suggestion)]))
            }
        }
        // Groups in the order the server sent them: movies, series, people,
        // studios & networks, or people first when the query names a person.
        return runs
    }

    /// The flat order ↑↓ walks: the groups' rows top to bottom.
    nonisolated static func navigationOrder(_ suggestions: [API.SearchSuggestion]) -> [Int] {
        groups(suggestions).flatMap { $0.items.map(\.index) }
    }

    // MARK: Actions

    private func move(_ step: Int) -> KeyPress.Result {
        let order = Self.navigationOrder(suggestions)
        guard !order.isEmpty else { return .ignored }
        let position = highlighted.flatMap { order.firstIndex(of: $0) }
        let next = (position ?? (step > 0 ? -1 : order.count)) + step
        highlighted = next < 0 || next >= order.count ? nil : order[next]
        return .handled
    }

    private func submit() {
        if let highlighted, suggestions.indices.contains(highlighted) {
            open(suggestions[highlighted])
            return
        }
        let text = query.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        close()
        model.search(text)
    }

    private func open(_ suggestion: API.SearchSuggestion) {
        close()
        if let titleID = suggestion.titleID {
            model.openTitle(titleID)
            return
        }
        switch suggestion.mediaType {
        case .person: model.open(.person(suggestion.id))
        case .company: model.open(.company(suggestion.id))
        case .network: model.browse(.tv, networkId: suggestion.id)
        case .movie, .tv, .unknown: break
        }
    }

    private func close() {
        model.isSearchOpen = false
    }

    /// After a short pause, `GET /search/suggest`. Under two characters the
    /// server would answer nothing, so the list just clears. A failed call
    /// leaves the list as it was; the Search page reports real errors.
    private func suggest(_ text: String) async {
        highlighted = nil
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        guard trimmed.count >= 2 else {
            suggestions = []
            return
        }
        try? await Task.sleep(for: .milliseconds(250))
        if Task.isCancelled { return }
        let results = (try? await model.api.search.suggestions(trimmed)) ?? suggestions
        if !Task.isCancelled { suggestions = results }
    }
}

/// A suggestion: poster, name over its subtitle, and its kind.
private struct SearchPanelRow: View {
    let suggestion: API.SearchSuggestion
    let highlighted: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                thumbnail
                    .frame(width: 44, height: 44)
                VStack(alignment: .leading, spacing: 2) {
                    Text(suggestion.name)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(Theme.textPrimary)
                        .lineLimit(1)
                    if let subtitle = suggestion.subtitle {
                        Text(subtitle)
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.textSecondary)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 8)
                SuggestionKindPill(kind: suggestion.mediaType, status: suggestion.status)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(highlighted ? Theme.textPrimary.opacity(0.1) : .clear)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    /// A poster for titles, a round photo for people, a logo on white for
    /// studios and networks.
    @ViewBuilder
    private var thumbnail: some View {
        switch suggestion.mediaType {
        case .person:
            ZStack {
                Theme.bg2
                if suggestion.posterPath.url(.w185) != nil {
                    RemoteImage(suggestion.posterPath, size: .w185, showsShimmer: false)
                } else {
                    Image(systemName: "person.fill")
                        .font(.system(size: 16))
                        .foregroundStyle(Theme.textMuted)
                }
            }
            .frame(width: 40, height: 40)
            .clipShape(Circle())
        case .company, .network:
            ZStack {
                Color.white
                if suggestion.posterPath.url(.w185) != nil {
                    RemoteImage(suggestion.posterPath, size: .w185, contentMode: .fit, showsShimmer: false)
                        .padding(4)
                } else {
                    Image(systemName: suggestion.mediaType == .network ? "tv" : "building.2")
                        .font(.system(size: 14))
                        .foregroundStyle(Color.black.opacity(0.55))
                }
            }
            .frame(width: 44, height: 30)
            .clipShape(RoundedRectangle(cornerRadius: 5))
        default:
            RemoteImage(suggestion.posterPath, size: .w92, showsShimmer: false)
                .frame(width: 30, height: 44)
                .background(Theme.bg2)
                .clipShape(RoundedRectangle(cornerRadius: 4))
        }
    }
}

/// The Movie/TV/Actor pill, wearing a title's library status in the same
/// tone as a poster's badge and strip (`API.LibraryStatus.tone`, the
/// website's lib/library/status-tone.ts): green in the library, purple
/// downloading, red missing, orange not monitored, blue coming soon (as in
/// Radarr and Sonarr). Not in the library, a
/// person, or a status this app doesn't know stays the plain grey outline.
struct SuggestionKindPill: View {
    let kind: API.SuggestionKind
    let status: API.LibraryStatus?

    /// (text, fill, border), or nil for the neutral pill.
    nonisolated static func colors(for status: API.LibraryStatus?) -> (foreground: Color, background: Color, border: Color)? {
        status?.tone.palette
    }

    /// "Movie · In your library"; just "Movie" when there's no known status.
    nonisolated static func accessibilityText(kind: API.SuggestionKind, status: API.LibraryStatus?) -> String {
        guard let status, status.isKnown else { return kind.label }
        return "\(kind.label) · \(status.name)"
    }

    var body: some View {
        let colors = Self.colors(for: status)
        let text = Self.accessibilityText(kind: kind, status: status)
        Text(kind.label)
            .font(.system(size: 10.5, weight: .medium))
            .foregroundStyle(colors?.foreground ?? Theme.textSecondary)
            .padding(.horizontal, 7)
            .padding(.vertical, 2)
            .background(Capsule().fill(colors?.background ?? .clear))
            .overlay(Capsule().strokeBorder(colors?.border ?? Theme.borderStrong))
            .help(text)
            .accessibilityLabel(text)
    }
}
