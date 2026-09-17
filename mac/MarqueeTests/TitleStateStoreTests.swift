import Testing
@testable import Marquee

/// Adding a title from a list must stop that list offering the add again —
/// the lists don't refetch on your own action, so the change is remembered.
@MainActor
struct TitleStateStoreTests {
    private let movie = API.TitleID(.movie, 603)

    private func card(
        canQuickAdd: Bool = true,
        canRequest: Bool = false,
        requested: Bool? = nil,
        status: API.LibraryStatus? = nil
    ) -> API.TitleCard {
        API.TitleCard(
            mediaType: .movie,
            tmdbId: 603,
            name: "The Matrix",
            posterPath: nil,
            year: "1999",
            subtitle: nil,
            overview: nil,
            rating: nil,
            status: status,
            favorited: nil,
            requested: requested,
            canQuickAdd: canQuickAdd,
            canRequest: canRequest
        )
    }

    @Test func aCardOffersTheAddUntilItHappens() {
        let store = TitleStateStore()
        #expect(card().applying(store[movie]).canQuickAdd)

        store.added(movie, status: .trackedMonitored)

        let updated = card().applying(store[movie])
        #expect(updated.canQuickAdd == false)
        #expect(updated.status == .trackedMonitored)
        // Which is what the hover overlay keys off.
        #expect(updated.quickAction == .none)
    }

    @Test func aMembersRequestIsRemembered() {
        let store = TitleStateStore()
        store.requested(movie)

        let updated = card(canQuickAdd: false, canRequest: true).applying(store[movie])
        #expect(updated.requested == true)
        #expect(updated.quickAction == .request(movie, alreadyRequested: true))
    }

    @Test func aStatusChangeOnTheTitlePageReachesTheLists() {
        let store = TitleStateStore()
        store.statusChanged(movie, to: .owned)
        #expect(card(status: .untracked).applying(store[movie]).status == .owned)
        // A status change alone doesn't take away an add that's still offered.
        #expect(card().applying(store[movie]).canQuickAdd)
    }

    @Test func nothingChangesWithoutAnEntry() {
        let store = TitleStateStore()
        let original = card(status: .untracked)
        #expect(original.applying(store[API.TitleID(.tv, 1396)]) == original)
    }

    @Test func reloadingDropsWhatWeRemembered() {
        let store = TitleStateStore()
        store.added(movie, status: .owned)
        store.clear()
        #expect(store[movie] == nil)
        #expect(card().applying(store[movie]).canQuickAdd)
    }
}
