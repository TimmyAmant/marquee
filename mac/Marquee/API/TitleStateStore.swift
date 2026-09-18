import Foundation
import Observation

/// What this Mac has changed about a title since the list it appears in was
/// fetched.
///
/// Lists deliberately don't refetch when the viewer acts on them — that
/// reloads the page under the pointer and throws the scroll back to the top.
/// So an add or a request records its outcome here, and every poster card
/// reads it, which keeps a card that's just been added from still offering
/// "Add to Radarr" the next time it's drawn. The website gets this for free
/// from `router.refresh()`; the app has to remember it.
///
/// Session-scoped and deliberately small: a reload (⌘R), signing out or
/// changing server clears it, at which point the server's own data is
/// authoritative again.
@MainActor
@Observable
final class TitleStateStore {
    struct Change: Equatable {
        /// The library status the server reported right after the change.
        var status: API.LibraryStatus?
        /// Whether a quick-add is still on offer (false once it's in an *arr).
        var canQuickAdd: Bool?
        /// Whether this viewer has a request in for it.
        var requested: Bool?
    }

    /// A favorite toggled on one entity (a title, person, collection…).
    struct FavoriteKey: Hashable {
        let entityType: API.FavoriteEntityType
        let tmdbId: Int
    }

    private(set) var changes: [API.TitleID: Change] = [:]
    /// Stars set from this Mac, so a star toggled from a card's context menu
    /// and the same entity's star elsewhere agree without a refetch.
    private(set) var favorites: [FavoriteKey: Bool] = [:]

    subscript(id: API.TitleID) -> Change? { changes[id] }

    /// Quick-add succeeded: the title is in Radarr/Sonarr now, so the button
    /// goes away and the badge shows what the server reports.
    func added(_ id: API.TitleID, status: API.LibraryStatus?) {
        merge(id) {
            $0.canQuickAdd = false
            $0.requested = nil
            if let status { $0.status = status }
        }
    }

    /// A member's request went in.
    func requested(_ id: API.TitleID) {
        merge(id) {
            $0.requested = true
            $0.canQuickAdd = false
        }
    }

    /// A title's status was re-read (title page actions, or a status refresh).
    func statusChanged(_ id: API.TitleID, to status: API.LibraryStatus) {
        merge(id) { $0.status = status }
    }

    func favorited(_ entityType: API.FavoriteEntityType, _ tmdbId: Int) -> Bool? {
        favorites[FavoriteKey(entityType: entityType, tmdbId: tmdbId)]
    }

    func favoriteChanged(_ entityType: API.FavoriteEntityType, _ tmdbId: Int, to favorited: Bool) {
        favorites[FavoriteKey(entityType: entityType, tmdbId: tmdbId)] = favorited
    }

    func clear() {
        if !changes.isEmpty { changes = [:] }
        if !favorites.isEmpty { favorites = [:] }
    }

    private func merge(_ id: API.TitleID, _ edit: (inout Change) -> Void) {
        var change = changes[id] ?? Change()
        edit(&change)
        changes[id] = change
    }
}

extension API.TitleCard {
    /// The card as it should be drawn, with anything this Mac changed since
    /// the list was fetched folded in.
    func applying(_ change: TitleStateStore.Change?) -> API.TitleCard {
        guard let change else { return self }
        var card = self
        if let status = change.status { card.status = status }
        if let canQuickAdd = change.canQuickAdd { card.canQuickAdd = canQuickAdd }
        if let requested = change.requested { card.requested = requested }
        return card
    }
}
