import XCTest
@testable import Marquee

// Personal notifications (api-v1.md §8, 0.45+): the DTOs against the doc's
// examples, the calls against a stubbed server, and the logic behind
// Settings › Account › Notifications (the add-channel form and the
// "What you hear about" matrix).

private let telegramId = "0b7d5f6e-3c1a-4f3e-9d61-6f0c2e1a9b44"
private let emailId = "5a0f4b1e-8d2c-4b6a-a1f7-2e9c3d4b5a61"

private func fixture(_ name: String) throws -> Data {
    let url = Bundle(for: PersonalNotificationsDecodingTests.self).resourceURL!
        .appendingPathComponent("Fixtures/api/\(name).json")
    return try Data(contentsOf: url)
}

private func decode<T: Decodable>(_ type: T.Type, _ name: String) throws -> T {
    try APIClient.decoder.decode(type, from: fixture(name))
}

final class PersonalNotificationsDecodingTests: XCTestCase {
    func testChannelsDecode() throws {
        let list = try decode(API.PersonalNotificationChannels.self, "notification-channels")
        XCTAssertEqual(list.offeredKinds, [.telegram, .email, .discord, .ntfy, .webhook])
        XCTAssertEqual(list.missingKinds, [.pushover])
        XCTAssertEqual(list.telegramBot, "MarqueeHomeBot")
        XCTAssertEqual(list.ntfyHouseholdServer, "https://ntfy.sh")
        XCTAssertFalse(list.homeNetwork)
        XCTAssertEqual(list.availability(of: .pushover)?.available, false)

        XCTAssertEqual(list.channels.count, 2)
        let telegram = list.channels[0]
        XCTAssertEqual(telegram.id, telegramId)
        XCTAssertEqual(telegram.kind, .telegram)
        XCTAssertEqual(telegram.label, "My phone")
        XCTAssertEqual(telegram.target, "Chat ••••6789")
        XCTAssertTrue(telegram.enabled)
        XCTAssertTrue(telegram.verified)
        XCTAssertEqual(telegram.lastSuccessAt, APIClient.parseDate("2026-09-25T18:40:05.000Z"))
        XCTAssertNil(telegram.lastError)

        let email = list.channels[1]
        XCTAssertEqual(email.kind, .email)
        XCTAssertNil(email.name)
        XCTAssertEqual(email.label, "Email", "No name: the kind")
        XCTAssertFalse(email.verified)
        XCTAssertNil(email.statusLine())
    }

    func testPreferencesDecode() throws {
        let preferences = try decode(API.NotificationPreferences.self, "notification-preferences")
        XCTAssertEqual(preferences.events.map(\.event), ["request_approved", "request_downloading", "request_pending"])
        let downloading = preferences.events[1]
        XCTAssertEqual(downloading.label, "Started downloading")
        XCTAssertFalse(downloading.reviewerOnly)
        XCTAssertTrue(downloading.inApp)
        XCTAssertFalse(downloading.push)
        XCTAssertEqual(downloading.channels, [telegramId: false, emailId: false])
        XCTAssertTrue(preferences.events[2].reviewerOnly)
    }

    func testHouseholdEventsDecode() throws {
        let household = try decode(API.HouseholdNotificationEvents.self, "household-notification-events")
        XCTAssertEqual(household.events.map(\.event), ["request_approved", "issue_updated"])
        XCTAssertEqual(household.events.map(\.label), ["A request is approved", "A reported problem is fixed"])
        XCTAssertEqual(household.events.map(\.enabled), [true, false])
    }

