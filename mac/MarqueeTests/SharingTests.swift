import XCTest
@testable import Marquee

// Sharing a title (0.45+): `GET /users/shareable`, the share body, the
// `title_shared` notification (and one from an older server without its
// fields), the links handed out, and the Share dialog's model against a
// stubbed server.

@MainActor
final class SharingTests: XCTestCase {
    private static let kid = UUID(uuidString: "83C55A49-6153-4CB9-AE22-4A42D48F4CF3")!
    private static let server = URL(string: "http://192.168.1.10:3000")!

    private func fixtureData(_ name: String) throws -> Data {
        try Data(contentsOf: Bundle(for: Self.self).resourceURL!.appendingPathComponent("Fixtures/api/\(name).json"))
    }

    private func decode<T: Decodable>(_ type: T.Type, _ name: String) throws -> T {
        try APIClient.decoder.decode(type, from: fixtureData(name))
    }

    override func tearDown() {
        StubURLProtocol.handler = nil
        StubURLProtocol.requests = []
        super.tearDown()
    }

    // MARK: Decoding

    func testShareableUsersFixture() throws {
        let list = try decode(API.ShareableUsers.self, "users-shareable")
        XCTAssertEqual(list.publicUrl, "https://marquee.example.com")
        let kid = try XCTUnwrap(list.results.first)
        XCTAssertEqual(kid.id, Self.kid)
        XCTAssertEqual(kid.label, "Kid")
        XCTAssertEqual(kid.username, "member1")
        XCTAssertNil(kid.avatarUrl)
    }

