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

extension AppModel {
    /// Moves to `section`'s tab (under More for the ones without a tab),
    /// keeping the tab being left where it was.
    func showOnPhone(_ section: SidebarItem) {
        let target = PhoneTab(section: section)
        switchTab(to: target)
        if target == .more {
            moreSection = section
        }
        if section != .settings { phoneSettingsTab = nil }
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
        if tab == .more {
            moreSection = nil
            phoneSettingsTab = nil
        }
    }

    func resetPhoneNavigation() {
        tab = .discover
        tabPaths = [:]
        moreSection = nil
        phoneSettingsTab = nil
        settingsTab = .account
    }

    /// Settings on iPhone and iPad, on `tab`: the More tab's Settings with
    /// that tab pushed over the list (on the iPad's full width, chosen in
    /// the Mac's row of tabs). Account, the default, is the list itself.
    func openSettings(_ tab: SettingsTab = .account) {
        select(.settings)
        settingsTab = tab
        phoneSettingsTab = tab == .account ? nil : tab
    }
}
