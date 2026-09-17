import SwiftUI

/// app/favorites/page.tsx — one call, five sections.
struct FavoritesView: View {
    @Environment(AppModel.self) private var model

    @State private var favorites: API.FavoritesResponse?
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 40) {
                Text("Favorites")
                    .font(.marqueeDisplay(32))
                    .foregroundStyle(Theme.textPrimary)

                if let favorites {
                    if favorites.isEmpty {
                        EmptyStateView(
                            title: "Nothing favorited yet",
                            message: "Star anything from its page or card to see it here.",
                            systemImage: "star"
                        )
                    } else {
                        if !favorites.movies.isEmpty {
                            section("Movies") { titleGrid(favorites.movies) }
                        }
                        if !favorites.tv.isEmpty {
                            section("TV Shows") { titleGrid(favorites.tv) }
                        }
                        if !favorites.collections.isEmpty {
                            section("Collections") {
                                PosterGrid {
                                    ForEach(favorites.collections) { collection in
                                        PosterCard(
                                            posterPath: collection.posterPath,
                                            name: collection.name,
                                            favorite: FavoriteTarget(.collection, collection.collectionId, favorited: true)
                                        ) {
                                            if let first = collection.firstMovieTmdbId {
                                                model.openTitle(API.TitleID(.movie, first))
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        if !favorites.people.isEmpty {
                            section("People") {
                                PosterGrid {
                                    ForEach(favorites.people) { person in
                                        PosterCard(
                                            posterPath: person.profilePath,
                                            name: person.name,
                                            subtitle: person.knownForDepartment,
                                            favorite: FavoriteTarget(.person, person.tmdbId, favorited: person.favorited ?? true)
                                        ) {
                                            model.open(.person(person.tmdbId))
                                        }
                                    }
                                }
                            }
                        }
                        if !favorites.studios.isEmpty {
                            section("Studios") {
                                FlowLayout(spacing: 10, lineSpacing: 10) {
                                    ForEach(favorites.studios) { studio in
                                        StudioChip(company: studio) { model.open(.company(studio.tmdbId)) }
                                    }
                                }
                            }
                        }
                    }
                } else if let error {
                    EmptyStateView(
                        title: "Couldn't load your favorites",
                        message: error,
                        systemImage: "exclamationmark.triangle",
                        actionTitle: "Try again",
                        action: { model.reload() }
                    )
                } else {
                    LoadingView()
                }
            }
            .padding(.horizontal, 32)
            .padding(.vertical, 32)
            .frame(maxWidth: 1240, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(Theme.bg0)
        .navigationTitle("Favorites")
        .task(id: ReloadKey(token: model.reloadToken, remote: model.events.remoteRevision(of: .library), local: model.events.revision(of: .favorites))) {
            await load()
        }
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            SectionTitle(text: title)
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

    private func load() async {
        do {
            let fresh = try await model.api.favorites.all()
            if Task.isCancelled { return }
            favorites = fresh
            error = nil
        } catch let failure as APIError where failure.isCancellation {
            return
        } catch {
            if favorites == nil { self.error = error.localizedDescription }
        }
    }
}
