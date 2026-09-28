import SwiftUI

/// The iPhone app's tab bar. The Mac's rail sections that don't get a tab
/// of their own (Movies, Series, Library, Favorites, Settings) live under More.
enum PhoneTab: String, Hashable, CaseIterable, Identifiable {
    case discover
    case search
    case requests
    case calendar
    case more

    var id: String { rawValue }

    var title: String {
        switch self {
        case .discover: return String(localized: "Discover")
        case .search: return String(localized: "Search")
        case .requests: return String(localized: "Requests")
        case .calendar: return String(localized: "Calendar")
        case .more: return String(localized: "More")
        }
    }

    var systemImage: String {
        switch self {
        case .discover: return "safari"
        case .search: return "magnifyingglass"
        case .requests: return "list.bullet"
        case .calendar: return "calendar"
        case .more: return "ellipsis.circle"
        }
    }

    /// Where a rail section lives on the phone.
    init(section: SidebarItem) {
        switch section {
        case .discover: self = .discover
        case .requests: self = .requests
        case .calendar: self = .calendar
        case .movies, .series, .library, .favorites, .settings: self = .more
        }
    }
}

/// The Settings pages a shared screen can ask for ("Connect an integration"),
/// the same tabs as the Mac's and the website's (0.56+). On the phone,
/// Account, Notifications and About are the More tab's Settings screen; the
/// admin's pages open on the website, which has room for them.
enum SettingsTab: String, Hashable, CaseIterable {
    case account, general, members, mediaServers, services, notifications, discover, blocklist, jobs, activity, about

    /// The page on the website (app/settings/…), relative to its root.
    var webPath: String {
        switch self {
        case .account: return "settings"
        case .general: return "settings/general"
        case .members: return "settings/members"
        case .mediaServers: return "settings/media-servers"
        case .services: return "settings/services"
        case .notifications: return "settings/notifications"
        case .discover: return "settings/discover"
        case .blocklist: return "settings/blocklist"
        case .jobs: return "settings/jobs"
        case .activity: return "settings/activity"
        case .about: return "settings/about"
        }
    }

    var title: String {
        switch self {
        case .account: return String(localized: "Account")
        case .general: return String(localized: "General")
        case .members: return String(localized: "Members")
        case .mediaServers: return String(localized: "Media servers")
        case .services: return String(localized: "Services")
        case .notifications: return String(localized: "Notifications")
        case .discover: return String(localized: "Discover")
        case .blocklist: return String(localized: "Blocklist")
        case .jobs: return String(localized: "Jobs")
        case .activity: return String(localized: "Activity")
        case .about: return String(localized: "About")
        }
    }

    var systemImage: String {
        switch self {
        case .account: return "person.crop.circle"
        case .general: return "gearshape"
        case .members: return "person.2"
        case .mediaServers: return "server.rack"
        case .services: return "powerplug"
        case .notifications: return "bell"
        case .discover: return "safari"
        case .blocklist: return "hand.raised"
        case .jobs: return "arrow.triangle.2.circlepath"
        case .activity: return "clock"
        case .about: return "info.circle"
        }
    }

    /// Covered by the phone's own Settings screen.
    var isOnPhone: Bool {
        switch self {
        case .account, .notifications, .about: return true
        default: return false
        }
    }
}

extension AppModel {
    /// Moves to `section`'s tab (under More for the ones without a tab),
    /// keeping the tab being left where it was.
    func showOnPhone(_ section: SidebarItem) {
        let target = PhoneTab(section: section)
        switchTab(to: target)
        if target == .more {
            moreSection = section
        }
    }

    /// The tab bar's selection: each tab keeps its own pushed pages.
    func switchTab(to target: PhoneTab) {
        guard target != tab else { return }
        tabPaths[tab] = path
        path = tabPaths[target] ?? []
        tabPaths[target] = nil
        tab = target
    }

    /// The pages pushed on `tab`, whether or not it's the visible one.
    func path(for tab: PhoneTab) -> [Route] {
        tab == self.tab ? path : tabPaths[tab] ?? []
    }

    func setPath(_ newPath: [Route], for tab: PhoneTab) {
        if tab == self.tab {
            path = newPath
        } else {
            tabPaths[tab] = newPath
        }
    }

    /// Tapping the visible tab again goes back to its first page.
    func popToRoot(_ tab: PhoneTab) {
        setPath([], for: tab)
        if tab == .more { moreSection = nil }
    }

    func resetPhoneNavigation() {
        tab = .discover
        tabPaths = [:]
        moreSection = nil
    }

    /// Settings on the phone: Account is the More tab's Settings screen; the
    /// admin's pages (Integrations, Discover, Activity, Jobs) are the
    /// website's, which has room for them.
    func openSettings(_ tab: SettingsTab = .account) {
        if tab.isOnPhone {
            select(.settings)
            return
        }
        guard let server = session.server else { return }
        Platform.open(server.baseURL.appending(path: tab.webPath))
    }
}
