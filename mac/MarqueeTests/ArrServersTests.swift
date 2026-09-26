import XCTest
@testable import Marquee

// Any number of Sonarr / Radarr servers and the add overrides (0.43+): the
// doc fixtures decoded, an older server's answers, the "Advanced" picks under
// Approve / Add, and the Add / Edit server form.

@MainActor
final class ArrServersTests: XCTestCase {
    private func fixture(_ name: String) throws -> Data {
        let url = Bundle(for: Self.self).resourceURL!.appendingPathComponent("Fixtures/api/\(name).json")
        return try Data(contentsOf: url)
    }

    private func decode<T: Decodable>(_ type: T.Type, _ name: String) throws -> T {
        try APIClient.decoder.decode(type, from: fixture(name))
    }

    /// Two Sonarr servers (the second anime, unreachable) and the anime flag.
    private func twoServers(isAnime: Bool = false) -> API.AddOptions {
        API.AddOptions(mediaType: .tv, tmdbId: 95396, is4k: false, isAnime: isAnime, servers: [
            API.AddOptionsServer(
                id: "main", name: "Sonarr", isDefault: true, is4k: false, reachable: true,
                qualityProfiles: [API.QualityProfile(id: 4, name: "HD-1080p"), API.QualityProfile(id: 7, name: "Anime")],
                rootFolders: [API.RootFolder(id: 1, path: "/tv")],
                tags: [API.ArrTag(id: 1, label: "kids")],
                defaults: API.AddDefaults(qualityProfileId: 4, rootFolderPath: "/tv", tags: [1], seriesType: .standard)
            ),
            API.AddOptionsServer(
                id: "anime", name: "Sonarr Anime", isDefault: false, is4k: false, reachable: false,
                qualityProfiles: [], rootFolders: [], tags: [],
                defaults: API.AddDefaults(qualityProfileId: 9, rootFolderPath: "/anime", tags: [], seriesType: .anime)
            ),
        ])
    }

    // MARK: Decoding

    func testFixturesDecode() throws {
        let integrations = try decode(API.IntegrationsOverview.self, "integrations")
        XCTAssertTrue(integrations.usesServerList)
        let sonarr = try XCTUnwrap(integrations.arrServers(of: .sonarr).first)
        XCTAssertEqual(sonarr.name, "Sonarr")
        XCTAssertEqual(sonarr.seriesType, .standard)
        XCTAssertEqual(sonarr.animeTags, [3])
        XCTAssertEqual(sonarr.animeQualityProfileId, 7)
        let radarr = try XCTUnwrap(integrations.arrServers(of: .radarr).first)
        XCTAssertTrue(radarr.is4k)
        XCTAssertNil(radarr.seriesType)
        XCTAssertNil(radarr.seasonFolders)
        XCTAssertTrue(radarr.webhookUrl.hasPrefix("http://marquee.local:3000/api/webhooks/servers/"))

        let list = try decode(API.ListResponse<API.ArrServer>.self, "arr-servers").results
        XCTAssertEqual(list.map(\.kind), [.sonarr])

        let test = try decode(API.ArrServerTestResult.self, "arr-server-test")
        XCTAssertEqual(test.version, "5.26.2.10099")
        XCTAssertEqual(test.options.tags, [API.ArrTag(id: 2, label: "kids")])
        // `…/options` answers the same lists without ok/version.
        let options = try decode(API.ArrServerOptions.self, "arr-server-test")
        XCTAssertEqual(options.rootFolders.map(\.path), ["/movies", "/movies-kids"])

        let addOptions = try decode(API.AddOptions.self, "add-options")
        XCTAssertEqual(addOptions.mediaType, .tv)
        XCTAssertFalse(addOptions.isAnime)
        let server = try XCTUnwrap(addOptions.servers.first)
        XCTAssertEqual(server.defaults, API.AddDefaults(qualityProfileId: 4, rootFolderPath: "/tv", tags: [], seriesType: .standard))
        XCTAssertEqual(server.pickerLabel, "Sonarr")
    }

