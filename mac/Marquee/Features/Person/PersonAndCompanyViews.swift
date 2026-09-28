import SwiftUI

/// app/person/[id]/page.tsx + components/person-header.tsx.
struct PersonDetailView: View {
    let tmdbId: Int

    @Environment(AppModel.self) private var model
    @State private var person: API.PersonDetail?
    @State private var error: String?

    var body: some View {
        Group {
            if let person {
                EntityPage(knownFor: person.knownForTitle, tmdbId: person.tmdbId) { compact in
                    header(person, compact: compact)
                } rows: {
                    MediaListView(
                        cards: person.credits,
                        subtitleLabel: String(localized: "Role"),
                        countLabel: { String(localized: "\($0) credits") },
                        showTypeFilter: true,
                        showSearch: true,
                        emptyMessage: String(localized: "No processed filmography found for this person yet.")
                    )
                }
            } else {
                ScrollView {
                    Group {
                        if let error {
                            EmptyStateView(
                                title: String(localized: "Couldn't load this person"),
                                message: error,
                                systemImage: "person.crop.circle.badge.exclamationmark",
                                actionTitle: String(localized: "Try again"),
                                action: { model.reload() }
                            )
                        } else {
                            LoadingView()
                        }
                    }
                    .padding(Metrics.pagePadding)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .scrollsUnderNavRail()
            }
        }
        .background(Theme.bg0)
        .navigationTitle(person?.name ?? "")
        .toolbar {
            // A person's page shares just a link (0.45.1+, as on the website):
            // Marquee's page or TMDb's.
            let links = ShareLinks.person(tmdbId, server: model.session.server?.baseURL)
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    ForEach(links.kinds) { kind in
                        if let url = links.url(for: kind) {
                            ShareLink(kind == .marquee ? "Share Marquee Link…" : "Share TMDb Link…", item: url)
                        }
                    }
                    Divider()
                    ForEach(links.kinds) { kind in
                        if let url = links.url(for: kind) {
                            Button(kind == .marquee ? "Copy Marquee Link" : "Copy TMDb Link") { model.copyLink(url) }
                        }
                    }
                } label: {
                    Image(systemName: "square.and.arrow.up")
                }
                .help("Share this person")
            }
        }
        .task(id: ReloadKey(token: model.reloadToken, remote: model.events.remoteRevision(of: [.library, .favorites]))) {
            await load()
        }
    }

    @ViewBuilder
    private func header(_ person: API.PersonDetail, compact: Bool) -> some View {
        let photo = ZStack {
            Theme.bg2
            if person.profilePath.url(.w342) != nil {
                RemoteImage(person.profilePath, size: .w342)
            } else {
                Image(systemName: "person.fill")
                    .font(.system(size: Metrics.text(48)))
                    .foregroundStyle(Theme.textMuted)
            }
        }
        .frame(width: compact ? 116 : 192, height: compact ? 174 : 288)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Theme.border))
        .shadow(color: .black.opacity(0.45), radius: 22, y: 10)

        let details = VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 14) {
                Text(person.name)
                    .font(.marqueeDisplay(compact ? 30 : 40))
                    .foregroundStyle(Theme.textPrimary)
                    .textSelection(.enabled)
                    .shadow(color: .black.opacity(0.25), radius: 10, y: 2)
                FavoriteButton(target: FavoriteTarget(.person, person.tmdbId, favorited: person.favorited))
            }
            FlowLayout(spacing: 18, lineSpacing: 4) {
                if let born = person.birthday {
                    Text("Born \(Text(born.longLabel).foregroundStyle(Theme.textSecondary))")
                        .foregroundStyle(Theme.textMuted)
                }
                if let died = person.deathday {
                    Text("Died \(Text(died.longLabel).foregroundStyle(Theme.textSecondary))")
                        .foregroundStyle(Theme.textMuted)
                }
                if let place = person.placeOfBirth.nonBlank {
                    Text(place)
                }
            }
            .font(.system(size: Metrics.text(13)))
            .foregroundStyle(Theme.textSecondary)
            if let bio = person.biography.nonBlank {
                Text(bio.truncated(to: 600))
                    .font(.system(size: Metrics.text(13.5)))
                    .lineSpacing(4)
                    .foregroundStyle(Theme.textSecondary)
                    .textSelection(.enabled)
                    .frame(maxWidth: 720, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            EntityLinksRow(links: person.links)
                .padding(.top, 4)
        }

        if compact {
            VStack(alignment: .leading, spacing: 18) {
                photo
                details
            }
        } else {
            HStack(alignment: .top, spacing: 32) {
                photo
                details
            }
        }
    }

    private func load() async {
        do {
            let fresh = try await model.api.people.detail(tmdbId)
            if Task.isCancelled { return }
            person = fresh
            error = nil
        } catch let failure as APIError where failure.isCancellation {
            return
        } catch {
            if person == nil { self.error = error.localizedDescription }
        }
    }
}

