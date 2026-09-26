import XCTest
@testable import Marquee

// Customisable Discover rows and Trakt list syncs (0.49+, api-v1.md
// deviation 18): the new fixtures, how Discover lays out `shelves` (and an
// older server without them), Settings › Discover's model and "Add row"
// form, and the Trakt lists card's model.

@MainActor
final class DiscoverRowsTests: XCTestCase {
    private static let server = URL(string: "http://192.168.1.10:3000")!
    private static let animeId = "5b0f3c2e-8f7a-4d0e-9b1c-2a6d7e8f9a01"
    private static let annaId = UUID(uuidString: "83c55a49-6153-4cb9-ae22-4a42d48f4cf3")!

    override func tearDown() {
        StubURLProtocol.handler = nil
        StubURLProtocol.requests = []
        super.tearDown()
    }

    private func fixtureData(_ name: String) throws -> Data {
        try Data(contentsOf: Bundle(for: Self.self).resourceURL!.appendingPathComponent("Fixtures/api/\(name).json"))
    }

    private func decode<T: Decodable>(_ type: T.Type, _ name: String) throws -> T {
        try APIClient.decoder.decode(type, from: fixtureData(name))
    }

    private func decode<T: Decodable>(_ type: T.Type, json: String) throws -> T {
        try APIClient.decoder.decode(type, from: Data(json.utf8))
    }

    private func stubbedAPI() -> MarqueeAPI {
        MarqueeAPI(client: APIClient(baseURL: Self.server, token: "mqt_test", session: StubURLProtocol.session()))
    }

