import SwiftUI
import Observation
import AppKit
import Network
import UserNotifications

/// A section and the pages pushed on it, to come back to.
struct SettingsReturn: Equatable {
    let selection: SidebarItem
    let path: [Route]
}

enum SidebarItem: String, Hashable, CaseIterable, Identifiable {
    case discover
    case movies
    case series
    case favorites
    case calendar
    case requests
    /// Reached from your photo on the rail, ⌘, and "Connect …" links; not a
    /// rail section or a Go menu item of its own.
    case settings

    /// The sections the Go menu lists (⌘1…⌘6).
    static var sections: [SidebarItem] { allCases.filter { $0 != .settings } }

    var id: String { rawValue }

    var title: String {
        switch self {
        case .discover: return "Discover"
        case .movies: return "Movies"
        case .series: return "Series"
        case .favorites: return "Favorites"
        case .calendar: return "Calendar"
        case .requests: return "Requests"
        case .settings: return "Settings"
        }
    }

    var systemImage: String {
        switch self {
        case .discover: return "safari"
        case .movies: return "film"
        case .series: return "tv"
        case .favorites: return "heart"
        case .calendar: return "calendar"
        case .requests: return "list.bullet"
        case .settings: return "gearshape"
        }
    }

    var shortcut: KeyEquivalent {
        switch self {
        case .discover: return "1"
        case .movies: return "2"
        case .series: return "3"
        case .favorites: return "4"
        case .calendar: return "5"
        case .requests: return "6"
        case .settings: return ","
        }
    }
}

enum Route: Hashable {
    case title(API.TitleID)
    case person(Int)
    case company(Int)
    case search(String)
    /// A Discover shelf's full list (its "See all").
    case discoverList(API.DiscoverList)
    case errorReference
    case changelog
}

extension Route {
    /// The same page on the server's website (app/title/[type]/[id],
    /// app/person/[id], app/company/[id], app/discover/[list]), relative to
    /// its root. nil for the screens the website has no standalone page for.
    var webPath: String? {
        switch self {
        case let .title(id): return "title/\(id.mediaType.rawValue)/\(id.tmdbId)"
        case let .person(id): return "person/\(id)"
        case let .company(id): return "company/\(id)"
        case let .discoverList(list): return "discover/\(list.rawValue)"
        case .search, .errorReference, .changelog: return nil
        }
    }
}

struct Banner: Identifiable, Equatable {
    let id = UUID()
    let message: String
    let isError: Bool
}

/// UI-level state shared by every window: session, navigation, badges.
@MainActor
@Observable
final class AppModel {
    enum Phase: Equatable {
        /// Restoring the saved server session.
        case launching
        /// No server chosen yet: the find-your-server onboarding.
        case connect
        /// A server is chosen; sign in (or create its first account).
        case signIn
        /// The saved server couldn't be used; `connectionProblem` says why.
        case unreachable
        case ready
    }

    /// Which card the sign-in phase shows.
    enum AuthForm: Equatable {
        case signIn
        case setup
    }

    /// The Marquee server this Mac is a client of.
    let session: ServerSession
    /// The find-your-server flow's state (discovery, manual entry).
    let connect = ConnectModel()
    /// Bumped by API mutations and by polling; screens key reloads off it.
    let events: ServerEvents
    /// The notification stream, badge polling, the Dock badge and
    /// notification banners while signed in.
    let live: LiveUpdates
    /// Whether the signed-in account wants banners on this Mac, and the
    /// "Get notifications on this Mac?" card that asks.
    let notificationConsent: NotificationConsent
    /// Newer Marquee releases, and installing one.
    let updater = Updater()
    /// Profile photos, by `avatarUrl`.
    let avatars = AvatarImageStore()
    /// What this Mac has changed about titles since the lists showing them
    /// were fetched, so cards don't offer an add that already happened.
    let titleState = TitleStateStore()

    /// The typed server API with the current token. Mutations made through it
    /// bump `events`.
    var api: MarqueeAPI {
        MarqueeAPI(client: session.client, events: events)
    }

