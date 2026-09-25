import SwiftUI
import AppKit

/// components/nav-menu.tsx — the app's navigation, after the Plex app's
/// Apple TV menu: a small frosted rail floats at the window's left edge
/// (profile, Search, Discover, the section you're in, and a menu button),
/// and resting on it, or pressing the menu button, opens the full menu as a
/// frosted panel over the page. Nothing reflows: pages always start
/// `Metrics.contentLeading` in, clear of the rail.
///
/// The panel sits below the window's toolbar rather than over it, where the
/// traffic lights and the back button live.
struct NavMenu: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openSettings) private var openSettings

    @State private var isOpen = false
    /// Set when the menu was opened with a click or the keyboard, which moves
    /// focus to the current item; opening on hover leaves focus where it was.
    @State private var focusOnOpen = false
    @State private var openTask: Task<Void, Never>?
    @State private var closeTask: Task<Void, Never>?
    @FocusState private var focus: NavFocus?

    var body: some View {
        ZStack(alignment: .leading) {
            NavRail(
                focus: $focus,
                onProfile: showAccount,
                onSearch: focusSearch,
                onMenu: { openMenu(moveFocus: true) }
            )
            .onHover(perform: railHover)
            .padding(.leading, NavMetrics.railInset)
            // Rail fades out as the panel comes in.
            .opacity(isOpen ? 0 : 1)
            .allowsHitTesting(!isOpen)
            .accessibilityHidden(isOpen)

            if isOpen {
                NavMenuPanel(
                    focus: $focus,
                    initialFocus: focusOnOpen ? .section(model.selection) : nil,
                    onProfile: showAccount,
                    onSearch: focusSearch,
                    onSelect: select
                )
                .onHover(perform: panelHover)
                .background {
                    NavDismissMonitor(
                        onClickOutside: { closeMenu() },
                        onEscape: { closeMenu(restoringFocus: true) }
                    )
                    .allowsHitTesting(false)
                }
                .padding(NavMetrics.panelInset)
                .transition(
                    .opacity
                        .combined(with: .offset(x: -12))
                        .combined(with: .scale(scale: 0.98, anchor: .leading))
                )
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .animation(.easeOut(duration: 0.2), value: isOpen)
        // Any navigation closes the menu, however it happened (a row here, a
        // search result, a notification, Go › Back).
        .onChange(of: model.selection) { closeMenu() }
        .onChange(of: model.path) { closeMenu() }
        .onChange(of: model.navMenuRequest) { openMenu(moveFocus: true) }
        .onDisappear { cancelTimers() }
    }

    // MARK: Opening and closing

    private func openMenu(moveFocus: Bool) {
        cancelTimers()
        focusOnOpen = moveFocus
        isOpen = true
    }

    private func closeMenu(restoringFocus: Bool = false) {
        cancelTimers()
        guard isOpen else { return }
        isOpen = false
        if restoringFocus { focus = .menuButton }
    }

    private func cancelTimers() {
        openTask?.cancel()
        closeTask?.cancel()
        openTask = nil
        closeTask = nil
    }

    private func railHover(_ inside: Bool) {
        openTask?.cancel()
        openTask = nil
        guard inside, !isOpen else { return }
        closeTask?.cancel()
        openTask = Task {
            try? await Task.sleep(for: NavMetrics.hoverOpenDelay)
            guard !Task.isCancelled else { return }
            openMenu(moveFocus: false)
        }
    }

    private func panelHover(_ inside: Bool) {
        closeTask?.cancel()
        closeTask = nil
        guard !inside, isOpen else { return }
        closeTask = Task {
            try? await Task.sleep(for: NavMetrics.hoverCloseDelay)
            guard !Task.isCancelled else { return }
            closeMenu()
        }
    }

    // MARK: Destinations

    /// The profile opens Settings on its Account tab (the website's /settings).
    private func showAccount() {
        closeMenu()
        model.settingsTab = .account
        openSettings()
    }

    /// The website's Search is a page; here it's the toolbar's search field.
    private func focusSearch() {
        closeMenu()
        model.searchFocusRequest &+= 1
    }

    private func select(_ item: SidebarItem) {
        // Closed here too: choosing the section you're already on at its
        // root changes nothing for `onChange` to see.
        closeMenu()
        model.select(item)
    }
}

/// Timings and insets from Docs/DESIGN_TARGET.md › Navigation.
private enum NavMetrics {
    /// How long the pointer rests on the rail before it opens into the menu,
    /// so sweeping past the window's left edge doesn't throw a panel over
    /// the page.
    static let hoverOpenDelay: Duration = .milliseconds(220)
    /// Grace period after the pointer leaves the open menu, so overshooting
    /// its edge by a few points doesn't snap it shut.
    static let hoverCloseDelay: Duration = .milliseconds(260)
    /// The rail's distance from the window's left edge.
    static let railInset: CGFloat = 16
    /// The panel's distance from the window's left and bottom edges and from
    /// the toolbar.
    static let panelInset: CGFloat = 12
    static let panelWidth: CGFloat = 288
    static let panelRadius: CGFloat = 24
}

/// What keyboard focus can land on, so opening the menu from the keyboard
/// can put it on the current section and Escape can hand it back to the
/// menu button.
private enum NavFocus: Hashable {
    case menuButton
    case profile
    case search
    case section(SidebarItem)
}

// MARK: - Rail

/// Plex's short list (profile, Search, Discover, menu), plus whichever other
/// section you're in, so the rail always shows where you are.
private struct NavRail: View {
    @Environment(AppModel.self) private var model
    let focus: FocusState<NavFocus?>.Binding
    let onProfile: () -> Void
    let onSearch: () -> Void
    let onMenu: () -> Void

    var body: some View {
        let name = model.viewer?.label ?? ""

        VStack(spacing: 4) {
            Button(action: onProfile) {
                NavAvatar(label: name, size: 36)
                    .frame(width: 40, height: 40)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .padding(.bottom, 4)
            .help(name)
            .accessibilityLabel("\(name): account and settings")

            NavRailButton(systemImage: "magnifyingglass", label: "Search", action: onSearch)
                .help("Search (⌘F)")

            section(.discover)
            if model.selection != .discover {
                section(model.selection)
            }

            NavRailButton(systemImage: "line.3.horizontal", label: "Open menu", action: onMenu)
                .focused(focus, equals: .menuButton)
                .help("Menu (⌃⌘S)")
        }
        // 7 of padding inside a 1pt border: 56 wide, ending 72 from the edge.
        .padding(8)
        .glassSurface(Capsule())
        .contentShape(Capsule())
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Main")
    }

    private func section(_ item: SidebarItem) -> some View {
        let pending = item == .requests ? model.pendingRequestCount : 0
        return NavRailButton(
            systemImage: item.systemImage,
            label: pending > 0 ? "\(item.title), \(pending) pending" : item.title,
            current: model.selection == item,
            showsDot: pending > 0
        ) {
            model.select(item)
        }
        .help("\(item.title) (⌘\(String(item.shortcut.character)))")
    }
}

/// One of the rail's 40pt round buttons.
private struct NavRailButton: View {
    let systemImage: String
    let label: String
    var current = false
    /// An admin with pending requests: an 8pt accent dot on the icon.
    var showsDot = false
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
        .accessibilityLabel(label)
        .accessibilityAddTraits(current ? .isSelected : [])
    }
}

// MARK: - Panel

private struct NavMenuPanel: View {
    @Environment(AppModel.self) private var model
    let focus: FocusState<NavFocus?>.Binding
    /// Where focus goes once the panel is on screen; nil when it opened on hover.
    let initialFocus: NavFocus?
    let onProfile: () -> Void
    let onSearch: () -> Void
    let onSelect: (SidebarItem) -> Void

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    NavProfileRow(
                        name: model.viewer?.label ?? "",
                        server: model.session.server?.displayName,
                        action: onProfile
                    )
                    .focused(focus, equals: .profile)

                    VStack(spacing: 2) {
                        NavMenuRow(systemImage: "magnifyingglass", title: "Search", prominent: true, action: onSearch)
                            .focused(focus, equals: .search)
                        row(.discover, prominent: true)

                        NavSectionHeader(title: "Browse")
                        row(.movies)
                        row(.series)

                        NavSectionHeader(title: "Library")
                        row(.favorites)
                        row(.calendar)
                        row(.requests)
                    }
                    .padding(.top, 12)
                }
                .padding(.horizontal, 12)
                .padding(.top, 16)
                .padding(.bottom, 12)
            }
            .scrollBounceBehavior(.basedOnSize)

            HStack(spacing: 12) {
                MarqueeWordmark(size: 17)
                Spacer(minLength: 0)
                AppearanceToggle()
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .overlay(alignment: .top) {
                Rectangle()
                    .fill(Theme.glassBorder)
                    .frame(height: 1)
            }
        }
        .frame(width: NavMetrics.panelWidth)
        .frame(maxHeight: .infinity)
        .glassSurface(RoundedRectangle(cornerRadius: NavMetrics.panelRadius, style: .continuous))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Main menu")
        .task {
            if let initialFocus { focus.wrappedValue = initialFocus }
        }
    }

    private func row(_ item: SidebarItem, prominent: Bool = false) -> some View {
        NavMenuRow(
            systemImage: item.systemImage,
            title: item.title,
            current: model.selection == item,
            prominent: prominent,
            // The server's own pending count, polled by `LiveUpdates`; always
            // 0 for members.
            badge: item == .requests ? model.pendingRequestCount : 0
        ) {
            onSelect(item)
        }
        .focused(focus, equals: .section(item))
    }
}

