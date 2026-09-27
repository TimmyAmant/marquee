import XCTest
@testable import Marquee

/// Search in sections (0.54+): the page's order — Movies, TV Shows, People,
/// Studios & Networks — from a new server and an older one, the theme's
/// place, the type-ahead's groups and ↑↓ order, and decoding kinds this
/// build doesn't know.
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
        // Before 0.54: no sections, no placement, people/studios/titles only.
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

    func testAnOlderServersMixedSuggestionsAreRegrouped() throws {
        // Before 0.54 the server sent TMDb's mixed order.
        let list = try [suggestion(1, "person"), suggestion(2, "movie"), suggestion(3, "tv"), suggestion(4, "movie")]
        XCTAssertEqual(SearchPanel.groups(list).map(\.group), [.movies, .series, .people])
        XCTAssertEqual(SearchPanel.navigationOrder(list), [1, 3, 2, 0], "↑↓ follow what's on screen")
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
}
