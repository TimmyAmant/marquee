import AppKit
import SwiftUI

/// app/title/[type]/[id]/page.tsx + components/title-hero.tsx.
struct TitleDetailView: View {
    let id: API.TitleID

    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL
    @Environment(\.navRailInsets) private var navRailInsets
    @State private var screen: TitleDetailModel
    @State private var showingTrailer = false
    @State private var showingRelink = false
    @State private var showingSeasonPicker = false
    @State private var showingReportProblem = false
    @State private var showingShare = false

    init(id: API.TitleID) {
        self.id = id
        _screen = State(initialValue: TitleDetailModel(id: id))
    }

    var body: some View {
        Group {
            if let detail = screen.detail {
                content(detail)
            } else if let loadError = screen.loadError {
                EmptyStateView(
                    title: String(localized: "Couldn't load this title"),
                    message: loadError,
                    systemImage: "exclamationmark.triangle",
                    actionTitle: String(localized: "Try again"),
                    action: { model.reload() }
                )
            } else {
                LoadingView()
            }
        }
        .background(Theme.bg0)
        .navigationTitle(screen.name)
        .toolbar {
            if let webURL = model.webURL(for: .title(id)) {
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        Button("Share…") { showingShare = true }
                            .disabled(screen.detail == nil)
                        Divider()
                        Button("Open in Browser") { openURL(webURL) }
                        Button("Copy Link") { model.copyLink(webURL) }
                    } label: {
                        Image(systemName: "square.and.arrow.up")
                    }
                    .help("Open this title on your Marquee server's website")
                }
            }
        }
        // Only ⌘R refetches the page. Everything the viewer does here updates
        // `library` + `viewer` in place through `titles.status`, so the
        // ScrollView is never rebuilt and the scroll offset never moves.
        .task(id: model.reloadToken) {
            screen.titleState = model.titleState
            await screen.load(model.api)
        }
        // A change that came from the server (a download finished, someone
        // requested this from the website) still refreshes the status block —
        // `remoteRevision` deliberately ignores this app's own mutations.
        .task(id: model.events.remoteRevision(of: [.library, .requests])) {
            await screen.refreshStatus(model.api, recordingIn: model.titleState)
        }
        .sheet(isPresented: $showingTrailer) {
            if let key = screen.detail?.links.trailerYoutubeKey {
                TrailerSheet(videoKey: key, title: screen.name)
            }
        }
        .sheet(isPresented: $showingRelink) {
            RelinkTitleSheet(mediaType: id.mediaType) { target in
                let newId = try await screen.relink(target)
                showingRelink = false
                model.replaceTop(with: .title(API.TitleID(id.mediaType, newId)))
            }
        }
        .sheet(isPresented: $showingSeasonPicker) {
            if let detail = screen.detail {
                SeasonRequestSheet(title: detail.name, seasons: detail.seasons, autoApprove: detail.viewer.autoApprove == true) { seasons in
                    try await screen.requestSeasons(seasons)
                    // After Seerr's toast: "Severance requested".
                    model.flash(String(localized: "\(detail.name) requested"))
                }
            }
        }
        .sheet(isPresented: $showingShare) {
            if let detail = screen.detail {
                ShareTitleSheet(
                    titleID: id, titleName: detail.name, imdbId: detail.links.imdbId,
                    serverURL: model.session.server?.baseURL
                )
            }
        }
        .sheet(isPresented: $showingReportProblem) {
            if let detail = screen.detail {
                ReportProblemSheet(mediaType: detail.mediaType, seasonNumbers: detail.seasons.map(\.seasonNumber)) { report in
                    try await screen.reportProblem(report)
                }
            }
        }
    }

    private func content(_ detail: API.TitleDetail) -> some View {
        // The page is measured from the window's top edge, with the toolbar
        // floating over the artwork, so the page starts under the top bar
        // rather than below it. The backdrop also runs under the navigation
        // rail to the window's left edge, so the columns step past the rail
        // themselves (`leading`). Like the website (components/title-hero.tsx,
        // 0.54+), the page uses the window's whole width: poster | title and
        // details | facts on the right edge, and the rows below span the same
        // width between the same gutters.
        GeometryReader { proxy in
            let hero = TitleHeroMetrics(window: proxy.size)
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    ZStack(alignment: .topLeading) {
                        TitleBackdrop(
                            backdropPath: detail.backdropPath,
                            seed: UInt64(UInt32(bitPattern: Int32(truncatingIfNeeded: detail.tmdbId))),
                            height: hero.backdropHeight,
                            wide: hero.wide
                        )
                        .equatable()

                        HStack(alignment: .top, spacing: Metrics.titleColumnGap) {
                            TitlePoster(posterPath: detail.posterPath)
                                .equatable()

                            TitleMainColumn(
                                screen: screen,
                                detail: detail,
                                onTrailer: { showingTrailer = true },
                                onRelink: { showingRelink = true },
                                onPickSeasons: { showingSeasonPicker = true },
                                onReportProblem: { showingReportProblem = true },
                                onShare: { showingShare = true }
                            )
                            // A readable measure however wide the window;
                            // the artwork shows through beside it.
                            .frame(maxWidth: hero.textWidth, alignment: .leading)
                            .padding(.top, Metrics.titleColumnTop)

                            Spacer(minLength: 0)

                            TitleSidebarColumn(detail: detail)
                                .frame(width: hero.railWidth)
                                .padding(.top, Metrics.titleColumnTop)
                        }
                        .padding(.leading, leading)
                        .padding(.trailing, trailing)
                        .padding(.top, hero.posterTop)
                    }

                    VStack(alignment: .leading, spacing: 44) {
                        if !detail.seasons.isEmpty {
                            VStack(alignment: .leading, spacing: Metrics.shelfHeadGap) {
                                SectionTitle(text: String(localized: "Episodes"))
                                SeasonAccordion(screen: screen, seasons: detail.seasons)
                            }
                        }
                        if !detail.cast.isEmpty {
                            Shelf(title: String(localized: "Cast"), itemGap: Metrics.tileGap, headInset: 0) {
                                ForEach(detail.cast) { member in
                                    PersonCard(
                                        profilePath: member.profilePath,
                                        name: member.name,
                                        character: member.character,
                                        favorite: FavoriteTarget(.person, member.tmdbId, favorited: member.favorited),
                                        link: .person(member.tmdbId)
                                    ) {
                                        model.open(.person(member.tmdbId))
                                    }
                                }
                            }
                        }
                        if let franchise = detail.franchise, !franchise.items.isEmpty {
                            FranchiseSection(screen: screen, franchise: franchise)
                        }
                        if !detail.studios.isEmpty {
                            VStack(alignment: .leading, spacing: Metrics.shelfHeadGap) {
                                SectionTitle(text: String(localized: "Studio"))
                                FlowLayout(spacing: 10, lineSpacing: 10) {
                                    ForEach(detail.studios) { studio in
                                        StudioChip(company: studio) { model.open(.company(studio.tmdbId)) }
                                    }
                                }
                            }
                        }
                        if !detail.similar.isEmpty {
                            Shelf(title: String(localized: "More like this"), headInset: 0) {
                                ForEach(detail.similar) { card in
                                    ShelfItem {
                                        PosterCard(card: card, showsTypeLabel: true) {
                                            model.openTitle(card.id)
                                        }
                                    }
                                }
                            }
                        }
                    }
                    .padding(.leading, leading)
                    .padding(.trailing, trailing)
                    .padding(.top, 44)
                    .padding(.bottom, 60)
                }
            }
        }
        .ignoresSafeArea(.container, edges: [.top, .horizontal])
    }

    /// `.tp-poster{left:48px}`, measured from the content area rather than
    /// from the window edge the page now starts at.
    private var leading: CGFloat {
        navRailInsets.leading + Metrics.titleGutter
    }

    /// The right gutter, past the rail too when it's on the right.
    private var trailing: CGFloat {
        navRailInsets.trailing + Metrics.titleRightGutter
    }
}

