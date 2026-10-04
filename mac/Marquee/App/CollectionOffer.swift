import Foundation

/// components/collection-prompt.tsx: after a movie is added (the admin) or
/// requested (a member), the rest of its collection the library doesn't have
/// yet is offered in one go — "Part of The Matrix Collection. 3 other movies
/// in this collection aren't in your library yet. Add them too?". Asked of
/// the server (`titles.collectionRest`) after each such add or request;
/// "Not now" on a collection isn't asked again until the app restarts.
@MainActor
@Observable
final class CollectionOfferModel {
    struct Offer: Identifiable, Hashable {
        /// The movie that was just added or requested.
        let tmdbId: Int
        let collectionId: Int
        let name: String
        let action: API.CollectionRest.Action
        let items: [API.TitleCard]

        var id: Int { collectionId }
    }

    /// Non-nil while the sheet is up.
    var offer: Offer?
    private(set) var isWorking = false
    private(set) var error: String?

    @ObservationIgnored private var declined: Set<Int> = []
    /// The collection on screen, still to be answered — kept apart from
    /// `offer`, which the sheet's binding clears before its onDismiss runs.
    @ObservationIgnored private var unanswered: Int?
    @ObservationIgnored private var task: Task<Void, Never>?

    /// A movie was just added or requested: offer the rest of its collection,
    /// if there's any. Errors (an older server's `.notFound` included) offer
    /// nothing.
    func movieAdded(_ tmdbId: Int, api: MarqueeAPI) {
        task?.cancel()
        task = Task { [weak self] in
            guard let rest = try? await api.titles.collectionRest(movie: tmdbId) else { return }
            guard !Task.isCancelled, let self, let collection = rest.collection, !rest.items.isEmpty,
                  !self.declined.contains(collection.id), self.offer == nil
            else { return }
            self.error = nil
            self.unanswered = collection.id
            self.offer = Offer(
                tmdbId: tmdbId, collectionId: collection.id, name: collection.name, action: rest.action, items: rest.items
            )
        }
    }

    /// "Not now" — or the sheet closed any other way without an answer.
    func decline() {
        if let unanswered { declined.insert(unanswered) }
        unanswered = nil
        offer = nil
        error = nil
    }

    /// "Add all" / "Request all": the server's result once it's done, or nil
    /// with `error` set (the sheet stays up).
    func accept(api: MarqueeAPI) async -> API.CollectionRestResult? {
        guard let offer, !isWorking else { return nil }
        isWorking = true
        error = nil
        defer { isWorking = false }
        do {
            let result = try await api.titles.addCollectionRest(movie: offer.tmdbId)
            unanswered = nil
            self.offer = nil
            return result
        } catch {
            self.error = error.localizedDescription
            return nil
        }
    }
}
