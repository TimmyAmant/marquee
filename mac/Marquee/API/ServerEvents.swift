import Foundation
import Observation

/// Change counters screens key their `.task(id:)` reloads off, the server-era
/// replacement for the old engine's `AppEvents`. Every successful mutation
/// through `MarqueeAPI` bumps the areas it touches; `LiveUpdates` bumps
/// `notifications` / `requests` when polling sees the counts move on the
/// server (a download finished, a member requested something from the website).
///
///     .task(id: model.events.revision(of: [.library, .requests])) { await load() }
@MainActor
@Observable
final class ServerEvents {
    struct Change: OptionSet, Hashable, Sendable {
        let rawValue: Int

        /// Library status, Sonarr/Radarr tracking, synced libraries: poster
        /// badges, title pages, the calendar, Discover's Recently added.
        static let library = Change(rawValue: 1 << 0)
        static let requests = Change(rawValue: 1 << 1)
        static let notifications = Change(rawValue: 1 << 2)
        static let favorites = Change(rawValue: 1 << 3)
        /// Integrations, jobs, TMDb configuration.
        static let settings = Change(rawValue: 1 << 4)
        /// Household accounts.
        static let users = Change(rawValue: 1 << 5)
        /// What browse lists are built from: the TMDb/TVDB keys, the library
        /// connections (Plex, Jellyfin, Sonarr/Radarr) and syncs. Always
        /// recorded alongside `.settings`, so a list can reload for these
        /// without also reloading for a Discord webhook or an ntfy topic.
        static let catalog = Change(rawValue: 1 << 6)

        static let all: Change = [.library, .requests, .notifications, .favorites, .settings, .users, .catalog]
    }

    enum Source: Sendable {
        /// This app changed something (a `MarqueeAPI` mutation).
        case mutation
        /// Polling noticed the server's state moved on its own.
        case server
    }

    private(set) var library = 0
    private(set) var requests = 0
    private(set) var notifications = 0
    private(set) var favorites = 0
    private(set) var settings = 0
    private(set) var users = 0
    private(set) var catalog = 0

    /// The same counters, but only advanced by `.server` changes. A screen that
    /// already applies its own action in place keys its reload off these, so
    /// acting on a title never re-renders (and re-scrolls) the page you acted on.
    private(set) var remoteLibrary = 0
    private(set) var remoteRequests = 0
    private(set) var remoteNotifications = 0
    private(set) var remoteFavorites = 0
    private(set) var remoteSettings = 0
    private(set) var remoteUsers = 0
    private(set) var remoteCatalog = 0

    /// Called after a `.mutation` is recorded, so the badge poller can
    /// refresh right away instead of waiting for its next tick.
    @ObservationIgnored var onMutation: ((Change) -> Void)?

    func record(_ change: Change, source: Source = .mutation) {
        if change.contains(.library) { library &+= 1 }
        if change.contains(.requests) { requests &+= 1 }
        if change.contains(.notifications) { notifications &+= 1 }
        if change.contains(.favorites) { favorites &+= 1 }
        if change.contains(.settings) { settings &+= 1 }
        if change.contains(.users) { users &+= 1 }
        if change.contains(.catalog) { catalog &+= 1 }
        if source == .server {
            if change.contains(.library) { remoteLibrary &+= 1 }
            if change.contains(.requests) { remoteRequests &+= 1 }
            if change.contains(.notifications) { remoteNotifications &+= 1 }
            if change.contains(.favorites) { remoteFavorites &+= 1 }
            if change.contains(.settings) { remoteSettings &+= 1 }
            if change.contains(.users) { remoteUsers &+= 1 }
            if change.contains(.catalog) { remoteCatalog &+= 1 }
        }
        if source == .mutation, !change.isEmpty {
            onMutation?(change)
        }
    }

    /// One value that moves whenever any of `areas` does, from either source.
    /// Reading it inside a view body (or `.task(id:)`) observes exactly those
    /// counters. Use this on a screen whose list *should* rebuild after the
    /// viewer's own action (Favorites losing a card, the request queue losing
    /// a row); use `remoteRevision(of:)` on a screen that updates in place.
    func revision(of areas: Change) -> Int {
        var total = 0
        if areas.contains(.library) { total &+= library }
        if areas.contains(.requests) { total &+= requests }
        if areas.contains(.notifications) { total &+= notifications }
        if areas.contains(.favorites) { total &+= favorites }
        if areas.contains(.settings) { total &+= settings }
        if areas.contains(.users) { total &+= users }
        if areas.contains(.catalog) { total &+= catalog }
        return total
    }

    /// Moves only when the server's own state changed under us (a download
    /// finished, someone requested something from the website) — never for a
    /// mutation this app made.
    func remoteRevision(of areas: Change) -> Int {
        var total = 0
        if areas.contains(.library) { total &+= remoteLibrary }
        if areas.contains(.requests) { total &+= remoteRequests }
        if areas.contains(.notifications) { total &+= remoteNotifications }
        if areas.contains(.favorites) { total &+= remoteFavorites }
        if areas.contains(.settings) { total &+= remoteSettings }
        if areas.contains(.users) { total &+= remoteUsers }
        if areas.contains(.catalog) { total &+= remoteCatalog }
        return total
    }
}
