import XCTest
@testable import Marquee

// Sign in with Plex / Jellyfin, linked accounts and member import: decoding
// with the new fields present and absent (older servers), the request each
// call sends, and the Plex poll loop against a stubbed server.

final class MediaSignInDecodingTests: XCTestCase {
    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try APIClient.decoder.decode(type, from: Data(json.utf8))
    }

    private static let userBase = #""id":"6f1c2a4e-8b1d-4c3e-9f0a-2b7d5e8c1a90","username":"timmy","displayName":"Timmy","role":"member","libraryOwnerId":"6f1c2a4e-8b1d-4c3e-9f0a-2b7d5e8c1a90""#
    private static let memberBase = #""id":"6f1c2a4e-8b1d-4c3e-9f0a-2b7d5e8c1a90","username":"sam","displayName":null,"role":"member","autoApproveMovies":false,"autoApproveTv":false,"createdAt":"2026-09-01T12:00:00.000Z","isCurrentUser":false"#

    func testServerInfoSignInMethods() throws {
        let info = try decode(ServerInfo.self, #"{"app":"marquee","apiVersion":1,"version":"0.33.0","setupComplete":true,"status":"ok","signIn":{"password":true,"plex":true,"jellyfin":false}}"#)
        XCTAssertEqual(info.signIn, SignInMethods(password: true, plex: true, jellyfin: false))
        XCTAssertTrue(info.offersPlexSignIn)
        XCTAssertFalse(info.offersJellyfinSignIn)

        let jellyfinOnly = try decode(ServerInfo.self, #"{"app":"marquee","apiVersion":1,"version":"0.33.0","setupComplete":true,"status":"ok","signIn":{"jellyfin":true}}"#)
        XCTAssertEqual(jellyfinOnly.signIn, SignInMethods(password: true, plex: false, jellyfin: true))
        XCTAssertTrue(jellyfinOnly.offersJellyfinSignIn)
    }

    func testJellyfinNameDefaultsToJellyfin() throws {
        // Before 0.40 there's no `jellyfinName`: it's Jellyfin.
        let older = try decode(ServerInfo.self, #"{"app":"marquee","apiVersion":1,"version":"0.39.0","setupComplete":true,"status":"ok","signIn":{"password":true,"plex":false,"jellyfin":true}}"#)
        XCTAssertEqual(older.signIn?.jellyfinName, "Jellyfin")
        XCTAssertEqual(older.jellyfinName, "Jellyfin")
        XCTAssertEqual(older.label(for: .jellyfin), "Jellyfin")

        let blank = try decode(ServerInfo.self, #"{"app":"marquee","apiVersion":1,"version":"0.40.0","setupComplete":true,"status":"ok","signIn":{"jellyfin":true,"jellyfinName":" "}}"#)
        XCTAssertEqual(blank.jellyfinName, "Jellyfin")

        let noSignIn = try decode(ServerInfo.self, #"{"app":"marquee","apiVersion":1,"version":"0.32.0","setupComplete":true,"status":"ok"}"#)
        XCTAssertEqual(noSignIn.jellyfinName, "Jellyfin")
        let none: ServerInfo? = nil
        XCTAssertEqual(none.jellyfinName, "Jellyfin")
        XCTAssertEqual(none.label(for: .plex), "Plex")
    }

    func testEmbyServerIsCalledEmby() throws {
        let info = try decode(ServerInfo.self, #"{"app":"marquee","apiVersion":1,"version":"0.40.0","setupComplete":true,"status":"ok","signIn":{"password":true,"plex":true,"jellyfin":true,"jellyfinName":"Emby"}}"#)
        XCTAssertEqual(info.signIn, SignInMethods(password: true, plex: true, jellyfin: true, jellyfinName: "Emby"))
        XCTAssertEqual(info.jellyfinName, "Emby")
        XCTAssertEqual(info.label(for: .jellyfin), "Emby")
        XCTAssertEqual(info.label(for: .plex), "Plex")
        XCTAssertEqual(Optional(info).label(for: .jellyfin), "Emby")
    }

    func testOlderServerInfoOffersNoNewButtons() throws {
        let info = try decode(ServerInfo.self, #"{"app":"marquee","apiVersion":1,"version":"0.32.0","setupComplete":true,"status":"ok"}"#)
        XCTAssertNil(info.signIn)
        XCTAssertFalse(info.offersPlexSignIn)
        XCTAssertFalse(info.offersJellyfinSignIn)

        // A shape this app doesn't understand hides the buttons rather than
        // failing the whole probe.
        let odd = try decode(ServerInfo.self, #"{"app":"marquee","apiVersion":1,"version":"9.0.0","setupComplete":true,"status":"ok","signIn":["plex"]}"#)
        XCTAssertNil(odd.signIn)
        XCTAssertFalse(odd.offersPlexSignIn)
    }

    func testUserLinkedAndHasPassword() throws {
        let linked = try decode(User.self, "{\(Self.userBase),\"linked\":{\"plex\":true,\"jellyfin\":false},\"hasPassword\":false}")
        XCTAssertEqual(linked.linked, LinkedAccounts(plex: true, jellyfin: false))
        XCTAssertEqual(linked.hasPassword, false)
        XCTAssertTrue(linked.linked?.isLinked(.plex) == true)
        XCTAssertFalse(linked.linked?.isLinked(.jellyfin) == true)

        let old = try decode(User.self, "{\(Self.userBase)}")
        XCTAssertNil(old.linked)
        XCTAssertNil(old.hasPassword)

        let me = try decode(API.Me.self, "{\(Self.userBase),\"autoApproveMovies\":false,\"autoApproveTv\":false,\"createdAt\":\"2026-09-01T12:00:00.000Z\",\"linked\":{\"plex\":false,\"jellyfin\":true},\"hasPassword\":true}")
        XCTAssertEqual(me.user.linked, LinkedAccounts(plex: false, jellyfin: true))
        XCTAssertEqual(me.user.hasPassword, true)
        let oldMe = try decode(API.Me.self, "{\(Self.userBase),\"autoApproveMovies\":false,\"autoApproveTv\":false,\"createdAt\":\"2026-09-01T12:00:00.000Z\"}")
        XCTAssertNil(oldMe.user.linked)
    }

    func testHouseholdMemberTags() throws {
        let member = try decode(API.HouseholdMember.self, "{\(Self.memberBase),\"linked\":{\"plex\":true,\"jellyfin\":true},\"hasPassword\":false}")
        XCTAssertEqual(member.linked, LinkedAccounts(plex: true, jellyfin: true))
        XCTAssertEqual(member.hasPassword, false)

        let old = try decode(API.HouseholdMember.self, "{\(Self.memberBase)}")
        XCTAssertNil(old.linked)
        XCTAssertNil(old.hasPassword)
    }

    /// The app only ever opens a plex.tv sign-in page over https, whatever
    /// the server sends.
    func testPlexStartOpensOnlyPlexTvOverHttps() throws {
        func url(_ authUrl: String) throws -> URL? {
            try decode(API.PlexSignInStart.self, #"{"handle":"h","authUrl":"\#(authUrl)","expiresAt":"2026-09-25T12:10:00.000Z"}"#).url
        }
        XCTAssertNotNil(try url("https://app.plex.tv/auth#?code=ABCD"))
        XCTAssertNotNil(try url("https://plex.tv/link"))
        XCTAssertNil(try url("http://app.plex.tv/auth"))
        XCTAssertNil(try url("file:///Applications/Calculator.app"))
        XCTAssertNil(try url("https://app.plex.tv.evil.example/auth"))
        XCTAssertNil(try url("https://evilplex.tv/auth"))
        XCTAssertNil(try url("marquee://title/movie/1"))

        // The admin's "Connect Plex" in Settings goes through the same check.
        func connectURL(_ authUrl: String) throws -> URL? {
            try decode(API.PlexPinStart.self, #"{"authUrl":"\#(authUrl)","pinId":1}"#).url
        }
        XCTAssertNotNil(try connectURL("https://app.plex.tv/auth#?code=ABCD"))
        XCTAssertNil(try connectURL("file:///Applications/Calculator.app"))
        XCTAssertNil(try connectURL("https://evilplex.tv/auth"))
    }

    func testPlexStartAndImportShapes() throws {
        let start = try decode(API.PlexSignInStart.self, #"{"handle":"h_123","authUrl":"https://app.plex.tv/auth#?code=ABCD","expiresAt":"2026-09-25T12:10:00.000Z"}"#)
        XCTAssertEqual(start.handle, "h_123")
        XCTAssertNotNil(start.url)
        XCTAssertEqual(start.expiresAt, APIClient.parseDate("2026-09-25T12:10:00.000Z"))

        let list = try decode(API.ListResponse<API.ImportCandidate>.self, #"""
        {"results":[
          {"id":12345,"username":"sam","displayName":"Sam","thumb":"https://plex.tv/users/abc/avatar","alreadyMember":false},
          {"id":"f3a1c2","username":"alex","displayName":null,"thumb":null,"alreadyMember":true},
          {"id":"9","username":"kim"}
        ]}
        """#)
        XCTAssertEqual(list.results.map(\.id), [.number(12345), .string("f3a1c2"), .string("9")])
        XCTAssertEqual(list.results.map(\.alreadyMember), [false, true, false])
        XCTAssertEqual(list.results[0].label, "Sam")
        XCTAssertEqual(list.results[1].label, "alex")
        XCTAssertNil(list.results[2].thumb)

        let result = try decode(API.ImportUsersResult.self, "{\"created\":[{\(Self.memberBase),\"linked\":{\"plex\":true,\"jellyfin\":false},\"hasPassword\":false}],\"skipped\":2}")
        XCTAssertEqual(result.created.count, 1)
        XCTAssertEqual(result.created[0].linked?.plex, true)
        XCTAssertEqual(result.skipped, 2)

        XCTAssertEqual(try decode(API.SignInSettings.self, #"{"mediaServerSignup":false}"#).mediaServerSignup, false)
    }

    func testIdsGoBackAsTheyCame() throws {
        let body = try APIClient.encoder.encode(API.ImportUsersRequest(ids: [.number(12345), .string("f3a1c2")]))
        XCTAssertEqual(String(decoding: body, as: UTF8.self), #"{"ids":[12345,"f3a1c2"]}"#)
    }

    func testPollSteps() throws {
        XCTAssertNil(try PlexPoll.step(status: 202, body: Data(#"{"status":"pending"}"#.utf8)))
        XCTAssertEqual(try PlexPoll.step(status: 200, body: Data("{}".utf8)), Data("{}".utf8))
        XCTAssertThrowsError(try PlexPoll.step(status: 410, body: Data())) { error in
            XCTAssertEqual(error as? MediaSignInError, .expired)
            XCTAssertEqual(error.localizedDescription, "The Plex sign-in expired. Try again.")
        }
        XCTAssertThrowsError(try PlexPoll.step(status: 403, body: Data(#"{"error":"Ask the admin to add you first.","code":"forbidden"}"#.utf8))) { error in
            XCTAssertEqual(error.localizedDescription, "Ask the admin to add you first.")
        }
        XCTAssertThrowsError(try PlexPoll.step(status: 403, body: Data("nope".utf8))) { error in
            XCTAssertEqual(error as? MediaSignInError, .refused(MediaSignInError.refusedFallback))
        }
    }
}

@MainActor
final class MediaSignInRequestTests: XCTestCase {
    private static let memberJSON = #"{"id":"6f1c2a4e-8b1d-4c3e-9f0a-2b7d5e8c1a90","username":"sam","displayName":null,"role":"member","autoApproveMovies":false,"autoApproveTv":false,"createdAt":"2026-09-01T12:00:00.000Z","isCurrentUser":false}"#
    private static let loginJSON = #"{"token":"mqt_fresh","expiresAt":"2026-12-16T12:00:00.000Z","user":{"id":"6f1c2a4e-8b1d-4c3e-9f0a-2b7d5e8c1a90","username":"timmy","displayName":"Timmy","role":"member","libraryOwnerId":"6f1c2a4e-8b1d-4c3e-9f0a-2b7d5e8c1a90"}}"#
    private static let startJSON = #"{"handle":"h_123","authUrl":"https://app.plex.tv/auth#?code=ABCD","expiresAt":"2099-01-01T00:00:00.000Z"}"#
    private static let watchlistJSON = #"{"available":true,"enabled":true,"movies":true,"tv":false,"lastSyncedAt":"2026-09-25T18:40:05.000Z","lastError":null,"requestedCount":3}"#
    private static let watchlistOffJSON = #"{"available":true,"enabled":false,"movies":true,"tv":true,"lastSyncedAt":null,"lastError":null,"requestedCount":0}"#

    private struct Case {
        let method: String
        let path: String
        var body: String?
        let response: (Int, String)
        var records = false
        let call: (MarqueeAPI) async throws -> Void
    }

    override func tearDown() {
        StubURLProtocol.handler = nil
        StubURLProtocol.requests = []
        super.tearDown()
    }

    func testEachCallSendsWhatTheContractSpecifies() async throws {
        let cases: [Case] = [
            Case(method: "POST", path: "/auth/plex/start", response: (200, Self.startJSON)) { api in
                let start = try await api.auth.plexStart()
                XCTAssertEqual(start.handle, "h_123")
            },
            Case(method: "POST", path: "/auth/plex/poll", body: #"{"handle":"h_123","deviceName":"Mac"}"#, response: (202, #"{"status":"pending"}"#)) { api in
                let answer = try await api.auth.plexPoll(handle: "h_123", deviceName: "Mac")
                XCTAssertNil(answer)
            },
            Case(method: "POST", path: "/auth/plex/poll", body: #"{"handle":"h_123","deviceName":"Mac"}"#, response: (200, Self.loginJSON)) { api in
                let answer = try await api.auth.plexPoll(handle: "h_123", deviceName: "Mac")
                XCTAssertEqual(answer?.token, "mqt_fresh")
            },
            Case(method: "POST", path: "/auth/jellyfin", body: #"{"username":"sam","password":"pw","deviceName":"Mac"}"#, response: (200, Self.loginJSON)) { api in
                let answer = try await api.auth.jellyfin(username: "sam", password: "pw", deviceName: "Mac")
                XCTAssertEqual(answer.token, "mqt_fresh")
            },
            Case(method: "POST", path: "/me/links/plex/start", response: (200, Self.startJSON)) { api in
                _ = try await api.links.plexStart()
            },
            Case(method: "POST", path: "/me/links/plex/poll", body: #"{"handle":"h_123"}"#, response: (202, #"{"status":"pending"}"#)) { api in
                let linked = try await api.links.plexPoll(handle: "h_123")
                XCTAssertFalse(linked)
            },
            Case(method: "POST", path: "/me/links/plex/poll", body: #"{"handle":"h_123"}"#, response: (200, #"{"ok":true}"#), records: true) { api in
                let linked = try await api.links.plexPoll(handle: "h_123")
                XCTAssertTrue(linked)
            },
            Case(method: "POST", path: "/me/links/jellyfin", body: #"{"username":"sam","password":"pw"}"#, response: (200, #"{"ok":true}"#), records: true) { api in
                try await api.links.jellyfin(username: "sam", password: "pw")
            },
            Case(method: "DELETE", path: "/me/links/plex", response: (200, #"{"ok":true}"#), records: true) { api in
                try await api.links.unlink(.plex)
            },
            Case(method: "DELETE", path: "/me/links/jellyfin", response: (200, #"{"ok":true}"#), records: true) { api in
                try await api.links.unlink(.jellyfin)
            },
            Case(method: "GET", path: "/me/plex-watchlist", response: (200, Self.watchlistJSON)) { api in
                let state = try await api.plexWatchlist.state()
                XCTAssertTrue(state.enabled)
            },
            Case(method: "POST", path: "/me/plex-watchlist/start", response: (200, Self.startJSON)) { api in
                let start = try await api.plexWatchlist.start()
                XCTAssertEqual(start.handle, "h_123")
            },
            Case(method: "POST", path: "/me/plex-watchlist/poll", body: #"{"handle":"h_123"}"#, response: (202, #"{"status":"pending"}"#)) { api in
                let state = try await api.plexWatchlist.poll(handle: "h_123")
                XCTAssertNil(state)
            },
            Case(method: "POST", path: "/me/plex-watchlist/poll", body: #"{"handle":"h_123"}"#, response: (200, Self.watchlistJSON)) { api in
                let state = try await api.plexWatchlist.poll(handle: "h_123")
                XCTAssertEqual(state?.enabled, true)
            },
            Case(method: "PATCH", path: "/me/plex-watchlist", body: #"{"movies":false}"#, response: (200, Self.watchlistJSON)) { api in
                _ = try await api.plexWatchlist.setTypes(movies: false)
            },
            Case(method: "PATCH", path: "/me/plex-watchlist", body: #"{"movies":true,"tv":false}"#, response: (200, Self.watchlistJSON)) { api in
                _ = try await api.plexWatchlist.setTypes(movies: true, tv: false)
            },
            Case(method: "POST", path: "/me/plex-watchlist/sync", response: (200, Self.watchlistJSON), records: true) { api in
                let state = try await api.plexWatchlist.sync()
                XCTAssertEqual(state.requestedCount, 3)
            },
            Case(method: "DELETE", path: "/me/plex-watchlist", response: (200, Self.watchlistOffJSON)) { api in
                let state = try await api.plexWatchlist.disable()
                XCTAssertFalse(state.enabled)
            },
            Case(method: "GET", path: "/users/import/plex", response: (200, #"{"results":[{"id":1,"username":"sam","displayName":"Sam","thumb":null,"alreadyMember":false}]}"#)) { api in
                let list = try await api.users.importCandidates(from: .plex)
                XCTAssertEqual(list.first?.id, .number(1))
            },
            Case(method: "GET", path: "/users/import/jellyfin", response: (200, #"{"results":[]}"#)) { api in
                let list = try await api.users.importCandidates(from: .jellyfin)
                XCTAssertTrue(list.isEmpty)
            },
            Case(method: "POST", path: "/users/import/plex", body: #"{"ids":[1,2]}"#, response: (200, "{\"created\":[\(Self.memberJSON)],\"skipped\":1}"), records: true) { api in
                let result = try await api.users.importMembers(from: .plex, ids: [.number(1), .number(2)])
                XCTAssertEqual(result.skipped, 1)
            },
            Case(method: "POST", path: "/users/import/jellyfin", body: #"{"ids":["a1"]}"#, response: (200, #"{"created":[],"skipped":0}"#), records: true) { api in
                _ = try await api.users.importMembers(from: .jellyfin, ids: [.string("a1")])
            },
            Case(method: "GET", path: "/settings/sign-in", response: (200, #"{"mediaServerSignup":true}"#)) { api in
                let settings = try await api.users.signInSettings()
                XCTAssertTrue(settings.mediaServerSignup)
            },
            Case(method: "PUT", path: "/settings/sign-in", body: #"{"mediaServerSignup":false}"#, response: (200, #"{"mediaServerSignup":false}"#), records: true) { api in
                try await api.users.saveSignInSettings(API.SignInSettings(mediaServerSignup: false))
            },
        ]

        for testCase in cases {
            let label = "\(testCase.method) \(testCase.path) → \(testCase.response.0)"
            let events = ServerEvents()
            let client = APIClient(baseURL: URL(string: "http://127.0.0.1:3000")!, token: "mqt_test", session: StubURLProtocol.session())
            let api = MarqueeAPI(client: client, events: events)
            let (status, json) = testCase.response
            StubURLProtocol.requests = []
            StubURLProtocol.handler = { _ in StubURLProtocol.json(status, json) }

            do {
                try await testCase.call(api)
            } catch {
                XCTFail("\(label): \(error)")
                continue
            }
            guard let request = StubURLProtocol.requests.first, StubURLProtocol.requests.count == 1 else {
                XCTFail("\(label): expected exactly one request, got \(StubURLProtocol.requests.count)")
                continue
            }
            XCTAssertEqual(request.httpMethod, testCase.method, label)
            XCTAssertEqual(request.url?.path, "/api/v1" + testCase.path, label)
            let body = Self.body(of: request)
            if let expected = testCase.body {
                XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json", label)
                XCTAssertEqual(try Self.jsonObject(body), try Self.jsonObject(Data(expected.utf8)), label)
            } else {
                XCTAssertTrue(body.isEmpty, "\(label) sends no body")
            }
            XCTAssertEqual(events.revision(of: .all) != 0, testCase.records, "\(label) change signal")
        }
    }

    func testRefusalsCarryTheServersMessage() async {
        let client = APIClient(baseURL: URL(string: "http://127.0.0.1:3000")!, session: StubURLProtocol.session())
        let api = MarqueeAPI(client: client)

        StubURLProtocol.handler = { _ in StubURLProtocol.json(403, #"{"error":"Ask the admin to add you first.","code":"forbidden"}"#) }
        do {
            _ = try await api.auth.jellyfin(username: "sam", password: "pw", deviceName: "Mac")
            XCTFail("Expected a refusal")
        } catch {
            XCTAssertEqual(error as? MediaSignInError, .refused("Ask the admin to add you first."))
        }

        StubURLProtocol.handler = { _ in StubURLProtocol.json(401, #"{"error":"Incorrect username or password","code":"invalid_credentials"}"#) }
        do {
            _ = try await api.auth.jellyfin(username: "sam", password: "bad", deviceName: "Mac")
            XCTFail("Expected invalid credentials")
        } catch {
            XCTAssertEqual(error as? APIError, .invalidCredentials)
        }

        // Anything but 202/200/403/410 from a poll is an ordinary API error.
        StubURLProtocol.handler = { _ in StubURLProtocol.json(429, #"{"error":"Slow down.","code":"rate_limited"}"#) }
        do {
            _ = try await api.auth.plexPoll(handle: "h", deviceName: "Mac")
            XCTFail("Expected rate limited")
        } catch {
            XCTAssertEqual(error as? APIError, .rateLimited("Slow down."))
        }
    }

    /// A server before the Plex Watchlist has no `/me/plex-watchlist`: the
    /// card stays hidden and nothing is shown as an error.
    func testOlderServerHasNoPlexWatchlist() async throws {
        let client = APIClient(baseURL: URL(string: "http://127.0.0.1:3000")!, token: "mqt_test", session: StubURLProtocol.session())
        let api = MarqueeAPI(client: client)
        StubURLProtocol.handler = { _ in StubURLProtocol.json(404, #"{"error":"Not found","code":"not_found"}"#) }
        let state = try await api.plexWatchlist.state()
        XCTAssertEqual(state, .unavailable)
        XCTAssertFalse(state.available)

        // Other failures are still failures.
        StubURLProtocol.handler = { _ in StubURLProtocol.json(500, #"{"error":"Boom","code":"internal"}"#) }
        do {
            _ = try await api.plexWatchlist.state()
            XCTFail("Expected an error")
        } catch {
            XCTAssertEqual(error as? APIError, .server("Boom"))
        }
    }

    /// Turning it on and "Check now" end with the server's own words.
    func testPlexWatchlistRefusalsCarryTheServersMessage() async {
        let client = APIClient(baseURL: URL(string: "http://127.0.0.1:3000")!, token: "mqt_test", session: StubURLProtocol.session())
        let api = MarqueeAPI(client: client)

        StubURLProtocol.handler = { _ in StubURLProtocol.json(403, #"{"error":"That's a different Plex account from the one linked here. Sign in to plex.tv as that one.","code":"forbidden"}"#) }
        do {
            _ = try await api.plexWatchlist.poll(handle: "h")
            XCTFail("Expected a refusal")
        } catch {
            XCTAssertEqual(error.localizedDescription, "That's a different Plex account from the one linked here. Sign in to plex.tv as that one.")
        }

        StubURLProtocol.handler = { _ in StubURLProtocol.json(410, #"{"error":"Expired","code":"expired"}"#) }
        do {
            _ = try await api.plexWatchlist.poll(handle: "h")
            XCTFail("Expected expiry")
        } catch {
            XCTAssertEqual(error as? MediaSignInError, .expired)
        }

        StubURLProtocol.handler = { _ in StubURLProtocol.json(409, #"{"error":"Link your Plex account first.","code":"conflict"}"#) }
        do {
            _ = try await api.plexWatchlist.poll(handle: "h")
            XCTFail("Expected a conflict")
        } catch {
            XCTAssertEqual(error.localizedDescription, "Link your Plex account first.")
        }

        StubURLProtocol.handler = { _ in StubURLProtocol.json(429, #"{"error":"Checked a moment ago. Try again in a minute.","code":"rate_limited"}"#) }
        do {
            _ = try await api.plexWatchlist.sync()
            XCTFail("Expected rate limited")
        } catch {
            XCTAssertEqual(error.localizedDescription, "Checked a moment ago. Try again in a minute.")
        }
    }

    nonisolated static func body(of request: URLRequest) -> Data {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return Data() }
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable {
            let read = stream.read(&buffer, maxLength: buffer.count)
            if read <= 0 { break }
            data.append(buffer, count: read)
        }
        return data
    }

    nonisolated static func jsonObject(_ data: Data) throws -> NSDictionary {
        try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? NSDictionary)
    }
}

/// `ServerSession`'s Plex and Jellyfin sign-in against a stubbed server.
final class MediaSignInSessionTests: XCTestCase {
    private static let loginJSON = #"{"token":"mqt_plex","expiresAt":"2026-12-16T12:00:00.000Z","user":{"id":"6f1c2a4e-8b1d-4c3e-9f0a-2b7d5e8c1a90","username":"sam","displayName":"Sam","role":"member","libraryOwnerId":"6f1c2a4e-8b1d-4c3e-9f0a-2b7d5e8c1a90","linked":{"plex":true,"jellyfin":false},"hasPassword":false}}"#
    private static let server = ServerAddress(host: "127.0.0.1", port: 9)
    private static let start = API.PlexSignInStart(
        handle: "h_123", authUrl: "https://app.plex.tv/auth#?code=ABCD", expiresAt: Date().addingTimeInterval(600)
    )
    private static let fast: Duration = .milliseconds(10)

    @MainActor
    private func makeSession() -> (ServerSession, InMemoryTokenStore) {
        let defaults = UserDefaults(suiteName: "com.timmyamant.MarqueeTests.mediaSignIn.\(UUID().uuidString)")!
        defaults.set(Self.server.baseURLString, forKey: ServerSession.serverDefaultsKey)
        let store = InMemoryTokenStore()
        StubURLProtocol.requests = []
        let session = ServerSession(
            defaults: defaults, tokenStore: store, urlSession: StubURLProtocol.session(), deviceName: "Test Mac",
            pinned: nil, probe: { _ in .unreachable(.noResponse) }
        )
        return (session, store)
    }

    override func tearDown() {
        StubURLProtocol.handler = nil
        StubURLProtocol.requests = []
        super.tearDown()
    }

    @MainActor
    func testStartAsksTheServerForAHandle() async throws {
        StubURLProtocol.handler = { request in
            XCTAssertEqual(request.url?.path, "/api/v1/auth/plex/start")
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
            return StubURLProtocol.json(200, #"{"handle":"h_9","authUrl":"https://app.plex.tv/auth#?code=X","expiresAt":"2099-01-01T00:00:00.000Z"}"#)
        }
        let (session, _) = makeSession()
        let start = try await session.startPlexSignIn()
        XCTAssertEqual(start.handle, "h_9")
    }

    @MainActor
    func testPendingPendingThenSignedInStoresTheToken() async throws {
        let polls = Counter()
        StubURLProtocol.handler = { request in
            XCTAssertEqual(request.url?.path, "/api/v1/auth/plex/poll")
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
            let body = try JSONSerialization.jsonObject(with: MediaSignInRequestTests.body(of: request)) as? [String: Any]
            XCTAssertEqual(body?["handle"] as? String, "h_123")
            XCTAssertEqual(body?["deviceName"] as? String, "Test Mac")
            return polls.increment() < 3
                ? StubURLProtocol.json(202, #"{"status":"pending"}"#)
                : StubURLProtocol.json(200, Self.loginJSON)
        }
        let (session, store) = makeSession()

        let user = try await session.finishPlexSignIn(Self.start, interval: Self.fast)
        XCTAssertEqual(polls.value, 3)
        XCTAssertEqual(user.username, "sam")
        XCTAssertEqual(user.linked?.plex, true)
        XCTAssertEqual(store.token(for: Self.server.baseURLString), "mqt_plex", "Stored exactly like a password sign-in")
        XCTAssertEqual(session.client?.token, "mqt_plex")
        XCTAssertTrue(session.isSignedIn)
    }

    @MainActor
    func testForbiddenShowsTheServersMessage() async {
        StubURLProtocol.handler = { _ in
            StubURLProtocol.json(403, #"{"error":"This Plex account doesn't have access to this server.","code":"forbidden"}"#)
        }
        let (session, store) = makeSession()
        do {
            _ = try await session.finishPlexSignIn(Self.start, interval: Self.fast)
            XCTFail("Expected a refusal")
        } catch {
            XCTAssertEqual(error.localizedDescription, "This Plex account doesn't have access to this server.")
        }
        XCTAssertEqual(StubURLProtocol.requests.count, 1, "A 403 ends the polling")
        XCTAssertNil(store.token(for: Self.server.baseURLString))
        XCTAssertFalse(session.isSignedIn)
    }

    @MainActor
    func testGoneSaysTheSignInExpired() async {
        let polls = Counter()
        StubURLProtocol.handler = { _ in
            polls.increment() == 1
                ? StubURLProtocol.json(202, #"{"status":"pending"}"#)
                : StubURLProtocol.json(410, #"{"error":"Expired","code":"expired"}"#)
        }
        let (session, _) = makeSession()
        do {
            _ = try await session.finishPlexSignIn(Self.start, interval: Self.fast)
            XCTFail("Expected expiry")
        } catch {
            XCTAssertEqual(error as? MediaSignInError, .expired)
            XCTAssertEqual(error.localizedDescription, "The Plex sign-in expired. Try again.")
        }
        XCTAssertEqual(polls.value, 2)
        XCTAssertFalse(session.isSignedIn)
    }

    @MainActor
    func testOtherErrorsStopPolling() async {
        StubURLProtocol.handler = { _ in StubURLProtocol.json(500, #"{"error":"Boom","code":"internal"}"#) }
        let (session, _) = makeSession()
        do {
            _ = try await session.finishPlexSignIn(Self.start, interval: Self.fast)
            XCTFail("Expected an error")
        } catch {
            XCTAssertEqual(error as? APIError, .server("Boom"))
        }
        XCTAssertEqual(StubURLProtocol.requests.count, 1)
    }

    @MainActor
    func testCancelStopsPolling() async throws {
        let polls = Counter()
        StubURLProtocol.handler = { _ in
            polls.increment()
            return StubURLProtocol.json(202, #"{"status":"pending"}"#)
        }
        let (session, store) = makeSession()
        let task = Task { try await session.finishPlexSignIn(Self.start, interval: Self.fast) }

        for _ in 0..<200 where polls.value < 2 {
            try await Task.sleep(for: .milliseconds(10))
        }
        XCTAssertGreaterThanOrEqual(polls.value, 2)
        let atCancel = polls.value
        task.cancel()
        let result = await task.result
        switch result {
        case .success: XCTFail("A cancelled sign-in must not succeed")
        case let .failure(error): XCTAssertTrue(PlexPoll.isCancellation(error), "\(error)")
        }
        // A request already handed to URLSession when Cancel came may still
        // reach the stub; nothing new is sent after that.
        try await Task.sleep(for: .milliseconds(50))
        let afterCancel = polls.value
        XCTAssertLessThanOrEqual(afterCancel, atCancel + 1)
        try await Task.sleep(for: .milliseconds(200))
        XCTAssertEqual(polls.value, afterCancel, "No polls after Cancel")
        XCTAssertNil(store.token(for: Self.server.baseURLString))
    }

    @MainActor
    func testExpiresAtEndsPolling() async {
        StubURLProtocol.handler = { _ in StubURLProtocol.json(202, #"{"status":"pending"}"#) }
        // A clock that jumps past the deadline after the second poll.
        let clock = Counter()
        do {
            _ = try await PlexPoll.run(
                expiresAt: Date(timeIntervalSince1970: 1000),
                interval: Self.fast,
                now: { Date(timeIntervalSince1970: clock.increment() > 2 ? 2000 : 0) }
            ) { () async throws -> Bool? in nil }
            XCTFail("Expected expiry")
        } catch {
            XCTAssertEqual(error as? MediaSignInError, .expired)
        }
    }

    @MainActor
    func testJellyfinSignInStoresTheToken() async throws {
        StubURLProtocol.handler = { request in
            XCTAssertEqual(request.url?.path, "/api/v1/auth/jellyfin")
            let body = try JSONSerialization.jsonObject(with: MediaSignInRequestTests.body(of: request)) as? [String: Any]
            XCTAssertEqual(body?["username"] as? String, "sam")
            XCTAssertEqual(body?["password"] as? String, "pw")
            XCTAssertEqual(body?["deviceName"] as? String, "Test Mac")
            return StubURLProtocol.json(200, Self.loginJSON)
        }
        let (session, store) = makeSession()
        let user = try await session.loginWithJellyfin(username: " sam ", password: "pw")
        XCTAssertEqual(user.username, "sam")
        XCTAssertEqual(store.token(for: Self.server.baseURLString), "mqt_plex")
        XCTAssertTrue(session.isSignedIn)
    }

    @MainActor
    func testJellyfinRefusalAndEmptyFields() async {
        StubURLProtocol.handler = { _ in StubURLProtocol.json(403, #"{"error":"Ask the admin to add you first.","code":"forbidden"}"#) }
        let (session, store) = makeSession()
        do {
            _ = try await session.loginWithJellyfin(username: "sam", password: "pw")
            XCTFail("Expected a refusal")
        } catch {
            XCTAssertEqual(error.localizedDescription, "Ask the admin to add you first.")
        }
        XCTAssertNil(store.token(for: Self.server.baseURLString))

        StubURLProtocol.requests = []
        do {
            _ = try await session.loginWithJellyfin(username: " ", password: "")
            XCTFail("Expected invalid")
        } catch {
            XCTAssertEqual(error as? APIError, .invalid("Enter your Jellyfin username and password."))
        }
        XCTAssertTrue(StubURLProtocol.requests.isEmpty)
    }
}

private final class Counter: @unchecked Sendable {
    private let lock = NSLock()
    private var count = 0

    var value: Int { lock.withLock { count } }

    @discardableResult
    func increment() -> Int { lock.withLock { count += 1; return count } }
}
