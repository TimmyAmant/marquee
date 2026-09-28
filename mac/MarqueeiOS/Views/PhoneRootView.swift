import SwiftUI

/// The signed-in iPhone app: a tab bar (Discover, Search, Requests, Calendar,
/// More), each tab with its own navigation stack of the shared `Route`s.
struct PhoneRootView: View {
    @Environment(AppModel.self) private var model
    @State private var showsNotifications = false

    var body: some View {
        @Bindable var whatsNew = model.whatsNew
        TabView(selection: tabSelection) {
            ForEach(PhoneTab.allCases) { tab in
                PhoneTabStack(tab: tab, showsNotifications: $showsNotifications)
                    .tabItem { Label(tab.title, systemImage: tab.systemImage) }
                    .tag(tab)
                    .badge(badge(for: tab))
            }
        }
        .tint(Theme.accent)
        .safeAreaInset(edge: .top, spacing: 0) {
            if model.live.isReconnecting {
                PhoneOfflineStrip()
            }
        }
        .animation(.easeOut(duration: 0.2), value: model.live.isReconnecting)
        .overlay(alignment: .bottom) {
            PhoneBannerView()
                // Clear of the tab bar.
                .padding(.bottom, 60)
        }
        .sheet(isPresented: $showsNotifications) {
            PhoneNotificationsView()
                .environment(model)
        }
        .sheet(isPresented: notificationPrompt) {
            PhoneNotificationPrompt()
                .environment(model)
                .presentationDetents([.height(380)])
        }
        .sheet(item: $whatsNew.content, onDismiss: { model.whatsNew.dismiss() }) { content in
            PhoneWhatsNewView(content: content)
                .environment(model)
        }
        .onAppear {
            model.refreshCounts()
            #if DEBUG
            // Automated screenshot runs (`simctl launch` with
            // SIMCTL_CHILD_MARQUEE_TAB=requests) open on a given tab.
            if let raw = ProcessInfo.processInfo.environment["MARQUEE_TAB"], let tab = PhoneTab(rawValue: raw) {
                model.switchTab(to: tab)
            }
            // …and SIMCTL_CHILD_MARQUEE_OPEN=marquee://title/movie/603 opens
            // a page without the system's "Open in Marquee?" confirmation.
            if let raw = ProcessInfo.processInfo.environment["MARQUEE_OPEN"], let url = URL(string: raw) {
                model.handle(url: url)
            }
            // …and SIMCTL_CHILD_MARQUEE_SECTION=library opens one of More's
            // pages (a rail section, or "changelog" / "errors").
            switch ProcessInfo.processInfo.environment["MARQUEE_SECTION"] {
            case "changelog"?:
                model.switchTab(to: .more)
                model.open(.changelog)
            case "errors"?:
                model.switchTab(to: .more)
                model.open(.errorReference)
            case let raw?:
                if let item = SidebarItem(rawValue: raw) { model.showOnPhone(item) }
            case nil:
                break
            }
            #endif
        }
    }

    /// Tapping the tab you're on goes back to its first page.
    private var tabSelection: Binding<PhoneTab> {
        Binding(
            get: { model.tab },
            set: { tab in
                if tab == model.tab {
                    model.popToRoot(tab)
                } else {
                    model.switchTab(to: tab)
                }
            }
        )
    }

    private var notificationPrompt: Binding<Bool> {
        Binding(
            get: { model.notificationConsent.isAsking },
            set: { showing in
                if !showing, model.notificationConsent.isAsking {
                    model.notificationConsent.notNow()
                }
            }
        )
    }

    private func badge(for tab: PhoneTab) -> Int {
        switch tab {
        case .requests: return model.pendingRequestCount
        default: return 0
        }
    }
}

/// One tab's navigation stack.
private struct PhoneTabStack: View {
    let tab: PhoneTab
    @Binding var showsNotifications: Bool
    @Environment(AppModel.self) private var model

    var body: some View {
        NavigationStack(path: path) {
            root
                // A compact header: the page's title in large type inside
                // the bar itself, beside the bell, rather than a large-title
                // band under it.
                .toolbarTitleDisplayMode(.inlineLarge)
                .toolbar {
                    if tab != .more {
                        ToolbarItem(placement: .topBarTrailing) {
                            NotificationBellButton { showsNotifications = true }
                        }
                    }
                }
                .navigationDestination(for: Route.self) { route in
                    PhoneRouteView(route: route)
                }
        }
    }

    private var path: Binding<[Route]> {
        Binding(
            get: { model.path(for: tab) },
            set: { model.setPath($0, for: tab) }
        )
    }

    @ViewBuilder
    private var root: some View {
        switch tab {
        case .discover: DiscoverView()
        case .search: PhoneSearchView()
        case .requests: RequestsView()
        case .calendar: PhoneCalendarView()
        case .more: PhoneMoreView(showsNotifications: $showsNotifications)
        }
    }
}

/// A pushed page: the shared screens, with the phone's own title page.
struct PhoneRouteView: View {
    let route: Route

    var body: some View {
        Group {
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
        // A pushed page's title sits small in the bar, beside Back.
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// The bell in each tab's toolbar, with the unread count.
struct NotificationBellButton: View {
    let action: () -> Void
    @Environment(AppModel.self) private var model

    var body: some View {
        Button(action: action) {
            Image(systemName: model.unreadCount > 0 ? "bell.badge" : "bell")
                .symbolRenderingMode(model.unreadCount > 0 ? .palette : .monochrome)
                .foregroundStyle(model.unreadCount > 0 ? Theme.accent : Theme.textPrimary, Theme.textPrimary)
        }
        .accessibilityLabel(Text("Notifications"))
        .accessibilityValue(model.unreadCount > 0 ? Text("\(model.unreadCount) unread") : Text(verbatim: ""))
    }
}

/// Signed in, and the server stopped answering (`LiveUpdates.isReconnecting`).
private struct PhoneOfflineStrip: View {
    var body: some View {
        HStack(spacing: 8) {
            ProgressView().controlSize(.mini)
            Text("Reconnecting to your server…")
                .font(.footnote.weight(.medium))
                .foregroundStyle(Theme.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 6)
        .background(.bar)
        .transition(.move(edge: .top).combined(with: .opacity))
        .accessibilityElement(children: .combine)
    }
}

/// `AppModel.flash(_:)`'s transient message.
private struct PhoneBannerView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        ZStack {
            if let banner = model.banner {
                Label(banner.message, systemImage: banner.isError ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(banner.isError ? Theme.danger : Theme.textPrimary)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(.regularMaterial, in: Capsule())
                    .overlay(Capsule().strokeBorder(Theme.border))
                    .shadow(radius: 8, y: 3)
                    .padding(.horizontal, 16)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .task(id: banner.id) {
                        try? await Task.sleep(for: .seconds(3.5))
                        if model.banner?.id == banner.id {
                            withAnimation { model.banner = nil }
                        }
                    }
                    .onTapGesture { withAnimation { model.banner = nil } }
            }
        }
        .animation(.spring(duration: 0.3), value: model.banner)
    }
}
