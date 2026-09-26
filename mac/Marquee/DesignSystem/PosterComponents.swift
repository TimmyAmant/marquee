import SwiftUI

/// What the star on a card or header toggles, plus the state the server just
/// reported for it. Lists where the website shows no star send `favorited: nil`
/// — those call sites pass no target at all.
struct FavoriteTarget: Hashable {
    let entityType: API.FavoriteEntityType
    let tmdbId: Int
    let favorited: Bool

    init(_ entityType: API.FavoriteEntityType, _ tmdbId: Int, favorited: Bool) {
        self.entityType = entityType
        self.tmdbId = tmdbId
        self.favorited = favorited
    }
}

enum PosterQuickAction: Hashable {
    case none
    /// Admin quick-add (`POST /titles/{type}/{id}/add`).
    case add(API.TitleID)
    /// Member request (`POST /titles/{type}/{id}/request`).
    case request(API.TitleID, alreadyRequested: Bool)
}

extension API.MediaType {
    /// The "MOVIE" / "SERIES" corner pill on mixed-media poster rows.
    var typeLabel: String {
        switch self {
        case .movie: return "MOVIE"
        case .tv: return "SERIES"
        case let .unknown(raw): return raw.uppercased()
        }
    }
}

extension API.TitleCard {
    /// The star, or nil on lists the website shows none on.
    var favoriteTarget: FavoriteTarget? {
        favorited.map { FavoriteTarget(API.FavoriteEntityType(mediaType), tmdbId, favorited: $0) }
    }

    /// The hover action the server says this viewer may take on this card.
    var quickAction: PosterQuickAction {
        if canQuickAdd { return .add(id) }
        if canRequest || requested == true { return .request(id, alreadyRequested: requested == true) }
        return .none
    }
}

/// components/poster-card.tsx — artwork with status strip, corner badges,
/// hover overview + quick action, and a title/year/favorite footer.
struct PosterCard: View {
    var posterPath: API.ImageRef?
    let name: String
    var year: String?
    var subtitle: String?
    var rating: Double?
    var overview: String?
    var status: API.LibraryStatus?
    var typeLabel: String?
    var favorite: FavoriteTarget?
    var quickAction: PosterQuickAction = .none
    var imageSize: API.ImageRef.Size = .w342
    /// What the card opens, for the context menu's Copy Link / Open in Browser.
    var link: Route?
    let action: () -> Void
    /// Set when the card came from a `TitleCard`, so a status this Mac has
    /// already changed can be folded in without refetching the list.
    private var titleID: API.TitleID?

    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL
    @State private var hovering = false

    /// The status to draw: the server's, unless this Mac has changed it since.
    private var effectiveStatus: API.LibraryStatus? {
        if let titleID, let changed = model.titleState[titleID]?.status { return changed }
        return status
    }

    /// The hover action to offer, minus anything already done from this Mac.
    private var effectiveQuickAction: PosterQuickAction {
        guard let titleID, let change = model.titleState[titleID] else { return quickAction }
        switch quickAction {
        case let .add(id):
            if change.canQuickAdd == false { return change.requested == true ? .request(id, alreadyRequested: true) : .none }
            return quickAction
        case let .request(id, already):
            return .request(id, alreadyRequested: already || change.requested == true)
        case .none:
            return .none
        }
    }

    /// The common case: a `TitleCard` straight from the API.
    init(
        card: API.TitleCard,
        showsTypeLabel: Bool = false,
        showsOverview: Bool = false,
        showsRating: Bool = false,
        action: @escaping () -> Void
    ) {
        self.init(
            posterPath: card.posterPath,
            name: card.name,
            year: card.year,
            subtitle: card.subtitle,
            rating: showsRating ? card.rating : nil,
            overview: showsOverview ? card.overview : nil,
            status: card.status,
            typeLabel: showsTypeLabel ? card.mediaType.typeLabel : nil,
            favorite: card.favoriteTarget,
            quickAction: card.quickAction,
            link: .title(card.id),
            action: action
        )
        titleID = card.id
    }

    init(
        posterPath: API.ImageRef?,
        name: String,
        year: String? = nil,
        subtitle: String? = nil,
        rating: Double? = nil,
        overview: String? = nil,
        status: API.LibraryStatus? = nil,
        typeLabel: String? = nil,
        favorite: FavoriteTarget? = nil,
        quickAction: PosterQuickAction = .none,
        imageSize: API.ImageRef.Size = .w342,
        link: Route? = nil,
        action: @escaping () -> Void
    ) {
        self.posterPath = posterPath
        self.name = name
        self.year = year
        self.subtitle = subtitle
        self.rating = rating
        self.overview = overview
        self.status = status
        self.typeLabel = typeLabel
        self.favorite = favorite
        self.quickAction = quickAction
        self.imageSize = imageSize
        self.link = link
        self.action = action
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            artwork
            Button(action: action) {
                Text(name)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.textPrimary)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)
            .padding(.top, 8)