/// The account: a 38pt avatar, the name over the server this Mac is signed
/// in to, and a chevron that nudges right on hover.
private struct NavProfileRow: View {
    let name: String
    let server: String?
    let action: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                NavAvatar(label: name, size: 38)
                VStack(alignment: .leading, spacing: 0) {
                    Text(name)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.textPrimary)
                        .lineLimit(1)
                        .frame(minHeight: 20)
                    if let server {
                        Text(server)
                            .font(.system(size: 11.5))
                            .foregroundStyle(Theme.textMuted)
                            .lineLimit(1)
                            .truncationMode(.middle)
                            .frame(minHeight: 16)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Theme.textMuted)
                    .frame(width: 16, height: 16)
                    .offset(x: hovering ? 2 : 0)
            }
            .padding(.vertical, 6)
            .padding(.leading, 6)
            .padding(.trailing, 12)
        }
        .buttonStyle(NavPillStyle(current: false, rest: Theme.textPrimary))
        .onHover { hovering = $0 }
        .animation(.easeOut(duration: 0.15), value: hovering)
        .accessibilityLabel(server.map { "\(name), \($0)" } ?? name)
        .accessibilityHint("Opens account and settings")
    }
}

/// A menu row: Search and Discover are the larger 44pt rows, the sections
/// 40pt.
private struct NavMenuRow: View {
    let systemImage: String
    let title: String
    var current = false
    var prominent = false
    var badge = 0
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Image(systemName: systemImage)
                    .font(.system(size: prominent ? 17 : 16))
                    .frame(width: prominent ? 20 : 19, height: prominent ? 20 : 19)
                Text(title)
                    .font(.system(size: prominent ? 16 : 15, weight: prominent ? .semibold : .medium))
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if badge > 0 {
                    NavCountBadge(count: badge)
                }
            }
            .padding(.horizontal, 14)
            .frame(height: prominent ? 44 : 40)
        }
        .buttonStyle(NavPillStyle(current: current, rest: Theme.textPrimary.opacity(0.9), lifted: true))
        .accessibilityLabel(badge > 0 ? "\(title), \(badge) pending" : title)
        .accessibilityAddTraits(current ? .isSelected : [])
    }
}

