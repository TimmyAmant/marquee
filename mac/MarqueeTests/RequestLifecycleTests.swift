import XCTest
@testable import Marquee

// The request lifecycle and conversations (0.46+, deviation 16): the new
// fields on the request, issue, badge, notification and title DTOs — decoded
// from the doc fixtures and from an older server that leaves them all out —
// the Edit sheet's choices, and the comment thread's model against a stub.

@MainActor
final class RequestLifecycleTests: XCTestCase {
    private static let server = URL(string: "http://192.168.1.10:3000")!
    private static let requestId = UUID(uuidString: "5b0f1d8e-8a8c-4f5e-9d51-1f0c7a0e2b44")!

    override func tearDown() {
        StubURLProtocol.handler = nil
        StubURLProtocol.requests = []
        super.tearDown()
    }

    private func fixtureData(_ name: String) throws -> Data {
        try Data(contentsOf: Bundle(for: Self.self).resourceURL!.appendingPathComponent("Fixtures/api/\(name).json"))
    }

    private func fixture(_ name: String) throws -> [String: Any] {
        try XCTUnwrap(JSONSerialization.jsonObject(with: fixtureData(name)) as? [String: Any])
    }

    private func decode<T: Decodable>(_ type: T.Type, _ object: Any) throws -> T {
        try APIClient.decoder.decode(type, from: JSONSerialization.data(withJSONObject: object))
    }

    /// The fixture with `keys` removed from every row of its `results`.
    private func withoutKeys(_ name: String, _ keys: [String]) throws -> [String: Any] {
        var json = try fixture(name)
        let rows = try XCTUnwrap(json["results"] as? [[String: Any]])
        json["results"] = rows.map { row in row.filter { !keys.contains($0.key) } }
        return json
    }

    private func stubbedAPI() -> MarqueeAPI {
        MarqueeAPI(client: APIClient(baseURL: Self.server, token: "mqt_test", session: StubURLProtocol.session()))
    }

    // MARK: An older server

    func testOlderServerPayloadsStillDecode() throws {
        let mine = try decode(
            API.ListResponse<API.MyRequest>.self,
            withoutKeys("requests-mine", ["canEdit", "canCancel", "editedAt", "commentCount"])
        ).results
        let pendingMine = try XCTUnwrap(mine.last)
        XCTAssertEqual(pendingMine.status, .pending)
        XCTAssertFalse(pendingMine.offersEdit, "Missing counts as no")
        XCTAssertFalse(pendingMine.offersCancel)
        XCTAssertNil(pendingMine.editedAt)
        XCTAssertFalse(pendingMine.hasConversation, "No comments on an older server")
        XCTAssertFalse(try XCTUnwrap(mine.first).showsAskInCommentsHint, "No \"ask in its comments\" without comments")

        var queue = try fixture("requests-pending")
        let queueRows = try XCTUnwrap(queue["results"] as? [[String: Any]])
        queue["results"] = queueRows.map { $0.filter { !["editedAt", "commentCount"].contains($0.key) } }
        let pending = try decode(API.PendingRequests.self, queue)
        XCTAssertTrue(pending.results.allSatisfy { !$0.wasChanged && !$0.hasConversation })

        let history = try decode(
            API.ListResponse<API.ReviewedRequest>.self,
            withoutKeys("requests-history", ["addFailed", "commentCount", "notFoundSince"])
        ).results
        XCTAssertTrue(history.allSatisfy { !$0.couldntAdd && $0.couldntAddLine == nil && $0.commentCount == nil })

        var issues = try fixture("issues")
        let issueRows = try XCTUnwrap(issues["results"] as? [[String: Any]])
        issues["results"] = issueRows.map { $0.filter { $0.key != "commentCount" } }
        XCTAssertNil(try decode(API.IssueList.self, issues).results.first?.commentCount)

        let notifications = try decode(API.NotificationList.self, withoutKeys("notifications", ["requestId", "issueId"]))
        XCTAssertTrue(notifications.results.allSatisfy { $0.requestId == nil && $0.issueId == nil })

        var badges = try fixture("badges")
        badges.removeValue(forKey: "failedRequests")
        let older = try decode(API.Badges.self, badges)
        XCTAssertNil(older.failedRequests)
        XCTAssertEqual(older.requestsPageCount, 3)

        var title = try fixture("title-detail")
        var viewer = try XCTUnwrap(title["viewer"] as? [String: Any])
        viewer.removeValue(forKey: "myRequests")
        title["viewer"] = viewer
        let detail = try decode(API.TitleDetail.self, title)
        XCTAssertNil(detail.viewer.myRequests)
        XCTAssertEqual(detail.viewer.ownRequests, [])
    }

