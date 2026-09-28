import SwiftUI

/// app/search/page.tsx — the results in sections, always Movies, TV Shows,
/// People, then Studios & Networks (SearchPageLayout), each a shelf with its
/// total and a See all when there's more; a genre/keyword theme shelf leads
/// when the query is that theme, else it comes last.
struct SearchResultsView: View {
    let query: String

    @Environment(AppModel.self) private var model

    @State private var results: API.SearchResults?
    @State private var error: APIError?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 40) {
                HStack(spacing: 12) {
                    Text("Results for “\(query)”")
                        .font(.marqueeDisplay(30))
                        .foregroundStyle(Theme.textPrimary)
                        .accessibilityAddTraits(.isHeader)
                    Spacer(minLength: 0)
                    if let results, !results.isEmpty { StatusColorKey() }
                }
                .padding(.trailing, Metrics.pagePadding)

                if let error, error.isTMDbUnconfigured {
                    TMDbMissingNotice(isAdmin: model.viewer?.isAdmin == true) {
                        model.openSettings(.general)
                    }
                    .padding(.trailing, Metrics.pagePadding)
                } else if let results {
                    let layout = SearchPageLayout(results)
                    if layout.isEmpty {
                        EmptyStateView(
                            title: String(localized: "No results for “\(query)”."),
                            message: String(localized: "Check the spelling, or try a shorter title, a person's name or a studio."),
                            systemImage: "magnifyingglass"
                        )
                        .padding(.trailing, Metrics.pagePadding)
                    }
                    ForEach(layout.blocks) { block in
                        self.block(block)
                    }
                } else if let error {
                    EmptyStateView(
                        title: String(localized: "Couldn't search"),
                        message: error.localizedDescription,
                        systemImage: "exclamationmark.triangle",
                        actionTitle: String(localized: "Try again"),
                        action: { model.reload() }
                    )
                    .padding(.trailing, Metrics.pagePadding)
                } else {
                    LoadingView(label: String(localized: "Searching…"))
                        .padding(.trailing, Metrics.pagePadding)
                }
            }
            // Shelves bleed to the right edge like Discover's; the heading
            // and notices carry the right gutter themselves.
            .padding(.leading, Metrics.pagePadding)
            .padding(.vertical, Metrics.pagePadding)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .scrollsUnderNavRail()
        .marqueeGlow()
        .background(Theme.bg0)
        .navigationTitle("Search")
        .headingIsThePageTitle()
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

    @ViewBuilder
    private func block(_ block: SearchPageLayout.Block) -> some View {
        let seeAll: (() -> Void)? = block.seeAll.map { section in { model.open(.searchSection(query, section)) } }
        switch block {
        case let .theme(theme):
            Shelf(title: String(localized: "\(theme.label) movies & TV")) {
                ForEach(theme.items) { card in
                    ShelfItem {
                        PosterCard(card: card, showsTypeLabel: true) { model.openTitle(card.id) }
                    }
                }
            }
        case let .titles(name, section):
            Shelf(title: name.title, seeAll: seeAll, trailing: AnyView(SearchCount(total: section.totalResults))) {
                ForEach(section.results) { card in
                    ShelfItem {
                        PosterCard(card: card) { model.openTitle(card.id) }
                    }
                }
            }
        case let .people(section):
            Shelf(
                title: API.SearchSectionName.people.title,
                seeAll: seeAll,
                trailing: AnyView(SearchCount(total: section.totalResults)),
                itemGap: Metrics.tileGap
            ) {
                ForEach(section.results) { person in
                    SearchPersonTile(person: person) { model.open(.person(person.tmdbId)) }
                        .frame(width: 124)
                }
            }
        case let .studios(section):
            Shelf(
                title: API.SearchSectionName.studios.title,
                seeAll: seeAll,
                trailing: AnyView(SearchCount(total: section.totalResults)),
                itemGap: Metrics.tileGap
            ) {
                ForEach(section.results) { company in
                    SearchCompanyTile(company: company) { open(company) }
                }
            }
        }
    }

    private func open(_ company: API.SearchCompanyCard) {
        if company.isNetwork {
            model.browse(.tv, networkId: company.tmdbId)
        } else {
            model.open(.company(company.tmdbId))
        }
    }
}

/// A section's total beside its heading.
struct SearchCount: View {
    let total: Int

    var body: some View {
        Text(total, format: .number)
            .font(.system(size: Metrics.text(13)))
            .monospacedDigit()
            .foregroundStyle(Theme.textMuted)
    }
}

/// Search's person card (components/person-tile.tsx): a round photo, the
/// name, and what they're known for — round so a row of people never reads
/// as more posters.
struct SearchPersonTile: View {
    let person: API.PersonCard
    let action: () -> Void

    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            VStack(spacing: 7) {
                ZStack {
                    Theme.bg2
                    if person.profilePath.url(.w185) != nil {
                        RemoteImage(person.profilePath, size: .w185)
                    } else {
                        Image(systemName: "person.fill")
                            .font(.system(size: Metrics.text(30)))
                            .foregroundStyle(Theme.textMuted)
                    }
                }
                .aspectRatio(1, contentMode: .fit)
                .clipShape(Circle())
                .overlay(Circle().strokeBorder(hovering ? Theme.accent : Theme.border))
                .overlay(alignment: .topTrailing) {
                    if let favorited = person.favorited, hovering || favorited {
                        FavoriteButton(target: FavoriteTarget(.person, person.tmdbId, favorited: favorited), compact: true)
                            .background(Circle().fill(Theme.bg0.opacity(0.6)))
                    }
                }
                VStack(spacing: 2) {
                    Text(person.name)
                        .font(.system(size: Metrics.text(12.5), weight: .medium))
                        .foregroundStyle(Theme.textPrimary)
                        .lineLimit(1)
                    Text(person.knownForLine ?? " ")
                        .font(.system(size: Metrics.text(11)))
                        .foregroundStyle(Theme.textMuted)
                        .lineLimit(2)
                        .multilineTextAlignment(.center)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .help(person.name)
        .accessibilityLabel(person.knownForLine.map { "\(person.name), \($0)" } ?? person.name) // i18n-ignore
    }
}

/// A studio or network in search: Discover's logo tile with its name and
/// kind underneath.
struct SearchCompanyTile: View {
    let company: API.SearchCompanyCard
    var width: CGFloat? = 224
    let action: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            LogoCard(name: company.name, logoPath: company.logoPath, width: width, monogramFallback: true, action: action)
                .overlay(alignment: .topTrailing) {
                    if let favorited = company.favorited, !company.isNetwork {
                        FavoriteButton(target: FavoriteTarget(.company, company.tmdbId, favorited: favorited), compact: true)
                            .background(Circle().fill(Theme.bg0.opacity(0.6)))
                            .padding(5)
                    }
                }
            Button(action: action) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(company.name)
                        .font(.system(size: Metrics.text(12.5), weight: .medium))
                        .foregroundStyle(Theme.textPrimary)
                        .lineLimit(1)
                    Text(company.isNetwork ? String(localized: "Network") : String(localized: "Studio"))
                        .font(.system(size: Metrics.text(11)))
                        .foregroundStyle(Theme.textMuted)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .frame(width: width)
    }
}
