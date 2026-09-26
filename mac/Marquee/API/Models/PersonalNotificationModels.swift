import Foundation

// Personal notifications (api-v1.md §8, 0.45+; deviation 13): the account's
// own channels, which events reach the bell, device push and each channel,
// and (admin) what the household channels post. lib/api/types.ts
// `PersonalNotificationChannel`, `NotificationPreferenceRow`,
// `HouseholdNotificationEvents`.

extension API {
    /// A personal channel's service. A kind this app doesn't know decodes as
    /// `.unknown` and is shown read-only.
    enum NotificationChannelKind: OpenEnum {
        case telegram
        case pushover
        case email
        case discord
        case ntfy
        case webhook
        case unknown(String)

        /// The order the website offers them in.
        static let knownCases: [NotificationChannelKind] = [.telegram, .pushover, .email, .discord, .ntfy, .webhook]

        var rawValue: String {
            switch self {
            case .telegram: return "telegram"
            case .pushover: return "pushover"
            case .email: return "email"
            case .discord: return "discord"
            case .ntfy: return "ntfy"
            case .webhook: return "webhook"
            case let .unknown(raw): return raw
            }
        }

        /// personal-notifications.tsx `KIND_LABEL`.
        var label: String {
            switch self {
            case .telegram: return "Telegram"
            case .pushover: return "Pushover"
            case .email: return "Email"
            case .discord: return "Discord"
            case .ntfy: return "ntfy"
            case .webhook: return "Webhook"
            case let .unknown(raw): return raw.capitalized
            }
        }
    }

    /// `GET /me/notification-channels`.
    struct PersonalNotificationChannels: Codable, Hashable, Sendable {
        /// Which kinds this server can offer, by wire kind.
        let available: [String: NotificationChannelAvailability]
        let channels: [PersonalNotificationChannel]

        func availability(of kind: NotificationChannelKind) -> NotificationChannelAvailability? {
            available[kind.rawValue]
        }

        /// The kinds "Add a channel" offers, in the website's order.
        var offeredKinds: [NotificationChannelKind] {
            NotificationChannelKind.knownCases.filter { availability(of: $0)?.available == true }
        }

        /// The kinds the admin hasn't set up yet ("… can be added once the
        /// admin sets them up for the household.").
        var missingKinds: [NotificationChannelKind] {
            NotificationChannelKind.knownCases.filter { availability(of: $0)?.available != true }
        }

        /// The household bot, for "Connect with Telegram" (nil: enter the chat ID).
        var telegramBot: String? { availability(of: .telegram)?.botUsername.nonBlank }
        /// The household ntfy server, where a topic alone will do.
        var ntfyHouseholdServer: String? { availability(of: .ntfy)?.householdServer.nonBlank }
        /// Whether this account's webhook and ntfy URLs may be on the home network.
        var homeNetwork: Bool { availability(of: .webhook)?.homeNetwork == true }

        func replacing(_ channel: PersonalNotificationChannel) -> PersonalNotificationChannels {
            PersonalNotificationChannels(
                available: available,
                channels: channels.map { $0.id == channel.id ? channel : $0 }
            )
        }
    }

    /// One kind's entry in `available`; the extra fields are per kind.
    struct NotificationChannelAvailability: Codable, Hashable, Sendable {
        let available: Bool
        /// Telegram: the household bot (null if Telegram can't be reached).
        var botUsername: String?
        /// ntfy: the household server (null: only full topic URLs).
        var householdServer: String?
        /// Webhook: whether URLs may point at the home network.
        var homeNetwork: Bool?
    }

    struct PersonalNotificationChannel: Codable, Hashable, Sendable, Identifiable {
        let id: String
        let kind: NotificationChannelKind
        let name: String?
        /// Masked: enough to tell channels apart, never the secret itself.
        let target: String
        let enabled: Bool
        /// False for an email address, or a Telegram chat ID typed in by
        /// hand, until the 6-digit code sent there is entered; it gets
        /// nothing else until then.
        let verified: Bool
        let lastSuccessAt: Date?
        let lastError: String?
        let lastErrorAt: Date?
        let createdAt: Date