    // MARK: New values

    func testFailedRequestsCountOnTheRequestsBadge() {
        let badges = API.Badges(unreadNotifications: 0, pendingRequests: 1, openIssues: 2, notFoundRequests: 3, failedRequests: 4)
        XCTAssertEqual(badges.requestsPageCount, 10)
    }

    func testCommentEventTypes() {
        XCTAssertEqual(API.NotificationEventType(rawValue: "request_comment"), .requestComment)
        XCTAssertEqual(API.NotificationEventType(rawValue: "issue_comment"), .issueComment)
        XCTAssertEqual(API.NotificationEventType.issueComment.rawValue, "issue_comment")
        XCTAssertEqual(API.NotificationEventType.issueComment.emoji, "💬")
        XCTAssertTrue(API.NotificationEventType.requestComment.isKnown)
    }

    func testTitlePageRequestSummary() throws {
        var title = try fixture("title-detail")
        var viewer = try XCTUnwrap(title["viewer"] as? [String: Any])
        viewer["myRequests"] = [
            [
                "id": "5b0f1d8e-8a8c-4f5e-9d51-1f0c7a0e2b44", "status": "pending", "seasons": [2], "seasonsLabel": "Season 2",
                "is4k": false, "canEdit": true, "canCancel": true, "commentCount": 0, "createdAt": "2026-09-17T17:10:02.001Z",
            ],
            [
                "id": "28713d50-27f2-4230-9c95-c1e6a000f6c0", "status": "approved", "seasons": NSNull(), "seasonsLabel": NSNull(),
                "is4k": true, "canEdit": false, "canCancel": false, "commentCount": 2, "createdAt": "2026-09-16T17:10:02.001Z",
            ],
            [
                "id": "9a7d2c11-5e3b-4f0a-8c6d-2b1e0f9a8d77", "status": "rejected", "seasons": NSNull(), "seasonsLabel": NSNull(),
                "is4k": false, "canEdit": false, "canCancel": false, "commentCount": 1, "createdAt": "2026-09-15T17:10:02.001Z",
            ],
        ]
        title["viewer"] = viewer
        let requests = try decode(API.TitleDetail.self, title).viewer.ownRequests
        XCTAssertEqual(requests.map(\.sentence), [
            "Your request (Season 2) is waiting for review",
            "Your request (In 4K) is approved",
            "Your request is declined",
        ])
        XCTAssertEqual(requests.first?.id, Self.requestId)
        XCTAssertEqual(requests.first?.canEdit, true)
        XCTAssertEqual(requests[1].commentCount, 2)
    }

    func testCommentHeaders() throws {
        let thread = try APIClient.decoder.decode(API.CommentThread.self, from: fixtureData("comment-thread"))
        let report = try XCTUnwrap(thread.results.first)
        XCTAssertEqual(report.headerParts.count, 2, "\(report.headerParts)")
        XCTAssertEqual(report.headerParts.first, "Reported", "A member has no tag; the note says what it is")
        let reply = try XCTUnwrap(thread.results.last)
        XCTAssertEqual(reply.headerParts.first, "Reviewer")
        XCTAssertEqual(reply.headerParts.last, "edited")
        XCTAssertEqual(API.CommentRole.admin.tag, "Admin")
        XCTAssertNil(API.CommentRole.member.tag)
        XCTAssertEqual(API.CommentKind.resolution.noteLabel, "Marked fixed")
        XCTAssertEqual(API.CommentKind.declined.noteLabel, "Declined")
        XCTAssertNil(API.CommentKind.comment.noteLabel)
        XCTAssertEqual(API.CommentKind(rawValue: "poll"), .unknown("poll"), "A newer kind still decodes")
        XCTAssertEqual(API.CommentParent.issue(Self.requestId).path, "/issues/5b0f1d8e-8a8c-4f5e-9d51-1f0c7a0e2b44/comments")
    }

    // MARK: The Edit sheet