    private func body(_ request: URLRequest) throws -> [String: Any] {
        var data = request.httpBody ?? Data()
        if data.isEmpty, let stream = request.httpBodyStream {
            stream.open()
            defer { stream.close() }
            var buffer = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable {
                let read = stream.read(&buffer, maxLength: buffer.count)
                if read <= 0 { break }
                data.append(buffer, count: read)
            }
        }
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    /// `discover.json` with `shelves` replaced (or removed, for nil).
    private func discover(shelves: [[String: Any]]?) throws -> API.DiscoverShelves {
        var json = try XCTUnwrap(JSONSerialization.jsonObject(with: fixtureData("discover")) as? [String: Any])
        if let shelves { json["shelves"] = shelves } else { json.removeValue(forKey: "shelves") }
        return try APIClient.decoder.decode(API.DiscoverShelves.self, from: JSONSerialization.data(withJSONObject: json))
    }

    private static let card: [String: Any] = [
        "mediaType": "movie", "tmdbId": 603, "name": "The Matrix", "posterPath": NSNull(), "year": "1999",
        "subtitle": NSNull(), "overview": NSNull(), "rating": NSNull(), "status": NSNull(), "favorited": NSNull(),
        "requested": NSNull(), "canQuickAdd": false, "canRequest": false,
    ]

    private static func shelf(
        _ id: String, kind: String, results: [[String: Any]]? = nil, genres: [[String: Any]]? = nil,
        logos: [[String: Any]]? = nil, seeAll: Any = NSNull()
    ) -> [String: Any] {
        [
            "id": id, "kind": kind, "title": id.capitalized, "custom": false,
            "results": results ?? NSNull(), "genres": genres ?? NSNull(), "logos": logos ?? NSNull(), "seeAll": seeAll,
        ]
    }

    // MARK: Fixtures

    func testDiscoverShelvesDecode() throws {
        let shelves = try decode(API.DiscoverShelves.self, "discover")
        let rows = try XCTUnwrap(shelves.shelves)
        XCTAssertEqual(rows.map(\.id), ["trending", Self.animeId, "movieGenres", "studios"])
        XCTAssertEqual(rows[1].kind, "keyword")
        XCTAssertTrue(rows[1].custom)
        XCTAssertEqual(rows[1].seeAll?.list, .unknown(Self.animeId))
        XCTAssertEqual(rows[2].genres?.first?.name, "Action")
        XCTAssertNil(rows[2].results)
        XCTAssertEqual(rows[3].logos?.first?.name, "Walt Disney Pictures")
    }

    func testSettingsLookupAndSyncsDecode() throws {
        let settings = try decode(API.DiscoverSettings.self, "discover-settings")
        XCTAssertEqual(settings.shelves.count, 5)
        XCTAssertTrue(settings.traktConfigured)
        XCTAssertEqual(settings.maxCustomShelves, 30)
        XCTAssertEqual(settings.shelves[1].hidden, true)
        XCTAssertNil(settings.shelves[0].sourceLine, "A built-in row has no source")
        XCTAssertEqual(settings.shelves[2].rowKind, .keyword)
        XCTAssertEqual(settings.shelves[2].source?.mediaType, .all)
        XCTAssertEqual(settings.shelves[2].sourceLine, "TMDb keyword · anime · Both")
        XCTAssertEqual(settings.shelves[3].sourceLine, "Studio · A24 · Movies")
        XCTAssertEqual(settings.shelves[4].sourceLine, "Trakt list · trakt.tv/users/someone/lists/best-of-2024")

        let lookup = try decode(API.ListResponse<API.DiscoverLookupResult>.self, "discover-lookup").results
        XCTAssertEqual(lookup.map(\.name), ["A24", "anime"])
        XCTAssertEqual(lookup.first?.detail, "US")
        XCTAssertNil(lookup.last?.logoPath)

        let syncs = try decode(API.TraktSyncs.self, "trakt-syncs")
        XCTAssertTrue(syncs.available)
        XCTAssertEqual(syncs.maxPerMember, 10)
        let sync = try XCTUnwrap(syncs.results.first)
        XCTAssertEqual(sync.kind, .list)
        XCTAssertEqual(sync.name, "Best of 2024")
        XCTAssertTrue(sync.movies)
        XCTAssertFalse(sync.tv)
        XCTAssertEqual(sync.requestedCount, 4)
        XCTAssertEqual(sync.lastSyncedAt, APIClient.parseDate("2026-09-25T18:40:05.000Z"))
        XCTAssertEqual(sync.owner?.id, Self.annaId)
        XCTAssertEqual(sync.owner?.label, "Anna")

        let jobs = try decode(API.ListResponse<API.Job>.self, "jobs").results
        XCTAssertEqual(jobs.count, 8)
        XCTAssertTrue(jobs.contains { $0.id == "trakt-sync" })
    }

    func testAnUnknownKindOrSeeAllStillDecodes() throws {
        let row = try decode(API.DiscoverRow.self, json: #"""
        {"id":"x","kind":"carousel","title":"New thing","custom":true,"results":null,"genres":null,"logos":null,
         "seeAll":{"type":"sideways","list":7,"mediaType":null}}
        """#)
        XCTAssertEqual(row.kind, "carousel")
        XCTAssertNil(row.seeAll, "A See all this app can't read only drops the chevron")
    }

    // MARK: Discover layout

    func testShelvesAreShownInTheAdminsOrder() throws {
        let layout = DiscoverLayout(try decode(API.DiscoverShelves.self, "discover"))
        XCTAssertEqual(layout.rows.map(\.id), ["trending", Self.animeId, "movieGenres", "studios"])
        XCTAssertEqual(layout.rows.map(\.title), ["Trending", "Anime", "Movie Genres", "Studios"])
        XCTAssertEqual(layout.colorKeyRowID, "trending")

        guard case let .posters(cards) = layout.rows[1].content else { return XCTFail("A custom row is a poster row") }
        XCTAssertEqual(cards.first?.id, API.TitleID(.movie, 603))
        XCTAssertEqual(layout.rows[1].seeAll, .list(.unknown(Self.animeId)), "A custom row's See all is its own list")
        XCTAssertEqual(layout.rows[0].seeAll, .list(.trending))

        guard case let .genres(tiles, mediaType) = layout.rows[2].content else { return XCTFail("Genre tiles") }
        XCTAssertEqual(tiles.first?.id, 28)
        XCTAssertEqual(mediaType, .movie)
        XCTAssertEqual(layout.rows[2].seeAll, .browse(.movie))

        guard case let .studios(logos) = layout.rows[3].content else { return XCTFail("Studio logos") }
        XCTAssertEqual(logos.first?.tmdbId, 2)
    }

    func testUnknownKindsShowResultsOrAreSkipped() throws {
        let shelves = try discover(shelves: [
            Self.shelf("first", kind: "carousel", results: [Self.card]),
            Self.shelf("second", kind: "carousel"),
            Self.shelf("seriesGenres", kind: "seriesGenres", genres: [["id": 18, "name": "Drama", "backdropPath": NSNull()]]),
            Self.shelf("networks", kind: "networks", logos: [["tmdbId": 213, "name": "Netflix", "logoPath": NSNull()]]),
            Self.shelf("studios", kind: "studios", logos: []),
            Self.shelf("empty", kind: "keyword", results: []),
            Self.shelf("odd", kind: "movieGenres", logos: [["tmdbId": 1, "name": "?", "logoPath": NSNull()]]),
        ])
        let layout = DiscoverLayout(shelves)
        XCTAssertEqual(layout.rows.map(\.id), ["first", "seriesGenres", "networks"], "Empty rows and ones this app can't draw are left out")
        guard case .posters = layout.rows[0].content else { return XCTFail("An unknown kind with results is a poster row") }
        guard case let .genres(_, mediaType) = layout.rows[1].content else { return XCTFail("Series genres") }
        XCTAssertEqual(mediaType, .tv)
        guard case .networks = layout.rows[2].content else { return XCTFail("Networks") }
        XCTAssertNil(layout.rows[0].seeAll)
    }

    func testACustomRowsSeeAllOpensTheListView() throws {
        let list: (String) -> [String: Any] = { ["type": "list", "list": $0, "mediaType": NSNull()] }
        let shelves = try discover(shelves: [
            Self.shelf("a", kind: "keyword", results: [Self.card], seeAll: list(Self.animeId)),
            Self.shelf("b", kind: "trending", results: [Self.card], seeAll: list("trending")),
            Self.shelf("c", kind: "keyword", results: [Self.card], seeAll: list("top-secret")),
            Self.shelf("d", kind: "keyword", results: [Self.card], seeAll: ["type": "browse", "list": NSNull(), "mediaType": "tv"]),
        ])
        let layout = DiscoverLayout(shelves)
        XCTAssertEqual(layout.rows.map(\.seeAll), [.list(.unknown(Self.animeId)), .list(.trending), nil, .browse(.tv)])
        // The fixed keys' See all still only knows the built-in lists.
        XCTAssertNil(API.SeeAllDestination.resolve(API.SeeAllTarget(type: .list, list: .unknown(Self.animeId))))
    }

    func testAnOlderServerKeepsTheFixedRows() throws {
        let shelves = try discover(shelves: nil)
        XCTAssertNil(shelves.shelves)
        let layout = DiscoverLayout(shelves)
        XCTAssertEqual(layout.rows.map(\.id), API.DiscoverShelf.allCases.map(\.rawValue))
        XCTAssertEqual(layout.rows.map(\.title), [
            "Recently Added", "Trending", "Popular Movies", "Movie Genres", "Upcoming Movies",
            "Studios", "Popular Series", "Series Genres", "Upcoming Series", "Networks",
        ])
        XCTAssertEqual(layout.colorKeyRowID, "recentlyAdded")
        XCTAssertEqual(layout.rows[1].seeAll, .list(.trending))
        guard case let .genres(_, mediaType) = layout.rows[7].content else { return XCTFail("Series genres") }
        XCTAssertEqual(mediaType, .tv)
        guard case let .studios(logos) = layout.rows[5].content else { return XCTFail("Studios") }
        XCTAssertEqual(logos.first?.name, "Walt Disney Pictures")
    }

    func testEmptyShelvesMeanNothingToShow() throws {
        XCTAssertTrue(DiscoverLayout(try discover(shelves: [])).isEmpty, "Every row hidden: the empty state")
    }

    // MARK: Discover lists

    func testACustomRowsListIsFetchedByItsId() async throws {
        let page = try fixtureData("discover-list")
        StubURLProtocol.handler = { _ in (200, StubURLProtocol.apiHeaders, page) }
        _ = try await stubbedAPI().discover.list(.unknown(Self.animeId), page: 2)
        let request = try XCTUnwrap(StubURLProtocol.requests.first)
        XCTAssertEqual(request.url?.path, "/api/v1/discover/lists/\(Self.animeId)")
        XCTAssertEqual(request.url?.query, "page=2")
        XCTAssertTrue(API.DiscoverList.unknown(Self.animeId).isCustomRow)
        XCTAssertTrue(API.DiscoverList.unknown(Self.animeId).mixesMediaTypes)
        XCTAssertFalse(API.DiscoverList.unknown("top-secret").isCustomRow)
    }

    // MARK: Settings › Discover

    private func settingsRows(_ ids: [String]) -> [API.DiscoverRowSetting] {
        ids.map { API.DiscoverRowSetting(id: $0, kind: $0, title: $0) }
    }

    func testReorderMoves() {
        let rows = settingsRows(["a", "b", "c", "d"])
        let ids: ([API.DiscoverRowSetting]?) -> [String]? = { $0?.map(\.id) }
        XCTAssertEqual(ids(DiscoverSettingsModel.moving(rows, id: "c", by: -1)), ["a", "c", "b", "d"])
        XCTAssertEqual(ids(DiscoverSettingsModel.moving(rows, id: "a", by: 1)), ["b", "a", "c", "d"])
        XCTAssertNil(DiscoverSettingsModel.moving(rows, id: "a", by: -1), "Already first")
        XCTAssertNil(DiscoverSettingsModel.moving(rows, id: "d", by: 1), "Already last")
        XCTAssertNil(DiscoverSettingsModel.moving(rows, id: "zz", by: 1))

        // List.onMove's offsets: the destination counts the list as it was.
        XCTAssertEqual(DiscoverSettingsModel.moving(rows, fromOffsets: [0], toOffset: 4).map(\.id), ["b", "c", "d", "a"])
        XCTAssertEqual(DiscoverSettingsModel.moving(rows, fromOffsets: [3], toOffset: 0).map(\.id), ["d", "a", "b", "c"])
        XCTAssertEqual(DiscoverSettingsModel.moving(rows, fromOffsets: [1], toOffset: 3).map(\.id), ["a", "c", "b", "d"])
        XCTAssertEqual(DiscoverSettingsModel.moving(rows, fromOffsets: [0, 2], toOffset: 4).map(\.id), ["b", "d", "a", "c"])
        XCTAssertEqual(DiscoverSettingsModel.moving(rows, fromOffsets: [2], toOffset: 2).map(\.id), ["a", "b", "c", "d"])
    }

    func testMovingARowSendsTheWholeOrder() async throws {
        let answer = try fixtureData("discover-settings")
        StubURLProtocol.handler = { _ in (200, StubURLProtocol.apiHeaders, answer) }
        let settings = try decode(API.DiscoverSettings.self, "discover-settings")
        let discover = DiscoverSettingsModel(settings: settings)

        await discover.move(Self.animeId, by: -1, stubbedAPI())
        let request = try XCTUnwrap(StubURLProtocol.requests.first)
        XCTAssertEqual(request.httpMethod, "PUT")
        XCTAssertEqual(request.url?.path, "/api/v1/settings/discover")
        let sent = try XCTUnwrap(try body(request)["shelves"] as? [[String: Any]])
        XCTAssertEqual(sent.compactMap { $0["id"] as? String }, [
            "recentlyAdded", Self.animeId, "trending", "8d1e2f3a-4b5c-4d6e-8f70-1a2b3c4d5e6f", "c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f",
        ])
        XCTAssertEqual(sent.compactMap { $0["hidden"] as? Bool }, [false, false, true, false, false])
        XCTAssertEqual(discover.rows, settings.shelves, "Shows what the server answered")
        XCTAssertNil(discover.error)
    }

    func testAFailedChangeGoesBack() async throws {
        StubURLProtocol.handler = { _ in StubURLProtocol.json(400, #"{"error":"There's no Discover row \"x\". Reload and try again.","code":"invalid"}"#) }
        let settings = try decode(API.DiscoverSettings.self, "discover-settings")
        let discover = DiscoverSettingsModel(settings: settings)

        await discover.setHidden("trending", false, stubbedAPI())
        XCTAssertEqual(discover.rows, settings.shelves)
        XCTAssertEqual(discover.error, "There's no Discover row \"x\". Reload and try again.")
        XCTAssertFalse(discover.isSaving)
    }

    func testAnOlderServerHidesDiscoverSettings() async {
        StubURLProtocol.handler = { _ in StubURLProtocol.json(404, #"{"error":"Not found","code":"not_found"}"#) }
        let discover = DiscoverSettingsModel()
        await discover.load(stubbedAPI())
        XCTAssertTrue(discover.isUnavailable)
        XCTAssertNil(discover.settings)
    }

    func testRemovingAndAddingCustomRows() async throws {
        StubURLProtocol.handler = { _ in StubURLProtocol.json(200, #"{"ok":true}"#) }
        let settings = try decode(API.DiscoverSettings.self, "discover-settings")
        let discover = DiscoverSettingsModel(settings: settings)
        XCTAssertEqual(discover.customCount, 3)
        XCTAssertTrue(discover.canAddRow)

        discover.confirmingRemoveId = Self.animeId
        await discover.remove(Self.animeId, stubbedAPI())
        XCTAssertEqual(StubURLProtocol.requests.first?.httpMethod, "DELETE")
        XCTAssertEqual(StubURLProtocol.requests.first?.url?.path, "/api/v1/settings/discover/shelves/\(Self.animeId)")
        XCTAssertFalse(discover.rows.contains { $0.id == Self.animeId })
        XCTAssertNil(discover.confirmingRemoveId)

        discover.added(API.DiscoverRowSetting(id: "new", kind: "library", title: "Recently Added Movies", custom: true))
        XCTAssertEqual(discover.rows.last?.id, "new")
        XCTAssertEqual(discover.customCount, 3)
    }

    // MARK: Add row

    private func encoded(_ request: API.AddDiscoverRowRequest?) throws -> [String: AnyHashable] {
        let data = try APIClient.encoder.encode(try XCTUnwrap(request))
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: AnyHashable])
    }

    func testAddRowBodyPerKind() throws {
        let anime = API.DiscoverLookupResult(tmdbId: 210024, name: "anime", logoPath: nil, detail: nil)

        var draft = DiscoverRowDraft()
        XCTAssertEqual(draft.missingMessage, "Pick a keyword.")
        XCTAssertNil(draft.request)
        draft.picked = anime
        draft.title = "  Anime  "
        XCTAssertEqual(try encoded(draft.request), ["kind": "keyword", "tmdbId": 210024, "name": "anime", "mediaType": "all", "title": "Anime"])

        draft.setKind(.company)
        XCTAssertNil(draft.picked, "What was picked for another kind doesn't carry over")
        draft.picked = API.DiscoverLookupResult(tmdbId: 41077, name: "A24", logoPath: nil, detail: "US")
        draft.mediaType = .movie
        draft.title = ""
        XCTAssertEqual(try encoded(draft.request), ["kind": "company", "tmdbId": 41077, "name": "A24", "mediaType": "movie"])

        draft.setKind(.genre)
        XCTAssertEqual(draft.mediaType, .movie, "A genre row is movies or series")
        draft.mediaType = .tv
        draft.picked = API.DiscoverLookupResult(tmdbId: 35, name: "Comedy", logoPath: nil, detail: nil)
        XCTAssertEqual(try encoded(draft.request), ["kind": "genre", "tmdbId": 35, "name": "Comedy", "mediaType": "tv"])

        draft.setKind(.network)
        XCTAssertEqual(draft.missingMessage, "Pick a network.")
        draft.picked = API.DiscoverLookupResult(tmdbId: 49, name: "HBO", logoPath: nil, detail: nil)
        XCTAssertEqual(try encoded(draft.request), ["kind": "network", "tmdbId": 49, "name": "HBO", "mediaType": "tv"])

        draft.setKind(.tmdbList)
        XCTAssertNotNil(draft.missingMessage)
        draft.tmdbList = " 8136 "
        XCTAssertEqual(try encoded(draft.request), ["kind": "tmdbList", "tmdbId": 8136])
        draft.tmdbList = "https://www.themoviedb.org/list/8136-best"
        XCTAssertEqual(try encoded(draft.request), ["kind": "tmdbList", "url": "https://www.themoviedb.org/list/8136-best"])

        draft.setKind(.traktList)
        XCTAssertNotNil(draft.missingMessage)
        draft.traktURL = "https://trakt.tv/users/someone/lists/best-of-2024"
        XCTAssertEqual(try encoded(draft.request), ["kind": "traktList", "url": "https://trakt.tv/users/someone/lists/best-of-2024"])

        draft.setKind(.library)
        XCTAssertEqual(draft.mediaType, .tv, "Series is still a choice for a library row")
        XCTAssertEqual(try encoded(draft.request), ["kind": "library", "mediaType": "tv"])

        draft.title = String(repeating: "x", count: 80)
        XCTAssertEqual(try encoded(draft.request)["title"] as? String, String(repeating: "x", count: 60))
    }

    func testLookupSendsTypeQueryAndGenreMediaType() async throws {
        let answer = try fixtureData("discover-lookup")
        StubURLProtocol.handler = { _ in (200, StubURLProtocol.apiHeaders, answer) }
        let results = try await stubbedAPI().discoverSettings.lookup(.company, query: "a24", mediaType: .tv)
        XCTAssertEqual(results.count, 2)
        let request = try XCTUnwrap(StubURLProtocol.requests.last)
        let items = URLComponents(url: try XCTUnwrap(request.url), resolvingAgainstBaseURL: false)?.queryItems ?? []
        XCTAssertEqual(Set(items.map { "\($0.name)=\($0.value ?? "")" }), ["type=company", "q=a24"], "mediaType is only the genre list's")

        _ = try await stubbedAPI().discoverSettings.lookup(.genre, query: "", mediaType: .movie)
        let genres = try XCTUnwrap(StubURLProtocol.requests.last)
        let genreItems = URLComponents(url: try XCTUnwrap(genres.url), resolvingAgainstBaseURL: false)?.queryItems ?? []
        XCTAssertEqual(Set(genreItems.map { "\($0.name)=\($0.value ?? "")" }), ["type=genre", "mediaType=movie"], "Every genre: no q")
    }

    // MARK: Trakt lists

    func testTraktSyncForm() throws {
        let trakt = TraktSyncsModel()
        XCTAssertEqual(trakt.formProblem, TraktSyncsModel.blankLinkMessage)
        trakt.url = "  https://trakt.tv/users/someone/watchlist "
        trakt.movies = false
        trakt.tv = false
        XCTAssertEqual(trakt.formProblem, "Pick movies, TV shows or both.")
        trakt.tv = true
        XCTAssertEqual(trakt.request, API.CreateTraktSyncRequest(
            url: "https://trakt.tv/users/someone/watchlist", movies: false, tv: true, requestExisting: false
        ))
        let data = try APIClient.encoder.encode(try XCTUnwrap(trakt.request))
        XCTAssertEqual(
            try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: AnyHashable]),
            ["url": "https://trakt.tv/users/someone/watchlist", "movies": false, "tv": true, "requestExisting": false]
        )
    }

    func testTraktSyncLabels() throws {
        let sync = try XCTUnwrap(try decode(API.TraktSyncs.self, "trakt-syncs").results.first)
        let now = try XCTUnwrap(APIClient.parseDate("2026-09-25T20:40:05.000Z"))
        XCTAssertEqual(TraktSyncsModel.statusLine(sync, now: now), "Checked \(Format.timeAgo(sync.lastSyncedAt!, now: now)) · 4 titles requested so far")
        XCTAssertEqual(TraktSyncsModel.ownerLabel(sync, viewerId: UUID()), "Anna's")
        XCTAssertNil(TraktSyncsModel.ownerLabel(sync, viewerId: Self.annaId), "Your own shows no owner")
    }

    func testTraktSyncsLoadTogglesAndRateLimit() async throws {
        let list = try fixtureData("trakt-syncs")
        StubURLProtocol.handler = { request in
            switch (request.httpMethod ?? "", request.url?.path ?? "") {
            case ("GET", _): return (200, StubURLProtocol.apiHeaders, list)
            case ("POST", let path) where path.hasSuffix("/sync"):
                return StubURLProtocol.json(429, #"{"error":"Checked a moment ago. Try again in a minute.","code":"rate_limited"}"#)
            default:
                return StubURLProtocol.json(200, #"""
                {"id":"0f9e8d7c-6b5a-4f3e-9d2c-1b0a9f8e7d6c","kind":"list","url":"https://trakt.tv/users/someone/lists/best-of-2024","name":"Best of 2024","movies":true,"tv":true,"lastSyncedAt":null,"lastError":null,"requestedCount":4,"createdAt":"2026-09-20T09:12:44.000Z","owner":null}
                """#)
            }
        }
        let api = stubbedAPI()
        let trakt = TraktSyncsModel()
        await trakt.load(api, all: true)
        XCTAssertEqual(StubURLProtocol.requests.first?.url?.query, "all=true")
        XCTAssertTrue(trakt.isVisible)
        let sync = try XCTUnwrap(trakt.syncs?.first)

        StubURLProtocol.requests = []
        await trakt.setTypes(sync, movies: false, api)
        XCTAssertTrue(StubURLProtocol.requests.isEmpty, "Both off is refused here")
        XCTAssertEqual(trakt.rowErrors[sync.id], TraktSyncsModel.bothOffMessage)

        await trakt.setTypes(sync, tv: true, api)
        let patch = try XCTUnwrap(StubURLProtocol.requests.last)
        XCTAssertEqual(patch.httpMethod, "PATCH")
        XCTAssertEqual(try body(patch) as? [String: Bool], ["tv": true])
        XCTAssertEqual(trakt.syncs?.first?.tv, true)
        XCTAssertNil(trakt.rowErrors[sync.id])

        await trakt.checkNow(sync, api)
        XCTAssertEqual(trakt.rowErrors[sync.id], "Checked a moment ago. Try again in a minute.")
        XCTAssertTrue(trakt.busyIds.isEmpty)
    }

    func testTraktCardHidesOnAnOlderServer() async {
        StubURLProtocol.handler = { _ in StubURLProtocol.json(404, #"{"error":"Not found","code":"not_found"}"#) }
        let trakt = TraktSyncsModel()
        await trakt.load(stubbedAPI(), all: false)
        XCTAssertTrue(trakt.isUnavailable)
        XCTAssertFalse(trakt.isVisible)
    }
}
