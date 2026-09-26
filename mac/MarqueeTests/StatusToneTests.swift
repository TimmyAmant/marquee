import XCTest
@testable import Marquee

/// The library-status colors, shared with the website's
/// lib/library/status-tone.ts: every status its own tone, and the badge,
/// poster strip and search pill all derived from it.
final class StatusToneTests: XCTestCase {
    func testEveryStatusHasItsOwnTone() {
        XCTAssertEqual(API.LibraryStatus.owned.tone, .owned)
        XCTAssertEqual(API.LibraryStatus.trackedDownloading.tone, .tracked)
        XCTAssertEqual(API.LibraryStatus.trackedMonitored.tone, .missing)
        XCTAssertEqual(API.LibraryStatus.comingSoon.tone, .soon)
        XCTAssertEqual(API.LibraryStatus.untracked.tone, .neutral)
        XCTAssertEqual(API.LibraryStatus.unknown("later").tone, .neutral)

        let tones = API.LibraryStatus.knownCases.map(\.tone)
        XCTAssertEqual(Set(tones).count, API.LibraryStatus.knownCases.count)
    }

    func testOnlyTitlesInTheLibraryGetAPosterStrip() {
        XCTAssertNotNil(Theme.statusStrip(.owned))
        XCTAssertNotNil(Theme.statusStrip(.trackedDownloading))
        XCTAssertNotNil(Theme.statusStrip(.trackedMonitored))
        XCTAssertNotNil(Theme.statusStrip(.comingSoon))
        XCTAssertNil(Theme.statusStrip(.untracked))
        XCTAssertNil(Theme.statusStrip(.unknown("later")))
    }

    func testStripBadgeAndSearchPillShareOneColor() {
        for status in API.LibraryStatus.knownCases where status != .untracked {
            let strip = Theme.statusStrip(status)
            XCTAssertEqual(strip, status.tone.palette?.foreground, status.rawValue)
            XCTAssertEqual(SuggestionKindPill.colors(for: status)?.foreground, strip, status.rawValue)
        }
        XCTAssertEqual(Theme.statusStrip(.trackedMonitored), Theme.missing)
        XCTAssertEqual(Theme.statusStrip(.comingSoon), Theme.soon)
    }

    func testComingSoonRequestsWearTheSoonTone() {
        XCTAssertEqual(API.RequestTone.comingSoon.badgeTone, .soon)
        XCTAssertEqual(API.RequestTone.downloading.badgeTone, .tracked)
        XCTAssertEqual(API.RequestTone.owned.badgeTone, .owned)
    }

    func testTheColorKeyExplainsEveryStatus() {
        for status in API.LibraryStatus.knownCases {
            XCTAssertFalse(status.name.isEmpty)
            XCTAssertFalse(status.meaning.isEmpty)
        }
        XCTAssertEqual(SuggestionKindPill.accessibilityText(kind: .movie, status: .trackedMonitored), "Movie · Missing")
        XCTAssertEqual(SuggestionKindPill.accessibilityText(kind: .tv, status: .unknown("later")), "TV")
    }
}