            HStack(spacing: 6) {
                let line = [subtitle, year].compactMap(\.nonBlank).joined(separator: " · ")
                Text(line.isEmpty ? " " : line)
                    .font(.system(size: 11.5))
                    .foregroundStyle(Theme.textMuted)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if let favorite {
                    FavoriteButton(target: favorite, compact: true)
                }
            }
        }
        .contextMenu { contextMenuItems }
        // VoiceOver reads the card as one button: "The Matrix, 1999, Already
        // in your library", with the card's actions under Actions.
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityDescription)
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { action() }
        .accessibilityActions { cardActionItems }
    }

    // MARK: Context menu & accessibility

    private var webURL: URL? {
        link.flatMap { model.webURL(for: $0) }
    }

    @ViewBuilder
    private var contextMenuItems: some View {
        Button("Open", action: action)
        cardActionItems
        if let webURL {
            Divider()
            Button("Copy Link") { model.copyLink(webURL) }
            Button("Open in Browser") { openURL(webURL) }
        }
    }

    /// What the hover buttons offer — only the ones that apply right now.
    /// Shared by the context menu and VoiceOver's Actions rotor.
    @ViewBuilder
    private var cardActionItems: some View {
        switch effectiveQuickAction {
        case let .add(id):
            Button("Add to \(id.mediaType.arrName)") { run("Added to \(id.mediaType.arrName).") { try await model.quickAdd(id) } }
        case let .request(id, alreadyRequested) where !alreadyRequested:
            Button("Request") { run("Requested.") { try await model.requestTitle(id) } }
        default:
            EmptyView()
        }
        if let favorite {
            let isOn = model.isFavorited(favorite)
            Button(isOn ? "Remove from Favorites" : "Add to Favorites") {
                run(nil) { try await model.setFavorite(!isOn, favorite) }
            }
        }
    }

    private var accessibilityDescription: String {
        var parts = [name]
        if let year = year.nonBlank { parts.append(year) }
        if let subtitle = subtitle.nonBlank { parts.append(subtitle) }
        if let status = effectiveStatus, status.isKnown { parts.append(status.label) }
        if case .request(_, alreadyRequested: true) = effectiveQuickAction { parts.append("Requested") }
        if let favorite, model.isFavorited(favorite) { parts.append("Favorite") }
        return parts.joined(separator: ", ")
    }

    /// A context-menu action: a banner on success, the error on failure.
    private func run(_ success: String?, _ work: @escaping @MainActor () async throws -> Void) {
        Task {
            do {
                try await work()
                if let success { model.flash(success) }
            } catch {
                model.flash(error: error)
            }
        }
    }

    private var artwork: some View {
        Color.clear
            .aspectRatio(2.0 / 3.0, contentMode: .fit)
            .overlay {
                ZStack {
                    Theme.bg2
                    if posterPath.url(imageSize) != nil {
                        RemoteImage(posterPath, size: imageSize)
                    } else {
                        Text(name)
                            .font(.marqueeDisplay(13))
                            .foregroundStyle(Theme.textMuted)
                            .multilineTextAlignment(.center)
                            .padding(12)
                    }
                }
            }
            // .ov — the hover panel: overview clamped to 5 lines, then the
            // quick action. Only the button takes clicks; the rest falls
            // through to the card.
            .overlay(alignment: .bottom) {
                if hovering, overview != nil || effectiveQuickAction != .none {
                    VStack(alignment: .leading, spacing: 10) {
                        if let overview {
                            Text(overview)
                                .font(.system(size: 11))
                                .lineSpacing(3)
                                .foregroundStyle(Theme.textSecondary)
                                .lineLimit(5)
                                .allowsHitTesting(false)
                        }
                        quickActionView
                    }
                    .padding(.top, 10)
                    .padding(.horizontal, 9)
                    .padding(.bottom, 9)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        LinearGradient(
                            colors: [Theme.bg0.opacity(0.97), Theme.bg0.opacity(0.92), Theme.bg0.opacity(0.55), Theme.bg0.opacity(0.18)],
                            startPoint: .bottom,
                            endPoint: .top
                        )
                        .allowsHitTesting(false)
                    )
                    .transition(.opacity)
                }
            }
            .overlay(alignment: .topLeading) {
                if let typeLabel {
                    Text(typeLabel)
                        .font(.system(size: 9, weight: .bold))
                        .tracking(0.45)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 5)
                        .padding(.top, 3)
                        .padding(.bottom, 2.5)
                        .background(
                            RoundedRectangle(cornerRadius: 4)
                                .fill(typeLabel == "MOVIE" ? Theme.hex(0x2563EB) : Theme.hex(0xC026D3))
                        )
                        .shadow(color: .black.opacity(0.35), radius: 1.5, y: 1)
                        .padding(7)
                } else if let rating, rating > 0 {
                    HStack(spacing: 3) {
                        Image(systemName: "star.fill").font(.system(size: 8))
                        Text(String(format: "%.1f", rating))
                    }
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(Theme.accent)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 2.5)
                    .background(Capsule().fill(Theme.bg0.opacity(0.8)))
                    .padding(6)
                }
            }
            .overlay(alignment: .topTrailing) {
                if let status = effectiveStatus {
                    StatusBadge(status: status, compact: true)
                        .padding(6)
                        .allowsHitTesting(false)
                }
            }
            .overlay(alignment: .bottom) {
                if let status = effectiveStatus, let strip = Theme.statusStrip(status) {
                    strip.frame(height: 3)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .strokeBorder(hovering ? Theme.borderStrong : Theme.border, lineWidth: 1)
            )
            .shadow(color: .black.opacity(hovering ? 0.28 : 0.12), radius: hovering ? 10 : 4, y: hovering ? 6 : 2)
            .offset(y: hovering ? -4 : 0)
            .contentShape(Rectangle())
            .onTapGesture(perform: action)
            .onHover { inside in
                withAnimation(.easeOut(duration: 0.18)) { hovering = inside }
            }
    }

    @ViewBuilder
    private var quickActionView: some View {
        switch effectiveQuickAction {
        case .none:
            EmptyView()
        case let .add(id):
            QuickAddButton(id: id)
        case let .request(id, alreadyRequested):
            RequestButton(id: id, compact: true, alreadyRequested: alreadyRequested)
        }
    }
}

