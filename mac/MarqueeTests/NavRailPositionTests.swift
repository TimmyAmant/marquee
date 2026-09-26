import SwiftUI
import XCTest
@testable import Marquee

/// Settings › Menu position: what's stored, and where the rail and its
/// flyouts go for each choice.
final class NavRailPositionTests: XCTestCase {
    func testStoredValuesRoundTrip() {
        for position in NavRailPosition.allCases {
            XCTAssertEqual(NavRailPosition(stored: position.rawValue), position)
        }
    }

    func testNothingStoredOrUnknownFallsBackToLeft() {
        XCTAssertEqual(NavRailPosition(stored: nil), .left)
        XCTAssertEqual(NavRailPosition(stored: ""), .left)
        XCTAssertEqual(NavRailPosition(stored: "center"), .left)
        XCTAssertEqual(NavRailPosition(stored: "Right"), .left)
    }

    func testOrientation() {
        XCTAssertTrue(NavRailPosition.left.isVertical)
        XCTAssertTrue(NavRailPosition.right.isVertical)
        XCTAssertFalse(NavRailPosition.top.isVertical)
        XCTAssertFalse(NavRailPosition.bottom.isVertical)
    }

    func testFlyoutsOpenTowardThePage() {
        XCTAssertEqual(NavRailPosition.left.towardContent, .trailing)
        XCTAssertEqual(NavRailPosition.right.towardContent, .leading)
        XCTAssertEqual(NavRailPosition.top.towardContent, .bottom)
        XCTAssertEqual(NavRailPosition.bottom.towardContent, .top)
        for position in NavRailPosition.allCases {
            XCTAssertNotEqual(position.towardContent, position.edge)
        }
    }

    func testPagesKeepClearOfTheRailOnItsEdgeOnly() {
        let reach = Metrics.contentLeading
        XCTAssertEqual(NavRailPosition.left.contentInsets, EdgeInsets(top: 0, leading: reach, bottom: 0, trailing: 0))
        XCTAssertEqual(NavRailPosition.right.contentInsets, EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: reach))
        XCTAssertEqual(NavRailPosition.top.contentInsets, EdgeInsets(top: reach, leading: 0, bottom: 0, trailing: 0))
        XCTAssertEqual(NavRailPosition.bottom.contentInsets, EdgeInsets(top: 0, leading: 0, bottom: reach, trailing: 0))
    }

    func testDefaultIsTodaysLeftRail() {
        XCTAssertEqual(NavRailPosition.left.rawValue, "left")
        XCTAssertEqual(NavRailPosition.left.contentInsets.leading, 72)
    }
}
