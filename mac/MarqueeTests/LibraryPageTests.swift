import XCTest
@testable import Marquee

// The Library page (0.51+, api-v1.md §17 and deviation 20): the four
// fixtures and what the page reads off them, the filter query, the counts
// strip and Storage card wording, and `LibraryModel` against a stubbed
// server (paging, an older server's 404, the other tabs' loading).

@MainActor
final class LibraryPageTests: XCTestCase {
    private static let server = URL(string: "http://192.168.1.10:3000")!

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

    // MARK: Fixtures

    func testLibraryPageDecodes() throws {
        let page = try decode(API.LibraryPageResponse.self, "library-page")
        XCTAssertEqual(page.page, 1)
        XCTAssertEqual(page.pageSize, 60)
        XCTAssertEqual(page.totalPages, 14)
        XCTAssertEqual(page.totalResults, 812)
        XCTAssertTrue(page.hasMorePages)
        XCTAssertTrue(page.connected)
        XCTAssertEqual(page.results.count, 2)

        let matrix = try XCTUnwrap(page.results.first)
        XCTAssertEqual(matrix.id, API.TitleID(.movie, 603))
        XCTAssertEqual(matrix.name, "The Matrix")
        XCTAssertEqual(matrix.status, .owned)
        XCTAssertEqual(matrix.favorited, true)
        XCTAssertEqual(matrix.source, .plex)
        XCTAssertEqual(matrix.resolution, .uhd)
        XCTAssertEqual(matrix.resolution?.label, "4K")
        XCTAssertEqual(matrix.hdr, "Dolby Vision")
        XCTAssertEqual(matrix.videoCodec, "HEVC")
        XCTAssertEqual(matrix.audioCodec, "TrueHD Atmos")
        XCTAssertEqual(matrix.quality, "Bluray-2160p")
        XCTAssertEqual(matrix.sizeBytes, 31_234_567_890)
        XCTAssertNotNil(matrix.addedAt)
        XCTAssertEqual(matrix.genres, ["Action", "Science Fiction"])
        XCTAssertEqual(matrix.filePath, "/movies/The Matrix (1999)/The Matrix (1999) Bluray-2160p.mkv")
        XCTAssertNil(matrix.episodeCount)
        XCTAssertFalse(matrix.upgradeAvailable)
        XCTAssertFalse(matrix.possibleDuplicate)
        XCTAssertEqual(matrix.arrTracking, API.ArrTracking(arrId: 12, monitored: true))
        XCTAssertEqual(matrix.card.id, matrix.id)
        XCTAssertEqual(matrix.card.status, .owned)

        let thrones = try XCTUnwrap(page.results.last)
        XCTAssertEqual(thrones.mediaType, .tv)
        XCTAssertEqual(thrones.tvdbId, 121_361)
        XCTAssertEqual(thrones.status, .trackedDownloading)
        XCTAssertEqual(thrones.source, .sonarr)
        XCTAssertNil(thrones.resolution)
        XCTAssertNil(thrones.hdr)
        XCTAssertNil(thrones.addedAt)
        XCTAssertEqual(thrones.episodeCount, 61)
        XCTAssertEqual(thrones.arrTracking?.arrId, 7)

        XCTAssertEqual(page.summary, API.LibrarySummary(movies: 640, series: 172, episodes: 9840, totalBytes: 48_000_000_000_000, tracked: 23))
        XCTAssertEqual(page.filters.sources, [.plex, .sonarr, .radarr])
        XCTAssertEqual(page.filters.genres, ["Action", "Drama", "Science Fiction", "Sci-Fi & Fantasy"])
        XCTAssertEqual(page.filters.codecs, ["AV1", "H264", "HEVC"])
        XCTAssertEqual(page.filters.years, [2026, 2025, 2011, 1999])
        XCTAssertEqual(page.filters.resolutions, [.uhd, .fullHD, .sd])
        XCTAssertTrue(page.filters.hasHdr)
    }

    func testLastPageHasNoMore() throws {
        var json = try XCTUnwrap(JSONSerialization.jsonObject(with: fixtureData("library-page")) as? [String: Any])
        json["page"] = 14
        let last = try APIClient.decoder.decode(API.LibraryPageResponse.self, from: JSONSerialization.data(withJSONObject: json))
        XCTAssertFalse(last.hasMorePages)
    }

