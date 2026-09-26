import SwiftUI

/// app/search/page.tsx — people, studios, titles, then a genre/keyword theme row.
struct SearchResultsView: View {
    let query: String

    @Environment(AppModel.self) private var model

    @State private var results: API.SearchResults?
    @State private var error: APIError?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 40) {
                Text("Results for “\(query)”")
                    .font(.marqueeDisplay(30))
                    .foregroundStyle(Theme.textPrimary)

                if let error, error.isTMDbUnconfigured {
                    TMDbMissingNotice(isAdmin: model.viewer?.isAdmin == true) {
                        model.openSettings(.integrations)
                    }
                } else if let results {
                    if results.isEmpty {
                        EmptyStateView(title: "No results for “\(query)”.", systemImage: "magnifyingglass")
                    }

                    if !results.people.isEmpty {
                        section("People") {
                            PosterGrid {
                                ForEach(results.people) { person in
                                    PosterCard(
                                        posterPath: person.profilePath,
                                        name: person.name,
                                        subtitle: person.knownForDepartment,
                                        favorite: person.favorited.map { FavoriteTarget(.person, person.tmdbId, favorited: $0) },
                                        link: .person(person.tmdbId)
                                    ) {
                                        model.open(.person(person.tmdbId))
                                    }
                                }
                            }
                        }
                    }

                    if !results.studios.isEmpty {
                        section("Studios") {
                            FlowLayout(spacing: 10, lineSpacing: 10) {
                                ForEach(results.studios) { studio in
                                    StudioChip(company: studio) { model.open(.company(studio.tmdbId)) }
                                }
                            }
                        }
                    }

                    if !results.titles.isEmpty {
                        section("Titles", showsColorKey: true) { titleGrid(results.titles) }
                    }

                    if let theme = results.theme, !theme.items.isEmpty {
                        section("\(theme.label) movies & TV", showsColorKey: results.titles.isEmpty) {
                            titleGrid(theme.items)
                        }
                    }
                } else if let error {
                    EmptyStateView(
                        title: "Couldn't search",
                        message: error.localizedDescription,
                        systemImage: "exclamationmark.triangle",
                        actionTitle: "Try again",
                        action: { model.reload() }
                    )
                } else {
                    LoadingView(label: "Searching…")
                }
            }
            // Left-aligned with the shelf pages' 28pt gutter, not centred,
            // so this page lines up with Discover at any window width.
            .padding(.horizontal, Metrics.pagePadding)
            .padding(.vertical, Metrics.pagePadding)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .scrollsUnderNavRail()
        .background(Theme.bg0)
        .navigationTitle("Search")
        .task(id: ReloadKey(token: model.reloadToken, remote: model.events.remoteRevision(of: [.library, .favorites]))) {
            await load()
        }
    }

    private func load() async {
        do {
            let fresh = try await model.api.search.results(query)
            if Task.isCancelled { return }
            results = fresh
            error = nil
        } catch let failure as APIError {
            if failure.isCancellation { return }
            error = failure
            if failure.isTMDbUnconfigured { results = nil }
        } catch {
            self.error = APIError.wrapping(error)
        }
    }

    private func section<Content: View>(
        _ title: String,
        showsColorKey: Bool = false,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 10) {
                SectionTitle(text: title)
                Spacer(minLength: 0)
                if showsColorKey { StatusColorKey() }
            }
            content()
        }
    }

    private func titleGrid(_ cards: [API.TitleCard]) -> some View {
        PosterGrid {
            ForEach(cards) { card in
                PosterCard(card: card) { model.openTitle(card.id) }
            }
        }
    }
}