/// Fixed-width poster cell for horizontal shelves (`.card{width:156px}`).
struct ShelfItem<Content: View>: View {
    var width: CGFloat = Metrics.posterWidth
    @ViewBuilder let content: () -> Content

    var body: some View {
        content().frame(width: width)
    }
}

/// Room for a card's hover lift and shadow inside a shelf's scroller. Taken
/// back off the shelf's own height so the mockup's 12pt head gap and 48pt
/// shelf gap still measure 12 and 48.
private enum ShelfMetrics {
    static let hoverPad: CGFloat = 6
}

/// components/shelf.tsx — titled horizontal row with always-visible chevrons.
struct Shelf<Content: View>: View {
    let title: String
    var seeAll: (() -> Void)?
    var trailing: AnyView?
    /// `.row{gap:20px}` for posters; genre tiles and cast use 16.
    var itemGap: CGFloat = Metrics.posterGap
    /// The head row's right padding: the page's own right gutter, since the
    /// cards below deliberately bleed past it.
    var headInset: CGFloat = Metrics.pagePadding
    @ViewBuilder let content: () -> Content


    @State private var position: Int?
    @State private var itemCount = 0
    /// The row is scrolled as far right as it goes (or fits without scrolling).
    @State private var atEnd = false

    var body: some View {
        VStack(alignment: .leading, spacing: Metrics.shelfHeadGap - ShelfMetrics.hoverPad) {
            HStack(spacing: 9) {
                SectionTitle(text: title)
                if let seeAll {
                    Button(action: seeAll) {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 9, weight: .semibold))
                            .frame(width: 20, height: 20)
                            .overlay(Circle().strokeBorder(Theme.borderStrong))
                            .contentShape(Circle())
                    }
                    .buttonStyle(QuietButtonStyle())
                    .help("Browse all \(title)")
                    .accessibilityLabel("Browse all \(title)")
                }
                if let trailing { trailing }
                Spacer(minLength: 8)
                chevron("chevron.left", label: "Scroll left", dimmed: (position ?? 0) == 0) { page(-1) }
                chevron("chevron.right", label: "Scroll right", dimmed: atEnd) { page(1) }
            }
            .frame(height: Metrics.shelfHeadHeight)
            .padding(.trailing, headInset)

            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(alignment: .top, spacing: itemGap) {
                    Group(subviews: content()) { subviews in
                        ForEach(subviews.indices, id: \.self) { index in
                            subviews[index]
                                .onAppear { if itemCount != subviews.count { itemCount = subviews.count } }
                        }
                    }
                }
                .scrollTargetLayout()
                .padding(.vertical, ShelfMetrics.hoverPad)
            }
            .scrollPosition(id: $position, anchor: .leading)
            .onScrollGeometryChange(for: Bool.self) { geometry in
                geometry.visibleRect.maxX >= geometry.contentSize.width - 1
            } action: { _, isAtEnd in
                atEnd = isAtEnd
            }
        }
        .padding(.bottom, -ShelfMetrics.hoverPad)
    }

    /// `.arrow` — 28pt circle; `.arrow.dis` when there's nothing more that way.
    private func chevron(_ symbol: String, label: String, dimmed: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(dimmed ? Theme.borderStrong : Theme.textSecondary)
                .frame(width: 28, height: 28)
                .overlay(Circle().strokeBorder(dimmed ? Theme.border.opacity(0.7) : Theme.border))
                .contentShape(Circle())
        }
        .buttonStyle(QuietButtonStyle())
        .accessibilityLabel(label)
    }

    private func page(_ direction: Int) {
        let step = 5
        let maxIndex = max(0, itemCount - 1)
        withAnimation(.easeInOut(duration: 0.35)) {
            position = min(max(0, (position ?? 0) + direction * step), maxIndex)
        }
    }
}

