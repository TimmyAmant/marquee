import Foundation
import Observation

// "What's new in Marquee 0.45.3" after an upgrade — components/whats-new.tsx,
// with the rules of lib/whats-new.ts. Server and app updates are separate
// events: a newer server shows its changelog entries (as on the website and
// in the Windows app), and a newer Mac app shows its own, read from the
// lib/changelog.ts it was built with (bundled as a resource, project.yml).
// Both at once: one dialog with the releases of both, each once.

/// The versions this Mac last showed notes for, on one server.
struct WhatsNewSeen: Equatable, Sendable {
    var server: String?
    var app: String?
}

enum WhatsNew {
    /// How many releases the dialog lists; "See all changes" has the rest.
    static let cap = 10

    /// What changed since `WhatsNewSeen`: the last version seen of each.
    struct Pending: Equatable, Sendable {
        /// The server was upgraded from this version.
        var serverSince: AppVersion?
        /// This app was updated from this version.
        var appSince: AppVersion?
    }

    /// Nil when there's nothing to show: the first run on this Mac (nothing
    /// remembered: remember, don't greet a new install with a wall of notes),
    /// the same versions, or a downgrade. Something unreadable remembered
    /// counts as nothing.
    static func pending(seen: WhatsNewSeen, server: AppVersion?, app: AppVersion?) -> Pending? {
        let lastServer = seen.server.flatMap(AppVersion.init)
        let lastApp = seen.app.flatMap(AppVersion.init)
        var pending = Pending()
        if let lastServer, let server, server > lastServer { pending.serverSince = lastServer }
        if let lastApp, let app, app > lastApp { pending.appSince = lastApp }
        return pending.serverSince == nil && pending.appSince == nil ? nil : pending
    }

    /// What to remember after showing (or finding nothing to show): the
    /// newer of what was seen and what's current, each on its own, so a
    /// downgrade doesn't bring the same notes back after the next upgrade.
    static func remembered(seen: WhatsNewSeen, server: AppVersion?, app: AppVersion?) -> WhatsNewSeen {
        func newer(_ stored: String?, _ current: AppVersion?) -> String? {
            guard let current else { return stored }
            guard let stored, let last = AppVersion(stored), last >= current else { return current.description }
            return stored
        }
        return WhatsNewSeen(server: newer(seen.server, server), app: newer(seen.app, app))
    }

    /// The dialog.
    struct Content: Identifiable, Equatable, Sendable {
        /// The title's "What's new in Marquee 0.45.3": the newest version that changed.
        let version: String
        /// Newest first, at most `cap`, from the server and this app, each version once.
        let entries: [API.ChangelogEntry]
        /// More releases than `cap` fall in the range.
        let hasMore: Bool
        /// This app was updated to a version whose notes it doesn't have
        /// (no bundled changelog): say it's installed, and link to the release.
        let installedAppVersion: String?

        var id: String { version }

        /// The GitHub release for `installedAppVersion`.
        var releaseNotesURL: URL? {
            installedAppVersion.flatMap { URL(string: "https://github.com/TimmyAmant/marquee/releases/tag/v\($0)") }
        }
    }

    /// The releases newer than `since`, up to and including `upTo`.
    static func entries(_ changelog: [API.ChangelogEntry], since: AppVersion, upTo: AppVersion) -> [API.ChangelogEntry] {
        changelog.filter { entry in
            guard let version = AppVersion(entry.version) else { return false }
            return version > since && version <= upTo
        }
    }

    /// Nil when there's nothing to say (e.g. the server's changelog has no
    /// entries in the range): remember the versions and move on.
    static func content(
        pending: Pending,
        server: AppVersion?,
        app: AppVersion?,
        serverChangelog: [API.ChangelogEntry],
        appChangelog: [API.ChangelogEntry],
        cap: Int = WhatsNew.cap
    ) -> Content? {
        var merged: [API.ChangelogEntry] = []
        func add(_ list: [API.ChangelogEntry]) {
            for entry in list where !merged.contains(where: { AppVersion($0.version) == AppVersion(entry.version) }) {
                merged.append(entry)
            }
        }
        var newest: AppVersion?
        if let since = pending.serverSince, let server {
            // The server's text first: it's what the website shows.
            add(entries(serverChangelog, since: since, upTo: server))
            newest = server
        }
        var installed: String?
        if let since = pending.appSince, let app {
            add(entries(appChangelog, since: since, upTo: app))
            if !merged.contains(where: { AppVersion($0.version) == app }) { installed = app.description }
            if newest.map({ app > $0 }) ?? true { newest = app }
        }
        guard let newest, !merged.isEmpty || installed != nil else { return nil }
        merged.sort { (AppVersion($0.version) ?? newest) > (AppVersion($1.version) ?? newest) }
        return Content(
            version: newest.description,
            entries: Array(merged.prefix(cap)),
            hasMore: merged.count > cap,
            installedAppVersion: installed
        )
    }
}

