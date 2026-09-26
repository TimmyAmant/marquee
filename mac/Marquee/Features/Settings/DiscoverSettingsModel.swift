import Foundation
import Observation

// Settings › Discover (0.49+, api-v1.md §2): the admin arranges Discover for
// the household — reorders and hides the built-in rows, and adds their own.
// The state lives here, apart from the views, so it's testable.

/// The row list: order, show/hide, rename, remove, reset.
@MainActor
@Observable
final class DiscoverSettingsModel {
    /// nil until the first load answers.
    private(set) var settings: API.DiscoverSettings?
    private(set) var loadError: String?
    /// The server has no Settings › Discover (older than 0.49), or this
    /// account isn't the admin.
    private(set) var isUnavailable = false
    /// A change is on its way to the server.
    private(set) var isSaving = false
    /// The last change's failure, shown above the list.
    private(set) var error: String?
    /// The row asking "Remove …?".
    var confirmingRemoveId: String?

    var rows: [API.DiscoverRowSetting] { settings?.shelves ?? [] }
    var customCount: Int { rows.filter(\.custom).count }
    /// Room for another of the admin's own rows.
    var canAddRow: Bool {
        guard let settings else { return false }
        return customCount < settings.maxCustomShelves
    }

    init(settings: API.DiscoverSettings? = nil) {
        self.settings = settings
    }

    func load(_ api: MarqueeAPI) async {
        do {
            let fresh = try await api.discoverSettings.load()
            if Task.isCancelled { return }
            settings = fresh
            loadError = nil
            isUnavailable = false
        } catch let failure as APIError where failure.isCancellation {
            return
        } catch APIError.notFound {
            isUnavailable = true
        } catch APIError.forbidden {
            isUnavailable = true
        } catch {
            if settings == nil { loadError = error.localizedDescription }
        }
    }

    // MARK: Order

    /// Drag to reorder (`List.onMove`'s offsets).
    func move(fromOffsets source: IndexSet, toOffset destination: Int, _ api: MarqueeAPI) async {
        await arrange(Self.moving(rows, fromOffsets: source, toOffset: destination), api)
    }

    /// The ↑ / ↓ buttons: one place up (-1) or down (+1).
    func move(_ id: String, by offset: Int, _ api: MarqueeAPI) async {
        guard let moved = Self.moving(rows, id: id, by: offset) else { return }
        await arrange(moved, api)
    }

    /// Shows or hides a row, in place.
    func setHidden(_ id: String, _ hidden: Bool, _ api: MarqueeAPI) async {
        guard let index = rows.firstIndex(where: { $0.id == id }), rows[index].hidden != hidden else { return }
        var changed = rows
        changed[index].hidden = hidden
        await arrange(changed, api)
    }

    /// Sends the whole order, each row shown or hidden (`PUT`), showing it
    /// straight away and going back if the server says no.
    private func arrange(_ changed: [API.DiscoverRowSetting], _ api: MarqueeAPI) async {
        guard let before = settings, changed != before.shelves else { return }
        settings?.shelves = changed
        isSaving = true
        error = nil
        do {
            settings = try await api.discoverSettings.arrange(changed)
        } catch {
            settings = before
            self.error = error.localizedDescription
        }
        isSaving = false
    }

    // MARK: Custom rows