    var phase: Phase = .launching {
        didSet {
            if phase == .ready, oldValue != .ready { replayPendingURL() }
        }
    }
    /// The signed-in account, exactly as the server reports it.
    var viewer: API.User?
    var authForm: AuthForm = .signIn
    /// A note on the sign-in card, e.g. after the server ended the session.
    var authNotice: String?
    /// Why `.unreachable` couldn't use the saved server.
    var connectionProblem: ProbeOutcome?
    private(set) var isRetryingConnection = false

    var selection: SidebarItem = .discover
    var path: [Route] = []
    var movieFilters = API.BrowseQuery()
    var seriesFilters = API.BrowseQuery()

    var banner: Banner?
    /// Bumped by View → Reload (⌘R) to force the visible screen to refetch.
    var reloadToken = 0
    /// The search panel (`SearchPanel`), opened by the rail's Search and
    /// Edit › Find (⌘F).
    var isSearchOpen = false
    /// Which Settings tab opens next — "Connect …" links jump to Integrations.
    var settingsTab: SettingsTab = .account
    /// Where Settings was opened from, for its Back button; nil once you've
    /// left Settings some other way.
    var settingsReturn: SettingsReturn?

    /// Captured from the scene environment so non-view code (notification
    /// clicks, Settings links) can bring the main window back after it closed.
    @ObservationIgnored var openMainWindow: (() -> Void)?

    @ObservationIgnored private var bootstrapped = false
    /// A marquee:// link (a notification click, `open marquee://…`) that
    /// arrived before the session was ready — opened once it is.
    @ObservationIgnored private(set) var pendingURL: URL?
    /// Retries the can't-reach card when the network comes back or the Mac
    /// wakes; see `startReconnectTriggers()`.
    @ObservationIgnored private var pathMonitor: NWPathMonitor?
    @ObservationIgnored private var wakeObserver: NSObjectProtocol?
    @ObservationIgnored private var autoRetryTask: Task<Void, Never>?

    /// How long a network change or wake settles before the automatic retry,
    /// so a flapping Wi-Fi join doesn't fire a burst of probes.
    static let autoRetryDelay: Duration = .seconds(2)

    init(session: ServerSession = ServerSession(), notificationConsent: NotificationConsent = NotificationConsent()) {
        self.session = session
        let events = ServerEvents()
        self.events = events
        let live = LiveUpdates(events: events) { label in
            NSApp.dockTile.badgeLabel = label
        }
        self.live = live
        self.notificationConsent = notificationConsent
        notificationConsent.onChange = { enabled in
            live.bannersEnabled = enabled
        }
        connect.onSelect = { [weak self] address, info in
            self?.selectServer(address, info: info)
        }
        session.onUnauthorized = { [weak self] in
            self?.sessionEnded()
        }
        updater.onNewUpdate = { [weak self] update in
            self?.flash("Marquee \(update.version) is available. Update it from the rail or Settings › About.")
        }
    }

    /// Unread notifications from the server's `/badges`, polled by `live`.
    var unreadCount: Int { live.unreadCount }
    /// Pending requests (always 0 for members).
    var pendingRequestCount: Int { live.pendingRequestCount }

    func showMainWindow() {
        if let window = NSApp.windows.first(where: { $0.identifier?.rawValue.hasPrefix("main") == true && $0.isVisible }) {
            window.makeKeyAndOrderFront(nil)
        } else {
            openMainWindow?()
        }
        NSApp.activate(ignoringOtherApps: true)
    }

    // MARK: Session

    func bootstrap() {
        guard phase == .launching, !bootstrapped else { return }
        bootstrapped = true
        startReconnectTriggers()
        // A pinned (automated) run stays off GitHub; Check for Updates… still works.
        if session.pinned == nil {
            updater.startAutomaticChecks()
        }
        Task {
            await connectToSavedServer()
        }
    }

