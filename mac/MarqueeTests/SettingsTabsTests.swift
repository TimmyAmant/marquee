import XCTest
@testable import Marquee

/// Settings' tabs (SettingsRootView.swift): the website's set and order
/// (lib/settings/tabs.ts), and who sees which.
final class SettingsTabsTests: XCTestCase {
    func testTheTabsComeInTheWebsitesOrder() {
        XCTAssertEqual(SettingsTab.allCases, [
            .account, .general, .members, .mediaServers, .services, .notifications,
            .discover, .blocklist, .jobs, .logs, .activity, .about,
        ])
    }

    func testTheAdminSeesEveryTab() {
        XCTAssertEqual(SettingsTab.visible(isAdmin: true, canManageBlocklist: true), SettingsTab.allCases)
    }

    func testAMemberSeesOnlyTheirOwnTabs() {
        XCTAssertEqual(SettingsTab.visible(isAdmin: false, canManageBlocklist: false), [.account, .notifications, .about])
    }

    func testAMemberHandedTheBlocklistSeesItAndNothingElseOfTheAdmins() {
        XCTAssertEqual(
            SettingsTab.visible(isAdmin: false, canManageBlocklist: true),
            [.account, .notifications, .blocklist, .about]
        )
    }

    func testDiscoverHidesOnAnOlderServer() {
        XCTAssertFalse(SettingsTab.visible(isAdmin: true, canManageBlocklist: true, hasDiscover: false).contains(.discover))
    }

    func testATabTheViewerCantSeeLandsOnAccount() {
        let member = SettingsTab.visible(isAdmin: false, canManageBlocklist: false)
        XCTAssertEqual(SettingsTab.current(.services, in: member), .account)
        XCTAssertEqual(SettingsTab.current(.notifications, in: member), .notifications)
    }

    func testNotificationsSubTabs() {
        XCTAssertEqual(NotificationsSubTab.visible(isAdmin: false), [.personal])
        XCTAssertEqual(
            NotificationsSubTab.visible(isAdmin: true),
            [.personal, .household, .discord, .ntfy, .telegram, .pushover, .email, .gotify, .slack, .pushbullet, .webhook]
        )
    }
}