// MARK: - Hero

/// How the title page's hero scales with the window (components/title-hero.tsx
/// `--hero-h`): the artwork is min(70% of the window's height, 16:9 of its
/// width), never shorter than the mockup's 380, and the poster row sits a
/// little under halfway down it.
struct TitleHeroMetrics: Equatable {
    let backdropHeight: CGFloat
    let posterTop: CGFloat
    let textWidth: CGFloat
    let railWidth: CGFloat
    /// Wide enough that w1280 artwork would be soft on a Retina display.
    let wide: Bool

    init(window: CGSize) {
        let width = max(window.width, 1)
        backdropHeight = max(Metrics.backdropHeight, min(window.height * 0.7, width * 0.5625))
        posterTop = max(Metrics.titlePosterTop, backdropHeight * 0.42)
        textWidth = width >= 1700 ? 860 : 720
        railWidth = width >= 1700 ? 320 : Metrics.titleRailWidth
        wide = width > 1400
    }
}

/// `.backdrop` — full-bleed artwork behind the top of the page, bled up
/// under the window's toolbar, film grain over it, and soft fades into bg0:
/// under the toolbar, at the bottom, from the left behind the text, and a
/// light veil over all of it so a bright image reads like a dark one.
private struct TitleBackdrop: View, Equatable {
    let backdropPath: API.ImageRef?
    /// Keeps the film grain identical across re-renders.
    let seed: UInt64
    let height: CGFloat
    let wide: Bool

    var body: some View {
        // w1280 is plenty up to a 1400pt window; past that the original, so
        // the artwork stays sharp full-bleed on a big display.
        let size: API.ImageRef.Size = wide ? .original : .w1280
        Color.clear
            .frame(height: height)
            .frame(maxWidth: .infinity)
            // Aligned to the bottom so the extra height covers the toolbar
            // strip above the page's own top edge.
            .overlay(alignment: .bottom) {
                ZStack {
                    Theme.bg1
                    if backdropPath.url(size) != nil {
                        // Focal point at the top: faces and titles sit
                        // high in most backdrops.
                        RemoteImage(backdropPath, size: size)
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                    }
                    FilmGrain(seed: seed).opacity(Theme.grainOpacity)
                    Theme.bg0.opacity(0.22)
                    LinearGradient(
                        stops: [
                            .init(color: Theme.bg0.opacity(0.7), location: 0),
                            .init(color: Theme.bg0.opacity(0.25), location: 0.14),
                            .init(color: .clear, location: 0.28),
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                    LinearGradient(
                        stops: [
                            .init(color: .clear, location: 0.24),
                            .init(color: Theme.bg0.opacity(0.5), location: 0.54),
                            .init(color: Theme.bg0.opacity(0.88), location: 0.76),
                            // Solid a little before the edge, so the grain
                            // fades out with the artwork instead of stopping.
                            .init(color: Theme.bg0, location: 0.94),
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                    LinearGradient(
                        stops: [
                            .init(color: Theme.bg0.opacity(0.94), location: 0),
                            .init(color: Theme.bg0.opacity(0.84), location: 0.3),
                            .init(color: Theme.bg0.opacity(0.62), location: 0.52),
                            .init(color: Theme.bg0.opacity(0.26), location: 0.74),
                            .init(color: .clear, location: 0.92),
                        ],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                }
                .frame(height: height + Metrics.topBar)
                .clipped()
            }
    }
}

/// `.tp-poster` — 224×336, radius 12, a borderStrong ring and a deep shadow.
private struct TitlePoster: View, Equatable {
    let posterPath: API.ImageRef?

    var body: some View {
        ZStack {
            Theme.bg2
            if posterPath.url(.w500) != nil {
                RemoteImage(posterPath, size: .w500)
            }
        }
        .frame(width: Metrics.titlePosterWidth, height: Metrics.titlePosterHeight)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Theme.borderStrong))
        .shadow(color: .black.opacity(0.65), radius: 32, y: 14)
        .shadow(color: .black.opacity(0.45), radius: 10, y: 4)
    }
}

/// .grain-overlay — a light static noise texture over the backdrop.
///
/// Seeded, so a re-render draws exactly the same speckle. With a system
/// generator the grain re-rolled on every state change, which read as the
/// page flickering under the viewer.
private struct FilmGrain: View, Equatable {
    let seed: UInt64

    var body: some View {
        Canvas { context, size in
            var generator = SplitMix64(seed: seed)
            let dots = Int(size.width * size.height / 90)
            for _ in 0..<dots {
                let x = Double.random(in: 0..<size.width, using: &generator)
                let y = Double.random(in: 0..<size.height, using: &generator)
                let gray = Double.random(in: 0...1, using: &generator)
                context.fill(Path(CGRect(x: x, y: y, width: 1, height: 1)), with: .color(Color(white: gray)))
            }
        }
        .allowsHitTesting(false)
        .drawingGroup()
    }
}

/// A tiny deterministic generator, so the grain is stable per title.
private struct SplitMix64: RandomNumberGenerator {
    private var state: UInt64

    init(seed: UInt64) {
        state = seed &+ 0x9E37_79B9_7F4A_7C15
    }

    mutating func next() -> UInt64 {
        state = state &+ 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }
}

// MARK: - Main column

private struct TitleMainColumn: View {
    let screen: TitleDetailModel
    let detail: API.TitleDetail
    let onTrailer: () -> Void
    let onRelink: () -> Void
    let onPickSeasons: () -> Void
    let onReportProblem: () -> Void
    let onShare: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // .tp-title — serif 48/54, 700, −0.015em.
            Text(detail.name)
                .font(.marqueeDisplay(48, weight: .bold))
                .tracking(-0.72)
                .foregroundStyle(Theme.textPrimary)
                .shadow(color: .black.opacity(0.4), radius: 10, y: 2)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)

            // .tp-meta — 14px, 14pt gaps, then the Favorite pill.
            HStack(spacing: 14) {
                let parts = [
                    detail.facts.runtimeLabel,
                    detail.facts.genres.isEmpty ? nil : detail.facts.genres.joined(separator: ", "),
                    detail.facts.yearRange,
                ].compactMap(\.nonBlank)
                if !parts.isEmpty {
                    Text(parts.joined(separator: " · "))
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.textSecondary)
                }
                FavoriteButton(
                    target: FavoriteTarget(API.FavoriteEntityType(detail.mediaType), detail.tmdbId, favorited: detail.viewer.favorited)
                )
            }
            .padding(.top, 10)

            TitleActionRow(
                screen: screen, detail: detail, onRelink: onRelink, onPickSeasons: onPickSeasons,
                onReportProblem: onReportProblem, onShare: onShare
            )
                .padding(.top, 16)

            // components/my-title-requests.tsx (0.46+): your own requests for
            // it, with Edit / Cancel while pending and their conversations.
            if !detail.viewer.ownRequests.isEmpty {
                MyTitleRequestsList(requests: detail.viewer.ownRequests) {
                    await screen.requestChanged()
                }
                .padding(.top, 14)
            }

            if let tagline = detail.tagline.nonBlank {
                Text(tagline)
                    .font(.system(size: 13.5))
                    .italic()
                    .foregroundStyle(Theme.textMuted)
                    .padding(.top, 18)
            }

            if let overview = detail.overview.nonBlank {
                // .h-serif 18/24, then .body 14/22 six points under it.
                Text("Overview")
                    .font(.marqueeDisplay(18, weight: .semibold))
                    .foregroundStyle(Theme.textPrimary)
                    .padding(.top, 26)
                Text(overview)
                    .font(.system(size: 14))
                    .lineSpacing(5)
                    .foregroundStyle(Theme.textSecondary)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 6)
            }