/// `.person` — a cast card in the title page's carousel: a 112×124 portrait,
/// the actor's name, and the character below it.
///
/// The mockup has no star on these cards, so the favorite toggle sits in the
/// portrait's corner: always visible once favorited (the state is never
/// hidden) and on hover otherwise.
struct PersonCard: View {
    var profilePath: API.ImageRef?
    let name: String
    var character: String?
    var favorite: FavoriteTarget?
    /// What the card opens, for the context menu's Copy Link / Open in Browser.
    var link: Route?
    let action: () -> Void

    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL
    @State private var hovering = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack {
                Theme.bg2
                if profilePath.url(.w342) != nil {
                    RemoteImage(profilePath, size: .w342)
                } else {
                    Image(systemName: "person.fill")
                        .font(.system(size: 26))
                        .foregroundStyle(Theme.textMuted)
                }
            }
            .frame(width: Metrics.castWidth, height: Metrics.castPortraitHeight)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(hovering ? Theme.borderStrong : Theme.border)
            )
            .overlay(alignment: .topTrailing) {
                if let favorite, hovering || favorite.favorited {
                    FavoriteButton(target: favorite, compact: true)
                        .background(Circle().fill(Theme.bg0.opacity(0.55)))
                        .padding(3)
                }
            }
            .shadow(color: .black.opacity(hovering ? 0.28 : 0), radius: 8, y: 4)
            .contentShape(Rectangle())
            .onTapGesture(perform: action)

            Button(action: action) {
                Text(name)
                    .font(.system(size: 12.5, weight: .medium))
                    .foregroundStyle(Theme.textPrimary)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)
            .padding(.top, 7)

            Text(character?.nonBlank ?? " ")
                .font(.system(size: 11))
                .foregroundStyle(Theme.textMuted)
                .lineLimit(1)
        }
        .frame(width: Metrics.castWidth, alignment: .leading)
        .onHover { inside in
            withAnimation(.easeOut(duration: 0.18)) { hovering = inside }
        }
        .contextMenu {
            Button("Open", action: action)
            favoriteItem
            if let webURL = link.flatMap({ model.webURL(for: $0) }) {
                Divider()
                Button("Copy Link") { model.copyLink(webURL) }
                Button("Open in Browser") { openURL(webURL) }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel([name, character.nonBlank.map { "as \($0)" }].compactMap { $0 }.joined(separator: ", "))
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { action() }
        .accessibilityActions { favoriteItem }
    }

    @ViewBuilder
    private var favoriteItem: some View {
        if let favorite {
            let isOn = model.isFavorited(favorite)
            Button(isOn ? "Remove from Favorites" : "Add to Favorites") {
                Task {
                    do {
                        try await model.setFavorite(!isOn, favorite)
                    } catch {
                        model.flash(error: error)
                    }
                }
            }
        }
    }
}

/// components/poster-grid.tsx — auto-fill columns stretched edge to edge.
///
/// The cards start at a shelf card's 156pt and stretch to fill the row, so a
/// grid page never leaves a dead strip on the right. Shelf rows stay at
/// exactly 156.
struct PosterGrid<Content: View>: View {
    var minimum: CGFloat = Metrics.posterWidth
    @ViewBuilder let content: () -> Content

