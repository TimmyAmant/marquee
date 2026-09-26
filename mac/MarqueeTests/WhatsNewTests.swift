import XCTest
@testable import Marquee

// "What's new" after an upgrade: lib/whats-new.test.ts's cases, plus the
// Mac's own rule that server and app updates are separate events.

final class WhatsNewTests: XCTestCase {
    private func v(_ text: String) -> AppVersion {
        AppVersion(text)!
    }

    private func entry(_ version: String) -> API.ChangelogEntry {
        API.ChangelogEntry(version: version, date: API.CalendarDay("2026-09-26")!, changes: ["Change in \(version)"])
    }

    private func versions(_ content: WhatsNew.Content?) -> [String] {
        content?.entries.map(\.version) ?? []
    }

    // MARK: Versions

    func testVersionOrderIsNumericAndPreReleaseTolerant() {
        XCTAssertGreaterThan(v("0.45.10"), v("0.45.9"))
        XCTAssertEqual(v("0.46.0-beta.1"), v("0.46.0"))
        XCTAssertGreaterThan(v("0.46.0-beta.1"), v("0.45.3"))
        XCTAssertNil(AppVersion("garbage"))
    }

    // MARK: When it shows

    func testFirstRunShowsNothing() {
        XCTAssertNil(WhatsNew.pending(seen: WhatsNewSeen(), server: v("0.45.3"), app: v("0.45.3")))
        XCTAssertNil(WhatsNew.pending(seen: WhatsNewSeen(server: "junk", app: nil), server: v("0.45.3"), app: v("0.45.3")))
        XCTAssertEqual(
            WhatsNew.remembered(seen: WhatsNewSeen(), server: v("0.45.3"), app: v("0.45.2")),
            WhatsNewSeen(server: "0.45.3", app: "0.45.2")
        )
    }

    func testSameVersionsOrADowngradeShowNothing() {
        let seen = WhatsNewSeen(server: "0.45.3", app: "0.45.3")
        XCTAssertNil(WhatsNew.pending(seen: seen, server: v("0.45.3"), app: v("0.45.3")))
        XCTAssertNil(WhatsNew.pending(seen: seen, server: v("0.45.1"), app: v("0.45.2")))
        // A downgrade keeps the higher version, so re-upgrading doesn't repeat the notes.
        XCTAssertEqual(WhatsNew.remembered(seen: seen, server: v("0.45.1"), app: v("0.45.2")), seen)
    }

    func testAServerOnlyUpdateShowsTheServersEntries() throws {
        let seen = WhatsNewSeen(server: "0.45.1", app: "0.45.3")
        let pending = try XCTUnwrap(WhatsNew.pending(seen: seen, server: v("0.45.3"), app: v("0.45.3")))
        XCTAssertEqual(pending, WhatsNew.Pending(serverSince: v("0.45.1"), appSince: nil))
        let content = WhatsNew.content(
            pending: pending, server: v("0.45.3"), app: v("0.45.3"),
            serverChangelog: ["0.45.3", "0.45.2", "0.45.1", "0.45.0"].map(entry),
            appChangelog: []
        )
        XCTAssertEqual(content?.version, "0.45.3")
        XCTAssertEqual(versions(content), ["0.45.3", "0.45.2"])
        XCTAssertNil(content?.installedAppVersion)
    }

    func testAnAppOnlyUpdateShowsOnlyTheAppsEntries() throws {
        let seen = WhatsNewSeen(server: "0.45.3", app: "0.45.3")
        let pending = try XCTUnwrap(WhatsNew.pending(seen: seen, server: v("0.45.3"), app: v("0.46.1")))
        XCTAssertEqual(pending, WhatsNew.Pending(serverSince: nil, appSince: v("0.45.3")))
        let content = WhatsNew.content(
            pending: pending, server: v("0.45.3"), app: v("0.46.1"),
            serverChangelog: ["0.45.3", "0.45.2"].map(entry),
            appChangelog: ["0.46.1", "0.46.0", "0.45.3", "0.45.2"].map(entry)
        )
        XCTAssertEqual(content?.version, "0.46.1")
        XCTAssertEqual(versions(content), ["0.46.1", "0.46.0"])
        XCTAssertNil(content?.installedAppVersion)
    }

