import Foundation
import Observation
import OSLog
import UserNotifications

/// What macOS allows for Marquee's notifications.
enum NotificationAuthorization: Equatable, Sendable {
    /// Never asked: requesting shows the system prompt.
    case notDetermined
    /// Turned off in System Settings, or declined at the prompt.
    case denied
    case authorized
}

@MainActor
protocol NotificationAuthorizing: AnyObject {
    func authorization() async -> NotificationAuthorization
    /// Shows the system prompt the first time; after that it answers from
    /// System Settings without asking.
    func requestAuthorization() async -> Bool
}

/// Where each account's answer is kept, per server and account (the same
/// identity `LiveUpdates` keys its watermark with).
@MainActor
protocol NotificationChoiceStore: AnyObject {
    func choice(for identity: String) -> NotificationConsent.Choice?
    func setChoice(_ choice: NotificationConsent.Choice, for identity: String)
    /// Some account on this Mac has answered: this install has the question.
    var hasAnyChoice: Bool { get }
}

/// Whether this Mac shows the signed-in account's notifications as banners,
/// and when to ask (components/push-prompt.tsx and Settings › Account ›
/// Notifications on the website).
///
/// Nothing asks macOS for permission by itself. After signing in, the main
/// window shows "Get notifications on this Mac?" (`isAsking`), and only its
/// "Turn on" brings up the system prompt. The answer is kept per server and
/// account:
/// - **on**: banners, for as long as System Settings allows them.
/// - **not now**: no banners (the bell still shows everything), and the
///   question comes back at the next sign-in.
/// - **off**: turned off in Settings › Account; not asked again.
///
/// An install from before the question, which macOS already allows, counts
/// as on.
@MainActor
@Observable
final class NotificationConsent {
    enum Choice: String, Sendable {
        case on
        case off
        case notNow
    }

    /// Banners go out: the account said on, and macOS allows it.
    private(set) var isEnabled = false
    /// The "Get notifications on this Mac?" card is showing.
    private(set) var isAsking = false
    private(set) var authorization: NotificationAuthorization = .notDetermined
    /// The signed-in account's answer; nil before it's been asked.
    private(set) var choice: Choice?

    /// Told whenever `isEnabled` may have changed (`LiveUpdates.bannersEnabled`).
    @ObservationIgnored var onChange: ((Bool) -> Void)?

    @ObservationIgnored private let authorizer: NotificationAuthorizing
    @ObservationIgnored private let store: NotificationChoiceStore
    @ObservationIgnored private var identity: String?

    private static let logger = Logger(subsystem: "com.timmyamant.Marquee", category: "notifications")

    init(
        authorizer: NotificationAuthorizing = SystemNotificationAuthorizer(),
        store: NotificationChoiceStore = DefaultsNotificationChoices()
    ) {
        self.authorizer = authorizer
        self.store = store
    }

    /// An account is signed in: read its answer, and ask if it's due.
    /// - Parameter freshSignIn: A sign-in with a password, rather than the
    ///   saved session coming back at launch. Only then does a "Not now" ask again.
    func begin(identity: String, freshSignIn: Bool) async {
        self.identity = identity
        let authorization = await authorizer.authorization()
        guard self.identity == identity else { return }
        self.authorization = authorization

        var choice = store.choice(for: identity)
        if choice == nil, authorization == .authorized, !store.hasAnyChoice {
            // Allowed before this question existed. (Once any account here
            // has answered, macOS's yes is someone else's: ask this one.)
            choice = .on
            store.setChoice(.on, for: identity)
        }
        self.choice = choice

        let due: Bool
        switch choice {
        case nil: due = true
        case .notNow: due = freshSignIn
        // Said yes, but macOS has forgotten (the permission was reset).
        case .on: due = authorization == .notDetermined
        case .off: due = false
        }
        // Once it's off in System Settings, only Settings can turn it back on.
        isAsking = due && authorization != .denied
        Self.logger.info(
            "Notifications: answer \(choice?.rawValue ?? "none", privacy: .public), macOS \(String(describing: authorization), privacy: .public), asking \(self.isAsking)"
        )
        update()
    }

    /// Signed out, or the session ended.
    func end() {
        identity = nil
        choice = nil
        isAsking = false
        update()
    }

    /// "Turn on" on the card, or the Settings toggle: shows the system prompt
    /// if macOS hasn't asked yet. The account's answer is on either way, so
    /// allowing Marquee in System Settings later is all it takes.
    func turnOn() async {
        guard let identity else { return }
        isAsking = false
        choice = .on
        store.setChoice(.on, for: identity)
        let granted = await authorizer.requestAuthorization()
        var authorization = NotificationAuthorization.authorized
        if !granted { authorization = await authorizer.authorization() }
        guard self.identity == identity else { return }
        self.authorization = authorization
        update()
    }

    /// "Not now" on the card.
    func notNow() {
        guard let identity else { return }
        isAsking = false
        choice = .notNow
        store.setChoice(.notNow, for: identity)
        update()
    }

    /// The Settings toggle, off.
    func turnOff() {
        guard let identity else { return }
        isAsking = false
        choice = .off
        store.setChoice(.off, for: identity)
        update()
    }

    /// Back in the app: System Settings may have changed while it was away.
    func refreshAuthorization() async {
        guard let identity else { return }
        let authorization = await authorizer.authorization()
        guard self.identity == identity else { return }
        if authorization != self.authorization { self.authorization = authorization }
        update()
    }

    private func update() {
        let enabled = identity != nil && choice == .on && authorization == .authorized
        if enabled != isEnabled { isEnabled = enabled }
        onChange?(enabled)
    }
}

// MARK: - System implementations

@MainActor
final class SystemNotificationAuthorizer: NotificationAuthorizing {
    private static let logger = Logger(subsystem: "com.timmyamant.Marquee", category: "notifications")

    func authorization() async -> NotificationAuthorization {
        switch await Self.status() {
        case .authorized, .provisional: return .authorized
        case .denied: return .denied
        default: return .notDetermined
        }
    }

    func requestAuthorization() async -> Bool {
        do {
            return try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
        } catch {
            Self.logger.error("Notification authorization failed: \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    /// Off the main actor, handing back only the (Sendable) status.
    @concurrent
    private static func status() async -> UNAuthorizationStatus {
        await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
    }
}

@MainActor
final class DefaultsNotificationChoices: NotificationChoiceStore {
    static let keyPrefix = "marquee.notifications.choice."
    static let answeredKey = "marquee.notifications.answered"
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    var hasAnyChoice: Bool {
        defaults.bool(forKey: Self.answeredKey)
    }

    func choice(for identity: String) -> NotificationConsent.Choice? {
        defaults.string(forKey: Self.keyPrefix + identity).flatMap(NotificationConsent.Choice.init(rawValue:))
    }

    func setChoice(_ choice: NotificationConsent.Choice, for identity: String) {
        defaults.set(choice.rawValue, forKey: Self.keyPrefix + identity)
        defaults.set(true, forKey: Self.answeredKey)
    }
}