    var body: some View {
        LazyVGrid(
            columns: [GridItem(.adaptive(minimum: minimum), spacing: Metrics.posterGap, alignment: .top)],
            alignment: .leading,
            spacing: 28
        ) {
            content()
        }
    }
}

/// components/genre-card.tsx.
struct GenreCard: View {
    let tile: API.GenreTile
    /// Position in the shelf, for the fallback color.
    var index: Int = 0
    let action: () -> Void
    @State private var hovering = false

    private static let colors: [Int: UInt32] = [
        28: 0x991B1B, 10759: 0x991B1B, 12: 0x6B21A8, 16: 0x0F766E, 35: 0xA16207, 80: 0x1E3A8A,
        99: 0x065F46, 18: 0x334155, 10751: 0x0369A1, 14: 0x3730A3, 36: 0x92400E, 27: 0x262626,
        10402: 0x9D174D, 9648: 0x4C1D95, 10749: 0x9F1239, 878: 0x155E75, 10765: 0x155E75,
        10770: 0x44403C, 53: 0x7C2D12, 10752: 0x27272A, 10768: 0x27272A, 37: 0x713F12,
        10762: 0x3F6212, 10763: 0x1E40AF, 10764: 0x86198F, 10766: 0x881337, 10767: 0x115E59,
    ]
    private static let fallback: [UInt32] = [0x991B1B, 0x6B21A8, 0x0F766E, 0xA16207, 0x1E3A8A, 0x065F46]

    var body: some View {
        Button(action: action) {
            ZStack {
                Theme.hex(Self.colors[tile.id] ?? Self.fallback[index % Self.fallback.count])
                if tile.backdropPath.url(.w780) != nil {
                    RemoteImage(tile.backdropPath, size: .w780, showsShimmer: false)
                        .opacity(hovering ? 0.6 : 0.45)
                }
                Text(tile.name)
                    .font(.marqueeDisplay(34, weight: .heavy))
                    .tracking(-0.34)
                    .foregroundStyle(.white)
                    .shadow(color: .black.opacity(0.35), radius: 7, y: 2)
                    .multilineTextAlignment(.center)
                    .minimumScaleFactor(0.6)
                    .lineLimit(2)
                    .padding(.horizontal, 16)
            }
            .frame(width: 288, height: 160)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(.white.opacity(0.07))
            )
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
    }
}

/// components/logo-card.tsx — logo on white so dark marks stay readable.
struct LogoCard: View {
    let name: String
    let logoPath: API.ImageRef?
    let action: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            ZStack {
                if logoPath.url(.w500) != nil {
                    Color.white
                    RemoteImage(logoPath, size: .w500, contentMode: .fit, showsShimmer: false)
                        .padding(20)
                } else {
                    Theme.bg1
                    Text(name)
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.textSecondary)
                        .padding(.horizontal, 16)
                }
            }
            .frame(width: 224, height: 112)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(hovering ? Theme.borderStrong : Theme.border))
        }
        .buttonStyle(.plain)
        .help(name)
        .onHover { hovering = $0 }
    }
}

/// components/studio-chip.tsx.
struct StudioChip: View {
    let company: API.CompanyCard
    let action: () -> Void

    /// Every chip is the same height whether or not the studio has a logo —
    /// the logo tile sets it, so a logo-less chip would otherwise be shorter.
    private static let contentHeight: CGFloat = 32

    var body: some View {
        HStack(spacing: 10) {
            Button(action: action) {
                HStack(spacing: 10) {
                    if company.logoPath.url(.w185) != nil {
                        RemoteImage(company.logoPath, size: .w185, contentMode: .fit, showsShimmer: false)
                            .frame(width: 40, height: 24)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 4)
                            .background(Color.white, in: RoundedRectangle(cornerRadius: 5))
                    }
                    Text(company.name)
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.textPrimary)
                        .lineLimit(1)
                }
                .frame(height: Self.contentHeight)
            }
            .buttonStyle(.plain)
            if let favorited = company.favorited {
                FavoriteButton(target: FavoriteTarget(.company, company.tmdbId, favorited: favorited), compact: true)
            }
        }
        .padding(.leading, 8)
        .padding(.trailing, 12)
        .padding(.vertical, 8)
        .background(Theme.bg1, in: Capsule())
        .overlay(Capsule().strokeBorder(Theme.border))
    }
}