    func testBothUpdatedShowOneMergedListOnce() throws {
        let seen = WhatsNewSeen(server: "0.45.1", app: "0.45.2")
        let pending = try XCTUnwrap(WhatsNew.pending(seen: seen, server: v("0.45.3"), app: v("0.46.0")))
        let content = WhatsNew.content(
            pending: pending, server: v("0.45.3"), app: v("0.46.0"),
            serverChangelog: ["0.45.3", "0.45.2", "0.45.1"].map(entry),
            appChangelog: ["0.46.0", "0.45.3", "0.45.2", "0.45.1"].map(entry)
        )
        XCTAssertEqual(content?.version, "0.46.0")
        XCTAssertEqual(versions(content), ["0.46.0", "0.45.3", "0.45.2"], "Each version once, newest first")
        XCTAssertEqual(
            WhatsNew.remembered(seen: seen, server: v("0.45.3"), app: v("0.46.0")),
            WhatsNewSeen(server: "0.45.3", app: "0.46.0")
        )
    }

    func testAnAppUpdateWithoutItsNotesSaysItsInstalled() throws {
        let pending = WhatsNew.Pending(serverSince: nil, appSince: v("0.45.3"))
        let content = try XCTUnwrap(WhatsNew.content(
            pending: pending, server: v("0.45.3"), app: v("0.46.0"), serverChangelog: [], appChangelog: []
        ))
        XCTAssertEqual(content.installedAppVersion, "0.46.0")
        XCTAssertEqual(content.releaseNotesURL?.absoluteString, "https://github.com/TimmyAmant/marquee/releases/tag/v0.46.0")
        XCTAssertTrue(content.entries.isEmpty)
    }

    func testTheListIsCapped() throws {
        let many = (0..<15).map { entry("0.30.\($0)") }
        let content = try XCTUnwrap(WhatsNew.content(
            pending: WhatsNew.Pending(serverSince: v("0.29.0"), appSince: nil),
            server: v("0.30.14"), app: nil, serverChangelog: many, appChangelog: []
        ))
        XCTAssertEqual(content.entries.count, WhatsNew.cap)
        XCTAssertEqual(content.entries.first?.version, "0.30.14")
        XCTAssertTrue(content.hasMore)
    }

    func testNothingInRangeShowsNothing() {
        XCTAssertNil(WhatsNew.content(
            pending: WhatsNew.Pending(serverSince: v("0.45.1"), appSince: nil),
            server: v("0.45.3"), app: nil, serverChangelog: [entry("0.45.1")], appChangelog: []
        ))
    }

    // MARK: Storage

    func testStoreIsPerServer() throws {
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "WhatsNewTests-\(UUID().uuidString)"))
        let store = WhatsNewStore(defaults: defaults)
        XCTAssertEqual(store.seen(server: "http://a:3000"), WhatsNewSeen())
        store.save(WhatsNewSeen(server: "0.45.3", app: "0.45.2"), server: "http://a:3000")
        XCTAssertEqual(store.seen(server: "http://a:3000"), WhatsNewSeen(server: "0.45.3", app: "0.45.2"))
        XCTAssertEqual(store.seen(server: "http://b:3000"), WhatsNewSeen())
        XCTAssertEqual(defaults.string(forKey: "marquee.whatsNew.server.http://a:3000"), "0.45.3")
    }

    // MARK: The bundled changelog

    func testTheBundledChangelogParses() throws {
        let entries = BundledChangelog.load()
        XCTAssertFalse(entries.isEmpty, "lib/changelog.ts should be in the app's resources")
        // The build's own version is always the newest entry (both come from package.json's release).
        let newest = try XCTUnwrap(entries.first)
        XCTAssertNotNil(AppVersion(newest.version))
        XCTAssertFalse(newest.changes.isEmpty)
        XCTAssertTrue(entries.contains { $0.version == "0.45.3" })
    }

    func testTheScannerReadsEscapesAndComments() throws {
        let source = """
        export type ChangelogEntry = { version: string; date: string; changes: string[] };
        /** Newest first. [not an array] */
        export const CHANGELOG: ChangelogEntry[] = [
          {
            version: "0.2.0",
            date: "2026-09-26",
            // a comment with "quotes"
            changes: [
              "A \\"quoted\\" word…",
              "Two",
            ],
          },
          { version: "0.1.0", date: "2026-09-01", changes: ["First"] },
        ];
        """
        let entries = try XCTUnwrap(BundledChangelog.parse(source))
        XCTAssertEqual(entries.map(\.version), ["0.2.0", "0.1.0"])
        XCTAssertEqual(entries[0].changes, ["A \"quoted\" word…", "Two"])
        XCTAssertEqual(entries[1].date, API.CalendarDay("2026-09-01"))
        XCTAssertNil(BundledChangelog.parse("nothing here"))
    }
}
