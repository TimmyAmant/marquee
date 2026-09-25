import XCTest
@testable import Marquee

// When the "Get notifications on this Mac?" card asks, and what each answer
// does, against a stand-in for macOS's permission.

@MainActor
final class NotificationConsentTests: XCTestCase {
    private final class FakeAuthorizer: NotificationAuthorizing {
        var status: NotificationAuthorization = .notDetermined
        /// What the system prompt answers, the first time it's shown.
        var userAllows = true
        var requests = 0

        func authorization() async -> NotificationAuthorization { status }

        func requestAuthorization() async -> Bool {
            requests += 1
            if status == .notDetermined { status = userAllows ? .authorized : .denied }
            return status == .authorized
        }
    }

    private final class MemoryChoices: NotificationChoiceStore {
        var values: [String: NotificationConsent.Choice] = [:]
        var hasAnyChoice: Bool { !values.isEmpty }
        func choice(for identity: String) -> NotificationConsent.Choice? { values[identity] }
        func setChoice(_ choice: NotificationConsent.Choice, for identity: String) { values[identity] = choice }
    }

    private let timmy = "http://127.0.0.1:3100|timmy"
    private var authorizer = FakeAuthorizer()
    private var choices = MemoryChoices()
    /// The last value handed to `LiveUpdates.bannersEnabled`.
    private var bannersEnabled: Bool?

    private func makeConsent() -> NotificationConsent {
        let consent = NotificationConsent(authorizer: authorizer, store: choices)
        consent.onChange = { [weak self] in self?.bannersEnabled = $0 }
        return consent
    }

    func testItAsksAfterSigningInAndOnlyTurnOnShowsTheSystemPrompt() async {
        let consent = makeConsent()
        await consent.begin(identity: timmy, freshSignIn: true)
        XCTAssertTrue(consent.isAsking)
        XCTAssertFalse(consent.isEnabled)
        XCTAssertEqual(authorizer.requests, 0, "Nothing asks macOS before the card's Turn on")

        await consent.turnOn()
        XCTAssertEqual(authorizer.requests, 1)
        XCTAssertFalse(consent.isAsking)
        XCTAssertTrue(consent.isEnabled)
        XCTAssertEqual(bannersEnabled, true)
        XCTAssertEqual(choices.values[timmy], .on)

        // Remembered: the next launch doesn't ask.
        let next = makeConsent()
        await next.begin(identity: timmy, freshSignIn: false)
        XCTAssertFalse(next.isAsking)
        XCTAssertTrue(next.isEnabled)
    }

    func testNotNowMeansNoBannersUntilTheNextSignIn() async {
        let consent = makeConsent()
        await consent.begin(identity: timmy, freshSignIn: true)
        consent.notNow()
        XCTAssertFalse(consent.isAsking)
        XCTAssertFalse(consent.isEnabled)
        XCTAssertEqual(bannersEnabled, false)
        XCTAssertEqual(authorizer.requests, 0)

        // Relaunching with the saved session: still not now.
        let relaunch = makeConsent()
        await relaunch.begin(identity: timmy, freshSignIn: false)
        XCTAssertFalse(relaunch.isAsking)

        // Signing in again: asked again.
        let signIn = makeConsent()
        await signIn.begin(identity: timmy, freshSignIn: true)
        XCTAssertTrue(signIn.isAsking)
    }

    func testTheChoiceIsPerServerAndAccount() async {
        let consent = makeConsent()
        await consent.begin(identity: timmy, freshSignIn: true)
        await consent.turnOn()

        consent.end()
        XCTAssertFalse(consent.isEnabled, "Signed out: nobody's banners")
        await consent.begin(identity: "http://127.0.0.1:3100|kid", freshSignIn: true)
        XCTAssertTrue(consent.isAsking, "Another account on this Mac is asked for itself")
        XCTAssertFalse(consent.isEnabled)
    }

    func testAnInstallThatMacOSAlreadyAllowsCountsAsOn() async {
        authorizer.status = .authorized
        let consent = makeConsent()
        await consent.begin(identity: timmy, freshSignIn: false)
        XCTAssertFalse(consent.isAsking)
        XCTAssertTrue(consent.isEnabled)
        XCTAssertEqual(choices.values[timmy], .on)
    }

    func testOffInSystemSettingsIsNotAskedAndNeedsSystemSettings() async {
        authorizer.status = .denied
        let consent = makeConsent()
        await consent.begin(identity: timmy, freshSignIn: true)
        XCTAssertFalse(consent.isAsking, "The card can't help once macOS says no")

        // The Settings toggle: the answer is on, but macOS still says no.
        await consent.turnOn()
        XCTAssertEqual(consent.choice, .on)
        XCTAssertEqual(consent.authorization, .denied)
        XCTAssertFalse(consent.isEnabled)

        // Allowed in System Settings, then back to Marquee.
        authorizer.status = .authorized
        await consent.refreshAuthorization()
        XCTAssertTrue(consent.isEnabled)
    }

    func testDecliningTheSystemPromptLeavesBannersOff() async {
        authorizer.userAllows = false
        let consent = makeConsent()
        await consent.begin(identity: timmy, freshSignIn: true)
        await consent.turnOn()
        XCTAssertFalse(consent.isEnabled)
        XCTAssertEqual(consent.authorization, .denied)
        XCTAssertFalse(consent.isAsking)
    }

    func testTurningItOffInSettingsSticks() async {
        authorizer.status = .authorized
        let consent = makeConsent()
        await consent.begin(identity: timmy, freshSignIn: true)
        consent.turnOff()
        XCTAssertFalse(consent.isEnabled)
        XCTAssertEqual(bannersEnabled, false)

        let signIn = makeConsent()
        await signIn.begin(identity: timmy, freshSignIn: true)
        XCTAssertFalse(signIn.isAsking, "Off in Settings isn't asked again")
        XCTAssertFalse(signIn.isEnabled)
    }
}
