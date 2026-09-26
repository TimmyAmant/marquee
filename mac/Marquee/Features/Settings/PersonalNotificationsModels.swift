import Foundation

// The logic behind Settings › Account › Notifications' "Your channels" and
// "What you hear about" (app/settings/personal-notifications.tsx), kept out
// of the views so it can be tested.

/// personal-notifications.tsx `AddChannel`'s form: which kind, what it asks
/// for (`fieldsFor`), and the `POST /me/notification-channels` body.
struct ChannelForm: Equatable {
    /// ntfy: a topic on the household server, or a full topic URL.
    enum NtfyMode: String, CaseIterable, Hashable, Sendable {
        case household
        case url
    }

    struct Field: Equatable, Identifiable {
        /// The `config` key.
        let key: String
        let label: String
        var placeholder = ""
        var hint: String?
        /// Webhook URLs, topic URLs and keys are secrets.
        var secure = false

        var id: String { key }
    }

    var kind: API.NotificationChannelKind
    var ntfyMode: NtfyMode
    /// Optional, like "My phone".
    var name = ""
    /// Typed values by kind and field, so switching kinds and back keeps them.
    private var values: [String: String] = [:]

    static let nameLimit = 60

    /// The first kind on offer, and a topic on the household's ntfy server when there is one.
    init(channels: API.PersonalNotificationChannels) {
        kind = channels.offeredKinds.first ?? .discord
        ntfyMode = channels.ntfyHouseholdServer == nil ? .url : .household
    }

    func value(_ field: Field) -> String {
        values[storageKey(field)] ?? ""
    }

    mutating func setValue(_ value: String, for field: Field) {
        values[storageKey(field)] = value
    }

    private func storageKey(_ field: Field) -> String {
        "\(kind.rawValue).\(field.key)"
    }

    /// What this kind asks for (`fieldsFor`).
    func fields(_ channels: API.PersonalNotificationChannels) -> [Field] {
        switch kind {
        case .telegram:
            let hint = channels.telegramBot.map {
                "Message @\($0) /start, then paste your chat ID (@userinfobot on Telegram tells you yours). Or use Connect with Telegram above."
            } ?? "Message the household's bot /start, then paste your chat ID (@userinfobot on Telegram tells you yours)."
            return [Field(key: "chatId", label: "Your chat ID", placeholder: "123456789", hint: hint)]
        case .pushover:
            return [Field(key: "userKey", label: "Your user key", hint: "The 30-character key at the top of your pushover.net dashboard.", secure: true)]
        case .email:
            return [Field(key: "address", label: "Your email address", placeholder: "you@example.com", hint: "We'll email a code to confirm it's yours first.")]
        case .discord:
            return [Field(
                key: "webhookUrl", label: "Discord webhook URL", placeholder: "https://discord.com/api/webhooks/…",
                hint: "In your own server: channel settings › Integrations › Webhooks › New Webhook › Copy Webhook URL.",
                secure: true
            )]
        case .ntfy:
            if ntfyMode == .household, let server = channels.ntfyHouseholdServer {
                return [Field(
                    key: "topic", label: "Topic", placeholder: "pick-something-hard-to-guess",
                    hint: "On \(server). Subscribe to the same topic in the ntfy app."
                )]
            }
            return [Field(key: "url", label: "Topic URL", placeholder: "https://ntfy.sh/your-topic", hint: Self.internetHint(channels), secure: true)]
        case .webhook:
            let payload = "Marquee POSTs JSON: { event, preference, title, message, mediaType, tmdbId }."
            return [Field(
                key: "url", label: "Webhook URL", placeholder: "https://example.com/hooks/marquee",
                hint: [payload, Self.internetHint(channels)].compactMap { $0 }.joined(separator: " "),
                secure: true
            )]
        case .unknown:
            return []
        }
    }

    private static func internetHint(_ channels: API.PersonalNotificationChannels) -> String? {
        channels.homeNetwork ? nil : "It must be on the internet, not your home network."
    }

    /// The trimmed name, nil when blank.
    var trimmedName: String? {
        name.nonBlank.map { String($0.trimmingCharacters(in: .whitespacesAndNewlines).prefix(Self.nameLimit)) }
    }

    /// The `POST /me/notification-channels` body, or `.invalid` with what to
    /// fix. The server checks everything again (and sends a test first).
    func request(_ channels: API.PersonalNotificationChannels) throws -> API.CreateNotificationChannelRequest {
        guard kind.isKnown else { throw APIError.invalid("This app can't add that kind of channel.") }
        var config: [String: String] = [:]
        for field in fields(channels) {
            let value = value(field).trimmingCharacters(in: .whitespacesAndNewlines)
            guard !value.isEmpty else { throw APIError.invalid("\(field.label) is needed.") }
            if let problem = Self.problem(with: value, in: field) { throw APIError.invalid(problem) }
            config[field.key] = value
        }
        return API.CreateNotificationChannelRequest(kind: kind, name: trimmedName, config: config)
    }

