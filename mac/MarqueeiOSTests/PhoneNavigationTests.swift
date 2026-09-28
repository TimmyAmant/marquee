import Testing
import Foundation
@testable import Marquee

/// The iPhone app's tab bar: each tab keeps its own pages, the rail's other
/// sections open under More, and links land on the tab you're on.
@MainActor
struct PhoneNavigationTests {
    private func makeModel() -> AppModel {
        let suite = UserDefaults(suiteName: "marquee.tests.phone.\(UUID().uuidString)")!
        let session = ServerSession(defaults: suite, tokenStore: InMemoryTokenStore(), pinned: nil)
        let model = AppModel(session: session)
        model.phase = .ready
        return model
    }

    private let matrix = Route.title(API.TitleID(.movie, 603))
    private let keanu = Route.person(6384)

    @Test func eachTabKeepsItsOwnPages() {
        let model = makeModel()
        model.open(matrix)
        #expect(model.tab == .discover)

        model.switchTab(to: .search)
        #expect(model.path.isEmpty, "A new tab starts on its first page")
        model.open(keanu)

        model.switchTab(to: .discover)
        #expect(model.path == [matrix])
        #expect(model.path(for: .search) == [keanu])
    }

    @Test func settingABackgroundTabsPathLeavesTheVisibleOneAlone() {
        let model = makeModel()
        model.open(matrix)
        model.setPath([keanu], for: .requests)
        #expect(model.path == [matrix])
        #expect(model.path(for: .requests) == [keanu])
    }

    @Test func tappingTheVisibleTabGoesBackToItsFirstPage() {
        let model = makeModel()
        model.open(matrix)
        model.open(keanu)
        model.popToRoot(.discover)
        #expect(model.path.isEmpty)
    }

    @Test func railSectionsWithoutATabOpenUnderMore() {
        let model = makeModel()
        model.select(.favorites)
        #expect(model.tab == .more)
        #expect(model.moreSection == .favorites)

        model.select(.requests)
        #expect(model.tab == .requests)

        model.browse(.movie, genreId: 28)
        #expect(model.tab == .more)
        #expect(model.moreSection == .movies)
        #expect(model.movieFilters.genreId == 28)
    }

    @Test func aLinkOpensOnTheVisibleTab() {
        let model = makeModel()
        model.switchTab(to: .calendar)
        model.handle(url: URL(string: "marquee://title/movie/603")!)
        #expect(model.tab == .calendar)
        #expect(model.path == [matrix])
    }

    @Test func settingsLinksOpenAccountSettingsUnderMore() {
        let model = makeModel()
        model.handle(url: URL(string: "marquee://settings")!)
        #expect(model.tab == .more)
        #expect(model.moreSection == .settings)
    }

    @Test func signingOutStartsOverOnDiscover() {
        let model = makeModel()
        model.switchTab(to: .search)
        model.open(keanu)
        model.select(.favorites)
        model.signOut()
        #expect(model.tab == .discover)
        #expect(model.path.isEmpty)
        #expect(model.tabPaths.isEmpty)
        #expect(model.moreSection == nil)
    }

    @Test func everySectionHasATab() {
        for section in SidebarItem.allCases {
            let tab = PhoneTab(section: section)
            #expect(PhoneTab.allCases.contains(tab))
        }
        #expect(PhoneTab(section: .discover) == .discover)
        #expect(PhoneTab(section: .calendar) == .calendar)
        #expect(PhoneTab(section: .settings) == .more)
    }

    @Test func everySettingsTabHasItsWebsitePage() {
        #expect(SettingsTab.account.webPath == "settings")
        #expect(SettingsTab.services.webPath == "settings/services")
        #expect(SettingsTab.mediaServers.webPath == "settings/media-servers")
        #expect(SettingsTab.logs.webPath == "settings/logs")
        for tab in SettingsTab.allCases where tab != .account {
            #expect(tab.webPath.hasPrefix("settings/"))
        }
        #expect(Set(SettingsTab.allCases.map(\.webPath)).count == SettingsTab.allCases.count)
    }

    @Test func settingsLinksOpenTheirTabNatively() {
        let model = makeModel()
        model.switchTab(to: .search)
        model.openSettings(.services)
        #expect(model.tab == .more)
        #expect(model.moreSection == .settings)
        #expect(model.phoneSettingsTab == .services, "Pushed over the iPhone's list")
        #expect(model.settingsTab == .services, "Chosen in the iPad's row")
    }

    @Test func accountIsTheSettingsListItself() {
        let model = makeModel()
        model.openSettings(.logs)
        model.openSettings()
        #expect(model.moreSection == .settings)
        #expect(model.phoneSettingsTab == nil)
        #expect(model.settingsTab == .account)
    }

    @Test func leavingSettingsForgetsTheOpenTab() {
        let model = makeModel()
        model.openSettings(.jobs)
        model.select(.favorites)
        #expect(model.moreSection == .favorites)
        #expect(model.phoneSettingsTab == nil)

        model.openSettings(.activity)
        model.popToRoot(.more)
        #expect(model.moreSection == nil)
        #expect(model.phoneSettingsTab == nil)

        model.openSettings(.members)
        model.signOut()
        #expect(model.phoneSettingsTab == nil)
        #expect(model.settingsTab == .account)
    }

    @Test func theIPhonesListHasTheMacsTabsForTheSamePeople() {
        // PhoneSettingsView lists `SettingsTab.visible`, like the Mac's row.
        #expect(SettingsTab.visible(isAdmin: true, canManageBlocklist: true) == SettingsTab.allCases)
        #expect(SettingsTab.visible(isAdmin: false, canManageBlocklist: false) == [.account, .notifications, .about])
        #expect(SettingsTab.visible(isAdmin: false, canManageBlocklist: true) == [.account, .notifications, .blocklist, .about])
        #expect(!SettingsTab.visible(isAdmin: true, canManageBlocklist: true, hasDiscover: false).contains(.discover))
        for tab in SettingsTab.allCases {
            #expect(!tab.systemImage.isEmpty)
            #expect(!tab.title.isEmpty)
        }
    }

    @Test func settingsRowsStackWhenTheControlLeavesTooLittleRoom() {
        // An iPhone's card (about 340 points) keeps a switch beside its label…
        #expect(SettingsRowLayout.isSideBySide(width: 340, controlWidth: 51))
        // …but puts a 280-point picker under it; an iPad keeps it beside.
        #expect(!SettingsRowLayout.isSideBySide(width: 340, controlWidth: 280))
        #expect(SettingsRowLayout.isSideBySide(width: 900, controlWidth: 280))
    }
}
