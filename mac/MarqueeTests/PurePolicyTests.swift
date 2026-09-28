import XCTest
@testable import Marquee

// Ports of the web app's vitest suites (lib/format.test.ts, lib/quality.test.ts)
// — the formatters the app still computes locally.

final class FormatTests: XCTestCase {
    func testBytes() {
        XCTAssertEqual(Format.bytes(0), "0 B")
        XCTAssertEqual(Format.bytes(nil), "0 B")
        XCTAssertEqual(Format.bytes(500), "500.0 B")
        XCTAssertEqual(Format.bytes(Int64(3.7 * pow(1024, 3))), "3.7 GB")
        XCTAssertEqual(Format.bytes(Int64(1.5 * pow(1024, 4))), "1.5 TB")
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

/// components/user-avatar.tsx `initialsOf`: up to two initials, uppercased.
final class UserAvatarTests: XCTestCase {
    func testInitials() {
        XCTAssertEqual(UserAvatarView.initials(of: "admin"), "A")
        XCTAssertEqual(UserAvatarView.initials(of: "Timmy Amant"), "TA")
        XCTAssertEqual(UserAvatarView.initials(of: "  ada   king lovelace "), "AK")
        XCTAssertEqual(UserAvatarView.initials(of: "élodie"), "É")
        XCTAssertEqual(UserAvatarView.initials(of: ""), "?")
        XCTAssertEqual(UserAvatarView.initials(of: "   "), "?")
    }
}
