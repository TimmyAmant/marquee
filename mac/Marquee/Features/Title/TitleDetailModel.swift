import Foundation
import Observation

/// The title page's state: one `GET /titles/{type}/{id}` plus the actions the
/// server says this viewer may take. After an action the page refreshes only
/// `library` + `viewer` (`GET …/status`) instead of refetching everything.
@MainActor
@Observable
final class TitleDetailModel {
    let id: API.TitleID

    private(set) var detail: API.TitleDetail?
    private(set) var loadError: String?
    /// Episodes for each expanded season row.
    private(set) var episodes: [Int: API.SeasonEpisodes] = [:]
    private(set) var loadingSeason: Int?
    private(set) var seasonErrors: [Int: String] = [:]
    /// Bumped by every full load, so an expanded season row re-requests its
    /// episodes instead of showing the "no episode data" message after ⌘R.
    private(set) var reloadGeneration = 0

    /// The action area under the title.
    private(set) var isAdding = false
    private(set) var addError: String?
    /// The Sonarr/Radarr tracking row.
    private(set) var isSearching = false
    private(set) var isTogglingMonitor = false
    private(set) var trackingMessage: (text: String, isError: Bool)?
    /// "Add all N missing".
    private(set) var isAddingAll = false
    private(set) var addAllResult: String?

    @ObservationIgnored private var api: MarqueeAPI?

    init(id: API.TitleID) {
        self.id = id
    }

    var name: String { detail?.name ?? "" }

    // MARK: Loading

    func load(_ api: MarqueeAPI) async {
        self.api = api
        do {
            let fresh = try await api.titles.detail(id.mediaType, id: id.tmdbId)
            if Task.isCancelled { return }
            detail = fresh
            loadError = nil
            // A reload may have changed which episodes have files.
            episodes = [:]
            seasonErrors = [:]
            reloadGeneration &+= 1
        } catch let failure as APIError where failure.isCancellation {
            return
        } catch {
            if detail == nil { loadError = error.localizedDescription }
        }
    }

    /// The cheap refresh after an action, or after something else on the
    /// server moved the library/requests counters: `library` + `viewer` only.
    /// A no-op until the page has loaded.
    func refreshStatus(_ api: MarqueeAPI? = nil) async {
        if let api { self.api = api }
        guard let api = self.api, let current = detail else { return }
        guard let status = try? await api.titles.status(id.mediaType, id: id.tmdbId) else { return }
        guard !Task.isCancelled, detail?.id == status.id else { return }
        detail = current.updating(status)
    }

    // MARK: Seasons

    func loadSeason(_ seasonNumber: Int) {
        guard episodes[seasonNumber] == nil, loadingSeason != seasonNumber, let api else { return }
        loadingSeason = seasonNumber
        seasonErrors[seasonNumber] = nil
        Task {
            do {
                let season = try await api.titles.season(seasonNumber, ofShow: id.tmdbId)
                episodes[seasonNumber] = season
            } catch {
                seasonErrors[seasonNumber] = error.localizedDescription
            }
            if loadingSeason == seasonNumber { loadingSeason = nil }
        }
    }

    // MARK: Actions

    func add() {
        guard let api, !isAdding else { return }
        isAdding = true
        addError = nil
        Task {
            do {
                try await api.titles.add(id.mediaType, id: id.tmdbId)
                await refreshStatus()
            } catch {
                addError = error.localizedDescription
            }
            isAdding = false
        }
    }

    func request() {
        guard let api, !isAdding else { return }
        isAdding = true
        addError = nil
        Task {
            do {
                try await api.requests.create(id.mediaType, id: id.tmdbId)
                await refreshStatus()
            } catch {
                addError = error.localizedDescription
            }
            isAdding = false
        }
    }

    func searchNow() {
        guard let api, !isSearching else { return }
        isSearching = true
        trackingMessage = nil
        Task {
            do {
                try await api.titles.searchNow(id.mediaType, id: id.tmdbId)
                trackingMessage = ("Search queued.", false)
            } catch {
                trackingMessage = (error.localizedDescription, true)
            }
            isSearching = false
        }
    }

    func setMonitored(_ monitored: Bool) {
        guard let api, !isTogglingMonitor else { return }
        isTogglingMonitor = true
        trackingMessage = nil
        Task {
            do {
                _ = try await api.titles.setMonitored(monitored, id.mediaType, id: id.tmdbId)
                await refreshStatus()
            } catch {
                trackingMessage = (error.localizedDescription, true)
            }
            isTogglingMonitor = false
        }
    }

    func relink(_ target: API.RelinkTarget) async throws -> Int {
        guard let api else { throw APIError.unauthorized }
        return try await api.titles.relink(id.mediaType, id: id.tmdbId, to: target)
    }

    /// The franchise row's "Add all N missing", one title at a time like the website.
    func addAllMissing() {
        guard let api, let targets = detail?.franchise?.addAllMissing, !targets.isEmpty, !isAddingAll else { return }
        isAddingAll = true
        addAllResult = nil
        Task {
            var failures = 0
            for target in targets {
                do {
                    try await api.titles.add(target.mediaType, id: target.tmdbId)
                } catch {
                    failures += 1
                }
            }
            addAllResult = failures > 0
                ? "Added \(targets.count - failures) of \(targets.count) — \(failures) failed"
                : "Added all \(targets.count)"
            isAddingAll = false
            await refreshStatus()
        }
    }
}
