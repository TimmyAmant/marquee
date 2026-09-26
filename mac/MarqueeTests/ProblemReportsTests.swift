import XCTest
@testable import Marquee

// Problem reports (0.38+): the report body, `GET /issues`, the title's
// `viewer.canReport` / `openReports`, `openIssues` in the badges and the two
// notification types — decoded from the doc fixtures and from an older server
// that omits them all.

@MainActor
final class ProblemReportsTests: XCTestCase {
    private static let issueId = UUID(uuidString: "83BEDF64-C5D8-4F43-98A0-BB615C4B9897")!

    private func fixtureData(_ name: String) throws -> Data {
        try Data(contentsOf: Bundle(for: Self.self).resourceURL!.appendingPathComponent("Fixtures/api/\(name).json"))
    }

    private func fixture(_ name: String) throws -> [String: Any] {
        try XCTUnwrap(JSONSerialization.jsonObject(with: fixtureData(name)) as? [String: Any])
    }

    private func decode<T: Decodable>(_ type: T.Type, _ object: Any) throws -> T {
        try APIClient.decoder.decode(type, from: JSONSerialization.data(withJSONObject: object))
    }

    private func withViewer(_ name: String, _ edit: (inout [String: Any]) -> Void) throws -> [String: Any] {
        var json = try fixture(name)
        var viewer = try XCTUnwrap(json["viewer"] as? [String: Any])
        edit(&viewer)
        json["viewer"] = viewer
        return json
    }

    override func tearDown() {
        StubURLProtocol.handler = nil
        StubURLProtocol.requests = []
        super.tearDown()
    }

    // MARK: Decoding

    func testIssueListFixture() throws {
        let list = try decode(API.IssueList.self, fixture("issues"))
        let issue = try XCTUnwrap(list.results.first)
        XCTAssertEqual(issue.id, Self.issueId)
        XCTAssertEqual(issue.titleID, API.TitleID(.tv, 1396))
        XCTAssertEqual(issue.kind, .audio)
        XCTAssertEqual(issue.kindLabel, "Audio problem")
        XCTAssertEqual(issue.episodeLabel, "S2 E5")
        XCTAssertEqual(issue.status, .open)
        XCTAssertNil(issue.resolution)
        XCTAssertNil(issue.fixedLine)
        XCTAssertFalse(issue.isMine)
        XCTAssertEqual(issue.reportedBy.label, "Member")
        XCTAssertEqual(list.open.count, 1)
        XCTAssertTrue(list.fixed.isEmpty)
        XCTAssertEqual(list.kinds.map(\.id), API.IssueKind.knownCases)
        for option in list.kinds {
            XCTAssertEqual(option.id.label, option.label, "The app's labels match the server's")
        }
        XCTAssertTrue(issue.summaryLine(showingReporter: true).hasPrefix("Audio problem · Member · "))
        XCTAssertFalse(issue.summaryLine(showingReporter: false).contains("Member"))
    }

    func testFixedIssueAndUnknownValues() throws {
        var json = try fixture("issues")
        var row = try XCTUnwrap((json["results"] as? [[String: Any]])?.first)
        row["status"] = "resolved"
        row["resolution"] = "Replaced the file"
        row["resolvedAt"] = "2026-09-27T10:00:00.000Z"
        var strange = row
        strange["id"] = UUID().uuidString
        strange["kind"] = "smell"
        strange["status"] = "archived"
        strange["resolution"] = NSNull()
        json["results"] = [row, strange]
        json.removeValue(forKey: "kinds")

        let list = try decode(API.IssueList.self, json)
        XCTAssertTrue(list.kinds.isEmpty, "An absent kinds list decodes as empty")
        XCTAssertEqual(list.fixed.count, 1)
        XCTAssertTrue(list.open.isEmpty, "An unknown status is neither open nor fixed")
        XCTAssertEqual(list.results[0].fixedLine, "Fixed: Replaced the file")
        XCTAssertNotNil(list.results[0].resolvedAt)
        XCTAssertEqual(list.results[1].kind, .unknown("smell"))
        XCTAssertEqual(list.results[1].status, .unknown("archived"))
    }

