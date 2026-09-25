import SwiftUI

/// components/nav-menu.tsx — the app's navigation, after the Plex app's
/// Apple TV menu. A small frosted rail floats at the window's left edge and
/// is the whole menu: your photo (Settings) and one icon per section, each
/// going straight there in one click, with the section's name beside it on
/// hover. Nothing opens over the page. When a newer Marquee is out, an
/// update button joins the foot of the rail. Nothing reflows: pages always
/// start `Metrics.contentLeading` in, clear of the rail.
struct NavMenu: View {
    @Environment(AppModel.self) private var model

    @FocusState private var focus: RailItem?

    var body: some View {
        NavRail(
            focus: $focus,
            onProfile: showAccount,
            onSearch: focusSearch,
            onSelect: { model.select($0) },
            onUpdate: showUpdate
        )
        .padding(.leading, NavMetrics.railInset)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    // MARK: Destinations

    /// The profile opens Settings on its Account tab (the website's /settings).
    private func showAccount() {
        model.openSettings(.account)
    }

    /// The search panel, over the page.
    private func focusSearch() {
        model.isSearchOpen = true
    }

    /// A newer Marquee: Settings › About, where "Update" and its progress are.
    private func showUpdate() {
        model.openSettings(.about)
    }
}

/// Docs/DESIGN_TARGET.md › Navigation.
private enum NavMetrics {
    /// The rail's distance from the window's left edge.
    static let railInset: CGFloat = 16
}

// MARK: - Rail

/// Everything on the rail, top to bottom; also what keyboard focus can land on.
private enum RailItem: Hashable {
    case profile
    case notifications
    case search
    case section(SidebarItem)
    case update
}

/// Every destination, in the menu's order: your photo and notifications,
/// then Search and Discover, Movies and Series, and Favorites, Calendar and
/// Requests, with a short hairline between the groups (and before the update
/// button, when there's an update).
private struct NavRail: View {
    @Environment(AppModel.self) private var model
    let focus: FocusState<RailItem?>.Binding
    let onProfile: () -> Void
    let onSearch: () -> Void
    let onSelect: (SidebarItem) -> Void
    let onUpdate: () -> Void

    @State private var showingNotifications = false

    var body: some View {
        VStack(spacing: 4) {
            profile
                .padding(.bottom, 4)
            notifications
            RailHairline()

            NavRailButton(systemImage: "magnifyingglass", label: "Search", focus: focus, item: .search, action: onSearch)
            section(.discover)
            RailHairline()
            section(.movies)
            section(.series)
            RailHairline()
            section(.favorites)
            section(.calendar)
            section(.requests)
            if UpdateStatusView.showsInMenu(model.updater) {
                RailHairline()
                updateButton
            }
        }
        // 7 of padding inside a 1pt border: 56 wide, ending 72 from the edge.
        .padding(8)
        // Unclipped, so the name labels can sit beside the rail.
        .glassSurface(Capsule(), clipsContent: false)
        .contentShape(Capsule())
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Main")
    }

    /// Your photo (or initials); a plain person glyph when signed out.
    private var profile: some View {
        let viewer = model.viewer
        return Button(action: onProfile) {
            Group {
                if let viewer {
                    UserAvatarView(label: viewer.label, avatarUrl: viewer.avatarUrl, size: 36)
                } else {
                    Image(systemName: "person")
                        .font(.system(size: 16))
                        .foregroundStyle(Theme.textSecondary)
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(Theme.textPrimary.opacity(0.1)))
                }
            }
            .frame(width: 40, height: 40)
            // On Settings, a ring in place of the other items' solid pill.
            .overlay {
                if model.selection == .settings {
                    Circle().strokeBorder(Theme.textPrimary, lineWidth: 2)
                }
            }
            .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .modifier(RailLabeled(label: viewer == nil ? "Sign in" : "Settings", focus: focus, item: .profile))
        .accessibilityLabel(viewer.map { "\($0.label): account and settings" } ?? "Sign in")
        .accessibilityAddTraits(model.selection == .settings ? .isSelected : [])
    }

    /// Only while there's a newer Marquee (or its download is under way):
    /// Settings › About, where "Update" and the progress are.
    private var updateButton: some View {
        let version = model.updater.update?.version.description ?? ""
        let label = model.updater.isInstalling ? "Updating Marquee…" : "Update to Marquee \(version)"
        return NavRailButton(
            systemImage: "arrow.down.circle",
            label: label,
            focus: focus,
            item: .update,
            showsDot: true,
            action: onUpdate
        )
    }