/// app/company/[id]/page.tsx + components/company-header.tsx.
struct CompanyDetailView: View {
    let tmdbId: Int

    @Environment(AppModel.self) private var model
    @State private var company: API.CompanyDetail?
    @State private var error: String?

    var body: some View {
        Group {
            if let company {
                EntityPage(knownFor: company.knownForTitle, tmdbId: company.tmdbId) { compact in
                    header(company, compact: compact)
                } rows: {
                    MediaListView(
                        cards: company.titles,
                        showTypeFilter: true,
                        showSearch: true,
                        emptyMessage: String(localized: "No titles found for this studio yet.")
                    )
                }
            } else {
                ScrollView {
                    Group {
                        if let error {
                            EmptyStateView(
                                title: String(localized: "Couldn't load this studio"),
                                message: error,
                                systemImage: "building.2",
                                actionTitle: String(localized: "Try again"),
                                action: { model.reload() }
                            )
                        } else {
                            LoadingView(label: String(localized: "Loading the catalog…"))
                        }
                    }
                    .padding(Metrics.pagePadding)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .scrollsUnderNavRail()
            }
        }
        .background(Theme.bg0)
        .navigationTitle(company?.name ?? "")
        .task(id: ReloadKey(token: model.reloadToken, remote: model.events.remoteRevision(of: [.library, .favorites]))) {
            await load()
        }
    }

    @ViewBuilder
    private func header(_ company: API.CompanyDetail, compact: Bool) -> some View {
        let logo = ZStack {
            if company.logoPath.url(.w342) != nil {
                Color.white
                RemoteImage(company.logoPath, size: .w342, contentMode: .fit, showsShimmer: false)
                    .padding(compact ? 14 : 18)
            } else {
                Theme.bg1
                Text(company.name)
                    .font(.marqueeDisplay(16))
                    .foregroundStyle(Theme.textSecondary)
                    .padding()
            }
        }
        .frame(width: compact ? 144 : 176, height: compact ? 90 : 110)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Theme.border))
        .shadow(color: .black.opacity(0.35), radius: 18, y: 8)

        let details = VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 14) {
                Text(company.name)
                    .font(.marqueeDisplay(compact ? 30 : 38))
                    .foregroundStyle(Theme.textPrimary)
                    .shadow(color: .black.opacity(0.25), radius: 10, y: 2)
                FavoriteButton(target: FavoriteTarget(.company, company.tmdbId, favorited: company.favorited))
            }
            Text("\(company.titleCount) titles in the catalog")
                .font(.system(size: Metrics.text(13)))
                .foregroundStyle(Theme.textSecondary)
            if let summary = company.shortDescription {
                Text(summary)
                    .font(.system(size: Metrics.text(13.5)))
                    .foregroundStyle(Theme.textSecondary)
                    .frame(maxWidth: 720, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            EntityLinksRow(links: company.links)
                .padding(.top, 4)
        }

        if compact {
            VStack(alignment: .leading, spacing: 18) {
                logo
                details
            }
        } else {
            HStack(alignment: .top, spacing: 28) {
                logo
                details
            }
        }
    }

    private func load() async {
        do {
            let fresh = try await model.api.companies.detail(tmdbId)
            if Task.isCancelled { return }
            company = fresh
            error = nil
        } catch let failure as APIError where failure.isCancellation {
            return
        } catch {
            if company == nil { self.error = error.localizedDescription }
        }
    }
}

// MARK: - Hero

/// components/entity-hero.tsx — a person's or studio's page. With a title
/// they're best known for, its artwork runs full-bleed behind the header
/// (the title page's band, fades and veil: `TitleBackdrop`) with a small
/// "From {title}" link to it; without one, the header in the page's usual
/// gutters. `rows` is the list under the header.
struct EntityPage<Header: View, Rows: View>: View {
    let knownFor: API.KnownForTitle?
    /// The person's or studio's: keeps the film grain the same speckle on
    /// every render.
    let tmdbId: Int
    @ViewBuilder let header: (_ compact: Bool) -> Header
    @ViewBuilder let rows: () -> Rows

    @Environment(\.navRailInsets) private var navRailInsets
    #if os(iOS)
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    #endif

    private var seed: UInt64 {
        UInt64(UInt32(bitPattern: Int32(truncatingIfNeeded: tmdbId)))
    }

    private var compact: Bool {
        #if os(iOS)
        horizontalSizeClass == .compact
        #else
        false
        #endif
    }