// MARK: - The app's own changelog

/// lib/changelog.ts, copied into the app as a resource: a small scanner
/// reads its `version: "…"`, `date: "…"`, `changes: ["…", …]` entries
/// (lib/whats-new.test.ts runs the same scanner over the file, so a change
/// to its shape fails the website's tests first).
enum BundledChangelog {
    static let resourceName = "changelog"
    static let resourceExtension = "ts"

    /// This app's releases, newest first; empty if the file is missing or unreadable.
    static func load(bundle: Bundle = .main) -> [API.ChangelogEntry] {
        guard let url = bundle.url(forResource: resourceName, withExtension: resourceExtension),
              let source = try? String(contentsOf: url, encoding: .utf8)
        else { return [] }
        return parse(source) ?? []
    }

    /// Nil when the source isn't the shape it expects.
    static func parse(_ source: String) -> [API.ChangelogEntry]? {
        let bytes = Array(source.utf8)
        guard let declaration = find(Array("export const CHANGELOG".utf8), in: bytes, from: 0), // i18n-ignore
              let equals = bytes[declaration...].firstIndex(of: UInt8(ascii: "=")),
              let open = bytes[equals...].firstIndex(of: UInt8(ascii: "["))
        else { return nil }

        var entries: [API.ChangelogEntry] = []
        var version: String?
        var date: String?
        var changes: [String]?
        var inEntry = false
        var inChanges = false
        var pendingKey = ""
        var index = open + 1

        while index < bytes.count {
            let byte = bytes[index]
            let next = index + 1 < bytes.count ? bytes[index + 1] : 0
            if byte == UInt8(ascii: "/"), next == UInt8(ascii: "/") {
                index = bytes[index...].firstIndex(of: UInt8(ascii: "\n")) ?? bytes.count
                continue
            }
            if byte == UInt8(ascii: "/"), next == UInt8(ascii: "*") {
                guard let end = find(Array("*/".utf8), in: bytes, from: index + 2) else { return nil }
                index = end + 2
                continue
            }
            if byte == UInt8(ascii: "\"") {
                var end = index + 1
                while end < bytes.count, bytes[end] != UInt8(ascii: "\"") {
                    end += bytes[end] == UInt8(ascii: "\\") ? 2 : 1
                }
                guard end < bytes.count, inEntry,
                      let text = try? JSONSerialization.jsonObject(
                          with: Data(bytes[index...end]), options: .fragmentsAllowed
                      ) as? String
                else { return nil }
                if inChanges {
                    changes?.append(text)
                } else if pendingKey == "version" {
                    version = text
                } else if pendingKey == "date" {
                    date = text
                }
                pendingKey = ""
                index = end + 1
                continue
            }
            if isIdentifierStart(byte) {
                var end = index
                while end < bytes.count, isIdentifierStart(bytes[end]) || (bytes[end] >= 48 && bytes[end] <= 57) {
                    end += 1
                }
                pendingKey = String(decoding: bytes[index..<end], as: UTF8.self)
                index = end
                continue
            }
            switch byte {
            case UInt8(ascii: "{"):
                inEntry = true
                version = nil
                date = nil
                changes = nil
            case UInt8(ascii: "[") where pendingKey == "changes" && inEntry:
                changes = []
                inChanges = true
            case UInt8(ascii: "]") where inChanges:
                inChanges = false
            case UInt8(ascii: "]"):
                return entries
            case UInt8(ascii: "}") where inEntry:
                guard let version, let date, let day = API.CalendarDay(date), let changes else { return nil }
                entries.append(API.ChangelogEntry(version: version, date: day, changes: changes))
                inEntry = false
            default:
                break
            }
            index += 1
        }
        return nil
    }

    private static func isIdentifierStart(_ byte: UInt8) -> Bool {
        (byte >= 65 && byte <= 90) || (byte >= 97 && byte <= 122) || byte == UInt8(ascii: "_")
    }