    /// Renames one of the admin's own rows; false (and `error`) if it didn't.
    @discardableResult
    func rename(_ id: String, to title: String, _ api: MarqueeAPI) async -> Bool {
        guard let trimmed = title.nonBlank?.trimmingCharacters(in: .whitespacesAndNewlines) else {
            error = "Give the row a name."
            return false
        }
        guard let row = rows.first(where: { $0.id == id }), row.custom else { return false }
        if row.title == trimmed { return true }
        isSaving = true
        error = nil
        defer { isSaving = false }
        do {
            let updated = try await api.discoverSettings.update(id, API.UpdateDiscoverRowRequest(title: trimmed))
            replace(updated)
            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }

    func remove(_ id: String, _ api: MarqueeAPI) async {
        isSaving = true
        error = nil
        do {
            try await api.discoverSettings.remove(id)
            settings?.shelves.removeAll { $0.id == id }
        } catch APIError.notFound {
            // Already gone.
            settings?.shelves.removeAll { $0.id == id }
        } catch {
            self.error = error.localizedDescription
        }
        if confirmingRemoveId == id { confirmingRemoveId = nil }
        isSaving = false
    }

    /// "Reset to default": the built-in rows back in order, all shown.
    func reset(_ api: MarqueeAPI) async {
        isSaving = true
        error = nil
        do {
            settings = try await api.discoverSettings.reset()
        } catch {
            self.error = error.localizedDescription
        }
        isSaving = false
    }

    /// A row the Add sheet just made: at the end, shown.
    func added(_ row: API.DiscoverRowSetting) {
        guard settings != nil else { return }
        settings?.shelves.removeAll { $0.id == row.id }
        settings?.shelves.append(row)
    }

    private func replace(_ row: API.DiscoverRowSetting) {
        guard let index = rows.firstIndex(where: { $0.id == row.id }) else { return }
        settings?.shelves[index] = row
    }

    // MARK: Pure

    /// `rows` with the ones at `source` moved before `destination`, the way
    /// `List.onMove` counts (`destination` is an index in the list as it was).
    static func moving<Row>(_ rows: [Row], fromOffsets source: IndexSet, toOffset destination: Int) -> [Row] {
        let valid = source.filter { rows.indices.contains($0) }
        guard !valid.isEmpty else { return rows }
        let moving = valid.map { rows[$0] }
        var rest: [Row] = []
        var insertAt = 0
        for (index, row) in rows.enumerated() where !valid.contains(index) {
            if index < destination { insertAt += 1 }
            rest.append(row)
        }
        rest.insert(contentsOf: moving, at: min(insertAt, rest.count))
        return rest
    }

    /// `rows` with `id` one place up (-1) or down (+1); nil when it's
    /// already at that end, or not there.
    static func moving(_ rows: [API.DiscoverRowSetting], id: String, by offset: Int) -> [API.DiscoverRowSetting]? {
        guard let index = rows.firstIndex(where: { $0.id == id }) else { return nil }
        let target = index + offset
        guard offset != 0, rows.indices.contains(target) else { return nil }
        var moved = rows
        moved.swapAt(index, target)
        return moved
    }
}

/// The "Add row" sheet's form, as the server expects it.
struct DiscoverRowDraft: Hashable, Sendable {
    /// The kinds the sheet offers, in the website's order.
    static let kinds: [API.DiscoverRowKind] = API.DiscoverRowKind.knownCases

    private(set) var kind: API.DiscoverRowKind = .keyword
    /// The search field (keyword, studio, network, genre filter).
    var query = ""
    /// The keyword, genre, studio or network picked from the search.
    var picked: API.DiscoverLookupResult?
    var mediaType: API.DiscoverRowMediaType = .all
    /// A TMDb list's number or themoviedb.org/list link.
    var tmdbList = ""
    /// A public Trakt list or watchlist link.
    var traktURL = ""
    /// Optional; the server names the row when it's blank.
    var title = ""

    init(kind: API.DiscoverRowKind = .keyword) {
        setKind(kind)
    }

    /// Another kind: what was picked for the old one doesn't carry over.
    mutating func setKind(_ newKind: API.DiscoverRowKind) {
        if newKind != kind {
            query = ""
            picked = nil
        }
        kind = newKind
        let choices = newKind.mediaTypeChoices
        if !choices.isEmpty, !choices.contains(mediaType) {
            mediaType = choices.contains(.all) ? .all : .movie
        }
    }

    /// The genre list to look up (`movie` or `tv`).
    var genreMediaType: API.MediaType { mediaType == .tv ? .tv : .movie }

    /// What's missing before the row can be added, in the server's words;
    /// nil when it's ready.
    var missingMessage: String? {
        switch kind {
        case .keyword: return picked == nil ? "Pick a keyword." : nil
        case .genre: return picked == nil ? "Pick a genre." : nil
        case .company: return picked == nil ? "Pick a studio." : nil
        case .network: return picked == nil ? "Pick a network." : nil
        case .tmdbList: return tmdbList.nonBlank == nil ? "Enter a TMDb list's number or link." : nil
        case .traktList: return traktURL.nonBlank == nil ? "Paste a public Trakt list or watchlist link." : nil
        case .library: return nil
        case .unknown: return "Pick what the row shows."
        }
    }

    /// The `POST /settings/discover/shelves` body; nil until it's ready.
    var request: API.AddDiscoverRowRequest? {
        guard missingMessage == nil else { return nil }
        let name = title.nonBlank.map { String($0.trimmingCharacters(in: .whitespacesAndNewlines).prefix(API.AddDiscoverRowRequest.maxTitleLength)) }
        var body = API.AddDiscoverRowRequest(kind: kind.rawValue, title: name)
        switch kind {
        case .keyword, .company:
            body.tmdbId = picked?.tmdbId
            body.name = picked?.name
            body.mediaType = mediaType.rawValue
        case .genre:
            body.tmdbId = picked?.tmdbId
            body.name = picked?.name
            body.mediaType = genreMediaType.rawValue
        case .network:
            body.tmdbId = picked?.tmdbId
            body.name = picked?.name
            body.mediaType = API.DiscoverRowMediaType.tv.rawValue
        case .tmdbList:
            let value = tmdbList.trimmingCharacters(in: .whitespacesAndNewlines)
            if let number = Int(value), number > 0 {
                body.tmdbId = number
            } else {
                body.url = value
            }
        case .traktList:
            body.url = traktURL.trimmingCharacters(in: .whitespacesAndNewlines)
        case .library:
            body.mediaType = mediaType.rawValue
        case .unknown:
            return nil
        }
        return body
    }
}