            if !detail.credits.isEmpty {
                // .credits — 3 equal columns, name over role.
                LazyVGrid(
                    columns: Array(repeating: GridItem(.flexible(), spacing: 16, alignment: .topLeading), count: 3),
                    alignment: .leading,
                    spacing: 16
                ) {
                    ForEach(Array(detail.credits.enumerated()), id: \.offset) { _, credit in
                        VStack(alignment: .leading, spacing: 1) {
                            Text(credit.name)
                                .font(.system(size: 13.5, weight: .semibold))
                                .foregroundStyle(Theme.textPrimary)
                                .lineLimit(2)
                            Text(credit.role)
                                .font(.system(size: 12))
                                .foregroundStyle(Theme.textMuted)
                                .lineLimit(1)
                        }
                    }
                }
                .padding(.top, 20)
            }

            if !detail.keywords.isEmpty {
                // .chips — wrapped rather than clipped at the column's edge;
                // the first dozen (TMDb lists the most telling first).
                FlowLayout(spacing: 6, lineSpacing: 6) {
                    ForEach(detail.keywords.prefix(12), id: \.self) { keyword in
                        Text(keyword)
                            .font(.system(size: 11))
                            .foregroundStyle(Theme.textSecondary)
                            .lineLimit(1)
                            .fixedSize()
                            .padding(.horizontal, 9)
                            .frame(height: 22)
                            .overlay(Capsule().strokeBorder(Theme.border))
                    }
                }
                .padding(.top, 18)
            }

            ExternalLinksRow(links: detail.links, onTrailer: onTrailer)
                .padding(.top, 14)
        }
    }
}

/// `.tp-status` — the library badge and, next to it, the actions this viewer
/// may take on the title.
private struct TitleActionRow: View {
    let screen: TitleDetailModel
    let detail: API.TitleDetail
    let onRelink: () -> Void
    let onPickSeasons: () -> Void
    let onReportProblem: () -> Void
    let onShare: () -> Void

    @Environment(AppModel.self) private var model
    /// "Block requests" opened its reason field.
    @State private var askingBlockReason = false
    @State private var blockReason = ""

