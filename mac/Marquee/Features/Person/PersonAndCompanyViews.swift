import SwiftUI

/// app/person/[id]/page.tsx + components/person-header.tsx.
struct PersonDetailView: View {
    let tmdbId: Int

    @Environment(AppModel.self) private var model
    @State private var person: API.PersonDetail?
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 44) {
                if let person {
                    header(person)
                    MediaListView(
                        cards: person.credits,
                        subtitleLabel: "Role",
                        itemLabel: "credits",
                        showTypeFilter: true,
                        showSearch: true,
                        emptyMessage: "No processed filmography found for this person yet."
                    )
                } else if let error {
                    EmptyStateView(
                        title: "Couldn't load this person",
                        message: error,
                        systemImage: "person.crop.circle.badge.exclamationmark",
                        actionTitle: "Try again",
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
        .background(Theme.bg0)
        .navigationTitle(person?.name ?? "")
        .task(id: ReloadKey(token: model.reloadToken, remote: model.events.remoteRevision(of: [.library, .favorites]))) {
            await load()
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
                        .font(.system(size: 48))
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
                        (Text("Born ").foregroundStyle(Theme.textMuted) + Text(born.longLabel))
                    }
                    if let died = person.deathday {
                        (Text("Died ").foregroundStyle(Theme.textMuted) + Text(died.longLabel))
                    }
                    if let place = person.placeOfBirth.nonBlank {
                        Text(place)
                    }
                }
                .font(.system(size: 13))
                .foregroundStyle(Theme.textSecondary)
                if let bio = person.biography.nonBlank {
                    Text(bio.truncated(to: 600))
                        .font(.system(size: 13.5))
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

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 44) {
                if let company {
                    header(company)
                    MediaListView(
                        cards: company.titles,
                        itemLabel: "titles",
                        showTypeFilter: true,
                        showSearch: true,
                        emptyMessage: "No titles found for this studio yet."
                    )
                } else if let error {
                    EmptyStateView(
                        title: "Couldn't load this studio",
                        message: error,
                        systemImage: "building.2",
                        actionTitle: "Try again",
                        action: { model.reload() }
                    )
                } else {
                    LoadingView(label: "Loading the catalog…")
                }
            }
            .padding(.horizontal, Metrics.pagePadding)
            .padding(.vertical, Metrics.pagePadding)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Theme.bg0)
        .navigationTitle(company?.name ?? "")
        .task(id: ReloadKey(token: model.reloadToken, remote: model.events.remoteRevision(of: [.library, .favorites]))) {
            await load()
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
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.textSecondary)
                if let summary = company.shortDescription {
                    Text(summary)
                        .font(.system(size: 13.5))
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
