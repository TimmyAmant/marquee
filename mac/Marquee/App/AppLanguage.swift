import AppKit
import Foundation

/// The languages Marquee ships (Resources/Localizable.xcstrings; words per
/// docs/i18n-glossary.md), and how an account's choice becomes the app's.
///
/// How the language is chosen: the account's `language` on `GET /me`
/// (Settings › Account › Language, here or on the website), else the Mac's
/// own language order. Every text — SwiftUI's `Text("…")` and the
/// `String(localized:)` built in models alike — is looked up through the
/// main bundle, whose language macOS fixes at launch from the
/// `AppleLanguages` default. So the account's choice is written to *this
/// app's* `AppleLanguages` and takes effect the next time Marquee starts;
/// Settings says so and offers a Restart button. (Swapping SwiftUI's
/// `\.locale` alone would switch only part of the window, never alerts,
/// menus or notifications.) A launch argument — `-AppleLanguages (es)` —
/// outranks the app's defaults, so it always wins for that run.
enum AppLanguage: String, CaseIterable, Identifiable, Sendable {
    case english = "en"
    case spanish = "es"
    case french = "fr"
    case german = "de"
    case portugueseBrazil = "pt-BR"

    var id: String { rawValue }

    /// Each language in its own words, whatever the app is showing.
    var nativeName: String {
        switch self {
        case .english: "English" // i18n-ignore (always in its own language)
        case .spanish: "Español" // i18n-ignore (always in its own language)
        case .french: "Français" // i18n-ignore (always in its own language)
        case .german: "Deutsch" // i18n-ignore (always in its own language)
        case .portugueseBrazil: "Português (Brasil)" // i18n-ignore (always in its own language)
        }
    }

    /// One of ours from a server code (any case, `pt-br` or `pt_BR`), or a
    /// bundle localization name; nil for anything else.
    init?(code: String?) {
        guard let code = code?.replacingOccurrences(of: "_", with: "-").lowercased() else { return nil }
        guard let match = Self.allCases.first(where: { $0.rawValue.lowercased() == code }) else { return nil }
        self = match
    }

    /// What Marquee is showing right now: the localization macOS picked for
    /// the main bundle at launch (fixed until Marquee quits).
    static let current: AppLanguage = current(in: .main)

    static func current(in bundle: Bundle) -> AppLanguage {
        AppLanguage(code: bundle.preferredLocalizations.first) ?? .english
    }

    /// `Accept-Language` for every API request, so server-written text
    /// (errors, labels) matches the app — before sign-in too, when the
    /// server doesn't know the account yet.
    static let acceptLanguageHeader: String =
        current == .english ? "en" : "\(current.rawValue), en;q=0.5" // i18n-ignore

    // MARK: The account's preference

    static let appleLanguagesKey = "AppleLanguages"
    /// The language Marquee itself last wrote to `AppleLanguages`, so
    /// "Automatic" undoes only that, never a per-app language chosen in
    /// System Settings.
    static let appliedKey = "marquee.language.applied"

    /// Makes the account's language (`GET /me` `language`; nil = follow the
    /// Mac) this app's language from the next launch on. Returns the
    /// language the app will show after a restart: nil when that's the
    /// Mac's own choice.
    @discardableResult
    static func adoptAccountPreference(
        _ code: String?,
        defaults: UserDefaults = .standard,
        domain: String? = Bundle.main.bundleIdentifier
    ) -> AppLanguage? {
        let chosen = AppLanguage(code: code)
        let applied = defaults.string(forKey: appliedKey)
        if let chosen {
            if applied != chosen.rawValue || appDomainLanguages(defaults, domain) != [chosen.rawValue] {
                defaults.set([chosen.rawValue], forKey: appleLanguagesKey)
                defaults.set(chosen.rawValue, forKey: appliedKey)
            }
            return chosen
        }
        // Automatic: take back only what Marquee put there.
        if let applied {
            if appDomainLanguages(defaults, domain) == [applied] {
                defaults.removeObject(forKey: appleLanguagesKey)
            }
            defaults.removeObject(forKey: appliedKey)
        }
        return nil
    }

    /// `AppleLanguages` saved in this app's own domain — not the Mac's
    /// global list, nor a launch argument's.
    private static func appDomainLanguages(_ defaults: UserDefaults, _ domain: String?) -> [String]? {
        guard let domain else { return nil }
        return defaults.persistentDomain(forName: domain)?[appleLanguagesKey] as? [String]
    }

    /// Whether a restart is needed to show `language` (nil = the Mac's own
    /// first choice among ours).
    static func needsRestart(toShow language: AppLanguage?) -> Bool {
        let target = language ?? systemChoice
        return target != current
    }

    /// The language macOS would pick for Marquee at the next launch without
    /// an account choice: a per-app language from System Settings, else the
    /// Mac's own order.
    static var systemChoice: AppLanguage {
        let order = appDomainLanguages(.standard, Bundle.main.bundleIdentifier)
            ?? UserDefaults.standard.persistentDomain(forName: UserDefaults.globalDomain)?[appleLanguagesKey] as? [String]
            ?? Locale.preferredLanguages
        let pick = Bundle.preferredLocalizations(from: Bundle.main.localizations, forPreferences: order).first
        return AppLanguage(code: pick) ?? .english
    }

    /// Quits and opens Marquee again, so a new language applies everywhere.
    @MainActor
    static func relaunch() {
        let configuration = NSWorkspace.OpenConfiguration()
        configuration.createsNewApplicationInstance = true
        let url = Bundle.main.bundleURL
        // A tiny shell waits for this process to go before opening the app
        // again, so the new one never meets the old one's windows.
        let pid = ProcessInfo.processInfo.processIdentifier
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/bin/sh")
        task.arguments = ["-c", "while kill -0 \(pid) 2>/dev/null; do sleep 0.2; done; /usr/bin/open \"$0\"", url.path] // i18n-ignore
        do {
            try task.run()
            NSApp.terminate(nil)
        } catch {
            NSWorkspace.shared.openApplication(at: url, configuration: configuration) { _, _ in }
            NSApp.terminate(nil)
        }
    }
}