    var body: some View {
        let viewer = detail.viewer
        // 0.48+: the blocklist can be handed to a member.
        let managesBlocklist = model.viewer?.can(.manageBlocklist) == true
        let advancedOffered = offersAdvancedAdd(viewer)
        let targets = advancedTargets(viewer)
        // "Advanced" rides on the button it applies to, as a chevron.
        let splitStandard = advancedOffered && targets.standard
        let splitFourK = advancedOffered && !targets.standard && targets.fourK
        let menuTracking = viewer.arrTracking
        let menuBlock = viewer.offersBlocking(managesBlocklist: managesBlocklist) && viewer.block == nil && !askingBlockReason
        VStack(alignment: .leading, spacing: 8) {
            // components/title-hero.tsx (0.54+): one row of 32pt capsules on
            // a shared midline — the main action first, then the library
            // badge, the everyday extras, and "…" for the rarely used tools.
            FlowLayout(spacing: 8, lineSpacing: 8, centersLines: true) {
                // components/play-button.tsx (0.53+): "Play on Plex" and
                // friends, a menu when more than one server has it.
                PlayOnServerButton(links: detail.play ?? [])

                if !viewer.alreadyRequested, let action = detail.requestAction {
                    switch action {
                    case .wholeSeries:
                        HStack(spacing: 1) {
                            Button(screen.isAdding ? String(localized: "Requesting…") : action.buttonTitle) { screen.request() }
                                .buttonStyle(AccentButtonStyle(height: 32, squaredTrailing: splitStandard))
                                .disabled(screen.isAdding || screen.advancedAdd.isLoading)
                            if splitStandard { advancedChevron(viewer, filled: true) }
                        }
                    case .pickSeasons(more: false):
                        Button(action.buttonTitle, action: onPickSeasons)
                            .buttonStyle(AccentButtonStyle(height: 32))
                            .disabled(screen.isAdding)
                    case .pickSeasons(more: true):
                        // Among the secondary pills, so outlined like them.
                        Button(action: onPickSeasons) {
                            pillLabel("plus", action.buttonTitle, size: 13)
                        }
                        .buttonStyle(OutlineButtonStyle(pill: .large))
                        .disabled(screen.isAdding)
                    }
                }

                if viewer.canAdd {
                    HStack(spacing: 1) {
                        Button(screen.isAdding ? String(localized: "Adding…") : String(localized: "Add to \(detail.mediaType.arrName)")) { screen.add() }
                            .buttonStyle(AccentButtonStyle(height: 32, squaredTrailing: splitStandard))
                            .disabled(screen.isAdding || screen.advancedAdd.isLoading)
                        if splitStandard { advancedChevron(viewer, filled: true) }
                    }
                }

                StatusBadge(status: detail.library.status, large: true)

                if viewer.alreadyRequested {
                    Text(viewer.pendingRequestLine)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.info)
                        .padding(.horizontal, 14)
                        .frame(height: 32)
                        .background(Capsule().fill(Theme.infoBg))
                }

                // components/title-hero.tsx (0.46+, reviewers): Sonarr/Radarr
                // hasn't found the approved request; opens the Requests
                // screen, where it's listed under "Can't find".
                if let since = viewer.notFoundSince {
                    Button {
                        model.select(.requests)
                    } label: {
                        Text("Can't find")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(Theme.missing)
                            .padding(.horizontal, 14)
                            .frame(height: 32)
                            .background(Capsule().fill(Theme.missingBg))
                            .overlay(Capsule().strokeBorder(Theme.missing.opacity(0.4)))
                            .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .help("Sonarr/Radarr hasn't found it since \(Format.shortDate(since))")
                }

                // components/add-to-library-button.tsx (0.41+): on the
                // blocklist, a member sees why instead of Request (whoever
                // manages it gets Unblock instead).
                if !managesBlocklist, let block = viewer.block {
                    Text(block.closedLine)
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.textMuted)
                        .padding(.horizontal, 14)
                        .frame(minHeight: 32)
                        .overlay(Capsule().strokeBorder(Theme.border))
                        .fixedSize(horizontal: false, vertical: true)
                }

                // components/fourk-controls.tsx (0.37+): the 4K copy, when
                // the admin has a 4K Radarr/Sonarr for this type.
                if let fourK = viewer.fourK {
                    if let label = fourK.statusLabel {
                        Text(label)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(Theme.accent)
                            .padding(.horizontal, 14)
                            .frame(height: 32)
                            .overlay(Capsule().strokeBorder(Theme.accent.opacity(0.4)))
                    }
                    if fourK.isRequestPending {
                        Text("4K requested")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(Theme.info)
                            .padding(.horizontal, 14)
                            .frame(height: 32)
                            .background(Capsule().fill(Theme.infoBg))
                    } else if fourK.canRequest {
                        Button(screen.isFourKBusy ? "Requesting…" : "Request in 4K") { screen.requestIn4K() }
                            .buttonStyle(OutlineButtonStyle(tint: Theme.accent, pill: .large))
                            .disabled(screen.isFourKBusy || screen.advancedAdd4K.isLoading)
                    }
                    if fourK.canAdd {
                        Button(screen.isFourKBusy ? "Adding…" : "Add to 4K \(detail.mediaType.arrName)") { screen.addTo4K() }
                            .buttonStyle(OutlineButtonStyle(tint: Theme.accent, pill: .large))
                            .disabled(screen.isFourKBusy || screen.advancedAdd4K.isLoading)
                    }
                    if splitFourK { advancedChevron(viewer, filled: false) }
                }

                // components/report-problem-button.tsx (0.38+): once something
                // is reported, a "Problem reported" pill and "Report another"
                // (another episode can still be reported).
                if viewer.showsReportProblem(reportsIssues: model.viewer?.can(.reportIssues) == true) {
                    if screen.hasReportedProblem {
                        Text("Problem reported")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.textSecondary)
                            .padding(.horizontal, 14)
                            .frame(height: 32)
                            .overlay(Capsule().strokeBorder(Theme.border))
                    }
                    Button(action: onReportProblem) {
                        pillLabel(
                            "exclamationmark.bubble",
                            screen.hasReportedProblem ? String(localized: "Report another") : String(localized: "Report a problem"),
                            size: 13
                        )
                    }
                    .buttonStyle(OutlineButtonStyle(pill: .large))
                }

                // components/share-title-button.tsx (0.45.1+): send it to
                // someone in the household, or share a link.
                Button(action: onShare) {
                    pillLabel("square.and.arrow.up", String(localized: "Share"), size: 13)
                }
                .buttonStyle(OutlineButtonStyle(pill: .large))

                // components/block-requests-button.tsx (0.41+): Unblock (or
                // the keyword that blocked it) stays in the row while the
                // title is blocked — it's also the page's only sign of it.
                if viewer.offersBlocking(managesBlocklist: managesBlocklist) && viewer.block != nil {
                    blockControl(viewer.block)
                }

                // components/title-more-menu.tsx: the tools nobody needs
                // every visit.
                if menuTracking != nil || menuBlock || viewer.canRelink {
                    Menu {
                        if let tracking = menuTracking {
                            Button {
                                screen.searchNow()
                            } label: {
                                Label(screen.isSearching ? String(localized: "Searching…") : String(localized: "Search now"), systemImage: "magnifyingglass")
                            }
                            .disabled(screen.isSearching)
                            Button {
                                screen.setMonitored(!tracking.monitored)
                            } label: {
                                Label(
                                    tracking.monitored ? String(localized: "Stop monitoring") : String(localized: "Start monitoring"),
                                    systemImage: tracking.monitored ? "eye.slash" : "eye"
                                )
                            }
                            .disabled(screen.isTogglingMonitor)
                        }
                        if menuBlock {
                            Button {
                                askingBlockReason = true
                            } label: {
                                Label(String(localized: "Block requests"), systemImage: "hand.raised")
                            }
                        }
                        if viewer.canRelink {
                            Button(action: onRelink) {
                                Label(String(localized: "Fix ID"), systemImage: "tag")
                            }
                        }
                    } label: {
                        Image(systemName: "ellipsis")
                            .font(.system(size: 13, weight: .semibold))
                            .frame(width: 32, height: 32)
                            .contentShape(Circle())
                    }
                    .menuStyle(.button)
                    .menuIndicator(.hidden)
                    .buttonStyle(MoreMenuButtonStyle())
                    .fixedSize()
                    .help(String(localized: "More actions"))
                    .accessibilityLabel(String(localized: "More actions"))
                }

                if viewer.needsArrSetup {
                    Button("Connect \(detail.mediaType.arrName) to add this title") {
                        model.openSettings(.services)
                    }
                    .buttonStyle(QuietButtonStyle(color: Theme.accent))
                    .font(.system(size: 12.5))
                    .frame(height: 32)
                }
            }