    private static func find(_ needle: [UInt8], in haystack: [UInt8], from start: Int) -> Int? {
        guard !needle.isEmpty, haystack.count >= needle.count, start <= haystack.count - needle.count else { return nil }
        for index in start...(haystack.count - needle.count) where haystack[index..<(index + needle.count)].elementsEqual(needle) {
            return index
        }
        return nil
    }
}

// MARK: - Remembered per server

/// UserDefaults, per server: the last server and app versions whose notes
/// this Mac showed.
struct WhatsNewStore {
    static let serverKeyPrefix = "marquee.whatsNew.server."
    static let appKeyPrefix = "marquee.whatsNew.app."

    let defaults: UserDefaults

    func seen(server: String) -> WhatsNewSeen {
        WhatsNewSeen(
            server: defaults.string(forKey: Self.serverKeyPrefix + server),
            app: defaults.string(forKey: Self.appKeyPrefix + server)
        )
    }

    func save(_ seen: WhatsNewSeen, server: String) {
        defaults.set(seen.server, forKey: Self.serverKeyPrefix + server)
        defaults.set(seen.app, forKey: Self.appKeyPrefix + server)
    }
}

// MARK: - The dialog's state

/// Decides after each sign-in whether to show the dialog, and remembers
/// the versions once it's dismissed (OK, Escape).
@MainActor
@Observable
final class WhatsNewModel {
    /// Non-nil while the sheet is up.
    var content: WhatsNew.Content?

    @ObservationIgnored private let store: WhatsNewStore
    @ObservationIgnored private let appChangelog: () -> [API.ChangelogEntry]
    @ObservationIgnored private var task: Task<Void, Never>?
    /// Saved when the dialog is dismissed.
    @ObservationIgnored private var toRemember: (seen: WhatsNewSeen, server: String)?

    init(defaults: UserDefaults = .standard, appChangelog: @escaping () -> [API.ChangelogEntry] = { BundledChangelog.load() }) {
        store = WhatsNewStore(defaults: defaults)
        self.appChangelog = appChangelog
    }

    /// Signed in on `server` (its base URL). `serverVersion` is the last
    /// server-info's, when there was one; otherwise Settings › About's is asked.
    func begin(
        server: String,
        serverVersion: String?,
        appVersion: AppVersion? = .current,
        api: MarqueeAPI,
        delay: Duration = .seconds(1.5)
    ) {
        task?.cancel()
        task = Task { [weak self] in
            // After the main window has drawn: over Discover, not a blank window.
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled else { return }
            var serverNow = serverVersion.flatMap(AppVersion.init)
            if serverNow == nil {
                serverNow = (try? await api.about.info()).flatMap { AppVersion($0.version) }
            }
            guard !Task.isCancelled, let self else { return }
            await self.decide(server: server, serverVersion: serverNow, appVersion: appVersion, api: api)
        }
    }

    func decide(server: String, serverVersion: AppVersion?, appVersion: AppVersion?, api: MarqueeAPI) async {
        let seen = store.seen(server: server)
        let remember = WhatsNew.remembered(seen: seen, server: serverVersion, app: appVersion)
        guard let pending = WhatsNew.pending(seen: seen, server: serverVersion, app: appVersion) else {
            store.save(remember, server: server)
            return
        }
        var serverChangelog: [API.ChangelogEntry] = []
        if pending.serverSince != nil {
            do {
                serverChangelog = try await api.about.changelog()
            } catch {
                // Try again next launch rather than lose the notes.
                return
            }
        }
        guard !Task.isCancelled else { return }
        let appChangelog = pending.appSince != nil ? appChangelog() : []
        guard let content = WhatsNew.content(
            pending: pending,
            server: serverVersion,
            app: appVersion,
            serverChangelog: serverChangelog,
            appChangelog: appChangelog
        ) else {
            store.save(remember, server: server)
            return
        }
        toRemember = (remember, server)
        self.content = content
    }

    /// OK, Escape, or "See all changes": remembered, not shown again.
    func dismiss() {
        if let toRemember { store.save(toRemember.seen, server: toRemember.server) }
        toRemember = nil
        content = nil
    }

    /// Signed out: nothing is remembered, so it shows at the next sign-in.
    func end() {
        task?.cancel()
        task = nil
        toRemember = nil
        content = nil
    }
}