    func testHistoryAddedTo() throws {
        let history = try decode(API.ListResponse<API.ReviewedRequest>.self, "requests-history").results
        XCTAssertNil(history.first?.addedTo)
        XCTAssertNil(history.first?.addedToLine)
        let approved = try XCTUnwrap(history.first { $0.status == .approved })
        XCTAssertEqual(approved.addedTo?.serverName, "Radarr 2")
        XCTAssertEqual(approved.addedTo?.tags, [2])
        XCTAssertNil(approved.addedTo?.seriesType)
        XCTAssertEqual(approved.addedToLine, "Added to Radarr 2")

        // A removed server has no name, and an older server no `addedTo` at all.
        let removed = try APIClient.decoder.decode(API.AddedTo.self, from: Data(#"""
        {"serverId":"x","serverName":null,"qualityProfileId":6,"rootFolderPath":"/movies","tags":[],"seriesType":null}
        """#.utf8))
        XCTAssertNil(removed.serverName)
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: fixture("requests-history")) as? [String: Any])
        var rows = try XCTUnwrap(object["results"] as? [[String: Any]])
        for index in rows.indices { rows[index].removeValue(forKey: "addedTo") }
        object["results"] = rows
        let older = try APIClient.decoder.decode(
            API.ListResponse<API.ReviewedRequest>.self, from: JSONSerialization.data(withJSONObject: object)
        )
        XCTAssertTrue(older.results.allSatisfy { $0.addedTo == nil })
    }

    /// A server before 0.43 omits `arrServers`: the page keeps the four fixed cards.
    func testOlderIntegrationsFallBackToFixedCards() throws {
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: fixture("integrations")) as? [String: Any])
        object.removeValue(forKey: "arrServers")
        let older = try APIClient.decoder.decode(
            API.IntegrationsOverview.self, from: JSONSerialization.data(withJSONObject: object)
        )
        XCTAssertNil(older.arrServers)
        XCTAssertFalse(older.usesServerList)
        XCTAssertEqual(older.arrServers(of: .sonarr), [])
        XCTAssertEqual(older.arr(.sonarr)?.fullyConfigured, true)

        // An empty list is still the new page (no servers yet), not the old cards.
        object["arrServers"] = [Any]()
        let none = try APIClient.decoder.decode(
            API.IntegrationsOverview.self, from: JSONSerialization.data(withJSONObject: object)
        )
        XCTAssertTrue(none.usesServerList)
    }

    // MARK: Advanced picks

    func testSelectionStartsFromTheDefaultServersDefaults() {
        let selection = AddOptionsSelection(twoServers())
        XCTAssertEqual(selection.serverId, "main")
        XCTAssertEqual(selection.qualityProfileId, 4)
        XCTAssertEqual(selection.rootFolderPath, "/tv")
        XCTAssertEqual(selection.tags, [1])
        XCTAssertEqual(selection.seriesType, .standard)
        XCTAssertEqual(selection.overrides, API.AddOverrides(
            serverId: "main", qualityProfileId: 4, rootFolderPath: "/tv", tags: [1], seriesType: .standard
        ))
    }

    func testSwitchingServerResetsPicksToItsDefaults() {
        var selection = AddOptionsSelection(twoServers())
        selection.qualityProfileId = 7
        selection.setTag(1, on: false)
        selection.seriesType = .daily

        selection.selectServer("anime")
        XCTAssertEqual(selection.serverId, "anime")
        XCTAssertEqual(selection.qualityProfileId, 9)
        XCTAssertEqual(selection.rootFolderPath, "/anime")
        XCTAssertEqual(selection.tags, [])
        XCTAssertEqual(selection.seriesType, .anime)
        XCTAssertEqual(selection.server?.pickerLabel, "Sonarr Anime (not responding)")
        // Its lists are empty, but the saved picks still show.
        XCTAssertEqual(selection.qualityProfileChoices.map(\.id), [9])
        XCTAssertEqual(selection.rootFolderChoices, ["/anime"])

        selection.selectServer("main")
        XCTAssertEqual(selection.qualityProfileId, 4)
        XCTAssertEqual(selection.tags, [1])
        XCTAssertEqual(selection.qualityProfileChoices.map(\.id), [4, 7], "Nothing extra when the pick is listed")

        selection.selectServer("nope")
        XCTAssertEqual(selection.serverId, "main", "An unknown id changes nothing")
    }

    func testMoviesSendNoSeriesTypeAndNoServersMeansNoOverrides() {
        let movie = API.AddOptions(mediaType: .movie, tmdbId: 603, is4k: true, isAnime: false, servers: [
            API.AddOptionsServer(
                id: "r4k", name: "4K Radarr", isDefault: false, is4k: true, reachable: true,
                qualityProfiles: [], rootFolders: [], tags: [],
                defaults: API.AddDefaults(qualityProfileId: 5, rootFolderPath: "/movies-4k", tags: [], seriesType: nil)
            ),
        ])
        let selection = AddOptionsSelection(movie)
        XCTAssertEqual(selection.serverId, "r4k", "No default flagged: the first server")
        XCTAssertNil(selection.seriesType)
        XCTAssertNil(selection.overrides?.seriesType)

        let empty = AddOptionsSelection(API.AddOptions(mediaType: .movie, tmdbId: 603, is4k: false, isAnime: false, servers: []))
        XCTAssertNil(empty.serverId)
        XCTAssertNil(empty.overrides)
    }

    func testAnimeShowWithoutASeriesTypeDefaultsToAnime() {
        let options = API.AddOptions(mediaType: .tv, tmdbId: 1, is4k: false, isAnime: true, servers: [
            API.AddOptionsServer(
                id: "s", name: "Sonarr", isDefault: true, is4k: false, reachable: true,
                qualityProfiles: [], rootFolders: [], tags: [],
                defaults: API.AddDefaults(qualityProfileId: nil, rootFolderPath: nil, tags: [], seriesType: nil)
            ),
        ])
        XCTAssertEqual(AddOptionsSelection(options).seriesType, .anime)
    }

    func testNoBodyWhenAdvancedUntouched() {
        var advanced = AdvancedAddOptions()
        XCTAssertNil(advanced.overrides, "Never opened")
        XCTAssertFalse(advanced.isLoading)

        advanced.toggle()
        XCTAssertTrue(advanced.isLoading)
        XCTAssertNil(advanced.overrides, "Open but still loading")

        advanced.finishLoading(.success(twoServers()))
        XCTAssertFalse(advanced.isLoading)
        XCTAssertEqual(advanced.overrides?.serverId, "main", "Open and loaded: the picks are sent")

        advanced.selection?.selectServer("anime")
        XCTAssertEqual(advanced.overrides?.serverId, "anime")

        advanced.toggle()
        XCTAssertNil(advanced.overrides, "Closed again: back to the plain call")

        advanced.reset()
        XCTAssertEqual(advanced, AdvancedAddOptions())
    }

    func testAdvancedGoesAwayOnAnOlderServer() {
        var advanced = AdvancedAddOptions()
        advanced.toggle()
        advanced.finishLoading(.failure(APIError.notFound))
        XCTAssertFalse(advanced.isOffered)
        XCTAssertFalse(advanced.isExpanded)
        XCTAssertNil(advanced.overrides)
        advanced.reset()
        XCTAssertFalse(advanced.isOffered, "Stays hidden after an add")

        var failing = AdvancedAddOptions()
        failing.toggle()
        failing.finishLoading(.failure(APIError.upstream("Couldn't reach Sonarr.")))
        XCTAssertTrue(failing.isOffered)
        XCTAssertEqual(failing.phase, .failed("Couldn't reach Sonarr."))
        failing.toggle()
        failing.toggle()
        XCTAssertEqual(failing.phase, .idle, "Opening again tries again")
    }

    // MARK: Add / Edit server form

    private var savedSonarr: API.ArrServer {
        API.ArrServer(
            id: "s1", kind: .sonarr, name: "Sonarr", baseUrl: "http://10.0.0.2:8989/", isDefault: true,
            qualityProfileId: 4, rootFolderPath: "/tv", tags: [1, 5], seriesType: .daily, seasonFolders: false,
            animeQualityProfileId: 7, animeRootFolderPath: "/gone", animeTags: [3], fullyConfigured: true
        )
    }

    func testNewServerFormNeedsURLAndKey() throws {
        var form = ArrServerForm(kind: .radarr)
        XCTAssertEqual(form.problem, "URL and API key are required.")
        form.baseUrl = " http://10.0.0.2:7878/ "
        XCTAssertEqual(form.problem, "URL and API key are required.")
        form.apiKey = "k"
        XCTAssertNil(form.problem)
        XCTAssertEqual(form.testRequest, API.ArrServerTestRequest(kind: .radarr, baseUrl: "http://10.0.0.2:7878", apiKey: "k"))

        let body = form.saveRequest
        XCTAssertEqual(body.kind, .radarr)
        XCTAssertNil(body.name, "Blank: the server names it")
        XCTAssertEqual(body.baseUrl, "http://10.0.0.2:7878")
        XCTAssertNil(body.isDefault)
        form.isDefault = true
        XCTAssertEqual(form.saveRequest.isDefault, true, "Taking the default over")
        form.isDefault = false
        XCTAssertNil(body.sonarr, "Radarr sends no Sonarr settings")
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: APIClient.encoder.encode(body)) as? [String: Any])
        XCTAssertEqual(Set(json.keys), ["kind", "baseUrl", "apiKey", "is4k", "tags"])
    }

    func testEditingKeepsTheSavedKeyUnlessTheURLChanges() {
        var form = ArrServerForm(editing: savedSonarr)
        XCTAssertNil(form.problem)
        XCTAssertFalse(form.urlChanged, "Trailing slash doesn't count")
        XCTAssertFalse(form.canChangeDefault)
        XCTAssertEqual(form.testRequest, API.ArrServerTestRequest(kind: .sonarr, baseUrl: "http://10.0.0.2:8989", serverId: "s1"))
        XCTAssertNil(form.saveRequest.kind)
        XCTAssertNil(form.saveRequest.baseUrl, "Unchanged URL isn't sent")
        XCTAssertNil(form.saveRequest.apiKey)
        XCTAssertNil(form.saveRequest.isDefault, "Already the default: nothing to send")

        form.baseUrl = "http://10.0.0.3:8989"
        XCTAssertEqual(form.problem, "Enter the API key again to change the URL.")
        form.apiKey = "new"
        XCTAssertNil(form.problem)
        XCTAssertEqual(form.testRequest, API.ArrServerTestRequest(kind: .sonarr, baseUrl: "http://10.0.0.3:8989", apiKey: "new"))
        XCTAssertEqual(form.saveRequest.baseUrl, "http://10.0.0.3:8989")
        XCTAssertEqual(form.saveRequest.sonarr, API.ArrServerRequest.SonarrSettings(
            seriesType: .daily, seasonFolders: false, animeQualityProfileId: 7, animeRootFolderPath: "/gone", animeTags: [3]
        ))
    }

    func testLoadedOptionsDropPicksTheServerNoLongerHas() {
        var form = ArrServerForm(editing: savedSonarr)
        form.apply(API.ArrServerOptions(
            qualityProfiles: [API.QualityProfile(id: 7, name: "Anime"), API.QualityProfile(id: 8, name: "4K")],
            rootFolders: [API.RootFolder(id: 1, path: "/tv"), API.RootFolder(id: 2, path: "/anime")],
            tags: [API.ArrTag(id: 1, label: "kids"), API.ArrTag(id: 3, label: "anime")]
        ))
        XCTAssertEqual(form.qualityProfileId, 7, "Profile 4 is gone: the first one")
        XCTAssertEqual(form.rootFolderPath, "/tv", "Still listed: kept")
        XCTAssertEqual(form.tags, [1])
        XCTAssertEqual(form.animeQualityProfileId, 7)
        XCTAssertNil(form.animeRootFolderPath, "Gone: back to Same as above")
        XCTAssertEqual(form.animeTags, [3])

        var fresh = ArrServerForm(kind: .sonarr)
        fresh.apply(API.ArrServerOptions(qualityProfiles: [], rootFolders: []))
        XCTAssertNil(fresh.qualityProfileId)
        XCTAssertNil(fresh.rootFolderPath)
    }
}