            advancedAddPanels(viewer)

            if let line = viewer.otherRequestersLine {
                Text(line)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.textMuted)
            }
            if let error = screen.addError {
                InlineMessage(text: error)
            }
            if let message = screen.trackingMessage {
                InlineMessage(text: message.text, isError: message.isError)
            }
            if askingBlockReason && viewer.offersBlocking(managesBlocklist: managesBlocklist) && viewer.block == nil {
                blockReasonField
            }
            if let error = screen.blockError {
                InlineMessage(text: error)
            }
        }
    }

    // MARK: Advanced (add overrides)

    /// Which actions "Advanced" applies to: Add / Request, the 4K Add /
    /// Request, or both. Requests only with Advanced request options (0.48+),
    /// and only the whole-title ones (the season picker sends none).
    private func advancedTargets(_ viewer: API.TitleViewerState) -> (standard: Bool, fourK: Bool) {
        let requests = model.viewer?.can(.advancedRequests) == true
        let fourKRequest = viewer.fourK.map { $0.canRequest && !$0.isRequestPending } ?? false
        return (
            viewer.canAdd || (requests && !viewer.alreadyRequested && detail.requestAction == .wholeSeries),
            viewer.fourK?.canAdd == true || (requests && fourKRequest)
        )
    }

    private func offersAdvancedAdd(_ viewer: API.TitleViewerState) -> Bool {
        let targets = advancedTargets(viewer)
        guard targets.standard || targets.fourK else { return false }
        return screen.advancedAdd.isOffered && screen.advancedAdd4K.isOffered
    }

    /// The toggle shows one open/closed state for both panels.
    private func advancedToggleState(_ viewer: API.TitleViewerState) -> AdvancedAddOptions {
        advancedTargets(viewer).standard ? screen.advancedAdd : screen.advancedAdd4K
    }

    private func setAdvancedExpanded(_ expanded: Bool, _ viewer: API.TitleViewerState) {
        let targets = advancedTargets(viewer)
        if targets.standard, screen.advancedAdd.isExpanded != expanded { screen.advancedAdd.toggle() }
        if targets.fourK, screen.advancedAdd4K.isExpanded != expanded { screen.advancedAdd4K.toggle() }
    }

    @ViewBuilder
    private func advancedAddPanels(_ viewer: API.TitleViewerState) -> some View {
        let targets = advancedTargets(viewer)
        let both = targets.standard && targets.fourK
        let arrName = detail.mediaType.arrName
        if targets.standard && screen.advancedAdd.isExpanded {
            AddOptionsPanel(
                advanced: Binding(get: { screen.advancedAdd }, set: { screen.advancedAdd = $0 }),
                mediaType: detail.mediaType, tmdbId: detail.tmdbId, is4k: false,
                heading: both ? (viewer.canAdd ? String(localized: "Add to \(arrName)") : String(localized: "Request")) : nil
            )
        }
        if targets.fourK && screen.advancedAdd4K.isExpanded {
            AddOptionsPanel(
                advanced: Binding(get: { screen.advancedAdd4K }, set: { screen.advancedAdd4K = $0 }),
                mediaType: detail.mediaType, tmdbId: detail.tmdbId, is4k: true,
                heading: both ? (viewer.fourK?.canAdd == true ? String(localized: "Add to 4K \(arrName)") : String(localized: "Request in 4K")) : nil
            )
        }
    }

    /// "Block requests", "Unblock requests", or — when a blocked keyword did
    /// it — "Requests blocked by “anime”" (unblocked from Settings).
    @ViewBuilder
    private func blockControl(_ block: API.TitleBlock?) -> some View {
        if let keyword = block?.keyword.nonBlank {
            Text("Requests blocked by “\(keyword)”")
                .font(.system(size: 13))
                .foregroundStyle(Theme.textMuted)
                .padding(.horizontal, 14)
                .frame(height: 32)
                .overlay(Capsule().strokeBorder(Theme.border))
                .help("Remove the keyword in Settings › Account to unblock it.")
        } else if block != nil {
            Button {
                screen.unblock()
            } label: {
                pillLabel("hand.raised.slash", screen.isBlockBusy ? String(localized: "Unblocking…") : String(localized: "Unblock requests"), size: 13)
            }
            .buttonStyle(OutlineButtonStyle(pill: .large))
            .disabled(screen.isBlockBusy)
        } else if !askingBlockReason {
            Button {
                askingBlockReason = true
            } label: {
                pillLabel("hand.raised", String(localized: "Block requests"), size: 13)
            }
            .buttonStyle(OutlineButtonStyle(pill: .large))
        }
    }

    /// The reason field "Block requests" opens, with Block and Cancel.
    private var blockReasonField: some View {
        HStack(spacing: 8) {
            TextField("Why, for whoever asks (optional)", text: $blockReason)
                .textFieldStyle(.plain)
                .font(.system(size: 13))
                .padding(.horizontal, 14)
                .frame(height: 32)
                .background(Theme.bg0, in: Capsule())
                .overlay(Capsule().strokeBorder(Theme.border))
                .frame(maxWidth: 360)
                .onChange(of: blockReason) { _, value in
                    if value.count > API.BlockTitleRequest.maxReasonLength {
                        blockReason = String(value.prefix(API.BlockTitleRequest.maxReasonLength))
                    }
                }
                .onSubmit(submitBlock)
            Button(screen.isBlockBusy ? "Blocking…" : "Block", action: submitBlock)
                .buttonStyle(OutlineButtonStyle(pill: .large))
                .disabled(screen.isBlockBusy)
            Button("Cancel") { askingBlockReason = false }
                .buttonStyle(QuietButtonStyle())
                .font(.system(size: 12))
        }
    }

    private func submitBlock() {
        let reason = blockReason
        Task {
            if await screen.block(reason: reason) {
                askingBlockReason = false
                blockReason = ""
            }
        }
    }

    /// "Advanced" as a chevron joined onto the Add / Request button (a
    /// split button), or on its own after the 4K buttons.
    private func advancedChevron(_ viewer: API.TitleViewerState, filled: Bool) -> some View {
        let advanced = advancedToggleState(viewer)
        return Button {
            setAdvancedExpanded(!advanced.isExpanded, viewer)
        } label: {
            Image(systemName: "chevron.down")
                .font(.system(size: 10, weight: .bold))
                .rotationEffect(.degrees(advanced.isExpanded ? 180 : 0))
                .frame(width: filled ? 28 : 32, height: 32)
                .foregroundStyle(filled ? Theme.bg0 : Theme.accent)
                .background {
                    if filled {
                        UnevenRoundedRectangle(topLeadingRadius: 0, bottomLeadingRadius: 0, bottomTrailingRadius: 16, topTrailingRadius: 16)
                            .fill(Theme.accent)
                    } else {
                        Circle().strokeBorder(Theme.accent)
                    }
                }
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(screen.isAdding || screen.isFourKBusy)
        .help("Pick the server, quality profile, root folder and tags it's added with.")
        .accessibilityLabel(String(localized: "Advanced options"))
    }

    private func pillLabel(_ symbol: String, _ title: String, size: CGFloat) -> some View {
        HStack(spacing: PillSize.large.iconGap) {
            Image(systemName: symbol)
                .font(.system(size: size - 1))
                .foregroundStyle(Theme.textSecondary)
            Text(title)
        }
    }
}

