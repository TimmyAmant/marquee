import Foundation
import Observation

/// The Library page's state (app/library/page.tsx): the All titles tab's
/// filtered, paged list with its counts, and the Missing from collections,
/// Duplicates and Storage tabs, each loaded when first shown.
@MainActor
@Observable
final class LibraryModel {
    enum Tab: String, CaseIterable, Identifiable {
        case all, collections, duplicates, storage

        var id: String { rawValue }

        var label: String {
            switch self {
            case .all: return String(localized: "All titles")
            case .collections: return String(localized: "Missing from collections")
            case .duplicates: return String(localized: "Duplicates")
            case .storage: return String(localized: "Storage")
            }
        }
    }

    enum Layout: String, CaseIterable, Identifiable {
        case grid, table
        var id: String { rawValue }
    }

    var tab: Tab = .all
    var query = API.LibraryQuery()

    // MARK: All titles

    private(set) var entries: [API.LibraryEntry] = []
    private(set) var summary: API.LibrarySummary?
    private(set) var filters = API.LibraryFilters.empty
    /// nil until the first page answered.
    private(set) var connected: Bool?
    private(set) var nextPage = 1
    private(set) var hasNextPage = true
    private(set) var loadingPage = false
    private(set) var initialLoad = true
    /// The first page failed: the empty state offers "Try again".
    private(set) var error: APIError?
    /// A later page failed. Paging pauses (so scrolling doesn't hammer the
    /// server) until the Retry row asks again.
    private(set) var pageError: APIError?
    /// The server answered `404`: it's older than 0.51 and has no Library
    /// page (deviation 20). The page says so instead of "Couldn't load".
    private(set) var unsupported = false
    private var generation = 0

    /// Which ⌘R / server-change revision each tab last loaded at; a tab
    /// whose entry differs from the current one reloads when it's shown.
    private var loadedRevisions: [Tab: SectionRevision] = [:]

    /// ⌘R (`reloadToken`) and the server's library changing (`remoteRevision`).
    struct SectionRevision: Hashable, Sendable {
        var reload: Int
        var remote: Int

        init(reload: Int = 0, remote: Int = 0) {
            self.reload = reload
            self.remote = remote
        }
    }

    /// Per row: "Search now" / monitoring in flight, and what went wrong.
    private(set) var busyRows: Set<API.TitleID> = []
    private(set) var rowMessages: [API.TitleID: (text: String, isError: Bool)] = [:]

    // MARK: Collections

    private(set) var collections: [API.LibraryCollection]?
    private(set) var collectionsError: String?
    private(set) var loadingCollections = false
    private(set) var busyCollections: Set<String> = []
    private(set) var collectionResults: [String: String] = [:]

    // MARK: Duplicates

    private(set) var duplicates: [API.LibraryDuplicate]?
    private(set) var duplicatesError: String?
    private(set) var loadingDuplicates = false

    // MARK: Storage

    private(set) var storage: API.LibraryStorage?
    private(set) var storageError: String?
    private(set) var loadingStorage = false

    @ObservationIgnored private var api: MarqueeAPI?

    init(api: MarqueeAPI? = nil) {
        self.api = api
    }

    /// The `MarqueeAPI` every load goes through (the view hands over the
    /// session's on appear and after a reload).
    func attach(_ api: MarqueeAPI) {
        self.api = api
    }

    /// The tab's list is empty because nothing matched the filters, not
    /// because the library is still syncing.
    var isEmptyWithFilters: Bool { entries.isEmpty && query.hasFilters }

    func clearFilters() {
        query = API.LibraryQuery()
    }

    // MARK: The other tabs

    /// Loads the shown tab if it hasn't loaded at this revision yet: on
    /// first showing, after ⌘R and after the server's library changed.
    /// The All titles tab has its own paging (`reset()`).
    func loadSectionIfNeeded(at revision: SectionRevision = SectionRevision()) async {
        guard tab != .all, loadedRevisions[tab] != revision else { return }
        loadedRevisions[tab] = revision
        switch tab {
        case .all: break
        case .collections: await loadCollections()
        case .duplicates: await loadDuplicates()
        case .storage: await loadStorage()
        }
    }

    // MARK: Paging (infinite-results-grid.tsx)

    /// Starts over with the current filters: the counts, the pickers and
    /// the first page.
    func reset() async {
        generation &+= 1
        let current = generation
        initialLoad = true
        entries = []
        nextPage = 1
        hasNextPage = true
        loadingPage = false
        error = nil
        pageError = nil
        unsupported = false
        rowMessages = [:]
        await loadNextPage()
        if current == generation { initialLoad = false }
    }