    /// No saved server → onboarding. A saved token → `/me`, landing signed in,
    /// at sign-in on a 401, or on the can't-reach card. No token → sign-in,
    /// after a server-info probe so the card knows whether setup is done.
    private func connectToSavedServer() async {
        // A Change Server… (or another server picked) while this is out
        // makes its answer stale; it must not pull the app back to it.
        connectGeneration &+= 1
        let generation = connectGeneration
        guard session.server != nil else {
            connect.reset()
            phase = .connect
            return
        }
        if session.hasToken {
            let restored = await session.restore()
            guard generation == connectGeneration else { return }
            switch restored {
            case let .signedIn(user):
                completeSignIn(user, restored: true)
            case .signedOut:
                await showSignIn(generation: generation)
            case let .unreachable(outcome):
                showUnreachable(outcome)
            }
        } else if session.tokenUnavailable {
            // The Keychain wouldn't answer. The saved session is probably
            // still there, so say so instead of silently asking for a
            // password — "Retry" re-reads it.
            await showSignIn(notice: Self.keychainUnreadableNotice, generation: generation)
        } else {
            // After an update too (the new copy can't read the old copy's
            // sign-in), the plain form: you just updated, so no explanation.
            await showSignIn(generation: generation)
        }
    }

    /// Bumped by every connect attempt and by Change Server…; a connect
    /// whose number is no longer current drops its result.
    @ObservationIgnored private var connectGeneration = 0

    /// Shown when the login Keychain refused to answer.
    static let keychainUnreadableNotice =
        "Couldn't read your saved sign-in from the login Keychain. Sign in again, or reload (⌘R) to retry."

    private func showSignIn(notice: String? = nil, generation: Int) async {
        let outcome = await session.refreshInfo()
        guard generation == connectGeneration else { return }
        guard case let .marquee(info) = outcome else {
            showUnreachable(outcome)
            return
        }
        connectionProblem = nil
        authNotice = notice
        authForm = info.setupComplete == false ? .setup : .signIn
        phase = .signIn
    }

    private func showUnreachable(_ outcome: ProbeOutcome) {
        connectionProblem = outcome
        phase = .unreachable
    }

    /// "Retry" on the can't-reach card.
    func retryConnection() {
        guard phase == .unreachable, !isRetryingConnection else { return }
        isRetryingConnection = true
        Task {
            await connectToSavedServer()
            isRetryingConnection = false
        }
    }

