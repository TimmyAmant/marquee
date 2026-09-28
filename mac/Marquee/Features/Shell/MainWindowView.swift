import SwiftUI

/// app/layout.tsx: the floating navigation rail (with search and
/// notifications) + content. Search opens as a floating panel over the page.
struct MainWindowView: View {
    @Environment(AppModel.self) private var model
    /// Settings › Account › Menu position.
    @AppStorage(NavRailPosition.storageKey) private var railPositionValue = NavRailPosition.left.rawValue
    /// Settings › Account › Show menu labels.
    @AppStorage(NavRailPosition.labelsStorageKey) private var railShowsLabels = false

    var body: some View {
        @Bindable var model = model
        @Bindable var whatsNew = model.whatsNew
        let railPosition = NavRailPosition(stored: railPositionValue)
        let railInsets = railPosition.contentInsets(labeled: railShowsLabels)

        NavigationStack(path: $model.path) {
            SectionRootView(item: model.selection)
                .navigationDestination(for: Route.self) { route in
                    RouteDestinationView(route: route)
                }
        }
        .id(model.selection)
        // While the search panel is up, the page behind it takes no focus,
        // clicks or VoiceOver, so Tab and Escape stay with the panel.
        .disabled(model.isSearchOpen)
        .accessibilityHidden(model.isSearchOpen)
        // A rail on the left or right floats over the page's edge, so pages
        // lay out clear of it while their scroll views run under it to the
        // window edge (`scrollsUnderNavRail()`), as does the title page's
        // backdrop. A bar along the top or bottom gets a band of its own
        // instead, so it never sits on posters or artwork (like Windows).
        .safeAreaPadding(EdgeInsets(top: 0, leading: railInsets.leading, bottom: 0, trailing: railInsets.trailing))
        .environment(\.navRailInsets, EdgeInsets(top: 0, leading: railInsets.leading, bottom: 0, trailing: railInsets.trailing))
        .clipped()
        .padding(.top, railInsets.top)
        .padding(.bottom, railInsets.bottom)
        .background(Theme.bg0)
        .safeAreaInset(edge: .top, spacing: 0) {
            if model.live.isReconnecting {
                OfflineStrip()
            }
        }
        .animation(.easeOut(duration: 0.2), value: model.live.isReconnecting)
        .overlay {
            NavMenu()
                .environment(\.navRailPosition, railPosition)
                .environment(\.navRailShowsLabels, railShowsLabels)
                .disabled(model.isSearchOpen)
                .accessibilityHidden(model.isSearchOpen)
        }
        .overlay {
            if model.isSearchOpen {
                SearchPanel()
                    .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.15), value: model.isSearchOpen)
        // Any navigation closes it, however it happened.
        .onChange(of: model.selection) { model.isSearchOpen = false }
        .onChange(of: model.path) { model.isSearchOpen = false }
        .overlay(alignment: .bottom) {
            BannerView()
                // Above a rail along the bottom.
                .padding(.bottom, railInsets.bottom)
        }
        .overlay(alignment: .bottomTrailing) {
            ZStack {
                if model.notificationConsent.isAsking {
                    NotificationPromptCard()
                        .padding(16)
                        // Clear of a rail on the right or along the bottom.
                        .padding(.trailing, railInsets.trailing)
                        .padding(.bottom, railInsets.bottom)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .animation(.easeOut(duration: 0.25), value: model.notificationConsent.isAsking)
        }
        // After an upgrade (App/WhatsNew.swift). However it closes — OK,
        // Return, Escape, See all changes — the versions are remembered.
        .sheet(item: $whatsNew.content, onDismiss: { model.whatsNew.dismiss() }) { content in
            WhatsNewSheet(content: content) {
                model.open(.changelog)
            }
        }
        .onAppear {
            // `LiveUpdates` keeps the counts current; this just catches up when
            // the window is reopened.
            model.refreshCounts()
        }
    }
}

private struct SectionRootView: View {
    let item: SidebarItem

    var body: some View {
        switch item {
        case .discover: DiscoverView()
        case .movies: BrowseView(mediaType: .movie)
        case .series: BrowseView(mediaType: .tv)
        case .library: LibraryView()
        case .favorites: FavoritesView()
        case .calendar: CalendarScreen()
        case .requests: RequestsView()
        case .settings: SettingsRootView()
        }
    }
}

struct RouteDestinationView: View {
    let route: Route

    var body: some View {
        switch route {
        case let .title(id): TitleDetailView(id: id)
        case let .person(id): PersonDetailView(tmdbId: id)
        case let .company(id): CompanyDetailView(tmdbId: id)
        case let .search(query): SearchResultsView(query: query)
        case let .searchSection(query, section): SearchSectionView(query: query, section: section)
        case let .discoverList(list): DiscoverListView(list: list)
        case .errorReference: ErrorReferenceView()
        case .changelog: ChangelogView()
        }
    }
}

// MARK: - Offline strip

/// Signed in, and the server stopped answering (`LiveUpdates.isReconnecting`):
/// checks carry on, and its first answer clears it and reloads the page.
private struct OfflineStrip: View {
    var body: some View {
        HStack(spacing: 8) {
            ProgressView().controlSize(.mini)
            Text("Reconnecting to your server…")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Theme.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 6)
        .background(.bar)
        .overlay(alignment: .bottom) {
            Divider().overlay(Theme.border)
        }
        .transition(.move(edge: .top).combined(with: .opacity))
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Transient banner

private struct BannerView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        ZStack {
            if let banner = model.banner {
                Label(banner.message, systemImage: banner.isError ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
                    .font(.system(size: 12.5, weight: .medium))
                    .foregroundStyle(banner.isError ? Theme.danger : Theme.textPrimary)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(.regularMaterial, in: Capsule())
                    .overlay(Capsule().strokeBorder(Theme.border))
                    .shadow(radius: 8, y: 3)
                    .padding(.bottom, 22)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .task(id: banner.id) {
                        try? await Task.sleep(for: .seconds(3.5))
                        if model.banner?.id == banner.id {
                            withAnimation { model.banner = nil }
                        }
                    }
            }
        }
        .animation(.spring(duration: 0.3), value: model.banner)
    }
}
