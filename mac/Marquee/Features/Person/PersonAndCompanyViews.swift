import SwiftUI

/// app/person/[id]/page.tsx + components/person-header.tsx.
struct PersonDetailView: View {
    let tmdbId: Int

    @Environment(AppModel.self) private var model
    @State private var person: API.PersonDetail?
    @State private var error: String?
    #if os(iOS)
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    #endif

    /// An iPhone: the photo beside the name, the rest under both.
    private var isPhone: Bool {
        #if os(iOS)
        horizontalSizeClass == .compact
        #else
        false
        #endif
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: isPhone ? 28 : 44) {
                if let person {
                    if isPhone {
                        phoneHeader(person)
                    } else {
                        header(person)
                    }
                    MediaListView(
                        cards: person.credits,
                        subtitleLabel: String(localized: "Role"),
                        countLabel: { String(localized: "\($0) credits") },
                        showTypeFilter: true,
                        showSearch: true,
                        emptyMessage: String(localized: "No processed filmography found for this person yet.")
                    )
                } else if let error {
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
            .padding(.horizontal, Metrics.pagePadding)
            .padding(.vertical, Metrics.pagePadding)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .scrollsUnderNavRail()
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

    private func photo(_ person: API.PersonDetail, width: CGFloat) -> some View {
        ZStack {
            Theme.bg2
            if person.profilePath.url(.w342) != nil {
                RemoteImage(person.profilePath, size: .w342)
            } else {
                Image(systemName: "person.fill")
                    .font(.system(size: Metrics.text(width / 4)))
                    .foregroundStyle(Theme.textMuted)
            }
        }
        .frame(width: width, height: width * 1.5)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Theme.border))
    }

    /// At phone width: the photo and the name, dates and Favorite side by
    /// side, the biography across the page under them.
    private func phoneHeader(_ person: API.PersonDetail) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 16) {
                photo(person, width: 116)
                VStack(alignment: .leading, spacing: 8) {
                    Text(person.name)
                        .font(.marqueeDisplay(28))
                        .foregroundStyle(Theme.textPrimary)
                        .lineLimit(3)
                        .minimumScaleFactor(0.8)
                        .fixedSize(horizontal: false, vertical: true)
                        .textSelection(.enabled)
                    VStack(alignment: .leading, spacing: 3) {
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
                                .foregroundStyle(Theme.textSecondary)
                        }
                    }
                    .font(.system(size: Metrics.text(13)))
                    .fixedSize(horizontal: false, vertical: true)
                    FavoriteButton(target: FavoriteTarget(.person, person.tmdbId, favorited: person.favorited))
                        .padding(.top, 2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            if let bio = person.biography.nonBlank {
                Text(bio.truncated(to: 600))
                    .font(.system(size: Metrics.text(13.5)))
                    .lineSpacing(4)
                    .foregroundStyle(Theme.textSecondary)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func header(_ person: API.PersonDetail) -> some View {
        HStack(alignment: .top, spacing: 32) {
            ZStack {
                Theme.bg2
                if person.profilePath.url(.w342) != nil {
                    RemoteImage(person.profilePath, size: .w342)
                } else {
                    Image(systemName: "person.fill")
                        .font(.system(size: Metrics.text(48)))
                        .foregroundStyle(Theme.textMuted)
                }
            }
            .frame(width: 192, height: 288)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Theme.border))

            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 14) {
                    Text(person.name)
                        .font(.marqueeDisplay(40))
                        .foregroundStyle(Theme.textPrimary)
                        .textSelection(.enabled)
                    FavoriteButton(target: FavoriteTarget(.person, person.tmdbId, favorited: person.favorited))
                }
                HStack(spacing: 18) {
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
    #if os(iOS)
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    #endif

    /// An iPhone: the logo beside the name, the description under both.
    private var isPhone: Bool {
        #if os(iOS)
        horizontalSizeClass == .compact
        #else
        false
        #endif
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: isPhone ? 28 : 44) {
                if let company {
                    if isPhone {
                        phoneHeader(company)
                    } else {
                        header(company)
                    }
                    MediaListView(
                        cards: company.titles,
                        showTypeFilter: true,
                        showSearch: true,
                        emptyMessage: String(localized: "No titles found for this studio yet.")
                    )
                } else if let error {
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
            .padding(.horizontal, Metrics.pagePadding)
            .padding(.vertical, Metrics.pagePadding)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .scrollsUnderNavRail()
        .background(Theme.bg0)
        .navigationTitle(company?.name ?? "")
        .task(id: ReloadKey(token: model.reloadToken, remote: model.events.remoteRevision(of: [.library, .favorites]))) {
            await load()
        }
    }

    /// At phone width: the logo beside the name and Favorite, the
    /// description under both.
    private func phoneHeader(_ company: API.CompanyDetail) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .center, spacing: 14) {
                ZStack {
                    if company.logoPath.url(.w342) != nil {
                        Color.white
                        RemoteImage(company.logoPath, size: .w342, contentMode: .fit, showsShimmer: false)
                            .padding(10)
                    } else {
                        Theme.bg1
                        Image(systemName: "building.2")
                            .font(.system(size: 24))
                            .foregroundStyle(Theme.textMuted)
                    }
                }
                .frame(width: 112, height: 70)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Theme.border))

                VStack(alignment: .leading, spacing: 4) {
                    Text(company.name)
                        .font(.marqueeDisplay(26))
                        .foregroundStyle(Theme.textPrimary)
                        .lineLimit(2)
                        .minimumScaleFactor(0.8)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("\(company.titleCount) titles in the catalog")
                        .font(.system(size: Metrics.text(13)))
                        .foregroundStyle(Theme.textSecondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            FavoriteButton(target: FavoriteTarget(.company, company.tmdbId, favorited: company.favorited))
            if let summary = company.shortDescription {
                Text(summary)
                    .font(.system(size: Metrics.text(13.5)))
                    .foregroundStyle(Theme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func header(_ company: API.CompanyDetail) -> some View {
        HStack(alignment: .top, spacing: 28) {
            ZStack {
                if company.logoPath.url(.w342) != nil {
                    Color.white
                    RemoteImage(company.logoPath, size: .w342, contentMode: .fit, showsShimmer: false)
                        .padding(18)
                } else {
                    Theme.bg1
                    Text(company.name)
                        .font(.marqueeDisplay(16))
                        .foregroundStyle(Theme.textSecondary)
                        .padding()
                }
            }
            .frame(width: 176, height: 110)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Theme.border))

            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 14) {
                    Text(company.name)
                        .font(.marqueeDisplay(38))
                        .foregroundStyle(Theme.textPrimary)
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