    /// The network coming back (NWPathMonitor) or the Mac waking up: retry the
    /// can't-reach card by itself, and catch up on counts while signed in.
    private func startReconnectTriggers() {
        let monitor = NWPathMonitor()
        monitor.pathUpdateHandler = { [weak self] path in
            guard path.status == .satisfied else { return }
            Task { @MainActor in self?.connectivityMayHaveReturned() }
        }
        monitor.start(queue: DispatchQueue(label: "com.timmyamant.Marquee.path-monitor"))
        pathMonitor = monitor

        wakeObserver = NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didWakeNotification, object: nil, queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.connectivityMayHaveReturned() }
        }
    }

    /// Debounced: several triggers in a row (wake, then Wi-Fi rejoining) make
    /// one attempt after things settle.
    func connectivityMayHaveReturned() {
        autoRetryTask?.cancel()
        autoRetryTask = Task { [weak self] in
            try? await Task.sleep(for: Self.autoRetryDelay)
            guard !Task.isCancelled, let self else { return }
            switch phase {
            case .unreachable: retryConnection()
            case .ready: refreshCounts()
            default: break
            }
        }
    }

    /// A server picked from discovery or entered by hand (already probed).
    func selectServer(_ address: ServerAddress, info: ServerInfo) {
        connect.discovery.reset()
        session.select(address, info: info)
        connectionProblem = nil
        authNotice = nil
        if session.hasToken {
            phase = .launching
            Task {
                await connectToSavedServer()
            }
        } else {
            authForm = info.setupComplete == false ? .setup : .signIn
            phase = .signIn
        }
    }

    /// Menu › Change Server…, and the "Change" links: signs out, forgets the
    /// server, and starts the find-your-server flow over.
    func changeServer() {
        connectGeneration &+= 1
        let previous = session.server?.displayName
        session.forgetServer()
        clearSignedInState()
        connectionProblem = nil
        authNotice = nil
        connect.reset(prefill: previous)
        phase = .connect
    }

    /// Swap between the first-run and sign-in cards (the "Log in" /
    /// "Create an account" buttons under each form).
    func showAuthForm(_ target: AuthForm) {
        guard phase == .signIn else { return }
        authForm = target
    }

    /// - Parameter restored: The saved session came back at launch, rather
    ///   than someone signing in with a password just now.
    func completeSignIn(_ user: API.User, restored: Bool = false) {
        viewer = user
        authNotice = nil
        connectionProblem = nil
        selection = .discover
        path = []
        movieFilters = API.BrowseQuery()
        seriesFilters = API.BrowseQuery()
        phase = .ready
        let identity = "\(session.server?.baseURLString ?? "")|\(user.id.uuidString.lowercased())"
        live.start(identity: identity) { [weak self] in
            guard let self, self.phase == .ready else { return nil }
            return self.api
        }
        let consent = notificationConsent
        Task {
            await consent.begin(identity: identity, freshSignIn: !restored)
        }
    }

    /// Signs out of the server (revoking this Mac's token) but stays on it.
    func signOut() {
        let session = self.session
        Task {
            await session.logout()
        }
        clearSignedInState()
        authNotice = nil
        guard session.server != nil else {
            connect.reset()
            phase = .connect
            return
        }
        authForm = session.serverInfo?.setupComplete == false ? .setup : .signIn
        phase = .signIn
    }

    /// Any API call answered 401: the token expired or was revoked (a password
    /// change revokes every token), so go back to sign-in on the same server.
    private func sessionEnded() {
        guard phase == .ready else { return }
        clearSignedInState()
        authForm = .signIn
        authNotice = "Your session has ended. Please sign in again."
        phase = .signIn
    }

    private func clearSignedInState() {
        // The last account's notifications leave Notification Center with it,
        // so the next person on this Mac neither sees nor clicks them.
        if !AppInfo.isRunningTests {
            UNUserNotificationCenter.current().removeAllDeliveredNotifications()
        }
        pendingURL = nil
        live.stop()
        notificationConsent.end()
        avatars.clear()
        titleState.clear()
        viewer = nil
        path = []
        isSearchOpen = false
    }

    /// Role/owner can change on the server underneath a signed-in session
    /// (promotion, integrations connected) — re-read `/me`, like auth.ts's
    /// session callback. A 401 here signs out through `sessionEnded()`.
    func refreshViewer() {
        guard phase == .ready, let asked = viewer else { return }
        let server = session.server
        Task {
            guard let user = try? await session.refreshUser(), phase == .ready else { return }
            // Signed out and back in (maybe as someone else) while /me was
            // out: this answer is about the previous account.
            guard user.id == asked.id, session.server == server, viewer?.id == asked.id else { return }
            if user != viewer { viewer = user }
        }
    }

    /// Re-polls the server's badge counts now.
    func refreshCounts() {
        guard phase == .ready else { return }
        live.refresh(.activation)
    }

    /// The app came to the front: catch up on counts (and banners) right away,
    /// and pick up a change made in System Settings › Notifications.
    func applicationDidBecomeActive() {
        refreshCounts()
        guard phase == .ready else { return }
        let consent = notificationConsent
        Task {
            await consent.refreshAuthorization()
        }
    }

    // MARK: Navigation

    /// The navigation menu and the Go menu open Movies and Series unfiltered,
    /// like the web menu's plain /movies and /series links.
    func select(_ item: SidebarItem, resetFilters: Bool = true) {
        if resetFilters {
            if item == .movies { movieFilters = API.BrowseQuery() }
            if item == .series { seriesFilters = API.BrowseQuery() }
        }
        if selection != item {
            selection = item
        }
        if item != .settings {
            settingsReturn = nil
        }
        path = []
    }

    /// Settings, in the main window, on `tab`.
    func openSettings(_ tab: SettingsTab = .account) {
        settingsTab = tab
        // Remember the page Settings was opened from (a title's "Connect
        // Radarr…", say), so Settings can offer to go back to it.
        if selection != .settings {
            settingsReturn = SettingsReturn(selection: selection, path: path)
        }
        select(.settings)
        showMainWindow()
    }

    /// Settings' Back: the section and pages it was opened from.
    func returnFromSettings() {
        guard let back = settingsReturn else { return }
        settingsReturn = nil
        select(back.selection, resetFilters: false)
        path = back.path
    }

    func open(_ route: Route) {
        if path.last != route {
            path.append(route)
        }
    }

    func openTitle(_ id: API.TitleID) {
        open(.title(id))
    }

    func replaceTop(with route: Route) {
        if !path.isEmpty { path.removeLast() }
        path.append(route)
    }

    /// Genre tiles and network logos on Discover jump into a filtered browse.
    func browse(_ mediaType: API.MediaType, genreId: Int? = nil, networkId: Int? = nil) {
        var filters = API.BrowseQuery()
        filters.genreId = genreId
        filters.networkId = mediaType == .tv ? networkId : nil
        if mediaType == .movie {
            movieFilters = filters
            select(.movies, resetFilters: false)
        } else {
            seriesFilters = filters
            select(.series, resetFilters: false)
        }
    }

    func search(_ query: String) {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        open(.search(trimmed))
    }

    /// marquee://title/movie/603, marquee://person/287, marquee://company/420
    ///
    /// Before the session is ready (a cold launch from a notification click,
    /// or while signing in) the newest link waits in `pendingURL` and opens
    /// when `phase` becomes `.ready`. Signing out drops it.
    func handle(url: URL) {
        guard url.scheme == "marquee" else { return }
        guard phase == .ready else {
            pendingURL = url
            return
        }
        let parts = ([url.host ?? ""] + url.pathComponents.filter { $0 != "/" }).filter { !$0.isEmpty }
        switch parts.first {
        case "title":
            if parts.count >= 3, let id = Int(parts[2]) {
                let type = API.MediaType(rawValue: parts[1])
                guard type.isKnown else { return }
                openTitle(API.TitleID(type, id))
            }
        case "person":
            if parts.count >= 2, let id = Int(parts[1]) { open(.person(id)) }
        case "company":
            if parts.count >= 2, let id = Int(parts[1]) { open(.company(id)) }
        case "discover":
            if parts.count >= 2 {
                let list = API.DiscoverList(rawValue: parts[1])
                guard list.isKnown else { return }
                select(.discover)
                open(.discoverList(list))
            }
        case "search":
            if let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "q" })?.value {
                search(query)
            }
        default:
            break
        }
    }

    private func replayPendingURL() {
        guard let url = pendingURL else { return }
        pendingURL = nil
        handle(url: url)
    }

    // MARK: Web links

    /// The page for `route` on the server's own website, for Copy Link and
    /// Open in Browser.
    func webURL(for route: Route) -> URL? {
        guard let path = route.webPath, let server = session.server else { return nil }
        return server.baseURL.appending(path: path)
    }

    func copyLink(_ url: URL) {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(url.absoluteString, forType: .URL)
        pasteboard.setString(url.absoluteString, forType: .string)
        flash("Link copied.")
    }

    // MARK: Feedback

    func flash(_ message: String) {
        banner = Banner(message: message, isError: false)
    }

    func flash(error: Error) {
        banner = Banner(message: error.localizedDescription, isError: true)
    }

    func reload() {
        refreshViewer()
        refreshCounts()
        // Everything is about to be refetched, so the server's own answer wins.
        titleState.clear()
        reloadToken &+= 1
    }
}