        /// personal-notifications.tsx `channelLabel`: the name, else the kind.
        var label: String { name.nonBlank ?? kind.label }

        /// Where the confirmation code went, above the code field.
        var codeSentLine: String {
            kind == .telegram
                ? "The bot sent a 6-digit code to your Telegram chat."
                : "We emailed a 6-digit code to \(target)."
        }

        /// The row's status line: why the last delivery failed (in red), or
        /// when the last one arrived; nil before either.
        func statusLine(now: Date = Date()) -> (text: String, isError: Bool)? {
            if let lastError = lastError.nonBlank {
                let when = lastErrorAt.map { " \(Format.timeAgo($0, now: now))" } ?? ""
                return ("Last try failed\(when): \(lastError)", true)
            }
            if let lastSuccessAt {
                return ("Last delivered \(Format.timeAgo(lastSuccessAt, now: now))", false)
            }
            return nil
        }
    }

    /// `POST /me/notification-channels`.
    struct CreateNotificationChannelRequest: Codable, Hashable, Sendable {
        let kind: NotificationChannelKind
        var name: String?
        var enabled: Bool?
        let config: [String: String]
    }

    /// `PATCH /me/notification-channels/{id}`: only what's set changes.
    struct UpdateNotificationChannelRequest: Codable, Hashable, Sendable {
        var name: String?
        var enabled: Bool?
        var config: [String: String]?
    }

    struct NotificationChannelCode: Codable, Hashable, Sendable {
        let code: String
    }

    /// `POST /me/notification-channels/telegram-link`.
    struct TelegramLinkStart: Codable, Hashable, Sendable {
        let code: String
        /// `https://t.me/<bot>?start=<code>`: open it, and Telegram offers Start.
        let url: String
        let expiresAt: Date
    }

    struct TelegramLinkPollRequest: Codable, Hashable, Sendable {
        let code: String
        var name: String?
    }

    /// `GET/PUT /me/notification-preferences`.
    struct NotificationPreferences: Codable, Hashable, Sendable {
        let events: [NotificationPreferenceRow]
    }

    struct NotificationPreferenceRow: Codable, Hashable, Sendable, Identifiable {
        /// Kept as the server's string: an event this app doesn't know is
        /// shown with its `label` like any other.
        let event: String
        let label: String
        /// Grouped under "For reviewers".
        let reviewerOnly: Bool
        /// The bell.
        var inApp: Bool
        /// Devices: Web Push, and banners in the Mac and Windows apps.
        var push: Bool
        /// By channel id.
        var channels: [String: Bool]

        var id: String { event }
    }

    /// One event's change in `PUT /me/notification-preferences`: only what's
    /// set is sent, and only what's sent changes.
    struct NotificationPreferenceChange: Codable, Hashable, Sendable {
        let event: String
        var inApp: Bool?
        var push: Bool?
        var channels: [String: Bool]?
    }

    struct NotificationPreferencesUpdate: Codable, Hashable, Sendable {
        let events: [NotificationPreferenceChange]
    }

    /// `GET/PUT /settings/notification-events` (admin): what the household
    /// channels post.
    struct HouseholdNotificationEvents: Codable, Hashable, Sendable {
        let events: [HouseholdNotificationEvent]
    }

    struct HouseholdNotificationEvent: Codable, Hashable, Sendable, Identifiable {
        let event: String
        let label: String
        var enabled: Bool

        var id: String { event }
    }

    /// `PUT /settings/notification-events`: `{ "events": { "issue_updated": true } }`.
    struct HouseholdNotificationEventsUpdate: Codable, Hashable, Sendable {
        let events: [String: Bool]
    }
}
