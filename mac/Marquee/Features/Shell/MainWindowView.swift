import SwiftUI

/// app/layout.tsx: the floating navigation rail and menu + header (search,
/// notifications) + content.
struct MainWindowView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model

        // Without a split view, the toolbar only shows a search field declared
        // inside the stack, so every page brings its own. They share
        // `model.searchText`; only the page on top acts on it.
        NavigationStack(path: $model.path) {
            SectionRootView(item: model.selection)
                .modifier(SearchSupport(isOnTop: model.path.isEmpty))
                .navigationDestination(for: Route.self) { route in
                    RouteDestinationView(route: route)
                        .modifier(SearchSupport(isOnTop: model.path.last == route))
                }
        }
        .id(model.selection)
        // The rail floats over the page's left edge, so pages lay out clear
        // of it. Their scroll views run under it to the window edge
        // (`scrollsUnderNavRail()`), as does the title page's backdrop.
        .safeAreaPadding(.leading, Metrics.contentLeading)
        .environment(\.navRailInset, Metrics.contentLeading)
        .background(Theme.bg0)
        .safeAreaInset(edge: .top, spacing: 0) {
            if model.live.isOffline {
                OfflineStrip()
            }
        }
        .animation(.easeOut(duration: 0.2), value: model.live.isOffline)
        .overlay {
            NavMenu()
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                NotificationsToolbarButton()
            }
        }
        .overlay(alignment: .bottom) {
            BannerView()
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

// MARK: - Search (components/search-bar.tsx)

private struct SearchSupport: ViewModifier {
    /// Whether this page is the one showing. The pages under it keep their
    /// (hidden) copy of the field, which mustn't take focus, fetch
    /// suggestions or route a picked one.
    let isOnTop: Bool

    @Environment(AppModel.self) private var model
    @State private var suggestions: [API.SearchSuggestion] = []
    @FocusState private var searchFocused: Bool

    private static let completionPrefix = "\u{2063}marquee:"

    func body(content: Content) -> some View {
        @Bindable var model = model

        content
            .searchable(text: $model.searchText, placement: .toolbar, prompt: "Search an actor, a studio, a title…")
            .searchFocused($searchFocused)
            // Edit › Find (⌘F), and the navigation menu's Search.
            .onChange(of: model.searchFocusRequest) { _, _ in
                if isOnTop { searchFocused = true }
            }
            .searchSuggestions {
                ForEach(suggestions, id: \.stableId) { suggestion in
                    SuggestionRow(suggestion: suggestion)
                        .searchCompletion(Self.completionPrefix + suggestion.stableId)
                }
            }
            .onSubmit(of: .search) {
                model.search(model.searchText)
            }
            .onChange(of: model.searchText) { _, newValue in
                handleSearchText(newValue)
            }
            .task(id: model.searchText) {
                let query = model.searchText
                guard isOnTop, !query.hasPrefix(Self.completionPrefix) else { return }
                guard query.trimmingCharacters(in: .whitespaces).count >= 2 else {
                    suggestions = []
                    return
                }
                try? await Task.sleep(for: .milliseconds(250))
                if Task.isCancelled { return }
                // A failed suggest call just leaves the list as it was; the
                // Search screen reports real errors.
                let results = (try? await model.api.search.suggestions(query)) ?? []
                if !Task.isCancelled { suggestions = results }
            }
    }

    /// Picking a suggestion fills the field with a sentinel — route it instead.
    private func handleSearchText(_ text: String) {
        guard isOnTop, text.hasPrefix(Self.completionPrefix) else { return }
        let stableId = String(text.dropFirst(Self.completionPrefix.count))
        let picked = suggestions.first(where: { $0.stableId == stableId })
        model.searchText = ""
        suggestions = []
        guard let suggestion = picked else { return }
        if let titleID = suggestion.titleID {
            model.openTitle(titleID)
        } else if suggestion.mediaType == .person {
            model.open(.person(suggestion.id))
        }
    }
}

private struct SuggestionRow: View {
    let suggestion: API.SearchSuggestion

    var body: some View {
        HStack(spacing: 10) {
            RemoteImage(suggestion.posterPath, size: .w92, showsShimmer: false)
                .frame(width: 26, height: 36)
                .background(Theme.bg2)
                .clipShape(RoundedRectangle(cornerRadius: 3))
            VStack(alignment: .leading, spacing: 1) {
                Text(suggestion.name).lineLimit(1)
                if let subtitle = suggestion.subtitle {
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
            Text(suggestion.mediaType.label)
                .font(.system(size: 10))
                .foregroundStyle(.secondary)
                .padding(.horizontal, 6)
                .padding(.vertical, 1.5)
                .overlay(Capsule().strokeBorder(.secondary.opacity(0.5)))
        }
    }
}

// MARK: - Notifications (components/notifications-bell.tsx)

private struct NotificationsToolbarButton: View {
    @Environment(AppModel.self) private var model
    @State private var showing = false

    var body: some View {
        Button {
            showing.toggle()
        } label: {
            Image(systemName: model.unreadCount > 0 ? "bell.badge" : "bell")
                .symbolRenderingMode(.palette)
                .foregroundStyle(Theme.accent, Theme.textSecondary)
        }
        .help(model.live.badges.bellLabel.map { "Notifications (\($0) unread)" } ?? "Notifications")
        .popover(isPresented: $showing, arrowEdge: .bottom) {
            NotificationsPopover(dismiss: { showing = false })
                .environment(model)
        }
    }
}

private struct NotificationsPopover: View {
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