    var body: some View {
        if let knownFor, knownFor.backdropPath.url(.w1280) != nil {
            if compact {
                phoneHero(knownFor)
            } else {
                wideHero(knownFor)
            }
        } else {
            ScrollView {
                VStack(alignment: .leading, spacing: 44) {
                    header(compact)
                    rows()
                }
                .padding(.horizontal, Metrics.pagePadding)
                .padding(.vertical, Metrics.pagePadding)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .scrollsUnderNavRail()
        }
    }

    /// The Mac and iPad: a band a little over half the window tall (a
    /// person's header is shorter than a title's), the header over its lower
    /// part, "From …" at its bottom right once the window is wide enough to
    /// keep it clear of the text, above the header's right end otherwise.
    private func wideHero(_ knownFor: API.KnownForTitle) -> some View {
        GeometryReader { proxy in
            let width = max(proxy.size.width, 1)
            let height = max(360, min(proxy.size.height * 0.58, width * 0.42))
            let headerTop = height * 0.36
            let leading = navRailInsets.leading + Metrics.pagePadding
            let trailing = navRailInsets.trailing + Metrics.titleRightGutter
            let roomy = width >= 1200
            ScrollView {
                VStack(alignment: .leading, spacing: 44) {
                    ZStack(alignment: .topLeading) {
                        TitleBackdrop(
                            backdropPath: knownFor.backdropPath,
                            seed: seed,
                            height: height,
                            wide: width > 1400,
                            sideFade: true
                        )
                        .equatable()
                        .overlay(alignment: roomy ? .bottomTrailing : .topTrailing) {
                            KnownForLink(knownFor: knownFor)
                                .padding(.trailing, trailing)
                                .padding(.bottom, roomy ? 34 : 0)
                                .padding(.top, roomy ? 0 : headerTop - 42)
                        }

                        header(false)
                            .padding(.leading, leading)
                            .padding(.trailing, trailing)
                            .padding(.top, headerTop)
                    }

                    rows()
                        .padding(.leading, leading)
                        .padding(.trailing, navRailInsets.trailing + Metrics.pagePadding)
                        .padding(.bottom, Metrics.pagePadding)
                }
            }
        }
        .ignoresSafeArea(.container, edges: [.top, .horizontal])
    }

    /// The iPhone: the artwork across the top, the photo over its lower
    /// edge and "From …" beside it, then one column.
    private func phoneHero(_ knownFor: API.KnownForTitle) -> some View {
        GeometryReader { proxy in
            let height = max(220, proxy.size.width * 0.62)
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    TitleBackdrop(
                        backdropPath: knownFor.backdropPath,
                        seed: seed,
                        height: height + proxy.safeAreaInsets.top,
                        wide: false,
                        sideFade: false
                    )
                    .equatable()
                    .overlay(alignment: .bottomTrailing) {
                        KnownForLink(knownFor: knownFor)
                            .frame(maxWidth: proxy.size.width - 116 - Metrics.pagePadding * 3, alignment: .trailing)
                            .padding(.bottom, 14)
                    }

                    header(true)
                        .padding(.top, -110)

                    rows()
                        .padding(.top, 36)
                        .padding(.bottom, 40)
                }
                .padding(.horizontal, Metrics.pagePadding)
            }
            .ignoresSafeArea(.container, edges: .top)
        }
    }
}

/// The "From {title}" capsule on the band: opens the title the artwork is from.
private struct KnownForLink: View {
    let knownFor: API.KnownForTitle
    @Environment(AppModel.self) private var model
    @State private var hovering = false

    var body: some View {
        Button {
            model.openTitle(knownFor.id)
        } label: {
            Text("From \(knownFor.name)")
                .font(.system(size: Metrics.text(12)))
                .lineLimit(1)
                .truncationMode(.tail)
                .foregroundStyle(hovering ? Theme.accent : Theme.textSecondary)
                .padding(.horizontal, 12)
                .frame(height: 28)
                .background(Capsule().fill(Theme.bg0.opacity(0.4)))
                .background(.ultraThinMaterial, in: Capsule())
                .overlay(Capsule().strokeBorder(hovering ? Theme.accent : Theme.border))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .help(Text("Open \(knownFor.name)"))
        .accessibilityLabel(Text("Background from \(knownFor.name). Open its page"))
    }
}

/// components/external-links.tsx `EntityLinks` — IMDb, socials, website, as
/// the title page's link pills.
struct EntityLinksRow: View {
    let links: [API.ExternalLink]
    @Environment(\.openURL) private var openURL

    var body: some View {
        if !links.isEmpty {
            FlowLayout(spacing: 8, lineSpacing: 8) {
                ForEach(links, id: \.url) { link in
                    if let url = link.link {
                        Button(link.label) { openURL(url) }
                            .buttonStyle(OutlineButtonStyle(pill: .medium))
                            .help(url.absoluteString)
                    }
                }
            }
        }
    }
}
