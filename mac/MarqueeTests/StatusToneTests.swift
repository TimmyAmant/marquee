import XCTest
@testable import Marquee

/// The library-status colors, shared with the website's
/// lib/library/status-tone.ts and matching Radarr's/Sonarr's legends: every
/// status its own tone, and the badge, poster strip and search pill all
/// derived from it.
final class StatusToneTests: XCTestCase {
    func testEveryStatusHasItsOwnTone() {
        XCTAssertEqual(API.LibraryStatus.owned.tone, .owned)
        XCTAssertEqual(API.LibraryStatus.trackedDownloading.tone, .downloading)
        XCTAssertEqual(API.LibraryStatus.trackedMonitored.tone, .missing)
        XCTAssertEqual(API.LibraryStatus.trackedUnmonitored.tone, .unmonitored)
        XCTAssertEqual(API.LibraryStatus.comingSoon.tone, .soon)
        XCTAssertEqual(API.LibraryStatus.untracked.tone, .neutral)
        XCTAssertEqual(API.LibraryStatus.unknown("later").tone, .neutral)
        XCTAssertEqual(API.LibraryStatus(rawValue: "some_future_state").tone, .neutral)

        let tones = API.LibraryStatus.knownCases.map(\.tone)
        XCTAssertEqual(Set(tones).count, API.LibraryStatus.knownCases.count)
    }

    func testStatusesAreListedInDisplayOrder() {
        XCTAssertEqual(
            API.LibraryStatus.knownCases.map(\.rawValue),
            ["owned", "tracked_downloading", "tracked_monitored", "tracked_unmonitored", "coming_soon", "untracked"]
        )
    }

    func testDecodesTrackedUnmonitored() throws {
        struct Holder: Decodable { let status: API.LibraryStatus }
        let json = #"{"status":"tracked_unmonitored"}"#
        let holder = try APIClient.decoder.decode(Holder.self, from: Data(json.utf8))
        XCTAssertEqual(holder.status, .trackedUnmonitored)
        XCTAssertTrue(holder.status.isKnown)
        XCTAssertEqual(holder.status.label, "Not monitored")
        XCTAssertEqual(holder.status.compactLabel, "Not monitored")
        XCTAssertEqual(holder.status.name, "Not monitored")
        XCTAssertEqual(holder.status.meaning, "In Sonarr/Radarr but not monitored — it won't download on its own.")
    }

    func testOnlyTitlesInTheLibraryGetAPosterStrip() {
        XCTAssertNotNil(Theme.statusStrip(.owned))
        XCTAssertNotNil(Theme.statusStrip(.trackedDownloading))
        XCTAssertNotNil(Theme.statusStrip(.trackedMonitored))
        XCTAssertNotNil(Theme.statusStrip(.trackedUnmonitored))
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
        XCTAssertEqual(Theme.statusStrip(.owned), Theme.owned)
        XCTAssertEqual(Theme.statusStrip(.trackedDownloading), Theme.downloading)
        XCTAssertEqual(Theme.statusStrip(.trackedMonitored), Theme.missing)
        XCTAssertEqual(Theme.statusStrip(.trackedUnmonitored), Theme.unmonitored)
        XCTAssertEqual(Theme.statusStrip(.comingSoon), Theme.soon)
    }

    func testRequestTonesUseStatusOrInfoColors() {
        XCTAssertEqual(API.RequestTone.comingSoon.badgeTone, .soon)
        XCTAssertEqual(API.RequestTone.downloading.badgeTone, .downloading)
        XCTAssertEqual(API.RequestTone.owned.badgeTone, .owned)
        XCTAssertEqual(API.RequestTone.pending.badgeTone, .info)
        XCTAssertEqual(API.RequestTone.approved.badgeTone, .info)
    }

    func testTheColorKeyExplainsEveryStatus() {
        for status in API.LibraryStatus.knownCases {
            XCTAssertFalse(status.name.isEmpty)
            XCTAssertFalse(status.meaning.isEmpty)
        }
        XCTAssertEqual(StatusColorKeyList.footnote, "Same colors as Radarr and Sonarr.")
        XCTAssertEqual(
            StatusColorKey.pillStatuses,
            [.owned, .trackedDownloading, .trackedMonitored, .trackedUnmonitored, .comingSoon]
        )
        XCTAssertEqual(SuggestionKindPill.accessibilityText(kind: .movie, status: .trackedMonitored), "Movie · Missing")
        XCTAssertEqual(SuggestionKindPill.accessibilityText(kind: .tv, status: .trackedUnmonitored), "TV · Not monitored")
        XCTAssertEqual(SuggestionKindPill.accessibilityText(kind: .tv, status: .unknown("later")), "TV")
    }
}