/// "Browse", "Library": 11.5/600 muted, then a hairline to the right edge.
private struct NavSectionHeader: View {
    let title: String

    var body: some View {
        HStack(spacing: 12) {
            Text(title)
                .font(.system(size: 11.5, weight: .semibold))
                .foregroundStyle(Theme.textMuted)
                .accessibilityAddTraits(.isHeader)
            Rectangle()
                .fill(Theme.glassBorder)
                .frame(height: 1)
                .accessibilityHidden(true)
        }
        .padding(.horizontal, 12)
        .padding(.top, 16)
        .padding(.bottom, 6)
    }
}

/// components/requests-badge.tsx — the pending count, capped at "9+".
private struct NavCountBadge: View {
    let count: Int

    var body: some View {
        Text(count > 9 ? "9+" : "\(count)")
            .font(.system(size: 10.5, weight: .bold))
            .foregroundStyle(Theme.bg0)
            .padding(.horizontal, 5)
            .frame(minWidth: 18, minHeight: 18)
            .background(Capsule().fill(Theme.accent))
    }
}

/// components/theme-toggle.tsx — flips between light and dark.
private struct AppearanceToggle: View {
    @AppStorage(AppearancePreference.storageKey) private var appearance = AppearancePreference.system.rawValue
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Button {
            appearance = colorScheme == .dark ? AppearancePreference.light.rawValue : AppearancePreference.dark.rawValue
        } label: {
            Image(systemName: colorScheme == .dark ? "moon" : "sun.max")
                .font(.system(size: 13))
                .frame(width: 28, height: 28)
                .overlay(Circle().strokeBorder(Theme.borderStrong))
        }
        .buttonStyle(QuietButtonStyle())
        .help(colorScheme == .dark ? "Switch to light theme" : "Switch to dark theme")
    }
}

