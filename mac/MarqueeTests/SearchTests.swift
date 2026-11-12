import XCTest
@testable import Marquee

/// Search in sections (0.55+): the page's order — Movies, TV Shows, People,
/// Studios & Networks — from a new server and an older one, the theme's
/// place, the type-ahead's groups and ↑↓ order, decoding kinds this
/// build doesn't know, and recent searches.
final class SearchTests: XCTestCase {
    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try APIClient.decoder.decode(type, from: Data(json.utf8))
    }

    private static func card(_ id: Int, _ type: String) -> String {
        #"{"mediaType":"\#(type)","tmdbId":\#(id),"name":"T\#(id)","posterPath":null,"year":"2021","subtitle":null,"overview":null,"rating":null,"status":null,"favorited":false,"requested":false,"canQuickAdd":false,"canRequest":false}"#
    }

    private static let person = #"{"tmdbId":31,"name":"Tom Hanks","profilePath":"/t.jpg","knownForDepartment":"Acting","favorited":false,"knownFor":["Forrest Gump","Cast Away"]}"#

    private static func newServer(themePlacement: String) -> String {
        """
        {
          "query": "dune",
          "people": [\(person)],
          "studios": [],
          "titles": [\(card(1, "movie")), \(card(2, "tv"))],
          "theme": { "label": "Horror", "items": [\(card(3, "movie"))], "placement": "\(themePlacement)" },
          "sections": {
            "movies": { "totalResults": 40, "totalPages": 2, "results": [\(card(1, "movie"))] },
            "series": { "totalResults": 1, "totalPages": 1, "results": [\(card(2, "tv"))] },
            "people": { "totalResults": 1, "totalPages": 1, "results": [\(person)] },
            "studiosAndNetworks": { "totalResults": 2, "totalPages": 1, "results": [
              { "kind": "network", "tmdbId": 49, "name": "HBO", "logoPath": "/h.png", "favorited": null },
              { "kind": "studio", "tmdbId": 3268, "name": "HBO", "logoPath": null, "favorited": false }
            ] }
          }
        }
        """
    }

    func testSectionsComeInThePagesOrder() throws {
        let results = try decode(API.SearchResults.self, Self.newServer(themePlacement: "last"))
        let layout = SearchPageLayout(results)
        XCTAssertEqual(layout.blocks.map(\.id), ["movies", "series", "people", "studios", "theme"])
        XCTAssertEqual(layout.blocks.map(\.seeAll), [.movies, nil, nil, nil, nil], "See all only where there's more")
        guard case let .studios(studios) = layout.blocks[3] else { return XCTFail("Studios & Networks fourth") }
        XCTAssertEqual(studios.results.map(\.isNetwork), [true, false])
        XCTAssertEqual(studios.results.map(\.id), ["network-49", "studio-3268"], "Same TMDb id space, distinct rows")
        guard case let .people(people) = layout.blocks[2] else { return XCTFail("People third") }
        XCTAssertEqual(people.results.first?.knownForLine, "Acting · Forrest Gump, Cast Away")
    }

    func testAThemeTheQueryNamesLeads() throws {
        let results = try decode(API.SearchResults.self, Self.newServer(themePlacement: "first"))
        XCTAssertEqual(SearchPageLayout(results).blocks.map(\.id), ["theme", "movies", "series", "people", "studios"])
    }

    func testAnOlderServerStillGetsTheNewOrder() throws {
        // Before 0.55: no sections, no placement, people/studios/titles only.
        let older = """
        {
          "query": "keanu",
          "people": [{ "tmdbId": 6384, "name": "Keanu Reeves", "profilePath": null, "knownForDepartment": "Acting", "favorited": false }],
          "studios": [{ "tmdbId": 420, "name": "Marvel Studios", "logoPath": null, "favorited": false }],
          "titles": [\(Self.card(2, "tv")), \(Self.card(1, "movie"))],
          "theme": { "label": "Science Fiction", "items": [\(Self.card(3, "movie"))] }
        }
        """
        let results = try decode(API.SearchResults.self, older)
        XCTAssertNil(results.sections)
        XCTAssertNil(results.people.first?.knownFor)
        let layout = SearchPageLayout(results)
        XCTAssertEqual(layout.blocks.map(\.id), ["movies", "series", "people", "studios", "theme"])
        XCTAssertTrue(layout.blocks.allSatisfy { $0.seeAll == nil }, "An older server has no See all")
        guard case let .studios(studios) = layout.blocks[3] else { return XCTFail("Studios fourth") }
        XCTAssertEqual(studios.results.first?.isNetwork, false)
    }

    func testEmptySectionsAreLeftOut() throws {
        let empty = #"{"query":"zzz","people":[],"studios":[],"titles":[],"theme":null,"sections":{"movies":{"totalResults":0,"totalPages":0,"results":[]},"series":{"totalResults":0,"totalPages":0,"results":[]},"people":{"totalResults":0,"totalPages":0,"results":[]},"studiosAndNetworks":{"totalResults":0,"totalPages":1,"results":[]}}}"#
        let results = try decode(API.SearchResults.self, empty)
        XCTAssertTrue(results.isEmpty)
        XCTAssertTrue(SearchPageLayout(results).isEmpty)
    }

    // MARK: Type-ahead

    private func suggestion(_ id: Int, _ kind: String) throws -> API.SearchSuggestion {
        try decode(API.SearchSuggestion.self, #"{"id":\#(id),"mediaType":"\#(kind)","name":"N\#(id)","posterPath":null,"subtitle":null}"#)
    }

    func testSuggestionsGroupInThePagesOrder() throws {
        let list = try [
            suggestion(1, "movie"), suggestion(2, "movie"), suggestion(3, "tv"),
            suggestion(4, "person"), suggestion(5, "network"), suggestion(6, "company"),
        ]
        let groups = SearchPanel.groups(list)
        XCTAssertEqual(groups.map(\.group), [.movies, .series, .people, .studios])
        XCTAssertEqual(groups.map { $0.items.map(\.index) }, [[0, 1], [2], [3], [4, 5]])
        XCTAssertEqual(groups.map(\.group.label), ["Movies", "TV Shows", "People", "Studios & Networks"])
        XCTAssertEqual(SearchPanel.navigationOrder(list), [0, 1, 2, 3, 4, 5])
    }

    func testGroupsKeepTheServersOrderAndGatherStrays() throws {
        // People first ("tom hanks"); an older server's mixed order gathers
        // each kind into its group where that group first appears.
        let list = try [suggestion(1, "person"), suggestion(2, "movie"), suggestion(3, "tv"), suggestion(4, "movie")]
        XCTAssertEqual(SearchPanel.groups(list).map(\.group), [.people, .movies, .series])
        XCTAssertEqual(SearchPanel.navigationOrder(list), [0, 1, 3, 2], "↑↓ follow what's on screen")
    }

    func testTheServersOrderPutsPeopleFirst() throws {
        var results = try decode(API.SearchResults.self, Self.newServer(themePlacement: "last"))
        results.order = ["people", "movies", "series", "studiosAndNetworks", "theme", "collections"]
        XCTAssertEqual(SearchPageLayout(results).blocks.map(\.id), ["people", "movies", "series", "studios", "theme"])
    }

    func testUnknownSuggestionKindsDecodeAndAreSkipped() throws {
        let list = try [suggestion(1, "collection"), suggestion(2, "company")]
        XCTAssertEqual(list[0].mediaType, .unknown("collection"))
        XCTAssertNil(list[0].mediaType.group)
        XCTAssertEqual(list[1].mediaType.label, "Studio")
        XCTAssertNil(list[1].titleID)
        XCTAssertEqual(SearchPanel.groups(list).map(\.group), [.studios])
    }

    // MARK: See all

    func testSeeAllSkipsRepeatsAcrossPages() throws {
        var items = SearchSectionItems()
        let first = try [Self.card(1, "movie"), Self.card(2, "movie")].map { try decode(API.TitleCard.self, $0) }
        let second = try [Self.card(2, "movie"), Self.card(3, "movie")].map { try decode(API.TitleCard.self, $0) }
        XCTAssertEqual(items.append(titles: first), 2)
        XCTAssertEqual(items.append(titles: second), 1)
        XCTAssertEqual(items.titles.map(\.tmdbId), [1, 2, 3])
        XCTAssertFalse(items.isEmpty)
    }

    func testSeeAllDecodesEachSection() throws {
        let people = try decode(Paginated<API.PersonCard>.self, #"{"page":1,"totalPages":2,"totalResults":30,"results":[\#(Self.person)]}"#)
        XCTAssertTrue(people.hasMorePages)
        let studios = try decode(
            Paginated<API.SearchCompanyCard>.self,
            #"{"page":1,"totalPages":1,"totalResults":1,"results":[{"kind":"network","tmdbId":49,"name":"HBO","logoPath":null,"favorited":null}]}"#
        )
        XCTAssertEqual(studios.results.first?.isNetwork, true)
        XCTAssertEqual(API.SearchSectionName.allCases.map(\.rawValue), ["movies", "series", "people", "studios"])
    }

    // MARK: Recent searches

    func testARecentSearchGoesToTheFront() {
        XCTAssertEqual(RecentSearches.adding("dune", to: []), ["dune"])
        XCTAssertEqual(RecentSearches.adding("  alien ", to: ["dune"]), ["alien", "dune"], "Trimmed, newest first")
        XCTAssertEqual(RecentSearches.adding("   ", to: ["dune"]), ["dune"], "Blank is ignored")
    }

    func testTheSameSearchTypedDifferentlyMovesUp() {
        let list = ["alien", "Wall-E", "dune"]
        XCTAssertEqual(RecentSearches.adding("wall·e", to: list), ["wall·e", "alien", "dune"])
        XCTAssertEqual(RecentSearches.adding("DUNE", to: list), ["DUNE", "alien", "Wall-E"])
        XCTAssertEqual(RecentSearches.adding("Amélie", to: ["amelie"]), ["Amélie"], "Accents don't count")
        XCTAssertEqual(RecentSearches.adding("Fast & Furious", to: ["fast and furious"]), ["Fast & Furious"])
        XCTAssertEqual(RecentSearches.adding("!!", to: ["!!", "?"]), ["!!", "?"], "Punctuation alone still compares")
    }

    func testRecentSearchesKeepTheLastEight() {
        let full = (1...8).map { "search \($0)" }
        let next = RecentSearches.adding("new", to: full)
        XCTAssertEqual(next.count, RecentSearches.limit)
        XCTAssertEqual(next.first, "new")
        XCTAssertFalse(next.contains("search 8"), "The oldest drops off")
    }

    func testRecentSearchesAreRememberedPerAccount() throws {
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "marquee.tests.recentSearches.\(UUID().uuidString)"))
        let timmy = "http://192.168.1.20:3000|6f1c2a4e-8b1d-4c3e-9f0a-2b7d5e8c1a90"
        let kid = "http://192.168.1.20:3000|0a1b2c3d-0000-4000-8000-000000000001"
        XCTAssertEqual(RecentSearches.load(account: timmy, defaults: defaults), [])
        RecentSearches.remember("dune", account: timmy, defaults: defaults)
        XCTAssertEqual(RecentSearches.remember("Alien", account: timmy, defaults: defaults), ["Alien", "dune"])
        XCTAssertEqual(RecentSearches.load(account: timmy, defaults: defaults), ["Alien", "dune"])
        XCTAssertEqual(RecentSearches.load(account: kid, defaults: defaults), [], "Another account never sees them")
        XCTAssertEqual(RecentSearches.load(account: nil, defaults: defaults), [], "Nor does a signed-out app")
        RecentSearches.remember("bluey", account: kid, defaults: defaults)

        RecentSearches.save(RecentSearches.removing("dune", from: ["Alien", "dune"]), account: timmy, defaults: defaults)
        XCTAssertEqual(RecentSearches.load(account: timmy, defaults: defaults), ["Alien"])
        RecentSearches.save([], account: timmy, defaults: defaults)
        XCTAssertNil(defaults.object(forKey: RecentSearches.key(account: timmy)), "Clear leaves nothing behind")

        RecentSearches.clear(account: kid, defaults: defaults)
        XCTAssertEqual(RecentSearches.load(account: kid, defaults: defaults), [], "Signing out wipes them")
    }

    func testTheOldPerDeviceListIsDropped() throws {
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "marquee.tests.recentSearches.\(UUID().uuidString)"))
        defaults.set(["someone else's"], forKey: RecentSearches.storageKey)
        XCTAssertEqual(RecentSearches.load(account: "http://tower:3000|me", defaults: defaults), [])
        XCTAssertNil(defaults.object(forKey: RecentSearches.storageKey))
    }
}