    func testEditFormForAShow() throws {
        let options = try APIClient.decoder.decode(API.RequestEditOptions.self, from: fixtureData("request-edit-options"))
        var form = RequestEditForm(options)
        XCTAssertTrue(form.isTV)
        XCTAssertFalse(form.wholeSeries, "It asked for Season 2 only")
        XCTAssertFalse(form.fourK)
        XCTAssertEqual(form.selection.seasons, [2], "The request's own season starts ticked")
        XCTAssertEqual(form.selection.requestable, [2], "Season 1 is in the library")
        XCTAssertFalse(form.listDisabled)
        XCTAssertTrue(form.canSave)
        XCTAssertEqual(form.edit, API.RequestEdit(seasons: .seasons([2]), is4k: false))
        XCTAssertEqual(form.fourKLabel, "In 4K (always the whole show)")

        form.selection.set(2, false)
        XCTAssertFalse(form.canSave, "Just these seasons needs a season")

        form.wholeSeries = true
        XCTAssertTrue(form.listDisabled)
        XCTAssertTrue(form.canSave)
        XCTAssertEqual(form.edit, API.RequestEdit(seasons: .wholeSeries, is4k: false))

        form.wholeSeries = false
        form.fourK = true
        XCTAssertTrue(form.canSave, "4K is always the whole show")
        XCTAssertEqual(form.edit, API.RequestEdit(seasons: .wholeSeries, is4k: true))
    }

    func testEditFormForAWholeSeriesStartsOnWholeSeries() throws {
        var json = try fixture("request-edit-options")
        json["seasons"] = NSNull()
        json["is4k"] = true
        let form = RequestEditForm(try decode(API.RequestEditOptions.self, json))
        XCTAssertTrue(form.wholeSeries)
        XCTAssertTrue(form.fourK)
        XCTAssertEqual(form.selection.seasons, [])
        XCTAssertEqual(form.edit, API.RequestEdit(seasons: .wholeSeries, is4k: true))
    }

    func testEditFormForAMovie() throws {
        var json = try fixture("request-edit-options")
        json["mediaType"] = "movie"
        json["seasons"] = NSNull()
        json["seasonRows"] = []
        var form = RequestEditForm(try decode(API.RequestEditOptions.self, json))
        XCTAssertFalse(form.isTV)
        XCTAssertTrue(form.canSave)
        XCTAssertEqual(form.fourKLabel, "In 4K")
        form.fourK = true
        XCTAssertEqual(form.edit, API.RequestEdit(seasons: .unchanged, is4k: true), "A movie sends no seasons")

        json["fourKAvailable"] = false
        let noFourK = RequestEditForm(try decode(API.RequestEditOptions.self, json))
        XCTAssertFalse(noFourK.hasAnythingToChange)
        XCTAssertFalse(noFourK.canSave, "Nothing to change without 4K")
    }

    // MARK: The comment thread