    /// Appends the next page. After a failure only an explicit retry asks
    /// again; the rows already loaded (and the scroll offset) stay put.
    func loadNextPage(retrying: Bool = false) async {
        guard let api, hasNextPage, !loadingPage, retrying || pageError == nil else { return }
        let current = generation
        let requested = query
        loadingPage = true
        defer { if current == generation { loadingPage = false } }
        do {
            let page = try await api.library.page(requested, page: nextPage)
            guard current == generation else { return }
            let seen = Set(entries.map(\.id))
            entries.append(contentsOf: page.results.filter { !seen.contains($0.id) })
            summary = page.summary
            filters = page.filters
            connected = page.connected
            hasNextPage = page.hasMorePages
            nextPage = page.page + 1
            error = nil
            pageError = nil
        } catch let failure as APIError {
            guard current == generation, !failure.isCancellation else { return }
            pageFailed(failure)
        } catch {
            guard current == generation else { return }
            pageFailed(APIError.wrapping(error))
        }
    }

    /// The first page failing is the page's error; a later one only pauses
    /// paging behind the Retry row.
    private func pageFailed(_ failure: APIError) {
        if entries.isEmpty {
            unsupported = failure == .notFound
            error = failure
        } else {
            pageError = failure
        }
    }

    // MARK: The admin's row actions (library-arr-actions.tsx)

    /// "Search now": asks Radarr/Sonarr to look for the title.
    func searchNow(_ entry: API.LibraryEntry) async {
        guard let api, !busyRows.contains(entry.id) else { return }
        busyRows.insert(entry.id)
        rowMessages[entry.id] = nil
        do {
            try await api.titles.searchNow(entry.mediaType, id: entry.tmdbId)
            rowMessages[entry.id] = (String(localized: "Search queued."), false)
        } catch {
            rowMessages[entry.id] = (error.localizedDescription, true)
        }
        busyRows.remove(entry.id)
    }

    /// "Stop monitoring" / "Start monitoring": flips the row's flag on success.
    func toggleMonitoring(_ entry: API.LibraryEntry) async {
        guard let api, let tracking = entry.arrTracking, !busyRows.contains(entry.id) else { return }
        busyRows.insert(entry.id)
        rowMessages[entry.id] = nil
        do {
            let monitored = try await api.titles.setMonitored(!tracking.monitored, entry.mediaType, id: entry.tmdbId)
            if let index = entries.firstIndex(where: { $0.id == entry.id }) {
                entries[index].arrTracking = API.ArrTracking(arrId: tracking.arrId, monitored: monitored)
            }
        } catch {
            rowMessages[entry.id] = (error.localizedDescription, true)
        }
        busyRows.remove(entry.id)
    }

    // MARK: Missing from collections

    func loadCollections() async {
        guard let api, !loadingCollections else { return }
        loadingCollections = true
        defer { loadingCollections = false }
        do {
            collections = try await api.library.collectionsMissing()
            collectionsError = nil
        } catch let failure as APIError where failure.isCancellation {
            return
        } catch {
            if collections == nil { collectionsError = error.localizedDescription }
        }
    }

    /// The admin's "Add all N missing": one title at a time, like the
    /// website and the title page's franchise row.
    func addAllMissing(_ collection: API.LibraryCollection) async {
        guard let api, !collection.addAllMissing.isEmpty, !busyCollections.contains(collection.key) else { return }
        busyCollections.insert(collection.key)
        collectionResults[collection.key] = nil
        var failures = 0
        for target in collection.addAllMissing {
            do {
                try await api.titles.add(target.mediaType, id: target.tmdbId)
            } catch {
                failures += 1
            }
        }
        let total = collection.addAllMissing.count
        collectionResults[collection.key] = failures > 0
            ? String(localized: "Added \(total - failures) of \(total) — \(failures) failed")
            : String(localized: "Added all \(total)")
        busyCollections.remove(collection.key)
        // The whole list: the posters need their new badges, and "Add all" its new count.
        await loadCollections()
    }

    /// A member's "Request all N missing": one call to the collection's
    /// owned part; the server works the set out and says how it went.
    func requestAllMissing(_ collection: API.LibraryCollection) async {
        guard let api, !collection.requestAllMissing.isEmpty, !busyCollections.contains(collection.key) else { return }
        busyCollections.insert(collection.key)
        collectionResults[collection.key] = nil
        let target = collection.requestAllTarget
        do {
            collectionResults[collection.key] = try await api.requests.requestAllMissing(target.mediaType, id: target.tmdbId).message
        } catch {
            collectionResults[collection.key] = error.localizedDescription
        }
        busyCollections.remove(collection.key)
        await loadCollections()
    }

    // MARK: Duplicates

    func loadDuplicates() async {
        guard let api, !loadingDuplicates else { return }
        loadingDuplicates = true
        defer { loadingDuplicates = false }
        do {
            duplicates = try await api.library.duplicates()
            duplicatesError = nil
        } catch let failure as APIError where failure.isCancellation {
            return
        } catch {
            if duplicates == nil { duplicatesError = error.localizedDescription }
        }
    }

    // MARK: Storage

    func loadStorage() async {
        guard let api, !loadingStorage else { return }
        loadingStorage = true
        defer { loadingStorage = false }
        do {
            storage = try await api.library.storage()
            storageError = nil
        } catch let failure as APIError where failure.isCancellation {
            return
        } catch {
            if storage == nil { storageError = error.localizedDescription }
        }
    }
}
