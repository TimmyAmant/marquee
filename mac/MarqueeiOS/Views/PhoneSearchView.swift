import SwiftUI

/// The Search tab: type-ahead suggestions as you type (the Mac's search
/// panel, `GET /search/suggest`), and the full results page — the 0.55
/// sections in the server's order — once you press Search. With nothing
/// typed, this iPhone's recent searches. Opening a title pushes it over this
/// tab's root, so coming back finds the search as it was left.
struct PhoneSearchView: View {
    @Environment(AppModel.self) private var model

    @State private var query = ""
    /// What the results below are for; nil until a search is submitted.
    @State private var submitted: String?
    @State private var suggestions: [API.SearchSuggestion] = []
    /// This iPhone's recent searches (`RecentSearches`), newest first.
    @State private var recents: [String] = []

    var body: some View {
        Group {
            if let submitted, submitted == query.trimmingCharacters(in: .whitespaces) {
                SearchResultsView(query: submitted)
                    .id(submitted)
            } else if !suggestions.isEmpty {
                suggestionList
            } else if query.trimmingCharacters(in: .whitespaces).count < 2, !recents.isEmpty {
                recentList
            } else {
                ContentUnavailableView {
                    Label("Search", systemImage: "magnifyingglass")
                } description: {
                    Text("Search an actor, a studio, a title…")
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Theme.bg0)
            }
        }
        .navigationTitle("Search")
        .searchable(
            text: $query,
            placement: .navigationBarDrawer(displayMode: .always),
            prompt: Text("Search an actor, a studio, a title…")
        )
        .autocorrectionDisabled()
        .textInputAutocapitalization(.never)
        .onSubmit(of: .search) {
            let text = query.trimmingCharacters(in: .whitespaces)
            guard !text.isEmpty else { return }
            query = text
            submitted = text
            recents = RecentSearches.remember(text, account: model.currentAccountIdentity)
        }
        .onAppear { recents = RecentSearches.load(account: model.currentAccountIdentity) }
        .task(id: query) { await suggest(query) }
    }

    private var suggestionList: some View {
        List {
            ForEach(SearchPanel.groups(suggestions), id: \.group) { run in
                Section {
                    ForEach(run.items, id: \.suggestion.stableId) { item in
                        SearchPanelRow(suggestion: item.suggestion, highlighted: false) {
                            open(item.suggestion)
                        }
                        .listRowInsets(EdgeInsets(top: 2, leading: 10, bottom: 2, trailing: 10))
                        .listRowBackground(Theme.bg0)
                    }
                } header: {
                    Text(run.group.label)
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Theme.bg0)
        .scrollDismissesKeyboard(.immediately)
    }

    /// Recent searches, like the website's: a tap puts one back in the
    /// field, its suggestions coming up; × forgets it, Clear forgets them all.
    private var recentList: some View {
        List {
            Section {
                ForEach(recents, id: \.self) { recent in
                    HStack(spacing: 12) {
                        Button {
                            query = recent
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "clock")
                                    .foregroundStyle(Theme.textMuted)
                                Text(recent)
                                    .foregroundStyle(Theme.textPrimary)
                                    .lineLimit(1)
                                Spacer(minLength: 8)
                            }
                            .contentShape(Rectangle())
                        }
                        Button {
                            recents = RecentSearches.removing(recent, from: recents)
                            RecentSearches.save(recents, account: model.currentAccountIdentity)
                        } label: {
                            Image(systemName: "xmark")
                                .font(.footnote.weight(.medium))
                                .foregroundStyle(Theme.textMuted)
                                .frame(width: 32, height: 32)
                                .contentShape(Rectangle())
                        }
                        .accessibilityLabel("Remove “\(recent)” from recent searches")
                    }
                    // Two buttons in one row: each takes only its own taps.
                    .buttonStyle(.borderless)
                    .listRowBackground(Theme.bg0)
                }
            } header: {
                HStack {
                    Text("Recent searches")
                    Spacer()
                    Button("Clear") {
                        recents = []
                        RecentSearches.save([], account: model.currentAccountIdentity)
                    }
                    .font(.footnote)
                    .foregroundStyle(Theme.textMuted)
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Theme.bg0)
        .scrollDismissesKeyboard(.immediately)
    }

    private func open(_ suggestion: API.SearchSuggestion) {
        // What was typed, not the name picked: the search to come back to.
        recents = RecentSearches.remember(query, account: model.currentAccountIdentity)
        if let titleID = suggestion.titleID {
            model.openTitle(titleID)
            return
        }
        switch suggestion.mediaType {
        case .person: model.open(.person(suggestion.id))
        case .company: model.open(.company(suggestion.id))
        case .network: model.openNetwork(suggestion.id)
        case .movie, .tv, .unknown: break
        }
    }

    /// After a short pause, `GET /search/suggest`; cleared under two
    /// characters and once results are showing.
    private func suggest(_ text: String) async {
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        guard trimmed.count >= 2, trimmed != submitted else {
            suggestions = []
            return
        }
        try? await Task.sleep(for: .milliseconds(250))
        if Task.isCancelled { return }
        let results = (try? await model.api.search.suggestions(trimmed)) ?? suggestions
        if !Task.isCancelled { suggestions = results }
    }
}