/// The action row's "…" (components/title-more-menu.tsx): a 32pt outlined
/// circle like the pills beside it.
private struct MoreMenuButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        MoreMenuButtonBody(configuration: configuration)
    }
}

private struct MoreMenuButtonBody: View {
    let configuration: ButtonStyleConfiguration
    @State private var hovering = false

    var body: some View {
        let active = hovering || configuration.isPressed
        configuration.label
            .foregroundStyle(active ? Theme.accent : Theme.textPrimary)
            .background(Circle().fill(configuration.isPressed ? Theme.bg2 : Theme.bg0.opacity(0.4)))
            .overlay(Circle().strokeBorder(active ? Theme.accent : Theme.borderStrong, lineWidth: 1))
            .contentShape(Circle())
            .onHover { hovering = $0 }
    }
}

/// components/external-links.tsx — the server sends the ordered button row.
private struct ExternalLinksRow: View {
    let links: API.TitleDetail.Links
    let onTrailer: () -> Void
    @Environment(\.openURL) private var openURL

    var body: some View {
        let trailer = links.trailerURL
        if trailer != nil || !links.external.isEmpty {
            // .links — 30pt pills, 8pt apart.
            FlowLayout(spacing: 8, lineSpacing: 8) {
                if trailer != nil {
                    Button(action: onTrailer) {
                        HStack(spacing: PillSize.medium.iconGap) {
                            Image(systemName: "play.fill")
                                .font(.system(size: 10))
                                .foregroundStyle(Theme.accent)
                            Text("Trailer")
                        }
                    }
                    .buttonStyle(OutlineButtonStyle(pill: .medium))
                }
                ForEach(links.external, id: \.label) { item in
                    if let url = item.link {
                        Button(item.label) { openURL(url) }
                            .buttonStyle(OutlineButtonStyle(pill: .medium))
                    }
                }
            }
        }
    }
}

// MARK: - Sidebar column

private struct TitleSidebarColumn: View {
    let detail: API.TitleDetail

    /// The `.frow` rows this title actually has, in the mockup's order.
    private var facts: [(label: String, value: String)] {
        let facts = detail.facts
        // A theatrical release on the same day as the release date says
        // nothing new.
        let theatrical = facts.theatricalReleaseLabel == facts.releaseDateLabel ? nil : facts.theatricalReleaseLabel
        let candidates: [(String, String?)] = [
            (String(localized: "Status"), facts.statusLabel),
            (String(localized: "Original Title"), facts.originalTitle),
            (detail.mediaType == .movie ? String(localized: "Release Date") : String(localized: "First Air Date"), facts.releaseDateLabel),
            (String(localized: "Theatrical Release"), theatrical),
            (String(localized: "Digital Release"), facts.digitalReleaseLabel),
            (String(localized: "Next Episode"), facts.nextAirDateLabel),
            (String(localized: "Budget"), facts.budgetLabel),
            (String(localized: "Revenue"), facts.revenueLabel),
            (String(localized: "Original Language"), facts.originalLanguageLabel),
            (String(localized: "Production Country"), facts.productionCountry.map { "\($0.flag) \($0.name)" }),
            (String(localized: "Studio"), facts.studio),
            (String(localized: "Network"), facts.network),
        ]
        return candidates.compactMap { label, value in
            value.nonBlank.map { (label: label, value: $0) }
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            factsCard
            if let file = detail.library.file {
                FileDetailsCard(file: file, runtimeLabel: detail.facts.runtimeLabel)
            }
        }
    }