// MARK: - Shared pieces

/// Plex's round profile photo, with initials standing in: Marquee accounts
/// don't have pictures.
struct NavAvatar: View {
    let label: String
    let size: CGFloat

    var body: some View {
        Text(Self.initials(of: label))
            .font(.system(size: size * 0.38, weight: .semibold))
            .foregroundStyle(Theme.bg0)
            .frame(width: size, height: size)
            .background(Circle().fill(Theme.avatarGradient))
            // `ring-2 ring-white/15`, drawn outside the circle.
            .overlay(Circle().strokeBorder(Color.white.opacity(0.15), lineWidth: 2).padding(-2))
            .accessibilityHidden(true)
    }

    /// The first letter of the first two words, uppercased; "?" for none.
    nonisolated static func initials(of label: String) -> String {
        let letters = label
            .split(whereSeparator: \.isWhitespace)
            .prefix(2)
            .compactMap { $0.first.map { String($0).uppercased() } }
        return letters.isEmpty ? "?" : letters.joined()
    }
}

/// A rail button or menu row, fully rounded. The current one is a solid
/// textPrimary pill with bg0 content (white with a dark icon in dark mode,
/// the reverse in light); the others get a textPrimary-10% hover.
private struct NavPillStyle: ButtonStyle {
    let current: Bool
    /// The foreground at rest: rail icons are textSecondary, menu rows
    /// textPrimary at 90%.
    let rest: Color
    /// Menu rows lift the current pill with a shadow; rail buttons don't.
    var lifted = false

    func makeBody(configuration: Configuration) -> some View {
        NavPillBody(configuration: configuration, current: current, rest: rest, lifted: lifted)
    }
}

private struct NavPillBody: View {
    let configuration: ButtonStyleConfiguration
    let current: Bool
    let rest: Color
    let lifted: Bool
    @State private var hovering = false

    var body: some View {
        configuration.label
            .foregroundStyle(current ? Theme.bg0 : (hovering ? Theme.textPrimary : rest))
            .background {
                Capsule()
                    .fill(current ? Theme.textPrimary : (hovering ? Theme.textPrimary.opacity(0.1) : .clear))
                    .shadow(color: current && lifted ? .black.opacity(0.25) : .clear, radius: 9, y: 6)
            }
            .opacity(configuration.isPressed ? 0.8 : 1)
            .contentShape(Capsule())
            .onHover { hovering = $0 }
            .animation(.easeOut(duration: 0.15), value: hovering)
    }
}

/// Closes the menu on a click outside it or on Escape, like nav-menu.tsx's
/// document-level pointerdown and keydown listeners. An AppKit event monitor
/// rather than a SwiftUI gesture, so the click still lands on whatever it hit
/// and Escape works wherever focus is, including after the menu opened on
/// hover and focus stayed on the page.
private struct NavDismissMonitor: NSViewRepresentable {
    let onClickOutside: () -> Void
    let onEscape: () -> Void

    func makeNSView(context: Context) -> MonitorView {
        MonitorView()
    }

    func updateNSView(_ view: MonitorView, context: Context) {
        view.onClickOutside = onClickOutside
        view.onEscape = onEscape
    }

    static func dismantleNSView(_ view: MonitorView, coordinator: ()) {
        view.stopMonitoring()
    }

    /// Sized to the panel, so "outside" is anywhere else in its window.
    final class MonitorView: NSView {
        var onClickOutside: () -> Void = {}
        var onEscape: () -> Void = {}
        private var monitor: Any?

        private static let escapeKeyCode: UInt16 = 53

        override func hitTest(_ point: NSPoint) -> NSView? {
            nil
        }

        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            stopMonitoring()
            guard window != nil else { return }
            monitor = NSEvent.addLocalMonitorForEvents(
                matching: [.leftMouseDown, .rightMouseDown, .otherMouseDown, .keyDown]
            ) { [weak self] event in
                self?.handle(event) ?? event
            }
        }

        func stopMonitoring() {
            if let monitor { NSEvent.removeMonitor(monitor) }
            monitor = nil
        }

        private func handle(_ event: NSEvent) -> NSEvent? {
            // Other windows (Settings, the notifications popover) are theirs.
            guard let window, event.window === window else { return event }
            if event.type == .keyDown {
                guard event.keyCode == Self.escapeKeyCode else { return event }
                onEscape()
                return nil
            }
            if !bounds.contains(convert(event.locationInWindow, from: nil)) {
                onClickOutside()
            }
            return event
        }
    }
}