    func testShareBodyMatchesTheDoc() throws {
        let body = API.ShareTitleRequest(userIds: [Self.kid], note: "You'd love this one")
        XCTAssertEqual(body, try decode(API.ShareTitleRequest.self, "share-title-body"))
        // No note: the key is left out rather than sent as null.
        let bare = String(decoding: try APIClient.encoder.encode(API.ShareTitleRequest(userIds: [Self.kid])), as: UTF8.self)
        XCTAssertEqual(bare, #"{"userIds":["83c55a49-6153-4cb9-ae22-4a42d48f4cf3"]}"#)
    }

    func testTitleSharedNotification() throws {
        let list = try decode(API.NotificationList.self, "notifications")
        XCTAssertEqual(list.results.count, 2)

        let declined = list.results[0]
        XCTAssertEqual(declined.eventType, .requestRejected)
        XCTAssertNil(declined.sharedBy)
        XCTAssertNil(declined.note)
        XCTAssertEqual(declined.bannerTitle, "The Matrix")

        let shared = list.results[1]
        XCTAssertEqual(shared.eventType, .titleShared)
        XCTAssertEqual(shared.titleID, API.TitleID(.movie, 425))
        XCTAssertEqual(shared.note, "You'd love this one")
        XCTAssertEqual(shared.bannerTitle, "Shared with you")
        let sender = try XCTUnwrap(shared.sharedBy)
        XCTAssertEqual(sender.label, "Susan")
        XCTAssertEqual(sender.userId, Self.kid)
        XCTAssertEqual(sender.avatarUrl, "/api/v1/users/83c55a49-6153-4cb9-ae22-4a42d48f4cf3/avatar?v=1758220800000")

        // Mark all read keeps who sent it and the note.
        let read = shared.markedRead()
        XCTAssertTrue(read.read)
        XCTAssertEqual(read.sharedBy, sender)
        XCTAssertEqual(read.note, shared.note)
    }

    /// A server before 0.45 leaves `sharedBy` and `note` out altogether.
    func testNotificationFromOlderServerDecodesWithoutShareFields() throws {
        let json = #"""
        {"id":"bedcb20b-fa30-4683-b000-42affc320087","mediaType":"movie","tmdbId":603,"title":"The Matrix",
         "eventType":"downloaded","message":"\"The Matrix\" finished downloading","read":false,
         "createdAt":"2026-09-17T17:12:41.470Z"}
        """#
        let item = try APIClient.decoder.decode(API.NotificationItem.self, from: Data(json.utf8))
        XCTAssertEqual(item.eventType, .downloaded)
        XCTAssertNil(item.sharedBy)
        XCTAssertNil(item.note)
    }

    func testTitleSharedEventType() {
        XCTAssertEqual(API.NotificationEventType(rawValue: "title_shared"), .titleShared)
        XCTAssertEqual(API.NotificationEventType.titleShared.rawValue, "title_shared")
        XCTAssertEqual(API.NotificationEventType.titleShared.emoji, "📨")
        XCTAssertTrue(API.NotificationEventType.titleShared.isKnown)
    }

    // MARK: Links

    func testTitleLinksUseThePublicAddress() {
        let links = ShareLinks.title(API.TitleID(.movie, 603), imdbId: "tt0133093", publicUrl: "https://marquee.example.com", server: Self.server)
        XCTAssertEqual(links.kinds, [.marquee, .tmdb, .imdb])
        XCTAssertEqual(links.url(for: .marquee)?.absoluteString, "https://marquee.example.com/title/movie/603")
        XCTAssertEqual(links.url(for: .tmdb)?.absoluteString, "https://www.themoviedb.org/movie/603")
        XCTAssertEqual(links.url(for: .imdb)?.absoluteString, "https://www.imdb.com/title/tt0133093/")
    }

    func testTitleLinksFallBackToTheConnectedServerAndSkipIMDb() {
        let links = ShareLinks.title(API.TitleID(.tv, 1399), imdbId: nil, publicUrl: nil, server: Self.server)
        XCTAssertEqual(links.kinds, [.marquee, .tmdb], "No IMDb id, no IMDb link")
        XCTAssertEqual(links.url(for: .marquee)?.absoluteString, "http://192.168.1.10:3000/title/tv/1399")
        XCTAssertEqual(links.url(for: .tmdb)?.absoluteString, "https://www.themoviedb.org/tv/1399")
        XCTAssertNil(links.url(for: .imdb))

        // A blank or unusable public address counts as none.
        XCTAssertEqual(ShareLinks.base(publicUrl: "  ", server: Self.server), Self.server)
        XCTAssertEqual(ShareLinks.base(publicUrl: "not a url", server: Self.server), Self.server)
        // No address at all: only the public pages.
        XCTAssertEqual(ShareLinks.title(API.TitleID(.movie, 603), imdbId: "", publicUrl: nil, server: nil).kinds, [.tmdb])
    }

    func testPersonLinks() {
        let links = ShareLinks.person(6384, server: Self.server)
        XCTAssertEqual(links.kinds, [.marquee, .tmdb])
        XCTAssertEqual(links.url(for: .marquee)?.absoluteString, "http://192.168.1.10:3000/person/6384")
        XCTAssertEqual(links.url(for: .tmdb)?.absoluteString, "https://www.themoviedb.org/person/6384")
    }

    // MARK: The dialog's model

    private func makeModel(imdbId: String? = "tt0133093") -> ShareTitleModel {
        ShareTitleModel(titleID: API.TitleID(.movie, 425), titleName: "Ice Age", imdbId: imdbId, serverURL: Self.server)
    }

    private func stubbedAPI() -> MarqueeAPI {
        let client = APIClient(baseURL: Self.server, token: "mqt_test", session: StubURLProtocol.session())
        return MarqueeAPI(client: client)
    }

    private static func user(_ id: String, _ label: String) -> String {
        #"{"userId":"\#(id)","displayName":"\#(label)","username":"\#(label.lowercased())","label":"\#(label)","avatarUrl":null}"#
    }

    func testNoteIsClampedTrimmedAndCounted() {
        let share = makeModel()
        XCTAssertNil(share.trimmedNote)
        XCTAssertNil(share.noteCountLabel)
        share.note = "  You'd love this one \n"
        XCTAssertEqual(share.trimmedNote, "You'd love this one")
        share.note = "   "
        XCTAssertNil(share.trimmedNote, "A blank note sends none")

        share.note = String(repeating: "a", count: 300)
        XCTAssertEqual(share.note.count, 280, "Cut at 280 as it's typed")
        XCTAssertEqual(share.noteCountLabel, "280/280")
        share.note = String(repeating: "a", count: 239)
        XCTAssertNil(share.noteCountLabel)
        share.note = String(repeating: "a", count: 240)
        XCTAssertEqual(share.noteCountLabel, "240/280")
        // Counted in code points, like the server.
        XCTAssertEqual(ShareTitleModel.clamp(String(repeating: "é", count: 281)).unicodeScalars.count, 280)
    }

    func testSentMessage() {
        let kid = API.ShareableUser(userId: Self.kid, displayName: "Kid", username: "member1", label: "Kid")
        XCTAssertEqual(ShareTitleModel.sentMessage(recipients: [kid], count: 1), "Sent to Kid.")
        XCTAssertEqual(ShareTitleModel.sentMessage(recipients: [kid, kid, kid], count: 3), "Sent to 3 people.")
    }

    func testLoadSelectAndSend() async throws {
        let susan = "5d1e0c37-2a4b-4f9e-9a51-7c3f0b6e8d21"
        let listBody = #"{"results":[\#(Self.user("83c55a49-6153-4cb9-ae22-4a42d48f4cf3", "Kid")),\#(Self.user(susan, "Susan"))],"publicUrl":null}"#
        StubURLProtocol.handler = { request in
            if request.url?.path == "/api/v1/users/shareable" { return StubURLProtocol.json(200, listBody) }
            return StubURLProtocol.json(200, #"{"ok":true,"sharedWith":2}"#)
        }
        let api = stubbedAPI()
        let share = makeModel(imdbId: nil)
        XCTAssertFalse(share.canSend)

        await share.load(api)
        guard case let .loaded(users) = share.members else { return XCTFail("\(share.members)") }
        XCTAssertEqual(users.map(\.label), ["Kid", "Susan"])
        // No public address: the Marquee link is on this Mac's server, and no IMDb.
        XCTAssertEqual(share.linkKinds, [.marquee, .tmdb])
        XCTAssertEqual(share.linkURL?.absoluteString, "http://192.168.1.10:3000/title/movie/425")
        share.linkKind = .imdb
        XCTAssertEqual(share.linkURL?.absoluteString, "http://192.168.1.10:3000/title/movie/425", "An unavailable kind falls back to the first")
        share.linkKind = .tmdb
        XCTAssertEqual(share.linkURL?.absoluteString, "https://www.themoviedb.org/movie/425")

        XCTAssertFalse(share.canSend, "Nobody picked yet")
        share.toggle(users[0])
        share.toggle(users[1])
        XCTAssertTrue(share.isSelected(users[1]))
        share.toggle(users[1])
        XCTAssertFalse(share.isSelected(users[1]))
        share.toggle(users[1])
        XCTAssertTrue(share.canSend)
        share.note = " Watch it tonight "

        StubURLProtocol.requests = []
        await share.send(api)
        XCTAssertEqual(share.sendState, .sent("Sent to 2 people."))
        XCTAssertTrue(share.recipients.isEmpty, "The picks clear once it's sent")
        XCTAssertEqual(share.note, "")

        let request = try XCTUnwrap(StubURLProtocol.requests.last)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.url?.path, "/api/v1/titles/movie/425/share")
        let body = try XCTUnwrap(JSONSerialization.jsonObject(with: Self.body(of: request)) as? [String: Any])
        XCTAssertEqual(body["userIds"] as? [String], ["83c55a49-6153-4cb9-ae22-4a42d48f4cf3", susan])
        XCTAssertEqual(body["note"] as? String, "Watch it tonight")
    }

    func testPublicAddressAndOneRecipient() async throws {
        let listBody = #"{"results":[\#(Self.user("83c55a49-6153-4cb9-ae22-4a42d48f4cf3", "Kid"))],"publicUrl":"https://marquee.example.com"}"#
        StubURLProtocol.handler = { request in
            if request.url?.path == "/api/v1/users/shareable" { return StubURLProtocol.json(200, listBody) }
            return StubURLProtocol.json(200, #"{"ok":true,"sharedWith":1}"#)
        }
        let api = stubbedAPI()
        let share = makeModel()
        await share.load(api)
        XCTAssertEqual(share.linkKinds, [.marquee, .tmdb, .imdb])
        XCTAssertEqual(share.linkURL?.absoluteString, "https://marquee.example.com/title/movie/425")

        share.toggle(try XCTUnwrap(Self.users(share).first))
        await share.send(api)
        XCTAssertEqual(share.sendState, .sent("Sent to Kid."))
    }

    func testServerErrorIsShownAsItsMessage() async throws {
        let listBody = #"{"results":[\#(Self.user("83c55a49-6153-4cb9-ae22-4a42d48f4cf3", "Kid"))],"publicUrl":null}"#
        let limited = "That's a lot of sharing in a short time. Try again in a while."
        StubURLProtocol.handler = { request in
            if request.url?.path == "/api/v1/users/shareable" { return StubURLProtocol.json(200, listBody) }
            return StubURLProtocol.json(429, #"{"error":"\#(limited)","code":"rate_limited"}"#)
        }
        let api = stubbedAPI()
        let share = makeModel()
        await share.load(api)
        share.toggle(try XCTUnwrap(Self.users(share).first))
        share.note = "Tonight?"
        await share.send(api)
        XCTAssertEqual(share.sendState, .failed(limited))
        XCTAssertEqual(share.recipients.count, 1, "A failed send keeps the picks")
        XCTAssertEqual(share.note, "Tonight?", "…and the note")
        XCTAssertTrue(share.canSend, "Send can be tried again")
    }

    func testEmptyHouseholdAndOlderServer() async {
        StubURLProtocol.handler = { _ in StubURLProtocol.json(200, #"{"results":[],"publicUrl":null}"#) }
        let alone = makeModel()
        await alone.load(stubbedAPI())
        XCTAssertEqual(alone.members, .loaded([]))
        XCTAssertFalse(alone.canSend)

        StubURLProtocol.handler = { _ in StubURLProtocol.json(404, #"{"error":"Not found.","code":"not_found"}"#) }
        let older = makeModel()
        await older.load(stubbedAPI())
        guard case .unavailable = older.members else { return XCTFail("\(older.members)") }
        XCTAssertFalse(older.canSend)
        XCTAssertEqual(older.linkKinds, [.marquee, .tmdb, .imdb], "Links still work without the list")
    }

    /// The household list once it has loaded.
    private static func users(_ share: ShareTitleModel) -> [API.ShareableUser] {
        if case let .loaded(users) = share.members { return users }
        return []
    }

    private static func body(of request: URLRequest) -> Data {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return Data() }
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            if count <= 0 { break }
            data.append(buffer, count: count)
        }
        return data
    }
}