    /// components/notifications-bell.tsx: the bell, with a dot while any are
    /// unread; the list opens beside the rail.
    private var notifications: some View {
        let unread = model.unreadCount
        let label = model.live.badges.bellLabel.map { "Notifications, \($0) unread" } ?? "Notifications"
        return NavRailButton(
            systemImage: unread > 0 ? "bell.badge" : "bell",
            label: "Notifications",
            focus: focus,
            item: .notifications,
            current: showingNotifications,
            showsDot: unread > 0,
            hidesLabel: showingNotifications
        ) {
            showingNotifications.toggle()
        }
        .accessibilityLabel(label)
        .popover(isPresented: $showingNotifications, arrowEdge: .trailing) {
            NotificationsPopover(dismiss: { showingNotifications = false })
                .environment(model)
        }
    }

    private func section(_ item: SidebarItem) -> some View {
        let pending = item == .requests ? model.pendingRequestCount : 0
        return NavRailButton(
            systemImage: item.systemImage,
            label: item.title,
            focus: focus,
            item: .section(item),
            current: model.selection == item,
            showsDot: pending > 0
        ) {
            onSelect(item)
        }
        .accessibilityLabel(pending > 0 ? "\(item.title), \(pending) pending" : item.title)
    }
}

/// Between the rail's groups: 24 wide, in the glass border color.
private struct RailHairline: View {
    var body: some View {
        Rectangle()
            .fill(Theme.glassBorder)
            .frame(width: 24, height: 1)
            .padding(.vertical, 4)
            .accessibilityHidden(true)
    }
}

/// One of the rail's 40pt round buttons.
private struct NavRailButton: View {
    let systemImage: String
    let label: String
    let focus: FocusState<RailItem?>.Binding
    let item: RailItem
    var current = false
    /// An admin with pending requests: an 8pt accent dot on the icon.
    var showsDot = false
    /// No name label beside it (its popover is open there).
    var hidesLabel = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 16))
                .frame(width: 40, height: 40)
        }
        .buttonStyle(NavPillStyle(current: current, rest: Theme.textSecondary))
        .overlay(alignment: .topTrailing) {
            if showsDot {
                Circle()
                    .fill(Theme.accent)
                    .frame(width: 8, height: 8)
                    .background(Circle().fill(Theme.bg1).padding(-2))
                    .padding(6)
                    .allowsHitTesting(false)
            }
        }
        .modifier(RailLabeled(label: label, focus: focus, item: item, hidden: hidesLabel))
        .accessibilityLabel(label)
        .accessibilityAddTraits(current ? .isSelected : [])
    }
}

/// `RailLabel`: the item's name in a small frosted capsule 12 to its right,
/// on hover or keyboard focus, so the icons never have to be guessed at.
/// Decorative: the button carries the same name as its accessible label.
private struct RailLabeled: ViewModifier {
    let label: String
    let focus: FocusState<RailItem?>.Binding
    let item: RailItem
    var hidden = false
    @State private var hovering = false

    func body(content: Content) -> some View {
        let showing = !hidden && (hovering || focus.wrappedValue == item)
        content
            .focused(focus, equals: item)
            .onHover { hovering = $0 }
            .overlay(alignment: .leading) {
                Text(label)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.textPrimary)
                    .lineLimit(1)
                    .fixedSize()
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .glassSurface(Capsule())
                    // From the button's leading edge: its 40, then 12.
                    .offset(x: 40 + 12 + (showing ? 0 : -4))
                    .opacity(showing ? 1 : 0)
                    .animation(.easeOut(duration: 0.15), value: showing)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
    }
}


// MARK: - Shared pieces

/// A rail button, fully rounded. The current one is a solid
/// textPrimary pill with bg0 content (white with a dark icon in dark mode,
/// the reverse in light); the others get a textPrimary-10% hover.
private struct NavPillStyle: ButtonStyle {
    let current: Bool
    /// The foreground at rest.
    let rest: Color

    func makeBody(configuration: Configuration) -> some View {
        NavPillBody(configuration: configuration, current: current, rest: rest)
    }
}

private struct NavPillBody: View {
    let configuration: ButtonStyleConfiguration
    let current: Bool
    let rest: Color
    @State private var hovering = false

    var body: some View {
        configuration.label
            .foregroundStyle(current ? Theme.bg0 : (hovering ? Theme.textPrimary : rest))
            .background {
                Capsule()
                    .fill(current ? Theme.textPrimary : (hovering ? Theme.textPrimary.opacity(0.1) : .clear))
            }
            .opacity(configuration.isPressed ? 0.8 : 1)
            .contentShape(Capsule())
            .onHover { hovering = $0 }
            .animation(.easeOut(duration: 0.15), value: hovering)
    }
}