    /// A quick check before the round trip; nil when it looks right.
    private static func problem(with value: String, in field: Field) -> String? {
        switch field.key {
        case "chatId":
            let digits = value.hasPrefix("-") ? String(value.dropFirst()) : value
            return !digits.isEmpty && digits.allSatisfy(\.isASCII) && digits.allSatisfy(\.isNumber)
                ? nil : "A chat ID is a number, like 123456789."
        case "userKey":
            return value.count == 30 && value.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber) }
                ? nil : "A Pushover user key is 30 letters and numbers."
        case "address":
            let parts = value.split(separator: "@", omittingEmptySubsequences: false)
            return parts.count == 2 && !parts[0].isEmpty && parts[1].contains(".") && !value.contains(" ")
                ? nil : "Enter a valid email address."
        case "webhookUrl", "url":
            guard let url = URL(string: value), let scheme = url.scheme?.lowercased(),
                  scheme == "https" || scheme == "http", url.host?.isEmpty == false
            else { return "Enter the full URL, starting with https://." }
            return nil
        case "topic":
            return value.contains("/") || value.contains(" ") ? "A topic is one word, without slashes or spaces." : nil
        default:
            return nil
        }
    }

    /// Email and a typed-in Telegram chat are confirmed with a 6-digit code
    /// first (the one-tap Telegram link isn't: it proves the chat itself).
    var sendsCode: Bool { kind == .email || kind == .telegram }

    /// "Send code" when it gets a code rather than a test, else "Test & add".
    var submitTitle: String { sendsCode ? "Send code" : "Test & add" }
    var busyTitle: String { sendsCode ? "Sending code…" : "Testing…" }
    var successNotice: String {
        switch kind {
        case .email: return "Check your inbox for the code."
        case .telegram: return "Check Telegram: the bot sent you a code to enter above."
        default: return "Added. A test message is on its way."
        }
    }

    /// "Pushover and Email can be added once the admin sets them up for the household."
    static func missingNote(_ channels: API.PersonalNotificationChannels) -> String? {
        let missing = channels.missingKinds
        guard !missing.isEmpty else { return nil }
        let names = missing.map(\.label).joined(separator: ", ")
        return "\(names) can be added once the admin sets \(missing.count == 1 ? "it" : "them") up for the household."
    }
}

/// personal-notifications.tsx `PreferenceMatrix`: rows are events, columns
/// the bell, devices and each confirmed channel. A toggle shows at once and
/// is `PUT` on its own; the server's answer (the whole list) then replaces
/// the rows, and a failed save puts back what the server last said.
struct PreferenceMatrix: Equatable {
    enum Column: Hashable, Sendable {
        case bell
        case devices
        case channel(String)
    }

    typealias Row = API.NotificationPreferenceRow

    private(set) var rows: [Row]
    /// The server's last answer.
    private var confirmed: [Row]
    /// The newest save; older answers only update `confirmed`.
    private var latestSave = 0
    private var inFlight = 0

    init(rows: [Row]) {
        self.rows = rows
        confirmed = rows
    }

    var isSaving: Bool { inFlight > 0 }

    /// Everyone's events, in the server's order.
    var everyone: [Row] { rows.filter { !$0.reviewerOnly } }
    /// Grouped under "For reviewers".
    var reviewers: [Row] { rows.filter(\.reviewerOnly) }

    /// Bell, Devices, then each channel that can get anything (confirmed:
    /// an email address waiting for its code isn't a column yet).
    static func columns(for channels: [API.PersonalNotificationChannel]) -> [Column] {
        [.bell, .devices] + channels.filter(\.verified).map { .channel($0.id) }
    }

    static func value(_ row: Row, _ column: Column) -> Bool {
        switch column {
        case .bell: return row.inApp
        case .devices: return row.push
        case let .channel(id): return row.channels[id] ?? false
        }
    }

    /// The one-event body for turning `column` on or off.
    static func change(event: String, column: Column, on: Bool) -> API.NotificationPreferenceChange {
        switch column {
        case .bell: return API.NotificationPreferenceChange(event: event, inApp: on)
        case .devices: return API.NotificationPreferenceChange(event: event, push: on)
        case let .channel(id): return API.NotificationPreferenceChange(event: event, channels: [id: on])
        }
    }

    /// Shows the toggle straight away and returns what to `PUT`, with the
    /// token to hand back to `saved` / `failed`.
    mutating func toggle(event: String, column: Column, on: Bool) -> (token: Int, change: API.NotificationPreferenceChange) {
        let change = Self.change(event: event, column: column, on: on)
        rows = Self.applying(change, to: rows)
        latestSave += 1
        inFlight += 1
        return (latestSave, change)
    }

    /// The server's answer to save `token`.
    mutating func saved(_ answer: [Row], token: Int) {
        inFlight = max(0, inFlight - 1)
        confirmed = answer
        // A newer toggle is still on its way: keep showing it.
        if token == latestSave { rows = answer }
    }

    /// Save `token` failed: back to what the server last said, unless a newer one is on its way.
    mutating func failed(token: Int) {
        inFlight = max(0, inFlight - 1)
        if token == latestSave { rows = confirmed }
    }

    static func applying(_ change: API.NotificationPreferenceChange, to rows: [Row]) -> [Row] {
        rows.map { row in
            guard row.event == change.event else { return row }
            var row = row
            if let inApp = change.inApp { row.inApp = inApp }
            if let push = change.push { row.push = push }
            if let channels = change.channels { row.channels.merge(channels) { $1 } }
            return row
        }
    }
}
