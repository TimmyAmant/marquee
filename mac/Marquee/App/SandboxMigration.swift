import Foundation
import OSLog

/// Marquee 0.29 left the App Sandbox (its updater has to replace the app
/// itself), and an app outside the sandbox reads its settings from
/// ~/Library/Preferences rather than its container. On the first launch
/// without the sandbox this brings the container's settings across (the
/// server address, notification choices and watermarks, appearance…), once.
///
/// Nothing else in the container needs to move: its Caches hold only
/// artwork, which downloads again, and its Application Support holds the
/// pre-server app's store, which this app doesn't use. The session token
/// lives in the login Keychain, not the container (see `KeychainTokenStore`).
enum SandboxMigration {
    static let markerKey = "marquee.migratedFromSandbox"

    private static let logger = Logger(subsystem: "com.timmyamant.Marquee", category: "migration")

    /// The sandboxed app's preferences file.
    static var containerPreferences: URL {
        let identifier = Bundle.main.bundleIdentifier ?? "com.timmyamant.Marquee"
        return FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Containers/\(identifier)/Data/Library/Preferences/\(identifier).plist")
    }

    /// Copies every setting from `containerPreferences` that `defaults`
    /// doesn't already have, then sets the marker so it never runs again.
    /// - Returns: How many settings came across.
    @discardableResult
    static func run(defaults: UserDefaults = .standard, containerPreferences: URL = containerPreferences) -> Int {
        guard !defaults.bool(forKey: markerKey) else { return 0 }
        defer { defaults.set(true, forKey: markerKey) }

        guard let data = try? Data(contentsOf: containerPreferences),
              let old = try? PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any]
        else { return 0 }
        var imported = 0
        for (key, value) in old where key != markerKey && defaults.object(forKey: key) == nil {
            defaults.set(value, forKey: key)
            imported += 1
        }
        logger.notice("Brought \(imported) of \(old.count) settings across from the App Sandbox container")
        return imported
    }
}