    func testCollectionsMissingDecodes() throws {
        let list = try decode(API.ListResponse<API.LibraryCollection>.self, "library-collections-missing")
        let matrix = try XCTUnwrap(list.results.first)
        XCTAssertEqual(list.results.count, 1)
        XCTAssertEqual(matrix.id, "collection-2344")
        XCTAssertEqual(matrix.title, "The Matrix Collection")
        XCTAssertEqual(matrix.collectionId, 2344)
        XCTAssertEqual(matrix.collectionFavorited, false)
        XCTAssertEqual(matrix.items.map(\.tmdbId), [603])
        XCTAssertNil(matrix.items.first?.status, "A missing part has no status")
        XCTAssertEqual(matrix.missingCount, 2)
        XCTAssertEqual(matrix.addAllMissing, [API.TitleID(.movie, 605), API.TitleID(.movie, 624_860)])
        XCTAssertTrue(matrix.requestAllMissing.isEmpty)
        XCTAssertEqual(matrix.requestAllTarget, API.TitleID(.movie, 603))
        XCTAssertEqual(matrix.heading, "The Matrix Collection · 2 missing")
    }

    func testDuplicatesDecode() throws {
        let list = try decode(API.ListResponse<API.LibraryDuplicate>.self, "library-duplicates")
        let matrix = try XCTUnwrap(list.results.first)
        XCTAssertEqual(matrix.id, API.TitleID(.movie, 603))
        XCTAssertEqual(matrix.year, "1999")
        XCTAssertEqual(matrix.reason, .paths)
        XCTAssertEqual(matrix.reason.label, "Different files")
        XCTAssertEqual(API.LibraryDuplicateReason.servers.label, "On several servers")
        XCTAssertEqual(matrix.copies.count, 2)
        XCTAssertEqual(matrix.copies.map(\.source), [.radarr, .plex])
        XCTAssertEqual(matrix.copies.map(\.server), ["Radarr", "Tower"])
        XCTAssertEqual(matrix.copies.last?.filePath, "/movies/The Matrix (1999)/The Matrix (1999) WEBDL-1080p.mkv")
        XCTAssertEqual(matrix.copies.last?.sizeBytes, 8_123_456_789)
        XCTAssertEqual(matrix.copies.map(\.quality), ["Bluray-2160p", "1080p"])
    }

    func testStorageDecodes() throws {
        let storage = try decode(API.LibraryStorage.self, "library-storage")
        XCTAssertEqual(storage.folders.map(\.id), ["/movies", "/tv"])
        XCTAssertEqual(storage.folders.first?.servers, ["Radarr", "4K Radarr"])
        XCTAssertEqual(storage.folders.first?.freeBytes, 812_000_000_000)
        XCTAssertEqual(storage.totalFreeBytes, 1_624_000_000_000)
        XCTAssertNotNil(storage.measuredAt)
        XCTAssertTrue(storage.live)
        XCTAssertFalse(storage.isEmpty)
        let forecast = try XCTUnwrap(storage.forecast)
        XCTAssertEqual(forecast.daysRemaining, 42)
        XCTAssertEqual(forecast.bytesPerDay, 12_300_000_000)
        XCTAssertEqual(forecast.fullOn, API.CalendarDay(year: 2026, month: 11, day: 7))
    }