    /// `.facts` — padding 4/18/16 over a translucent bg1, radius 16.
    private var factsCard: some View {
        let rating = detail.facts.ratingPercent
        return VStack(alignment: .leading, spacing: 0) {
            if let rating {
                // .rating — height 50: serif 22 accent, then the source.
                HStack(spacing: 10) {
                    Text("★ \(rating)%")
                        .font(.marqueeDisplay(22, weight: .bold))
                        .tracking(-0.22)
                        .foregroundStyle(Theme.accent)
                    Spacer(minLength: 8)
                    Text("TMDb user score")
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.textMuted)
                }
                .frame(height: 50)
            }

            // 0.53+: IMDb / Rotten Tomatoes / Metacritic (an OMDb key on the server).
            let ratings = detail.facts.ratings.flatMap { TitleRatingsRow.hasAny($0) ? $0 : nil }
            if let ratings {
                TitleRatingsRow(ratings: ratings)
                    .padding(.vertical, 10)
                    .overlay(alignment: .top) {
                        if rating != nil { Theme.border.frame(height: 1) }
                    }
            }

            ForEach(Array(facts.enumerated()), id: \.offset) { index, row in
                factRow(row.label, row.value, dividing: rating != nil || ratings != nil || index > 0)
            }

            if !detail.facts.watchProviders.isEmpty {
                // .streaming — 1px top border, 14 above the caps label.
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        CapsLabel(text: String(localized: "CURRENTLY STREAMING ON"))
                        Spacer(minLength: 8)
                        // 0.53+: the country they're for (Settings › Discover).
                        if let region = detail.facts.streamingRegion.nonBlank {
                            Text(verbatim: region)
                                .font(.system(size: 11))
                                .foregroundStyle(Theme.textMuted)
                        }
                    }
                    FlowLayout(spacing: 8, lineSpacing: 8) {
                        ForEach(detail.facts.watchProviders, id: \.name) { provider in
                            providerTile(provider)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 14)
                .overlay(alignment: .top) { Theme.border.frame(height: 1) }
            }
        }
        .padding(.top, 4)
        .padding(.horizontal, 18)
        .padding(.bottom, 16)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Theme.bg1.opacity(0.94))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(Theme.border, lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.35), radius: 20, y: 18)
    }

    /// A provider's logo; with TMDb's "where to watch" page, a link to it.
    @ViewBuilder
    private func providerTile(_ provider: API.TitleDetail.WatchProvider) -> some View {
        let tile = RemoteImage(provider.logoPath, size: .w92, showsShimmer: false)
            .frame(width: 36, height: 36)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
            .shadow(color: .black.opacity(0.3), radius: 3, y: 2)
            .help(provider.name)
        if let url = detail.facts.streamingURL {
            Link(destination: url) { tile }
                .buttonStyle(.plain)
                .accessibilityLabel(provider.name)
        } else {
            tile
        }
    }

    /// `.frow` — label left, value right, hairline above. 38pt is a minimum,
    /// not a fixed height: a long value ("United States of America" doesn't
    /// fit 288pt) wraps and the row grows, like the website's.
    private func factRow(_ label: String, _ value: String, dividing: Bool) -> some View {
        HStack(alignment: .center, spacing: 10) {
            Text(label)
                .foregroundStyle(Theme.textSecondary)
                .lineLimit(1)
                .fixedSize()
            Spacer(minLength: 10)
            Text(value)
                .fontWeight(.medium)
                .foregroundStyle(Theme.textPrimary)
                .multilineTextAlignment(.trailing)
                .fixedSize(horizontal: false, vertical: true)
        }
        .font(.system(size: 12.5))
        .padding(.vertical, 6)
        .frame(minHeight: 38)
        .overlay(alignment: .top) {
            if dividing { Theme.border.frame(height: 1) }
        }
    }
}

/// components/file-details-section.tsx — the location field, then whichever of
/// the mockup's pairs the server described for this file.
private struct FileDetailsCard: View {
    let file: API.FileDetails
    let runtimeLabel: String?

    /// `.fgrid` cells, in the mockup's order: Size/Runtime, Added/Resolution,
    /// Quality profile/Video, Dynamic range/Audio. Anything the server didn't
    /// send is skipped and the rest closes up.
    private var cells: [(label: String, value: String)] {
        var cells: [(label: String, value: String)] = [(String(localized: "Size"), file.sizeLabel)]
        if let runtimeLabel { cells.append((String(localized: "Runtime"), runtimeLabel)) }
        if let added = file.dateAdded { cells.append((String(localized: "Added"), Format.shortDate(added))) }
        if let resolution = file.resolutionLabel { cells.append((String(localized: "Resolution"), resolution)) }
        if let quality = file.quality.nonBlank { cells.append((String(localized: "Quality profile"), quality)) }
        // No media-type gate: Plex reports codecs and audio for shows too,
        // aggregated across their episodes, and a cell with nothing in it is
        // skipped anyway.
        if let video = file.videoCodec.nonBlank { cells.append((String(localized: "Video"), video)) }
        if let range = file.dynamicRangeLabel { cells.append((String(localized: "Dynamic range"), range)) }
        if let audio = file.audioLabel { cells.append((String(localized: "Audio"), audio)) }
        if let container = file.container.nonBlank { cells.append((String(localized: "Container"), container)) }
        if let bitrate = file.bitrateLabel { cells.append((String(localized: "Bitrate"), bitrate)) }
        // Not in the mockup (its file has neither), but real files do —
        // they carry on in the same grid.
        if let edition = file.edition.nonBlank { cells.append((String(localized: "Edition"), edition)) }
        if let group = file.releaseGroup.nonBlank { cells.append((String(localized: "Release group"), group)) }
        return cells
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("File details")
                .font(.marqueeDisplay(16, weight: .semibold))
                .foregroundStyle(Theme.textPrimary)
                .padding(.bottom, 12)

            if let path = file.path.nonBlank {
                CapsLabel(text: String(localized: "LOCATION"))
                CopyField(value: path, variant: .path)
                    .padding(.top, 6)
            }

            LazyVGrid(
                columns: Array(repeating: GridItem(.flexible(), spacing: 14, alignment: .topLeading), count: 2),
                alignment: .leading,
                spacing: 12
            ) {
                ForEach(Array(cells.enumerated()), id: \.offset) { _, cell in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(cell.label)
                            .font(.system(size: 11))
                            .foregroundStyle(Theme.textMuted)
                            .lineLimit(1)
                        Text(cell.value)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(Theme.textPrimary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.85)
                            .textSelection(.enabled)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(.top, file.path.nonBlank == nil ? 0 : 14)
        }
        .padding(.top, 15)
        .padding(.horizontal, 18)
        .padding(.bottom, 18)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Theme.bg1)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Theme.border, lineWidth: 1)
        )
    }
}