    func testTitleViewerCanReport() throws {
        let detail = try decode(API.TitleDetail.self, fixture("title-detail"))
        XCTAssertEqual(detail.viewer.canReport, false)
        XCTAssertEqual(detail.viewer.openReports, 0)
        XCTAssertFalse(detail.viewer.showsReportProblem)

        let reportable = try decode(API.TitleStatus.self, withViewer("title-status") {
            $0["canReport"] = true
            $0["openReports"] = 2
        })
        XCTAssertTrue(reportable.viewer.showsReportProblem)
        XCTAssertEqual(detail.updating(reportable).viewer.openReports, 2)
    }

    func testOlderServerWithoutProblemReportsDecodes() throws {
        let old: (inout [String: Any]) -> Void = {
            $0.removeValue(forKey: "canReport")
            $0.removeValue(forKey: "openReports")
        }
        let detail = try decode(API.TitleDetail.self, withViewer("title-detail", old))
        XCTAssertNil(detail.viewer.canReport)
        XCTAssertNil(detail.viewer.openReports)
        XCTAssertFalse(detail.viewer.showsReportProblem, "No report button against an older server")
        let status = try decode(API.TitleStatus.self, withViewer("title-status", old))
        XCTAssertNil(status.viewer.canReport)

        var badges = try fixture("badges")
        badges.removeValue(forKey: "openIssues")
        let oldBadges = try decode(API.Badges.self, badges)
        XCTAssertNil(oldBadges.openIssues)
        XCTAssertEqual(oldBadges.requestsPageCount, oldBadges.pendingRequests)
    }

    func testBadgesCountOpenIssuesOnTheRequestsPage() throws {
        let badges = try decode(API.Badges.self, fixture("badges"))
        XCTAssertEqual(badges.pendingRequests, 1)
        XCTAssertEqual(badges.openIssues, 1)
        XCTAssertEqual(badges.requestsPageCount, 2)
        XCTAssertEqual(API.Badges(unreadNotifications: 0, pendingRequests: 0, openIssues: 3).requestsPageCount, 3)
        XCTAssertEqual(API.Badges.zero.requestsPageCount, 0)
    }

    func testNotificationEventTypes() {
        XCTAssertEqual(API.NotificationEventType(rawValue: "issue_reported"), .issueReported)
        XCTAssertEqual(API.NotificationEventType(rawValue: "issue_resolved"), .issueResolved)
        XCTAssertEqual(API.NotificationEventType.issueReported.emoji, "⚠️")
        XCTAssertEqual(API.NotificationEventType.issueResolved.emoji, "🛠️")
        for type in API.NotificationEventType.knownCases {
            XCTAssertEqual(API.NotificationEventType(rawValue: type.rawValue), type)
        }
        let future = API.NotificationEventType(rawValue: "something_new")
        XCTAssertEqual(future, .unknown("something_new"))
        XCTAssertFalse(future.isKnown)
        XCTAssertEqual(future.emoji, "🔔")
    }

    // MARK: Request bodies

    func testReportBodyMatchesTheDocExample() throws {
        let report = API.IssueReport(kind: .audio, message: "Out of sync after 20 minutes", seasonNumber: 2, episodeNumber: 5)
        let sent = try JSONSerialization.jsonObject(with: APIClient.encoder.encode(report)) as? NSDictionary
        let doc = try JSONSerialization.jsonObject(with: fixtureData("issue-report-body")) as? NSDictionary
        XCTAssertEqual(sent, doc)
        XCTAssertEqual(try decode(API.IssueReport.self, fixture("issue-report-body")), report)
    }

    func testReportBodyLeavesOutWhatWasntGiven() throws {
        func json(_ report: API.IssueReport) throws -> NSDictionary {
            try XCTUnwrap(JSONSerialization.jsonObject(with: APIClient.encoder.encode(report)) as? NSDictionary)
        }
        XCTAssertEqual(try json(API.IssueReport(kind: .wontPlay)), ["kind": "wont_play"])
        XCTAssertEqual(try json(API.IssueReport(kind: .video, message: "   ")), ["kind": "video"], "A blank note isn't sent")
        XCTAssertEqual(
            try json(API.IssueReport(kind: .subtitles, episodeNumber: 3)), ["kind": "subtitles"],
            "An episode needs its season"
        )
        XCTAssertEqual(try json(API.IssueReport(kind: .other, message: "Hm", seasonNumber: 0)), ["kind": "other", "message": "Hm", "seasonNumber": 0])
    }

