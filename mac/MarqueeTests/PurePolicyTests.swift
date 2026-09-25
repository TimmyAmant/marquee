import XCTest
@testable import Marquee

// Ports of the web app's vitest suites (lib/format.test.ts, lib/quality.test.ts,
// lib/title-meta.test.ts) — the formatters the app still computes locally.

final class FormatTests: XCTestCase {
    func testBytes() {
        XCTAssertEqual(Format.bytes(0), "0 B")
        XCTAssertEqual(Format.bytes(nil), "0 B")
        XCTAssertEqual(Format.bytes(500), "500.0 B")
        XCTAssertEqual(Format.bytes(Int64(3.7 * pow(1024, 3))), "3.7 GB")
        XCTAssertEqual(Format.bytes(Int64(1.5 * pow(1024, 4))), "1.5 TB")
    }

    func testRuntime() {
        XCTAssertEqual(Format.runtime(minutes: 42), "42m")
        XCTAssertEqual(Format.runtime(minutes: 120), "2h")
        XCTAssertEqual(Format.runtime(minutes: 102), "1h 42m")
        XCTAssertEqual(Format.runtime(minutes: 0), "0m")
    }

    func testFlagEmoji() {
        XCTAssertEqual(Format.flagEmoji(countryCode: "US"), "🇺🇸")
        XCTAssertEqual(Format.flagEmoji(countryCode: "gb"), "🇬🇧")
    }

    func testDateLabel() {
        XCTAssertEqual(Format.dateLabel("2026-07-17"), "July 17, 2026")
        XCTAssertNil(Format.dateLabel(nil))
        XCTAssertNil(Format.dateLabel("not a date"))
    }

    func testTimeAgo() {
        let now = Date()
        XCTAssertEqual(Format.timeAgo(now.addingTimeInterval(-30), now: now), "just now")
        XCTAssertEqual(Format.timeAgo(now.addingTimeInterval(-5 * 60), now: now), "5m ago")
        XCTAssertEqual(Format.timeAgo(now.addingTimeInterval(-3 * 3600), now: now), "3h ago")
        XCTAssertEqual(Format.timeAgo(now.addingTimeInterval(-2 * 86_400), now: now), "2d ago")
    }
}

final class QualityTests: XCTestCase {
    func testResolutionTier() {
        XCTAssertEqual(Quality.resolutionTier("WEBDL-2160p"), .uhd)
        XCTAssertEqual(Quality.resolutionTier("Bluray-4K"), .uhd)
        XCTAssertEqual(Quality.resolutionTier("Bluray-1080p"), .fullHD)
        XCTAssertEqual(Quality.resolutionTier("HDTV-720p"), .hd)
        XCTAssertEqual(Quality.resolutionTier("bluray-1080P"), .fullHD)
        XCTAssertNil(Quality.resolutionTier("SDTV"))
        XCTAssertNil(Quality.resolutionTier("DVD"))
        XCTAssertNil(Quality.resolutionTier(nil))
    }

    func testHdrLabel() {
        XCTAssertEqual(Quality.hdrLabel("DV"), "Dolby Vision")
        XCTAssertEqual(Quality.hdrLabel("HDR10Plus"), "HDR10+")
        XCTAssertEqual(Quality.hdrLabel("HDR10"), "HDR10")
        XCTAssertNil(Quality.hdrLabel(nil))
        XCTAssertNil(Quality.hdrLabel(""))
    }

    func testAudioLabel() {
        XCTAssertEqual(Quality.audioLabel("TrueHD Atmos"), "Atmos")
        XCTAssertEqual(Quality.audioLabel("DD+ Atmos"), "Atmos")
        XCTAssertEqual(Quality.audioLabel("DTS-HD MA"), "DTS-HD MA")
        XCTAssertNil(Quality.audioLabel(nil))
        XCTAssertNil(Quality.audioLabel(""))
    }
}

final class TitleMetaTests: XCTestCase {
    func testYearRange() {
        XCTAssertEqual(TitleMeta.yearRange(start: "2026", end: nil), "2026")
        XCTAssertEqual(TitleMeta.yearRange(start: "2001", end: "2011"), "2001–2011")
        XCTAssertEqual(TitleMeta.yearRange(start: "2026", end: "2026"), "2026")
        XCTAssertEqual(TitleMeta.yearRange(start: nil, end: "2020"), "2020")
        XCTAssertNil(TitleMeta.yearRange(start: nil, end: nil))
    }

    func testRelabelTvStatus() {
        XCTAssertEqual(TitleMeta.relabelTvStatus("Returning Series"), "Continuing")
        XCTAssertEqual(TitleMeta.relabelTvStatus("Ended"), "Ended")
        XCTAssertNil(TitleMeta.relabelTvStatus(nil))
    }

    func testMovieCreditsDedupesAndCaps() {
        let crew: [(id: Int, name: String, job: String, department: String)] = [
            (1, "Director A", "Director", "Directing"),
            (2, "Writer B", "Screenplay", "Writing"),
            (2, "Writer B", "Writer", "Writing"),
            (3, "Writer C", "Writer", "Writing"),
            (4, "Producer", "Producer", "Production"),
        ]
        let credits = TitleMeta.movieCredits(crew)
        XCTAssertEqual(credits.map(\.name), ["Director A", "Writer B", "Writer C"])
        XCTAssertEqual(credits.first?.role, "Director")
    }

    func testTvCredits() {
        let credits = TitleMeta.tvCredits(
            createdBy: [(1, "Creator A")],
            crew: [(1, "Creator A", "Executive Producer"), (2, "EP B", "Executive Producer")]
        )
        XCTAssertEqual(credits, [
            TitleMeta.CreditEntry(role: "Creator", name: "Creator A"),
            TitleMeta.CreditEntry(role: "Executive Producer", name: "EP B"),
        ])
    }
}

/// components/nav-menu.tsx `Avatar`: up to two initials, uppercased.
final class NavAvatarTests: XCTestCase {
    func testInitials() {
        XCTAssertEqual(NavAvatar.initials(of: "admin"), "A")
        XCTAssertEqual(NavAvatar.initials(of: "Timmy Amant"), "TA")
        XCTAssertEqual(NavAvatar.initials(of: "  ada   king lovelace "), "AK")
        XCTAssertEqual(NavAvatar.initials(of: "élodie"), "É")
        XCTAssertEqual(NavAvatar.initials(of: ""), "?")
        XCTAssertEqual(NavAvatar.initials(of: "   "), "?")
    }
}