    func testThreadLoadsSendsEditsAndDeletes() async throws {
        let thread = String(decoding: try fixtureData("comment-thread"), as: UTF8.self)
        StubURLProtocol.handler = { request in
            if request.httpMethod == "GET" { return StubURLProtocol.json(200, thread) }
            if request.httpMethod == "POST" { return StubURLProtocol.json(200, #"{"ok":true,"commentId":"c1"}"#) }
            return StubURLProtocol.json(200, #"{"ok":true}"#)
        }
        let api = stubbedAPI()
        let model = CommentThreadModel(parent: .issue(Self.requestId))
        XCTAssertNil(model.commentCount)
        XCTAssertFalse(model.canSend)

        await model.load(api)
        XCTAssertEqual(model.comments.count, 2)
        XCTAssertEqual(model.commentCount, 1)
        XCTAssertTrue(model.canComment)
        XCTAssertEqual(model.maxLength, 2000)

        model.draft = "   "
        XCTAssertFalse(model.canSend, "Nothing to send yet")
        model.draft = "Season 2, episode 5"
        XCTAssertTrue(model.canSend)
        StubURLProtocol.requests = []
        await model.send(api)
        XCTAssertEqual(model.draft, "", "The box clears once it's sent")
        XCTAssertNil(model.sendError)
        XCTAssertEqual(StubURLProtocol.requests.map { "\($0.httpMethod!) \($0.url!.path)" }, [
            "POST /api/v1/issues/5b0f1d8e-8a8c-4f5e-9d51-1f0c7a0e2b44/comments",
            "GET /api/v1/issues/5b0f1d8e-8a8c-4f5e-9d51-1f0c7a0e2b44/comments",
        ], "Sends, then reloads")

        let reply = try XCTUnwrap(model.comments.last)
        model.startEditing(reply)
        XCTAssertNil(model.editingId, "Only an editable comment can be edited")

        let mine = API.Comment(
            id: "c1", kind: .comment,
            author: API.CommentAuthor(userId: nil, label: "Member", avatarUrl: nil, role: .member),
            body: "Season 2", createdAt: Date(), editedAt: nil, isMine: true, canEdit: true, canDelete: true, editableUntil: Date()
        )
        model.startEditing(mine)
        XCTAssertEqual(model.editingId, "c1")
        XCTAssertEqual(model.editDraft, "Season 2")
        model.editDraft = "Season 2, episode 6"
        StubURLProtocol.requests = []
        await model.saveEdit(api)
        XCTAssertNil(model.editingId)
        XCTAssertEqual(StubURLProtocol.requests.first?.httpMethod, "PATCH")
        XCTAssertEqual(StubURLProtocol.requests.first?.url?.path, "/api/v1/issues/5b0f1d8e-8a8c-4f5e-9d51-1f0c7a0e2b44/comments/c1")

        StubURLProtocol.requests = []
        await model.delete(mine, api)
        XCTAssertEqual(StubURLProtocol.requests.first?.httpMethod, "DELETE")
        XCTAssertEqual(StubURLProtocol.requests.first?.url?.path, "/api/v1/issues/5b0f1d8e-8a8c-4f5e-9d51-1f0c7a0e2b44/comments/c1")
        XCTAssertNil(model.commentErrors["c1"])
    }

    func testThreadShowsTheServersErrors() async throws {
        let thread = String(decoding: try fixtureData("comment-thread"), as: UTF8.self)
        let full = "This conversation is full."
        let late = "Comments can only be changed for 15 minutes after posting."
        StubURLProtocol.handler = { request in
            switch request.httpMethod {
            case "GET": return StubURLProtocol.json(200, thread)
            case "POST": return StubURLProtocol.json(409, #"{"error":"\#(full)","code":"conflict"}"#)
            default: return StubURLProtocol.json(403, #"{"error":"\#(late)","code":"forbidden"}"#)
            }
        }
        let api = stubbedAPI()
        let model = CommentThreadModel(parent: .request(Self.requestId))
        await model.load(api)
        model.draft = "One more"
        await model.send(api)
        XCTAssertEqual(model.sendError, full)
        XCTAssertEqual(model.draft, "One more", "A failed send keeps the text")

        let mine = API.Comment(
            id: "c2", kind: .comment,
            author: API.CommentAuthor(userId: nil, label: "Member", avatarUrl: nil, role: nil),
            body: "Hi", createdAt: Date(), editedAt: nil, isMine: true, canEdit: true, canDelete: true, editableUntil: nil
        )
        model.startEditing(mine)
        model.editDraft = "Hello"
        await model.saveEdit(api)
        XCTAssertEqual(model.commentErrors["c2"], late)
        XCTAssertEqual(model.editingId, "c2", "Still editing after a failed save")
    }

    func testThreadFromAnOlderServer() async {
        StubURLProtocol.handler = { _ in StubURLProtocol.json(404, #"{"error":"Not found.","code":"not_found"}"#) }
        let model = CommentThreadModel(parent: .request(Self.requestId))
        await model.load(stubbedAPI())
        XCTAssertNil(model.commentCount)
        XCTAssertNotNil(model.loadError)
        XCTAssertFalse(model.canComment)
    }

    func testDraftIsClampedAndCounted() {
        let model = CommentThreadModel(parent: .request(Self.requestId))
        XCTAssertNil(model.remainingLabel)
        model.draft = String(repeating: "a", count: 2100)
        XCTAssertEqual(model.draft.count, 2000, "Cut at the limit as it's typed")
        XCTAssertEqual(model.remainingLabel, "0 left")
        model.draft = String(repeating: "a", count: 1850)
        XCTAssertEqual(model.remainingLabel, "150 left")
        model.draft = String(repeating: "a", count: 1800)
        XCTAssertNil(model.remainingLabel)
        XCTAssertEqual(CommentThreadModel.clamp(String(repeating: "é", count: 5), to: 3).unicodeScalars.count, 3)
    }

    func testToggleLabels() {
        XCTAssertEqual(CommentThreadModel.toggleLabel(count: 0, isOpen: false), "Comment")
        XCTAssertEqual(CommentThreadModel.toggleLabel(count: 2, isOpen: false), "Comments (2)")
        XCTAssertEqual(CommentThreadModel.toggleLabel(count: 2, isOpen: true), "Hide comments")
    }
}