// MARK: - Franchise (components/franchise-row.tsx)

private struct FranchiseSection: View {
    let screen: TitleDetailModel
    let franchise: API.TitleDetail.Franchise

    @Environment(AppModel.self) private var model
    @State private var confirmingAddAll = false
    @State private var confirmingRequestAll = false

    var body: some View {
        let missingCount = franchise.addAllMissing.count
        let requestableCount = franchise.requestAllMissing?.count ?? 0
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 12) {
                SectionTitle(text: franchise.title)
                if let collectionId = franchise.collectionId, let favorited = franchise.collectionFavorited {
                    FavoriteButton(target: FavoriteTarget(.collection, collectionId, favorited: favorited))
                }
                if let result = screen.addAllResult {
                    Text(result)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.textSecondary)
                } else if missingCount > 0 {
                    Button(screen.isAddingAll ? "Adding…" : "Add all \(missingCount) missing") { confirmingAddAll = true }
                        .buttonStyle(OutlineButtonStyle(compact: true))
                        .disabled(screen.isAddingAll)
                }
                if let result = screen.requestAllResult {
                    Text(result)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.textSecondary)
                } else if requestableCount > 0 {
                    Button(screen.isRequestingAll ? "Requesting…" : "Request all \(requestableCount) missing") {
                        confirmingRequestAll = true
                    }
                    .buttonStyle(OutlineButtonStyle(compact: true))
                    .disabled(screen.isRequestingAll)
                }
            }
            PosterGrid {
                ForEach(franchise.items) { card in
                    PosterCard(card: card) { model.openTitle(card.id) }
                }
            }
        }
        .confirmationDialog(
            "Add all \(missingCount) missing titles to Sonarr/Radarr?",
            isPresented: $confirmingAddAll
        ) {
            Button("Add All") { screen.addAllMissing() }
            Button("Cancel", role: .cancel) {}
        }
        .confirmationDialog(
            "Request all \(requestableCount) missing titles?",
            isPresented: $confirmingRequestAll
        ) {
            Button("Request All") { Task { await screen.requestAllMissing() } }
            Button("Cancel", role: .cancel) {}
        }
    }
}

// MARK: - Ratings and Play (0.53+)

/// components/title-hero.tsx's RatingsRow: IMDb (linking to the title there),
/// Rotten Tomatoes and Metacritic as small badges under the TMDb score.
private struct TitleRatingsRow: View {
    let ratings: API.TitleDetail.Ratings

    static func hasAny(_ ratings: API.TitleDetail.Ratings) -> Bool {
        ratings.imdbRating != nil || ratings.rottenTomatoesCritics != nil || ratings.metacritic != nil
    }

    var body: some View {
        FlowLayout(spacing: 6, lineSpacing: 6) {
            if let imdb = ratings.imdbRating {
                let badge = RatingBadge(mark: "IMDb", markColor: Color(red: 0.96, green: 0.77, blue: 0.09)) {
                    Text(imdb.formatted(.number.precision(.fractionLength(1))))
                    if let votes = ratings.imdbVotes {
                        Text("(\(votes.formatted(.number.notation(.compactName))))")
                            .foregroundStyle(Theme.textMuted)
                            .font(.system(size: 11))
                    }
                }
                .help("IMDb rating")
                if let url = ratings.imdbURL {
                    Link(destination: url) { badge }
                        .buttonStyle(.plain)
                } else {
                    badge
                }
            }
            if let critics = ratings.rottenTomatoesCritics {
                RatingBadge(mark: "🍅", markColor: nil) {
                    Text("\(critics)%")
                }
                .help("Rotten Tomatoes (critics)")
            }
            if let metacritic = ratings.metacritic {
                RatingBadge(mark: "MC", markColor: Color(red: 0.4, green: 0.8, blue: 0.2)) {
                    Text(verbatim: "\(metacritic)")
                }
                .help("Metascore")
            }
        }
    }
}

/// One rating: a small mark (IMDb's yellow tag, a tomato, Metacritic's
/// green) and the score, in an outlined capsule.
private struct RatingBadge<Score: View>: View {
    let mark: String
    let markColor: Color?
    @ViewBuilder let score: () -> Score

    var body: some View {
        HStack(spacing: 5) {
            if let markColor {
                Text(verbatim: mark)
                    .font(.system(size: 9.5, weight: .heavy))
                    .foregroundStyle(.black)
                    .padding(.horizontal, 4)
                    .padding(.vertical, 1)
                    .background(RoundedRectangle(cornerRadius: 3).fill(markColor))
            } else {
                Text(verbatim: mark).font(.system(size: 11))
            }
            score()
        }
        .font(.system(size: 12, weight: .medium))
        .foregroundStyle(Theme.textPrimary)
        .padding(.horizontal, 9)
        .frame(height: 26)
        .overlay(Capsule().strokeBorder(Theme.border))
    }
}

/// components/play-button.tsx: "Play on Plex" (or Jellyfin / Emby) — the
/// server's own app when this Mac has it (Plex's `plex://`), else its web
/// app. A menu when more than one household server has the title.
private struct PlayOnServerButton: View {
    let links: [API.TitleDetail.PlayLink]
    @Environment(\.openURL) private var openURL

    var body: some View {
        if links.count == 1, let link = links.first {
            Button { open(link) } label: { label(link.label) }
                .buttonStyle(AccentButtonStyle(height: 32))
        } else if links.count > 1 {
            Menu {
                ForEach(links) { link in
                    Button(link.menuTitle) { open(link) }
                }
            } label: {
                label(String(localized: "Play"))
            }
            .menuStyle(.button)
            .buttonStyle(AccentButtonStyle(height: 32))
            .fixedSize()
        }
    }

    private func label(_ text: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: "play.fill").font(.system(size: 10))
            Text(text)
        }
    }

    /// The app first when one is installed for its scheme.
    private func open(_ link: API.TitleDetail.PlayLink) {
        if let app = link.appUrl.nonBlank.flatMap(URL.init(string:)),
           NSWorkspace.shared.urlForApplication(toOpen: app) != nil {
            openURL(app)
        } else if let web = link.link {
            openURL(web)
        }
    }
}