    func testUnknownResolutionSourceAndReasonStillDecode() throws {
        let entry = try decode(API.LibraryEntry.self, json: """
        {"mediaType":"movie","tmdbId":1,"name":"X","posterPath":null,"year":null,"subtitle":null,"overview":null,"rating":null,
         "status":"owned","favorited":null,"requested":null,"canQuickAdd":false,"canRequest":false,"tvdbId":null,
         "source":"emby","sizeBytes":null,"addedAt":null,"genres":[],"resolution":"8K","hdr":null,"videoCodec":null,
         "audioCodec":null,"quality":null,"filePath":null,"episodeCount":null,"upgradeAvailable":false,
         "possibleDuplicate":false,"arrTracking":null}
        """)
        XCTAssertEqual(entry.source, .unknown("emby"))
        XCTAssertEqual(entry.resolution, .unknown("8K"))
        XCTAssertFalse(try XCTUnwrap(entry.resolution).isKnown)
        XCTAssertEqual(entry.resolution?.label, "8K")
        XCTAssertNil(entry.arrTracking)
        XCTAssertEqual(entry.metaLine, "Emby")
        XCTAssertNil(entry.sizeLabel)

        let filters = try decode(API.LibraryFilters.self, json: #"{"sources":["emby"],"genres":[],"codecs":[],"years":[],"resolutions":["8K"],"hasHdr":false}"#)
        XCTAssertEqual(filters.resolutions, [.unknown("8K")])

        let duplicate = try decode(API.LibraryDuplicate.self, json: """
        {"mediaType":"tv","tmdbId":2,"name":"Y","posterPath":null,"year":null,"reason":"editions","copies":[]}
        """)
        XCTAssertEqual(duplicate.reason, .unknown("editions"))
        XCTAssertEqual(duplicate.reason.label, "editions")
    }

    // MARK: The query

    func testQueryDefaultsSendNothing() {
        let query = API.LibraryQuery()
        XCTAssertFalse(query.hasFilters)
        XCTAssertTrue(query.queryItems(page: 1).values.allSatisfy { $0 == nil })
        XCTAssertEqual(query.queryItems(page: 3)["page"], "3")
        XCTAssertNil(API.LibraryQuery(q: "   ").queryItems(page: 1)["q"] ?? nil, "Blank search is no search")
        XCTAssertNil(API.LibraryQuery(codec: "").queryItems(page: 1)["codec"] ?? nil)
    }

    func testQuerySendsEveryFilter() {
        let query = API.LibraryQuery(
            type: .tv, status: .trackedMonitored, source: .jellyfin, resolution: .sd, hdr: true, codec: "AV1", genre: "Drama",
            year: 2011, q: " thrones ", sort: .rating
        )
        XCTAssertTrue(query.hasFilters)
        let items = query.queryItems(page: 1).compactMapValues { $0 }
        XCTAssertEqual(items, [
            "type": "tv", "status": "tracked_monitored", "source": "jellyfin", "resolution": "SD", "hdr": "1", "codec": "AV1",
            "genre": "Drama", "year": "2011", "q": "thrones", "sort": "rating",
        ])
        XCTAssertEqual(API.LibraryQuery(resolution: .uhd).queryItems(page: 1)["resolution"], "4K")
        XCTAssertEqual(API.LibraryQuery(resolution: .fullHD).queryItems(page: 1)["resolution"], "1080p")
        XCTAssertNil(API.LibraryQuery(hdr: false).queryItems(page: 1)["hdr"] ?? nil)
        XCTAssertNil(API.LibraryQuery(sort: .recent).queryItems(page: 1)["sort"] ?? nil, "The default sort is left out")
        XCTAssertEqual(API.LibrarySort.allCases.map(\.rawValue), ["recent", "title", "year", "size", "rating"])
    }

    // MARK: Wording

    func testMetaLinesAndCounts() throws {
        let page = try decode(API.LibraryPageResponse.self, "library-page")
        let matrix = try XCTUnwrap(page.results.first)
        let thrones = try XCTUnwrap(page.results.last)
        XCTAssertEqual(matrix.metaLine, "Plex · 29.1 GB")
        XCTAssertEqual(matrix.qualityLabel, "4K · Dolby Vision · HEVC · TrueHD Atmos")
        XCTAssertEqual(matrix.sizeLabel, "29.1 GB")
        XCTAssertEqual(thrones.metaLine, "Sonarr · 92.0 GB · 61 episodes")
        XCTAssertNil(thrones.qualityLabel)

        XCTAssertEqual(page.summary.line, "640 movies · 172 series · 9,840 episodes · 43.7 TB on disk")
        XCTAssertEqual(page.summary.trackedNote, "+ 23 more downloading, missing or coming soon, not counted above")
        let bare = API.LibrarySummary(movies: 1, series: 1, episodes: 0, totalBytes: 0, tracked: 0)
        XCTAssertEqual(bare.line, "1 movie · 1 series")
        XCTAssertNil(bare.trackedNote)
    }

    func testUpgradeAndDuplicateFlagsJoinTheMetaLine() throws {
        var json = try XCTUnwrap(JSONSerialization.jsonObject(with: fixtureData("library-page")) as? [String: Any])
        var results = try XCTUnwrap(json["results"] as? [[String: Any]])
        results[0]["upgradeAvailable"] = true
        results[0]["possibleDuplicate"] = true
        json["results"] = results
        let page = try APIClient.decoder.decode(API.LibraryPageResponse.self, from: JSONSerialization.data(withJSONObject: json))
        XCTAssertEqual(page.results.first?.metaLine, "Plex · 29.1 GB · Upgrade available · Possible duplicate")
    }

    func testStorageForecastLines() throws {
        let storage = try decode(API.LibraryStorage.self, "library-storage")
        XCTAssertEqual(storage.forecastLine, "Full in about 42 days at the current rate (11.5 GB/day).")
        let fullOn = try XCTUnwrap(storage.fullOnLine())
        XCTAssertTrue(fullOn.hasPrefix("Around "), fullOn)
        XCTAssertTrue(fullOn.hasSuffix("."), fullOn)
        XCTAssertTrue(fullOn.contains("2026"), fullOn)
        XCTAssertEqual(storage.measuredLine, "Read from your servers just now.")

        let today = API.LibraryStorage(
            folders: [], totalFreeBytes: 0, measuredAt: Date(timeIntervalSince1970: 1_790_000_000), live: false,
            forecast: API.LibraryStorageForecast(daysRemaining: 0, bytesPerDay: 1_073_741_824, fullOn: nil)
        )
        XCTAssertEqual(today.forecastLine, "Full today at the current rate (1.0 GB/day).")
        XCTAssertNil(today.fullOnLine())
        XCTAssertTrue(try XCTUnwrap(today.measuredLine).hasPrefix("From the last daily snapshot, "))
        XCTAssertFalse(today.isEmpty, "A snapshot counts as measured")

        let single = API.LibraryStorage(
            folders: [], totalFreeBytes: 0, measuredAt: nil, live: false,
            forecast: API.LibraryStorageForecast(daysRemaining: 1, bytesPerDay: 1_073_741_824, fullOn: nil)
        )
        XCTAssertEqual(single.forecastLine, "Full in about 1 day at the current rate (1.0 GB/day).")
        XCTAssertNotNil(single.fullOnLine(), "Counted from today when the server sends no day")

        let nothing = API.LibraryStorage(folders: [], totalFreeBytes: 0, measuredAt: nil, live: false, forecast: nil)
        XCTAssertTrue(nothing.isEmpty)
        XCTAssertEqual(nothing.forecastLine, "No forecast yet — it needs a couple of days of readings from the daily disk-space snapshot.")
        XCTAssertNil(nothing.fullOnLine())
        XCTAssertNil(nothing.measuredLine)
    }

    // MARK: The model against a stubbed server

    func testFirstPageFillsTheListCountsAndFilters() async throws {
        let page = try fixtureData("library-page")
        StubURLProtocol.handler = { _ in (200, StubURLProtocol.apiHeaders, page) }
        let screen = LibraryModel(api: stubbedAPI())
        screen.query.type = .movie
        screen.query.hdr = true

        await screen.reset()

        let request = try XCTUnwrap(StubURLProtocol.requests.first)
        XCTAssertEqual(request.url?.path, "/api/v1/library")
        XCTAssertEqual(Set(request.url?.query?.split(separator: "&").map(String.init) ?? []), ["type=movie", "hdr=1"])
        XCTAssertEqual(screen.entries.map(\.tmdbId), [603, 1399])
        XCTAssertEqual(screen.summary?.movies, 640)
        XCTAssertEqual(screen.filters.codecs, ["AV1", "H264", "HEVC"])
        XCTAssertEqual(screen.connected, true)
        XCTAssertTrue(screen.hasNextPage)
        XCTAssertFalse(screen.initialLoad)
        XCTAssertFalse(screen.unsupported)
        XCTAssertNil(screen.error)
        XCTAssertFalse(screen.isEmptyWithFilters)

        // The next page is asked for as page 2 and appended without repeats.
        await screen.loadNextPage()
        XCTAssertEqual(StubURLProtocol.requests.count, 2)
        XCTAssertTrue(StubURLProtocol.requests.last?.url?.query?.contains("page=2") == true)
        XCTAssertEqual(screen.entries.count, 2, "The stub answers the same two rows; they aren't listed twice")

        screen.clearFilters()
        XCTAssertFalse(screen.query.hasFilters)
    }

    func testOlderServerIsUnsupportedNotAnError() async {
        StubURLProtocol.handler = { _ in StubURLProtocol.json(404, #"{"error":"Not found","code":"not_found"}"#) }
        let screen = LibraryModel(api: stubbedAPI())

        await screen.reset()

        XCTAssertTrue(screen.unsupported)
        XCTAssertEqual(screen.error, .notFound)
        XCTAssertTrue(screen.entries.isEmpty)
        XCTAssertFalse(screen.initialLoad)
    }

    func testEmptyPageWithFiltersReadsAsNoMatches() async throws {
        var json = try XCTUnwrap(JSONSerialization.jsonObject(with: fixtureData("library-page")) as? [String: Any])
        json["results"] = []
        json["totalPages"] = 0
        let empty = try JSONSerialization.data(withJSONObject: json)
        StubURLProtocol.handler = { _ in (200, StubURLProtocol.apiHeaders, empty) }
        let screen = LibraryModel(api: stubbedAPI())
        screen.query.q = "zzz"

        await screen.reset()

        XCTAssertTrue(screen.entries.isEmpty)
        XCTAssertTrue(screen.isEmptyWithFilters)
        XCTAssertFalse(screen.hasNextPage)
        XCTAssertNil(screen.error)
    }

    func testOtherTabsLoadOnceUntilTheRevisionMoves() async throws {
        let collections = try fixtureData("library-collections-missing")
        let duplicates = try fixtureData("library-duplicates")
        let storage = try fixtureData("library-storage")
        StubURLProtocol.handler = { request in
            switch request.url?.path {
            case "/api/v1/library/collections-missing": return (200, StubURLProtocol.apiHeaders, collections)
            case "/api/v1/library/duplicates": return (200, StubURLProtocol.apiHeaders, duplicates)
            case "/api/v1/library/storage": return (200, StubURLProtocol.apiHeaders, storage)
            default: return StubURLProtocol.json(404, #"{"error":"Not found","code":"not_found"}"#)
            }
        }
        let screen = LibraryModel(api: stubbedAPI())

        await screen.loadSectionIfNeeded()
        XCTAssertTrue(StubURLProtocol.requests.isEmpty, "All titles pages through reset(), not here")

        screen.tab = .collections
        await screen.loadSectionIfNeeded()
        XCTAssertEqual(screen.collections?.map(\.key), ["collection-2344"])
        await screen.loadSectionIfNeeded()
        XCTAssertEqual(StubURLProtocol.requests.count, 1, "Shown again at the same revision: nothing to do")

        await screen.loadSectionIfNeeded(at: LibraryModel.SectionRevision(reload: 1))
        XCTAssertEqual(StubURLProtocol.requests.count, 2, "⌘R loads the shown tab again")

        screen.tab = .duplicates
        await screen.loadSectionIfNeeded(at: LibraryModel.SectionRevision(reload: 1))
        XCTAssertEqual(screen.duplicates?.first?.reason, .paths)

        screen.tab = .storage
        await screen.loadSectionIfNeeded(at: LibraryModel.SectionRevision(reload: 1))
        XCTAssertEqual(screen.storage?.forecast?.daysRemaining, 42)
        XCTAssertEqual(StubURLProtocol.requests.count, 4)
    }

    func testRowActionsGoToTheTitleEndpoints() async throws {
        let page = try decode(API.LibraryPageResponse.self, "library-page")
        let matrix = try XCTUnwrap(page.results.first)
        StubURLProtocol.handler = { request in
            if request.url?.path.hasSuffix("/monitored") == true {
                return StubURLProtocol.json(200, #"{"ok":true,"monitored":false}"#)
            }
            return StubURLProtocol.json(200, #"{"ok":true}"#)
        }
        let pageData = try fixtureData("library-page")
        StubURLProtocol.handler = { request in
            switch request.url?.path {
            case "/api/v1/library": return (200, StubURLProtocol.apiHeaders, pageData)
            case "/api/v1/titles/movie/603/monitored": return StubURLProtocol.json(200, #"{"ok":true,"monitored":false}"#)
            default: return StubURLProtocol.json(200, #"{"ok":true}"#)
            }
        }
        let screen = LibraryModel(api: stubbedAPI())
        await screen.reset()

        await screen.searchNow(matrix)
        let search = try XCTUnwrap(StubURLProtocol.requests.last)
        XCTAssertEqual(search.httpMethod, "POST")
        XCTAssertEqual(search.url?.path, "/api/v1/titles/movie/603/search")
        XCTAssertEqual(screen.rowMessages[matrix.id]?.text, "Search queued.")
        XCTAssertEqual(screen.rowMessages[matrix.id]?.isError, false)

        await screen.toggleMonitoring(matrix)
        let monitored = try XCTUnwrap(StubURLProtocol.requests.last)
        XCTAssertEqual(monitored.httpMethod, "PUT")
        XCTAssertEqual(monitored.url?.path, "/api/v1/titles/movie/603/monitored")
        XCTAssertEqual(screen.entries.first?.arrTracking?.monitored, false, "The row takes the server's answer")
        XCTAssertTrue(screen.busyRows.isEmpty)
    }
}
