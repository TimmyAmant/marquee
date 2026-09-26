import XCTest
@testable import Marquee

// Single sign-on and Jellyfin Quick Connect (0.44+): decoding with the new
// fields present and absent (older servers), which sign-in pages the app
// will open, the request each call sends, and the polls against a stubbed
// server.

final class SsoDecodingTests: XCTestCase {
    private static var fixturesURL: URL {
        Bundle(for: SsoDecodingTests.self).resourceURL!.appendingPathComponent("Fixtures/api", isDirectory: true)
    }

    private func fixture<T: Decodable>(_ type: T.Type, _ name: String) throws -> T {
        try APIClient.decoder.decode(type, from: Data(contentsOf: Self.fixturesURL.appendingPathComponent(name + ".json")))
    }

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try APIClient.decoder.decode(type, from: Data(json.utf8))
    }

    func testServerInfoFixtureOffersSsoAndQuickConnect() throws {
        let info = try fixture(ServerInfo.self, "server-info")
        XCTAssertEqual(info.signIn?.quickConnect, true)
        XCTAssertTrue(info.offersQuickConnect)
        XCTAssertEqual(info.singleSignOn, SignInMethods.SingleSignOn(name: "Authentik", signup: false))
        XCTAssertEqual(
            info.signIn,
            SignInMethods(
                password: true, plex: true, jellyfin: true, jellyfinName: "Jellyfin", signup: true,
                quickConnect: true, sso: .init(name: "Authentik", signup: false)
            )
        )
    }

    func testOlderServerInfoHasNoSsoOrQuickConnect() throws {
        let older = try decode(ServerInfo.self, #"{"app":"marquee","apiVersion":1,"version":"0.43.0","setupComplete":true,"status":"ok","signIn":{"password":true,"plex":true,"jellyfin":true,"jellyfinName":"Jellyfin","signup":true}}"#)
        XCTAssertEqual(older.signIn?.quickConnect, false)
        XCTAssertNil(older.signIn?.sso)
        XCTAssertNil(older.singleSignOn)
        XCTAssertFalse(older.offersQuickConnect)

        let noSignIn = try decode(ServerInfo.self, #"{"app":"marquee","apiVersion":1,"version":"0.32.0","setupComplete":true,"status":"ok"}"#)
        XCTAssertNil(noSignIn.singleSignOn)
        XCTAssertFalse(noSignIn.offersQuickConnect)

        // SSO explicitly off, or a value this app can't read: no button,
        // and the rest of the sign-in methods still decode.
        let off = try decode(ServerInfo.self, #"{"app":"marquee","apiVersion":1,"version":"0.44.0","setupComplete":true,"status":"ok","signIn":{"plex":true,"quickConnect":false,"sso":null}}"#)
        XCTAssertNil(off.singleSignOn)
        XCTAssertTrue(off.offersPlexSignIn)
        let odd = try decode(ServerInfo.self, #"{"app":"marquee","apiVersion":1,"version":"0.44.0","setupComplete":true,"status":"ok","signIn":{"plex":true,"sso":"Authentik"}}"#)
        XCTAssertNil(odd.singleSignOn)
        XCTAssertTrue(odd.offersPlexSignIn)
        let nameless = try decode(ServerInfo.self, #"{"app":"marquee","apiVersion":1,"version":"0.44.0","setupComplete":true,"status":"ok","signIn":{"sso":{"name":"  ","signup":true}}}"#)
        XCTAssertNil(nameless.singleSignOn)
        XCTAssertNil(nameless.signupHint)
    }

    func testQuickConnectNeedsJellyfin() throws {
        // Quick Connect only goes with the Jellyfin sign-in it lives on.
        let noJellyfin = try decode(ServerInfo.self, #"{"app":"marquee","apiVersion":1,"version":"0.44.0","setupComplete":true,"status":"ok","signIn":{"jellyfin":false,"quickConnect":true}}"#)
        XCTAssertFalse(noJellyfin.offersQuickConnect)
        let emby = try decode(ServerInfo.self, #"{"app":"marquee","apiVersion":1,"version":"0.44.0","setupComplete":true,"status":"ok","signIn":{"jellyfin":true,"jellyfinName":"Emby","quickConnect":false}}"#)
        XCTAssertFalse(emby.offersQuickConnect)
    }

    func testSignupHintIncludesSso() throws {
        func hint(_ signIn: String) throws -> String? {
            try decode(ServerInfo.self, #"{"app":"marquee","apiVersion":1,"version":"0.44.0","setupComplete":true,"status":"ok","signIn":\#(signIn)}"#).signupHint
        }
        XCTAssertEqual(
            try hint(#"{"sso":{"name":"Authentik","signup":true}}"#),
            "New here? Use Sign in with Authentik — your account is made for you."
        )
        XCTAssertEqual(
            try hint(#"{"plex":true,"jellyfin":true,"signup":true,"sso":{"name":"Authentik","signup":true}}"#),
            "New here? Use Sign in with Authentik (or Plex or Jellyfin) — your account is made for you."
        )
        // Media-server sign-up off, SSO sign-up on: only SSO is named.
        XCTAssertEqual(
            try hint(#"{"plex":true,"signup":false,"sso":{"name":"Pocket ID","signup":true}}"#),
            "New here? Use Sign in with Pocket ID — your account is made for you."
        )
        // SSO sign-up off: as before 0.44.
        XCTAssertEqual(
            try hint(#"{"plex":true,"signup":true,"sso":{"name":"Authentik","signup":false}}"#),
            "New here? Use Sign in with Plex — your account is made for you."
        )
        XCTAssertNil(try hint(#"{"plex":true,"signup":false,"sso":{"name":"Authentik","signup":false}}"#))
        XCTAssertNil(try hint(#"{"plex":true,"signup":false,"sso":{"name":"Authentik"}}"#))
    }

    func testLinkedSso() throws {
        let me = try fixture(API.Me.self, "me")
        XCTAssertEqual(me.linked, LinkedAccounts(plex: true, jellyfin: false, sso: false))
        let member = try fixture(API.HouseholdMember.self, "household-member")
        XCTAssertEqual(member.linked, LinkedAccounts(plex: false, jellyfin: true, sso: false))

        let linked = try decode(LinkedAccounts.self, #"{"plex":false,"jellyfin":false,"sso":true}"#)
        XCTAssertTrue(linked.sso)
        // Before 0.44 there's no `sso`: not linked.
        let older = try decode(LinkedAccounts.self, #"{"plex":true,"jellyfin":false}"#)
        XCTAssertEqual(older, LinkedAccounts(plex: true))
        XCTAssertFalse(older.sso)
    }

    func testStartShapes() throws {
        let sso = try fixture(API.SsoSignInStart.self, "auth-sso-start")
        XCTAssertEqual(sso.authUrl, "https://marquee.example.com/login/sso/app?key=Hc9…43 chars…")
        XCTAssertEqual(sso.expiresAt, APIClient.parseDate("2026-09-25T17:40:00.000Z"))
        XCTAssertFalse(sso.handle.isEmpty)

        let quickConnect = try fixture(API.QuickConnectStart.self, "auth-quick-connect-start")
        XCTAssertEqual(quickConnect.code, "482915")
        XCTAssertEqual(quickConnect.expiresAt, APIClient.parseDate("2026-09-25T17:40:00.000Z"))
    }

    func testSsoSettingsShapes() throws {
        let settings = try fixture(API.SsoSettings.self, "sso-settings")
        XCTAssertTrue(settings.configured)
        XCTAssertEqual(settings.name, "Authentik")
        XCTAssertEqual(settings.issuer, "https://auth.example.com/application/o/marquee/")
        XCTAssertEqual(settings.clientId, "marquee")
        XCTAssertTrue(settings.hasClientSecret)
        XCTAssertEqual(settings.scopes, "openid profile email")
        XCTAssertEqual(settings.publicUrl, "https://marquee.example.com")
        XCTAssertEqual(settings.callbackUrl, "https://marquee.example.com/api/auth/sso/callback")
        XCTAssertFalse(settings.allowSignup)
        XCTAssertFalse(settings.matchEmail)
        XCTAssertEqual(settings.requiredGroup, "marquee-users")
        XCTAssertNil(settings.trustedGroup)
        XCTAssertEqual(settings.groupsClaim, "groups")

        // Not set up yet: the defaults.
        let blank = try decode(API.SsoSettings.self, #"""
        {"configured":false,"name":"","issuer":"","clientId":"","hasClientSecret":false,"scopes":"openid profile email","publicUrl":"http://tower:3000","callbackUrl":"http://tower:3000/api/auth/sso/callback","allowSignup":false,"matchEmail":false,"requiredGroup":null,"trustedGroup":null,"groupsClaim":"groups"}
        """#)
        XCTAssertFalse(blank.configured)
        XCTAssertEqual(blank.name, "")
        XCTAssertNil(blank.requiredGroup)

        let test = try fixture(API.SsoTestResult.self, "sso-test")
        XCTAssertEqual(test.issuer, "https://auth.example.com/application/o/marquee/")
        XCTAssertEqual(test.tokenEndpoint, "https://auth.example.com/application/o/token/")
        XCTAssertEqual(test.userinfoEndpoint, "https://auth.example.com/application/o/userinfo/")
        XCTAssertEqual(test.warnings, [])

        let warned = try decode(API.SsoTestResult.self, #"""
        {"issuer":"http://auth.lan/","authorizationEndpoint":"http://auth.lan/authorize","tokenEndpoint":"http://auth.lan/token","userinfoEndpoint":null,"warnings":["The provider isn't using https — sign-ins and the client secret travel unencrypted."]}
        """#)
        XCTAssertNil(warned.userinfoEndpoint)
        XCTAssertEqual(warned.warnings.count, 1)
    }

    /// The redirect URI follows "Marquee's address" as it's typed, like the
    /// website's: its origin plus the callback path.
    func testCallbackURLFollowsTheAddress() {
        XCTAssertEqual(API.SsoSettings.callbackURL(for: "https://marquee.example.com"), "https://marquee.example.com/api/auth/sso/callback")
        XCTAssertEqual(API.SsoSettings.callbackURL(for: " https://Marquee.Example.com/some/path?x=1 "), "https://marquee.example.com/api/auth/sso/callback")
        XCTAssertEqual(API.SsoSettings.callbackURL(for: "http://tower:3000/"), "http://tower:3000/api/auth/sso/callback")
        XCTAssertEqual(API.SsoSettings.callbackURL(for: "https://marquee.example.com:443"), "https://marquee.example.com/api/auth/sso/callback")
        XCTAssertEqual(API.SsoSettings.callbackURL(for: ""), "https://your-marquee-address/api/auth/sso/callback")
        XCTAssertEqual(API.SsoSettings.callbackURL(for: "marquee.example.com"), "https://your-marquee-address/api/auth/sso/callback")
        XCTAssertEqual(API.SsoSettings.callbackURL(for: "ftp://marquee.example.com"), "https://your-marquee-address/api/auth/sso/callback")
    }

    func testSaveRequestKeepsOrClearsTheSecret() throws {
        var request = API.SsoSettingsRequest(
            name: "Authentik", issuer: "https://auth.example.com/", clientId: "marquee",
            clientSecret: nil, clearClientSecret: nil, scopes: "openid profile email",
            publicUrl: "https://marquee.example.com", allowSignup: true, matchEmail: false,
            requiredGroup: nil, trustedGroup: "trusted", groupsClaim: "groups"
        )
        var body = try Self.object(request)
        XCTAssertNil(body["clientSecret"], "Missing keeps the saved secret")
        XCTAssertNil(body["clearClientSecret"])
        XCTAssertNil(body["requiredGroup"], "Missing means none")
        XCTAssertEqual(body["trustedGroup"] as? String, "trusted")
        XCTAssertEqual(body["allowSignup"] as? Bool, true)
        XCTAssertEqual(body["publicUrl"] as? String, "https://marquee.example.com")

        request.clientSecret = "s3cret"
        request.clearClientSecret = true
        body = try Self.object(request)
        XCTAssertEqual(body["clientSecret"] as? String, "s3cret")
        XCTAssertEqual(body["clearClientSecret"] as? Bool, true)
    }

    private static func object(_ value: some Encodable) throws -> [String: Any] {
        try XCTUnwrap(JSONSerialization.jsonObject(with: APIClient.encoder.encode(value)) as? [String: Any])
    }

    /// The app opens single sign-on's page only over https or on the
    /// server's own address, whatever the server sends.
    func testSignInPageOpensOnlyHttpsOrTheServersOwnOrigin() throws {
        let home = URL(string: "http://192.168.1.10:3000")!
        func url(_ authUrl: String, server: URL? = home) -> URL? {
            API.SsoSignInStart(handle: "h", authUrl: authUrl, expiresAt: Date()).url(server: server)
        }
        XCTAssertNotNil(url("https://marquee.example.com/login/sso/app?key=abc"))
        XCTAssertNotNil(url("https://auth.example.com/anything", server: nil))
        // The server's own origin over plain http.
        XCTAssertNotNil(url("http://192.168.1.10:3000/login/sso/app?key=abc"))
        XCTAssertNotNil(url("HTTP://192.168.1.10:3000/login/sso/app?key=abc"))
        XCTAssertNotNil(url("http://tower/login/sso/app", server: URL(string: "http://Tower:80")!))
        // Plain http anywhere else.
        XCTAssertNil(url("http://evil.example/login/sso/app"))
        XCTAssertNil(url("http://192.168.1.10:8080/login/sso/app"), "Another port is another origin")
        XCTAssertNil(url("http://192.168.1.10.evil.example:3000/"))
        XCTAssertNil(url("http://192.168.1.10:3000/login/sso/app", server: nil))
        XCTAssertNil(url("http://marquee.example.com/", server: URL(string: "https://marquee.example.com")!), "http isn't the https origin")
        // Never a script, a file, or another app's scheme.
        XCTAssertNil(url("javascript:alert(1)"))
        XCTAssertNil(url("file:///Applications/Calculator.app"))
        XCTAssertNil(url("marquee://title/movie/1"))
        XCTAssertNil(url("x-apple.systempreferences:com.apple.preference.security"))
        XCTAssertNil(url("https:///no-host"))
        XCTAssertNil(url(""))
    }

    func testPollStepsSayWhichSignInExpired() throws {
        XCTAssertNil(try PlexPoll.step(status: 202, body: Data(), expired: .ssoExpired))
        XCTAssertThrowsError(try PlexPoll.step(status: 410, body: Data(), expired: .ssoExpired)) { error in
            XCTAssertEqual(error as? MediaSignInError, .ssoExpired)
            XCTAssertEqual(error.localizedDescription, "That sign-in expired. Try again.")
        }
        XCTAssertThrowsError(try PlexPoll.step(status: 410, body: Data(), expired: .quickConnectExpired)) { error in
            XCTAssertEqual(error.localizedDescription, "That Quick Connect code expired. Try again.")
        }
        XCTAssertThrowsError(try PlexPoll.step(status: 403, body: Data(#"{"error":"Authentik sign-in was cancelled.","code":"forbidden"}"#.utf8), expired: .ssoExpired)) { error in
            XCTAssertEqual(error as? MediaSignInError, .refused("Authentik sign-in was cancelled."))
        }
    }
}

@MainActor
final class SsoRequestTests: XCTestCase {
    private static let loginJSON = #"{"token":"mqt_fresh","expiresAt":"2026-12-16T12:00:00.000Z","user":{"id":"6f1c2a4e-8b1d-4c3e-9f0a-2b7d5e8c1a90","username":"timmy","displayName":"Timmy","role":"member","libraryOwnerId":"6f1c2a4e-8b1d-4c3e-9f0a-2b7d5e8c1a90"}}"#
    private static let ssoStartJSON = #"{"handle":"s_1","authUrl":"https://marquee.example.com/login/sso/app?key=k","expiresAt":"2099-01-01T00:00:00.000Z"}"#
    private static let quickConnectStartJSON = #"{"handle":"q_1","code":"482915","expiresAt":"2099-01-01T00:00:00.000Z"}"#
    private static let settingsJSON = #"{"configured":true,"name":"Authentik","issuer":"https://auth.example.com/","clientId":"marquee","hasClientSecret":true,"scopes":"openid profile email","publicUrl":"https://marquee.example.com","callbackUrl":"https://marquee.example.com/api/auth/sso/callback","allowSignup":false,"matchEmail":false,"requiredGroup":null,"trustedGroup":null,"groupsClaim":"groups"}"#
    private static let testJSON = #"{"issuer":"https://auth.example.com/","authorizationEndpoint":"https://auth.example.com/authorize","tokenEndpoint":"https://auth.example.com/token","userinfoEndpoint":null,"warnings":[]}"#
    private static let meJSON = #"{"id":"6f1c2a4e-8b1d-4c3e-9f0a-2b7d5e8c1a90","username":"timmy","displayName":"Timmy","role":"member","libraryOwnerId":"6f1c2a4e-8b1d-4c3e-9f0a-2b7d5e8c1a90","autoApproveMovies":false,"autoApproveTv":false,"createdAt":"2026-09-01T12:00:00.000Z","linked":{"plex":false,"jellyfin":false,"sso":true},"hasPassword":true}"#

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
        let saveRequest = API.SsoSettingsRequest(
            name: "Authentik", issuer: "https://auth.example.com/", clientId: "marquee",
            clientSecret: nil, clearClientSecret: true, scopes: "openid profile email",
            publicUrl: "https://marquee.example.com", allowSignup: false, matchEmail: true,
            requiredGroup: "marquee-users", trustedGroup: nil, groupsClaim: "groups"
        )
        let cases: [Case] = [
            Case(method: "POST", path: "/auth/sso/start", body: #"{"deviceName":"Mac"}"#, response: (200, Self.ssoStartJSON)) { api in
                let start = try await api.auth.ssoStart(deviceName: "Mac")
                XCTAssertEqual(start.handle, "s_1")
            },
            Case(method: "POST", path: "/auth/sso/poll", body: #"{"handle":"s_1","deviceName":"Mac"}"#, response: (202, #"{"status":"pending"}"#)) { api in
                let answer = try await api.auth.ssoPoll(handle: "s_1", deviceName: "Mac")
                XCTAssertNil(answer)
            },
            Case(method: "POST", path: "/auth/sso/poll", body: #"{"handle":"s_1","deviceName":"Mac"}"#, response: (200, Self.loginJSON)) { api in
                let answer = try await api.auth.ssoPoll(handle: "s_1", deviceName: "Mac")
                XCTAssertEqual(answer?.token, "mqt_fresh")
            },
            Case(method: "POST", path: "/auth/jellyfin/quick-connect/start", response: (200, Self.quickConnectStartJSON)) { api in
                let start = try await api.auth.quickConnectStart()
                XCTAssertEqual(start.code, "482915")
            },
            Case(method: "POST", path: "/auth/jellyfin/quick-connect/poll", body: #"{"handle":"q_1","deviceName":"Mac"}"#, response: (202, #"{"status":"pending"}"#)) { api in
                let answer = try await api.auth.quickConnectPoll(handle: "q_1", deviceName: "Mac")
                XCTAssertNil(answer)
            },
            Case(method: "POST", path: "/auth/jellyfin/quick-connect/poll", body: #"{"handle":"q_1","deviceName":"Mac"}"#, response: (200, Self.loginJSON)) { api in
                let answer = try await api.auth.quickConnectPoll(handle: "q_1", deviceName: "Mac")
                XCTAssertEqual(answer?.token, "mqt_fresh")
            },
            Case(method: "POST", path: "/me/links/sso/start", response: (200, Self.ssoStartJSON)) { api in
                _ = try await api.links.ssoStart()
            },
            Case(method: "POST", path: "/me/links/sso/poll", body: #"{"handle":"s_1"}"#, response: (202, #"{"status":"pending"}"#)) { api in
                let linked = try await api.links.ssoPoll(handle: "s_1")
                XCTAssertFalse(linked)
            },
            Case(method: "POST", path: "/me/links/sso/poll", body: #"{"handle":"s_1"}"#, response: (200, Self.meJSON), records: true) { api in
                let linked = try await api.links.ssoPoll(handle: "s_1")
                XCTAssertTrue(linked)
            },
            Case(method: "DELETE", path: "/me/links/sso", response: (200, Self.meJSON), records: true) { api in
                try await api.links.unlinkSso()
            },
            Case(method: "GET", path: "/settings/sso", response: (200, Self.settingsJSON)) { api in
                let settings = try await api.integrations.sso.settings()
                XCTAssertEqual(settings?.name, "Authentik")
            },
            Case(
                method: "PUT", path: "/settings/sso",
                body: #"{"name":"Authentik","issuer":"https://auth.example.com/","clientId":"marquee","clearClientSecret":true,"scopes":"openid profile email","publicUrl":"https://marquee.example.com","allowSignup":false,"matchEmail":true,"requiredGroup":"marquee-users","groupsClaim":"groups"}"#,
                response: (200, Self.settingsJSON)
            ) { api in
                let saved = try await api.integrations.sso.save(saveRequest)
                XCTAssertTrue(saved.configured)
            },
            Case(method: "DELETE", path: "/settings/sso", response: (200, Self.settingsJSON)) { api in
                _ = try await api.integrations.sso.remove()
            },
            Case(method: "POST", path: "/settings/sso/test", body: #"{"issuer":"https://auth.example.com/"}"#, response: (200, Self.testJSON)) { api in
                let result = try await api.integrations.sso.test(issuer: "https://auth.example.com/")
                XCTAssertEqual(result.issuer, "https://auth.example.com/")
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
            let body = MediaSignInRequestTests.body(of: request)
            if let expected = testCase.body {
                XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json", label)
                XCTAssertEqual(try MediaSignInRequestTests.jsonObject(body), try MediaSignInRequestTests.jsonObject(Data(expected.utf8)), label)
            } else {
                XCTAssertTrue(body.isEmpty, "\(label) sends no body")
            }
            XCTAssertEqual(events.revision(of: .all) != 0, testCase.records, "\(label) change signal")
        }
    }

    /// A server before 0.44 has no `/settings/sso`: the card stays hidden
    /// and nothing is shown as an error.
    func testOlderServerHasNoSsoSettings() async throws {
        let client = APIClient(baseURL: URL(string: "http://127.0.0.1:3000")!, token: "mqt_test", session: StubURLProtocol.session())
        let api = MarqueeAPI(client: client)
        StubURLProtocol.handler = { _ in StubURLProtocol.json(404, #"{"error":"Not found","code":"not_found"}"#) }
        let settings = try await api.integrations.sso.settings()
        XCTAssertNil(settings)

        StubURLProtocol.handler = { _ in StubURLProtocol.json(500, #"{"error":"Boom","code":"internal"}"#) }
        do {
            _ = try await api.integrations.sso.settings()
            XCTFail("Expected an error")
        } catch {
            XCTAssertEqual(error as? APIError, .server("Boom"))
        }
    }

    func testRefusalsCarryTheServersMessage() async {
        let client = APIClient(baseURL: URL(string: "http://127.0.0.1:3000")!, token: "mqt_test", session: StubURLProtocol.session())
        let api = MarqueeAPI(client: client)

        StubURLProtocol.handler = { _ in StubURLProtocol.json(403, #"{"error":"Your Authentik account isn't allowed to use Marquee. Ask the admin to add you to the right group.","code":"forbidden"}"#) }
        do {
            _ = try await api.auth.ssoPoll(handle: "s", deviceName: "Mac")
            XCTFail("Expected a refusal")
        } catch {
            XCTAssertEqual(error.localizedDescription, "Your Authentik account isn't allowed to use Marquee. Ask the admin to add you to the right group.")
        }

        StubURLProtocol.handler = { _ in StubURLProtocol.json(410, #"{"error":"That Quick Connect code expired. Try again.","code":"expired"}"#) }
        do {
            _ = try await api.auth.quickConnectPoll(handle: "q", deviceName: "Mac")
            XCTFail("Expected expiry")
        } catch {
            XCTAssertEqual(error as? MediaSignInError, .quickConnectExpired)
        }

        StubURLProtocol.handler = { _ in StubURLProtocol.json(409, #"{"error":"This Authentik account is already linked to another Marquee account.","code":"conflict"}"#) }
        do {
            _ = try await api.links.ssoPoll(handle: "s")
            XCTFail("Expected a conflict")
        } catch {
            XCTAssertEqual(error.localizedDescription, "This Authentik account is already linked to another Marquee account.")
        }

        StubURLProtocol.handler = { _ in StubURLProtocol.json(409, #"{"error":"Quick Connect is turned off on this Jellyfin server. The admin can turn it on in Jellyfin's Dashboard → General.","code":"conflict"}"#) }
        do {
            _ = try await api.auth.quickConnectStart()
            XCTFail("Expected a conflict")
        } catch {
            XCTAssertEqual(error.localizedDescription, "Quick Connect is turned off on this Jellyfin server. The admin can turn it on in Jellyfin's Dashboard → General.")
        }
    }
}

/// `ServerSession`'s single sign-on and Quick Connect sign-in against a
/// stubbed server: stored exactly like a Plex sign-in.
final class SsoSessionTests: XCTestCase {
    private static let loginJSON = #"{"token":"mqt_sso","expiresAt":"2026-12-16T12:00:00.000Z","user":{"id":"6f1c2a4e-8b1d-4c3e-9f0a-2b7d5e8c1a90","username":"sam","displayName":"Sam","role":"member","libraryOwnerId":"6f1c2a4e-8b1d-4c3e-9f0a-2b7d5e8c1a90","linked":{"plex":false,"jellyfin":false,"sso":true},"hasPassword":false}}"#
    private static let server = ServerAddress(host: "127.0.0.1", port: 9)
    private static let fast: Duration = .milliseconds(10)

    @MainActor
    private func makeSession() -> (ServerSession, InMemoryTokenStore) {
        let defaults = UserDefaults(suiteName: "com.timmyamant.MarqueeTests.sso.\(UUID().uuidString)")!
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
    func testSsoStartSendsTheDeviceName() async throws {
        StubURLProtocol.handler = { request in
            XCTAssertEqual(request.url?.path, "/api/v1/auth/sso/start")
            XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
            let body = try JSONSerialization.jsonObject(with: MediaSignInRequestTests.body(of: request)) as? [String: Any]
            XCTAssertEqual(body?["deviceName"] as? String, "Test Mac")
            return StubURLProtocol.json(200, #"{"handle":"s_9","authUrl":"http://127.0.0.1:9/login/sso/app?key=k","expiresAt":"2099-01-01T00:00:00.000Z"}"#)
        }
        let (session, _) = makeSession()
        let start = try await session.startSsoSignIn()
        XCTAssertEqual(start.handle, "s_9")
        // The server's own address over http is fine to open.
        XCTAssertNotNil(start.url(server: session.server?.baseURL))
    }

    @MainActor
    func testSsoPendingThenSignedInStoresTheToken() async throws {
        let polls = PollCounter()
        StubURLProtocol.handler = { request in
            XCTAssertEqual(request.url?.path, "/api/v1/auth/sso/poll")
            let body = try JSONSerialization.jsonObject(with: MediaSignInRequestTests.body(of: request)) as? [String: Any]
            XCTAssertEqual(body?["handle"] as? String, "s_1")
            XCTAssertEqual(body?["deviceName"] as? String, "Test Mac")
            return polls.increment() < 3
                ? StubURLProtocol.json(202, #"{"status":"pending"}"#)
                : StubURLProtocol.json(200, Self.loginJSON)
        }
        let (session, store) = makeSession()
        let start = API.SsoSignInStart(handle: "s_1", authUrl: "https://marquee.example.com/login/sso/app", expiresAt: Date().addingTimeInterval(600))
        let user = try await session.finishSsoSignIn(start, interval: Self.fast)
        XCTAssertEqual(polls.value, 3)
        XCTAssertEqual(user.linked?.sso, true)
        XCTAssertEqual(store.token(for: Self.server.baseURLString), "mqt_sso", "Stored exactly like a password sign-in")
        XCTAssertTrue(session.isSignedIn)
    }

    @MainActor
    func testSsoGoneSaysTheSignInExpired() async {
        StubURLProtocol.handler = { _ in StubURLProtocol.json(410, #"{"error":"That sign-in expired. Try again.","code":"expired"}"#) }
        let (session, store) = makeSession()
        let start = API.SsoSignInStart(handle: "s_1", authUrl: "https://marquee.example.com/", expiresAt: Date().addingTimeInterval(600))
        do {
            _ = try await session.finishSsoSignIn(start, interval: Self.fast)
            XCTFail("Expected expiry")
        } catch {
            XCTAssertEqual(error.localizedDescription, "That sign-in expired. Try again.")
        }
        XCTAssertNil(store.token(for: Self.server.baseURLString))
    }

    @MainActor
    func testQuickConnectApprovedStoresTheToken() async throws {
        let polls = PollCounter()
        StubURLProtocol.handler = { request in
            switch request.url?.path {
            case "/api/v1/auth/jellyfin/quick-connect/start":
                return StubURLProtocol.json(200, #"{"handle":"q_1","code":"482915","expiresAt":"2099-01-01T00:00:00.000Z"}"#)
            case "/api/v1/auth/jellyfin/quick-connect/poll":
                let body = try JSONSerialization.jsonObject(with: MediaSignInRequestTests.body(of: request)) as? [String: Any]
                XCTAssertEqual(body?["handle"] as? String, "q_1")
                XCTAssertEqual(body?["deviceName"] as? String, "Test Mac")
                return polls.increment() < 2
                    ? StubURLProtocol.json(202, #"{"status":"pending"}"#)
                    : StubURLProtocol.json(200, Self.loginJSON)
            default:
                XCTFail("Unexpected \(request.url?.path ?? "")")
                return StubURLProtocol.json(404, "{}")
            }
        }
        let (session, store) = makeSession()
        let start = try await session.startQuickConnect()
        XCTAssertEqual(start.code, "482915")
        let user = try await session.finishQuickConnect(start, interval: Self.fast)
        XCTAssertEqual(user.username, "sam")
        XCTAssertEqual(polls.value, 2)
        XCTAssertEqual(store.token(for: Self.server.baseURLString), "mqt_sso")
    }

    @MainActor
    func testQuickConnectRefusedShowsTheServersMessage() async {
        StubURLProtocol.handler = { _ in
            StubURLProtocol.json(403, #"{"error":"Jellyfin didn't accept that Quick Connect code. Try again.","code":"forbidden"}"#)
        }
        let (session, store) = makeSession()
        let start = API.QuickConnectStart(handle: "q_1", code: "482915", expiresAt: Date().addingTimeInterval(600))
        do {
            _ = try await session.finishQuickConnect(start, interval: Self.fast)
            XCTFail("Expected a refusal")
        } catch {
            XCTAssertEqual(error.localizedDescription, "Jellyfin didn't accept that Quick Connect code. Try again.")
        }
        XCTAssertEqual(StubURLProtocol.requests.count, 1, "A 403 ends the polling")
        XCTAssertNil(store.token(for: Self.server.baseURLString))
    }
}

private final class PollCounter: @unchecked Sendable {
    private let lock = NSLock()
    private var count = 0

    var value: Int { lock.withLock { count } }

    @discardableResult
    func increment() -> Int { lock.withLock { count += 1; return count } }
}