    func testResolveSendsTheNoteOnlyWhenThereIsOne() async throws {
        let ok = try fixtureData("ok")
        StubURLProtocol.handler = { _ in (200, StubURLProtocol.apiHeaders, ok) }
        let client = APIClient(baseURL: URL(string: "http://127.0.0.1:3000")!, token: "mqt_test", session: StubURLProtocol.session())
        let api = MarqueeAPI(client: client)

        for note in [nil, "", "  "] as [String?] {
            StubURLProtocol.requests = []
            try await api.issues.resolve(Self.issueId, note: note)
            let sent = try XCTUnwrap(StubURLProtocol.requests.first)
            XCTAssertEqual(sent.httpMethod, "POST")
            XCTAssertEqual(sent.url?.path, "/api/v1/issues/83bedf64-c5d8-4f43-98a0-bb615c4b9897/resolve")
            XCTAssertNil(sent.httpBody, "No note, no body")
            XCTAssertNil(sent.httpBodyStream, "No note, no body")
        }
    }

    func testMutationsSignalTheRequestsPage() async throws {
        let ok = try fixtureData("ok")
        StubURLProtocol.handler = { _ in (200, StubURLProtocol.apiHeaders, ok) }
        let client = APIClient(baseURL: URL(string: "http://127.0.0.1:3000")!, token: "mqt_test", session: StubURLProtocol.session())
        let events = ServerEvents()
        let api = MarqueeAPI(client: client, events: events)
        let calls: [(MarqueeAPI) async throws -> Void] = [
            { try await $0.issues.report(.movie, id: 603, API.IssueReport(kind: .video)) },
            { try await $0.issues.resolve(Self.issueId) },
            { try await $0.issues.delete(Self.issueId) },
        ]
        for call in calls {
            let before = events.revision(of: .requests)
            try await call(api)
            XCTAssertNotEqual(events.revision(of: .requests), before)
        }
    }

    func testOlderServerAnswers404ForIssues() async throws {
        StubURLProtocol.handler = { _ in StubURLProtocol.json(404, #"{"error":"Not found.","code":"not_found"}"#) }
        let client = APIClient(baseURL: URL(string: "http://127.0.0.1:3000")!, token: "mqt_test", session: StubURLProtocol.session())
        do {
            _ = try await MarqueeAPI(client: client).issues.list()
            XCTFail("Expected notFound")
        } catch let error as APIError {
            XCTAssertEqual(error, .notFound, "The Requests page hides the section on this")
        }
    }

    func testRateLimitShowsTheServersMessage() async throws {
        let message = "That's a lot of reports in a short time. Try again in a while."
        StubURLProtocol.handler = { _ in StubURLProtocol.json(429, #"{"error":"\#(message)","code":"rate_limited"}"#) }
        let client = APIClient(baseURL: URL(string: "http://127.0.0.1:3000")!, token: "mqt_test", session: StubURLProtocol.session())
        do {
            try await MarqueeAPI(client: client).issues.report(.movie, id: 603, API.IssueReport(kind: .audio))
            XCTFail("Expected rateLimited")
        } catch let error as APIError {
            XCTAssertEqual(error.localizedDescription, message)
        }
    }

    // MARK: The report form

    func testReportFormRules() {
        var form = ProblemReportForm()
        XCTAssertEqual(form.report(), .failure(ProblemReportError("Pick what's wrong.")))
        XCTAssertEqual(form.messageLabel, "Anything else? (optional)")

        form.kind = .other
        XCTAssertEqual(form.messageLabel, "What's wrong?")
        XCTAssertEqual(form.report(), .failure(ProblemReportError("Say what's wrong.")))
        form.message = "  The menu is in French  "
        XCTAssertEqual(form.report(), .success(API.IssueReport(kind: .other, message: "The menu is in French")))

        form.kind = .audio
        form.message = ""
        form.episode = "4"
        XCTAssertEqual(form.report(), .success(API.IssueReport(kind: .audio)), "No season: the episode is ignored")
        form.season = 2
        XCTAssertEqual(form.report(), .success(API.IssueReport(kind: .audio, seasonNumber: 2, episodeNumber: 4)))
        form.episode = "four"
        XCTAssertEqual(form.report(), .failure(ProblemReportError("Season and episode are whole numbers.")))
        form.episode = ""
        XCTAssertEqual(form.report(), .success(API.IssueReport(kind: .audio, seasonNumber: 2)))

        form.message = String(repeating: "a", count: 1001)
        XCTAssertEqual(form.report(), .failure(ProblemReportError("Keep it under 1000 characters.")))
    }
}