    /// A newer server's kind and event: kept, shown as they come.
    func testUnknownKindsAndEventsDecode() throws {
        let json = #"""
        {"available":{"telegram":{"available":true,"botUsername":null},"signal":{"available":true}},
         "channels":[{"id":"c1","kind":"signal","name":null,"target":"+1 ••• 42","enabled":true,"verified":true,
           "lastSuccessAt":null,"lastError":"Blocked","lastErrorAt":"2026-09-25T18:00:00.000Z","createdAt":"2026-09-25T17:00:00.000Z"}]}
        """#
        let list = try APIClient.decoder.decode(API.PersonalNotificationChannels.self, from: Data(json.utf8))
        let channel = try XCTUnwrap(list.channels.first)
        XCTAssertEqual(channel.kind, .unknown("signal"))
        XCTAssertFalse(channel.kind.isKnown)
        XCTAssertEqual(channel.label, "Signal")
        XCTAssertEqual(list.offeredKinds, [.telegram], "Only kinds this app can add")
        XCTAssertNil(list.telegramBot, "A null bot: enter the chat ID")
        XCTAssertNil(list.ntfyHouseholdServer)

        let preferences = try APIClient.decoder.decode(API.NotificationPreferences.self, from: Data(#"""
        {"events":[{"event":"request_comment","label":"Someone commented","reviewerOnly":false,"inApp":true,"push":false,"channels":{}}]}
        """#.utf8))
        XCTAssertEqual(preferences.events.first?.event, "request_comment")
        XCTAssertEqual(preferences.events.first?.label, "Someone commented")
    }

    func testAlertMissingMeansABanner() throws {
        func item(_ alert: String) throws -> API.NotificationItem {
            try APIClient.decoder.decode(API.NotificationItem.self, from: Data("""
            {"id":"bedcb20b-fa30-4683-b000-42affc320087","mediaType":"movie","tmdbId":603,"title":"The Matrix",\
            "eventType":"downloaded","message":"Ready.","read":false,\(alert)"createdAt":"2026-09-17T17:12:41.470Z"}
            """.utf8))
        }
        XCTAssertNil(try item("").alert)
        XCTAssertTrue(try item("").showsBanner, "An older server sends no alert: banner as before")
        XCTAssertTrue(try item(#""alert":true,"#).showsBanner)
        XCTAssertFalse(try item(#""alert":false,"#).showsBanner)
    }

    /// Email and a typed-in Telegram chat wait for a code; the line above
    /// the code field says where it went.
    func testCodeSentLinePerKind() throws {
        let list = try decode(API.PersonalNotificationChannels.self, "notification-channels")
        XCTAssertEqual(list.channels[1].codeSentLine, "We emailed a 6-digit code to anna@example.com.")
        let telegram = try APIClient.decoder.decode(API.PersonalNotificationChannel.self, from: Data(#"""
        {"id":"c2","kind":"telegram","name":null,"target":"Chat ••••6789","enabled":true,"verified":false,
         "lastSuccessAt":null,"lastError":null,"lastErrorAt":null,"createdAt":"2026-09-25T18:41:00.000Z"}
        """#.utf8))
        XCTAssertFalse(telegram.verified)
        XCTAssertEqual(telegram.codeSentLine, "The bot sent a 6-digit code to your Telegram chat.")
    }

    func testStatusLine() throws {
        let now = try XCTUnwrap(APIClient.parseDate("2026-09-25T18:45:05.000Z"))
        let list = try decode(API.PersonalNotificationChannels.self, "notification-channels")
        let delivered = try XCTUnwrap(list.channels.first?.statusLine(now: now))
        XCTAssertEqual(delivered.text, "Last delivered 5m ago")
        XCTAssertFalse(delivered.isError)

        let failing = try APIClient.decoder.decode(API.PersonalNotificationChannel.self, from: Data(#"""
        {"id":"c1","kind":"telegram","name":null,"target":"Chat ••••6789","enabled":true,"verified":true,
         "lastSuccessAt":"2026-09-25T18:00:00.000Z","lastError":"Forbidden: bot was blocked by the user",
         "lastErrorAt":"2026-09-25T16:45:05.000Z","createdAt":"2026-09-20T09:12:00.000Z"}
        """#.utf8))
        let failed = try XCTUnwrap(failing.statusLine(now: now))
        XCTAssertEqual(failed.text, "Last try failed 2h ago: Forbidden: bot was blocked by the user")
        XCTAssertTrue(failed.isError, "The error wins over an older success")
    }
}

final class ChannelFormTests: XCTestCase {
    private var channels: API.PersonalNotificationChannels!

    override func setUpWithError() throws {
        channels = try decode(API.PersonalNotificationChannels.self, "notification-channels")
    }

    private func filled(_ kind: API.NotificationChannelKind, _ values: [String: String], name: String = "") -> ChannelForm {
        var form = ChannelForm(channels: channels)
        form.kind = kind
        form.name = name
        for field in form.fields(channels) {
            if let value = values[field.key] { form.setValue(value, for: field) }
        }
        return form
    }

    func testStartsWithTheFirstOfferedKind() {
        let form = ChannelForm(channels: channels)
        XCTAssertEqual(form.kind, .telegram)
        XCTAssertEqual(form.ntfyMode, .household, "The household has an ntfy server")
    }

    func testFieldsPerKind() {
        var form = ChannelForm(channels: channels)
        let keys: [API.NotificationChannelKind: [String]] = [
            .telegram: ["chatId"], .pushover: ["userKey"], .email: ["address"],
            .discord: ["webhookUrl"], .ntfy: ["topic"], .webhook: ["url"],
        ]
        for (kind, expected) in keys {
            form.kind = kind
            XCTAssertEqual(form.fields(channels).map(\.key), expected, kind.rawValue)
        }
        form.kind = .ntfy
        XCTAssertEqual(form.fields(channels).first?.hint, "On https://ntfy.sh. Subscribe to the same topic in the ntfy app.")
        form.ntfyMode = .url
        XCTAssertEqual(form.fields(channels).map(\.key), ["url"])
        XCTAssertEqual(form.fields(channels).first?.secure, true)

        form.kind = .telegram
        XCTAssertTrue(form.fields(channels).first?.hint?.hasPrefix("Message @MarqueeHomeBot /start") == true)
        form.kind = .webhook
        XCTAssertTrue(form.fields(channels).first?.hint?.hasSuffix("not your home network.") == true)
    }

    func testRequestBodies() throws {
        XCTAssertEqual(
            try filled(.telegram, ["chatId": " 123456789 "], name: "  My phone ").request(channels),
            API.CreateNotificationChannelRequest(kind: .telegram, name: "My phone", config: ["chatId": "123456789"])
        )
        XCTAssertEqual(
            try filled(.email, ["address": "anna@example.com"]).request(channels),
            API.CreateNotificationChannelRequest(kind: .email, name: nil, config: ["address": "anna@example.com"])
        )
        XCTAssertEqual(
            try filled(.ntfy, ["topic": "marquee-anna"]).request(channels).config, ["topic": "marquee-anna"]
        )
        var url = filled(.ntfy, [:])
        url.ntfyMode = .url
        url.setValue("https://ntfy.sh/anna", for: url.fields(channels)[0])
        XCTAssertEqual(try url.request(channels).config, ["url": "https://ntfy.sh/anna"])
        XCTAssertEqual(
            try filled(.discord, ["webhookUrl": "https://discord.com/api/webhooks/1/abc"]).request(channels).config,
            ["webhookUrl": "https://discord.com/api/webhooks/1/abc"]
        )
        XCTAssertEqual(
            try filled(.pushover, ["userKey": "uQiRzpo4DXghDmr9QzzfQu27cmVRsG"]).request(channels).config,
            ["userKey": "uQiRzpo4DXghDmr9QzzfQu27cmVRsG"]
        )

        // Exactly the doc's body.
        let body = try APIClient.encoder.encode(try filled(.webhook, ["url": "https://example.com/hook"], name: "Home").request(channels))
        XCTAssertEqual(
            try JSONSerialization.jsonObject(with: body) as? NSDictionary,
            ["kind": "webhook", "name": "Home", "config": ["url": "https://example.com/hook"]] as NSDictionary
        )
    }

    func testValidation() {
        func problem(_ form: ChannelForm) -> String? {
            do {
                _ = try form.request(channels)
                return nil
            } catch {
                return error.localizedDescription
            }
        }
        XCTAssertEqual(problem(filled(.telegram, [:])), "Your chat ID is needed.")
        XCTAssertEqual(problem(filled(.telegram, ["chatId": "@anna"])), "A chat ID is a number, like 123456789.")
        XCTAssertNil(problem(filled(.telegram, ["chatId": "-1001234567890"])))
        XCTAssertEqual(problem(filled(.email, ["address": "anna"])), "Enter a valid email address.")
        XCTAssertEqual(problem(filled(.webhook, ["url": "example.com/hook"])), "Enter the full URL, starting with https://.")
        XCTAssertEqual(problem(filled(.pushover, ["userKey": "short"])), "A Pushover user key is 30 letters and numbers.")
        XCTAssertEqual(problem(filled(.ntfy, ["topic": "a/b"])), "A topic is one word, without slashes or spaces.")
    }

    func testValuesAreKeptPerKind() {
        var form = filled(.webhook, ["url": "https://example.com/hook"])
        form.kind = .ntfy
        form.ntfyMode = .url
        XCTAssertEqual(form.value(form.fields(channels)[0]), "", "ntfy's URL isn't the webhook's")
        form.kind = .webhook
        XCTAssertEqual(form.value(form.fields(channels)[0]), "https://example.com/hook")
    }

    func testWordingPerKind() {
        var form = ChannelForm(channels: channels)
        form.kind = .email
        XCTAssertEqual(form.submitTitle, "Send code")
        XCTAssertEqual(form.busyTitle, "Sending code…")
        XCTAssertEqual(form.successNotice, "Check your inbox for the code.")
        // A typed-in chat ID is confirmed with a code too.
        form.kind = .telegram
        XCTAssertTrue(form.sendsCode)
        XCTAssertEqual(form.submitTitle, "Send code")
        XCTAssertEqual(form.successNotice, "Check Telegram: the bot sent you a code to enter above.")
        form.kind = .discord
        XCTAssertEqual(form.submitTitle, "Test & add")
        XCTAssertEqual(form.busyTitle, "Testing…")
        XCTAssertEqual(ChannelForm.missingNote(channels), "Pushover can be added once the admin sets it up for the household.")
    }
}

final class PreferenceMatrixTests: XCTestCase {
    private func matrix() throws -> PreferenceMatrix {
        PreferenceMatrix(rows: try decode(API.NotificationPreferences.self, "notification-preferences").events)
    }

    func testColumnsAndGroups() throws {
        let channels = try decode(API.PersonalNotificationChannels.self, "notification-channels").channels
        XCTAssertEqual(PreferenceMatrix.columns(for: channels), [.bell, .devices, .channel(telegramId)], "The unconfirmed email isn't a column yet")
        let matrix = try matrix()
        XCTAssertEqual(matrix.everyone.map(\.event), ["request_approved", "request_downloading"])
        XCTAssertEqual(matrix.reviewers.map(\.event), ["request_pending"])
        XCTAssertFalse(matrix.isSaving)
    }

    func testChangeBodies() throws {
        let bodies = try [
            PreferenceMatrix.change(event: "request_downloading", column: .bell, on: false),
            PreferenceMatrix.change(event: "request_downloading", column: .devices, on: true),
            PreferenceMatrix.change(event: "request_downloading", column: .channel(telegramId), on: true),
        ].map { change in
            try JSONSerialization.jsonObject(with: APIClient.encoder.encode(API.NotificationPreferencesUpdate(events: [change]))) as? NSDictionary
        }
        XCTAssertEqual(bodies, [
            ["events": [["event": "request_downloading", "inApp": false]]],
            ["events": [["event": "request_downloading", "push": true]]],
            ["events": [["event": "request_downloading", "channels": [telegramId: true]]]],
        ] as [NSDictionary])
    }

    func testToggleShowsAtOnceThenTakesTheAnswer() throws {
        var matrix = try matrix()
        let (token, change) = matrix.toggle(event: "request_downloading", column: .channel(telegramId), on: true)
        XCTAssertEqual(change, API.NotificationPreferenceChange(event: "request_downloading", channels: [telegramId: true]))
        let row = try XCTUnwrap(matrix.rows.first { $0.event == "request_downloading" })
        XCTAssertTrue(PreferenceMatrix.value(row, .channel(telegramId)))
        XCTAssertFalse(PreferenceMatrix.value(row, .channel(emailId)), "Other channels untouched")
        XCTAssertTrue(matrix.isSaving)

        // The server's answer replaces the rows (here, it also turned on push).
        var answer = matrix.rows
        answer[1].push = true
        matrix.saved(answer, token: token)
        XCTAssertEqual(matrix.rows, answer)
        XCTAssertFalse(matrix.isSaving)
    }

    func testAFailedSaveGoesBackToTheServersRows() throws {
        var matrix = try matrix()
        let original = matrix.rows
        let (token, _) = matrix.toggle(event: "request_approved", column: .bell, on: false)
        XCTAssertFalse(matrix.rows[0].inApp)
        matrix.failed(token: token)
        XCTAssertEqual(matrix.rows, original)
    }

    func testAnOlderAnswerDoesNotUndoANewerToggle() throws {
        var matrix = try matrix()
        let (first, _) = matrix.toggle(event: "request_approved", column: .bell, on: false)
        let afterFirst = matrix.rows
        let (second, _) = matrix.toggle(event: "request_approved", column: .devices, on: false)
        let afterBoth = matrix.rows

        matrix.saved(afterFirst, token: first)
        XCTAssertEqual(matrix.rows, afterBoth, "The newer toggle is still on its way")
        XCTAssertTrue(matrix.isSaving)
        matrix.failed(token: second)
        XCTAssertEqual(matrix.rows, afterFirst, "Back to the server's last answer")
        XCTAssertFalse(matrix.isSaving)
    }
}

@MainActor
final class PersonalNotificationsRequestTests: XCTestCase {
    private struct Case {
        let method: String
        let path: String
        var body: String?
        let response: (Int, String)
        var records = false
        let call: (MarqueeAPI) async throws -> Void
    }

    private static let channelJSON = #"{"id":"0b7d5f6e-3c1a-4f3e-9d61-6f0c2e1a9b44","kind":"telegram","name":"My phone","target":"Chat ••••6789","enabled":false,"verified":true,"lastSuccessAt":null,"lastError":null,"lastErrorAt":null,"createdAt":"2026-09-20T09:12:00.000Z"}"#

    override func tearDown() {
        StubURLProtocol.handler = nil
        StubURLProtocol.requests = []
        super.tearDown()
    }

    private func api(_ events: ServerEvents? = nil) -> MarqueeAPI {
        let client = APIClient(baseURL: URL(string: "http://127.0.0.1:3000")!, token: "mqt_test", session: StubURLProtocol.session())
        return MarqueeAPI(client: client, events: events)
    }

    func testEachCallSendsWhatTheDocSpecifies() async throws {
        let channels = String(decoding: try fixture("notification-channels"), as: UTF8.self)
        let preferences = String(decoding: try fixture("notification-preferences"), as: UTF8.self)
        let household = String(decoding: try fixture("household-notification-events"), as: UTF8.self)
        let base = "/me/notification-channels"
        let one = "\(base)/\(telegramId)"
        let cases: [Case] = [
            Case(method: "GET", path: base, response: (200, channels)) { api in
                let list = try await api.notificationChannels.list()
                XCTAssertEqual(list?.channels.count, 2)
            },
            Case(method: "POST", path: base, body: #"{"kind":"telegram","name":"My phone","config":{"chatId":"123456789"}}"#, response: (201, Self.channelJSON)) { api in
                let channel = try await api.notificationChannels.add(API.CreateNotificationChannelRequest(
                    kind: .telegram, name: "My phone", config: ["chatId": "123456789"]
                ))
                XCTAssertEqual(channel.id, telegramId)
            },
            Case(method: "PATCH", path: one, body: #"{"enabled":false}"#, response: (200, Self.channelJSON)) { api in
                let channel = try await api.notificationChannels.update(telegramId, .init(enabled: false))
                XCTAssertFalse(channel.enabled)
            },
            Case(method: "DELETE", path: one, response: (200, #"{"ok":true}"#)) { api in
                try await api.notificationChannels.remove(telegramId)
            },
            Case(method: "POST", path: "\(one)/test", response: (200, Self.channelJSON)) { api in
                _ = try await api.notificationChannels.test(telegramId)
            },
            Case(method: "POST", path: "\(base)/\(emailId)/verify", body: #"{"code":"123456"}"#, response: (200, Self.channelJSON)) { api in
                _ = try await api.notificationChannels.verify(emailId, code: " 123456 ")
            },
            Case(method: "POST", path: "\(base)/\(emailId)/resend-code", response: (200, Self.channelJSON)) { api in
                _ = try await api.notificationChannels.resendCode(emailId)
            },
            Case(method: "POST", path: "\(base)/telegram-link", response: (200, #"{"code":"abc123","url":"https://t.me/MarqueeHomeBot?start=abc123","expiresAt":"2026-09-25T19:00:00.000Z"}"#)) { api in
                let start = try await api.notificationChannels.startTelegramLink()
                XCTAssertEqual(start.code, "abc123")
                XCTAssertEqual(start.url, "https://t.me/MarqueeHomeBot?start=abc123")
            },
            Case(method: "POST", path: "\(base)/telegram-link/poll", body: #"{"code":"abc123","name":"My phone"}"#, response: (202, #"{"status":"pending"}"#)) { api in
                let channel = try await api.notificationChannels.pollTelegramLink(code: "abc123", name: "My phone")
                XCTAssertNil(channel)
            },
            Case(method: "POST", path: "\(base)/telegram-link/poll", body: #"{"code":"abc123"}"#, response: (201, Self.channelJSON)) { api in
                let channel = try await api.notificationChannels.pollTelegramLink(code: "abc123", name: "  ")
                XCTAssertEqual(channel?.kind, .telegram)
            },
            Case(method: "GET", path: "/me/notification-preferences", response: (200, preferences)) { api in
                let answer = try await api.notificationPreferences.get()
                XCTAssertEqual(answer?.events.count, 3)
            },
            Case(
                method: "PUT", path: "/me/notification-preferences",
                body: #"{"events":[{"event":"request_downloading","push":false,"channels":{"0b7d5f6e-3c1a-4f3e-9d61-6f0c2e1a9b44":true}}]}"#,
                response: (200, preferences), records: true
            ) { api in
                let answer = try await api.notificationPreferences.save([
                    API.NotificationPreferenceChange(event: "request_downloading", push: false, channels: [telegramId: true]),
                ])
                XCTAssertEqual(answer.events.count, 3)
            },
            Case(method: "GET", path: "/settings/notification-events", response: (200, household)) { api in
                let answer = try await api.integrations.householdEvents()
                XCTAssertEqual(answer?.events.count, 2)
            },
            Case(method: "PUT", path: "/settings/notification-events", body: #"{"events":{"issue_updated":true}}"#, response: (200, household), records: true) { api in
                _ = try await api.integrations.saveHouseholdEvents(["issue_updated": true])
            },
        ]

        for testCase in cases {
            let label = "\(testCase.method) \(testCase.path) → \(testCase.response.0)"
            let events = ServerEvents()
            let (status, json) = testCase.response
            StubURLProtocol.requests = []
            StubURLProtocol.handler = { _ in StubURLProtocol.json(status, json) }

            do {
                try await testCase.call(api(events))
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

    /// A server before 0.45: the reads come back nil (the screens hide),
    /// nothing is an error.
    func testOlderServerHasNoPersonalNotifications() async throws {
        StubURLProtocol.handler = { _ in StubURLProtocol.json(404, #"{"error":"Not found","code":"not_found"}"#) }
        let api = api()
        let channels = try await api.notificationChannels.list()
        let preferences = try await api.notificationPreferences.get()
        let household = try await api.integrations.householdEvents()
        XCTAssertNil(channels)
        XCTAssertNil(preferences)
        XCTAssertNil(household)
    }

    func testFailuresCarryTheServersReason() async {
        let api = api()

        StubURLProtocol.handler = { _ in StubURLProtocol.json(400, #"{"error":"The test message didn't arrive: HTTP 404","code":"invalid"}"#) }
        do {
            _ = try await api.notificationChannels.add(API.CreateNotificationChannelRequest(kind: .webhook, config: ["url": "https://example.com"]))
            XCTFail("Expected invalid")
        } catch {
            XCTAssertEqual(error.localizedDescription, "The test message didn't arrive: HTTP 404")
        }

        StubURLProtocol.handler = { _ in StubURLProtocol.json(410, #"{"error":"That link expired.","code":"expired"}"#) }
        do {
            _ = try await api.notificationChannels.pollTelegramLink(code: "abc123")
            XCTFail("Expected expired")
        } catch {
            XCTAssertEqual(error as? MediaSignInError, .expiredWith("That link expired."))
        }

        StubURLProtocol.handler = { _ in StubURLProtocol.json(409, #"{"error":"Enter the chat ID instead.","code":"conflict"}"#) }
        do {
            _ = try await api.notificationChannels.pollTelegramLink(code: "abc123")
            XCTFail("Expected conflict")
        } catch {
            XCTAssertEqual(error as? APIError, .conflict("Enter the chat ID instead."))
        }
    }

    func testTelegramLinkPollsUntilTheChannelArrives() async throws {
        var polls = 0
        let channel = try await TelegramLink.run(interval: .milliseconds(1), maxPolls: 5) { () async throws -> String? in
            polls += 1
            return polls == 3 ? "connected" : nil
        }
        XCTAssertEqual(channel, "connected")
        XCTAssertEqual(polls, 3)

        do {
            _ = try await TelegramLink.run(interval: .milliseconds(1), maxPolls: 2) { () async throws -> String? in nil }
            XCTFail("Expected to give up")
        } catch {
            XCTAssertEqual(error as? MediaSignInError, .expiredWith(TelegramLink.timedOutMessage))
        }
    }

    // MARK: Helpers

    private static func body(of request: URLRequest) -> Data {
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

    private static func jsonObject(_ data: Data) throws -> NSDictionary {
        try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? NSDictionary)
    }
}
