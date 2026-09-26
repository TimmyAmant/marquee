import SwiftUI

/// app/layout.tsx: the floating navigation rail (with search and
/// notifications) + content. Search opens as a floating panel over the page.
struct MainWindowView: View {
    @Environment(AppModel.self) private var model
    /// Settings › Account › Menu position.
    @AppStorage(NavRailPosition.storageKey) private var railPositionValue = NavRailPosition.left.rawValue

    var body: some View {
        @Bindable var model = model
        let railPosition = NavRailPosition(stored: railPositionValue)
        let railInsets = railPosition.contentInsets

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
        // The rail floats over the page's left edge (or whichever edge
        // Settings put it on), so pages lay out clear of it. Their scroll
        // views run under it to the window edge (`scrollsUnderNavRail()`),
        // as does the title page's backdrop.
        .safeAreaPadding(railInsets)
        .environment(\.navRailInsets, railInsets)
        .background(Theme.bg0)
        .safeAreaInset(edge: .top, spacing: 0) {
            if model.live.isOffline {
                OfflineStrip()
            }
        }
        .animation(.easeOut(duration: 0.2), value: model.live.isOffline)
        .overlay {
            NavMenu()
                .environment(\.navRailPosition, railPosition)
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
        case .errorReference: ErrorReferenceView()
        case .changelog: ChangelogView()
        }
    }
}

// MARK: - Notifications (components/notifications-bell.tsx)

/// The notifications list, opened from the bell on the rail.
struct NotificationsPopover: View {
    @Environment(AppModel.self) private var model
    let dismiss: () -> Void

    @State private var items: [API.NotificationItem] = []
    @State private var loaded = false
    @State private var error: String?

    /// A ScrollView has no height of its own, so the list has to be told one:
    /// tall enough for what's there, capped so the popover can't outgrow a
    /// laptop screen. Roughly one row per 54pt, plus the list's own padding.
    private var listHeight: CGFloat {
        min(max(CGFloat(items.count) * 54 + 12, 160), 560)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Notifications")
                    .font(.system(size: 13, weight: .semibold))
                Spacer()
                if items.contains(where: { !$0.read }) {
                    Button("Mark all read") { markAllRead() }
                        .buttonStyle(QuietButtonStyle())
                        .font(.system(size: 11.5))
                }
            }
            .padding(12)
            Divider()
            if let error {
                InlineMessage(text: error)
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else if !loaded {
                ProgressView()
                    .controlSize(.small)
                    .frame(maxWidth: .infinity)
                    .padding(28)
            } else if items.isEmpty {
                Text("No notifications yet.")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.textSecondary)
                    .frame(maxWidth: .infinity)
                    .padding(28)
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 2) {
                        ForEach(items) { item in
                            NotificationRow(item: item) { open(item) }
                        }
                    }
                    .padding(6)
                }
                .frame(height: listHeight)
            }
        }
        .frame(width: 420)
        .task(id: model.events.remoteRevision(of: .notifications)) {
            await load()
        }
    }

    private func load() async {
        do {
            let list = try await model.api.notifications.list()
            if Task.isCancelled { return }
            items = list.results
            error = nil
        } catch let failure as APIError where failure.isCancellation {
            return
        } catch {
            if items.isEmpty { self.error = error.localizedDescription }
        }
        loaded = true
    }

    private func markAllRead() {
        let api = model.api
        items = items.map {
            API.NotificationItem(
                id: $0.id, mediaType: $0.mediaType, tmdbId: $0.tmdbId, title: $0.title,
                eventType: $0.eventType, message: $0.message, read: true, createdAt: $0.createdAt
            )
        }
        Task {
            do {
                try await api.notifications.markAllRead()
            } catch {
                model.flash(error: error)
            }
        }
    }

    private func open(_ item: API.NotificationItem) {
        let api = model.api
        if !item.read {
            Task { try? await api.notifications.markRead(item.id) }
        }
        dismiss()
        model.openTitle(item.titleID)
    }
}

private struct NotificationRow: View {
    let item: API.NotificationItem
    let action: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            HStack(alignment: .top, spacing: 8) {
                Circle()
                    .fill(item.read ? Color.clear : Theme.accent)
                    .frame(width: 6, height: 6)
                    .padding(.top, 5)
                VStack(alignment: .leading, spacing: 3) {
                    Text(item.message)
                        .font(.system(size: 12))
                        .foregroundStyle(item.read ? Theme.textSecondary : Theme.textPrimary)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(item.timeAgo())
                        .font(.system(size: 10.5))
                        .foregroundStyle(Theme.textMuted)
                }
                Spacer(minLength: 0)
            }
            .padding(8)
            .background(RoundedRectangle(cornerRadius: 8).fill(hovering ? Theme.bg2 : .clear))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
    }
}

// MARK: - Offline strip

/// Badge polling hasn't reached the server for a few minutes. Polling carries
/// on, and the next answer clears it.
private struct OfflineStrip: View {
    var body: some View {
        HStack(spacing: 8) {
            ProgressView().controlSize(.mini)
            Text("Can't reach your Marquee server — retrying…")
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
