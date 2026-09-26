import Testing
import Foundation
@testable import Marquee

/// Where each Discover shelf's "See all" chevron goes (`GET /discover`'s
/// `seeAll`), including against a server older than 0.42.3 that omits it.
struct DiscoverSeeAllTests {
    private func fixture(_ name: String) throws -> Data {
        let url = Bundle(for: FixtureAnchor.self).resourceURL!.appendingPathComponent("Fixtures/api/\(name).json")
        return try Data(contentsOf: url)
    }

    @Test func everyShelfHasOneOnACurrentServer() throws {
        let shelves = try APIClient.decoder.decode(API.DiscoverShelves.self, from: fixture("discover"))
        let expected: [API.DiscoverShelf: API.SeeAllDestination] = [
            .recentlyAdded: .list(.recentlyAdded),
            .trending: .list(.trending),
            .popularMovies: .browse(.movie),
            .movieGenres: .browse(.movie),
            .upcomingMovies: .list(.upcomingMovies),
            .studios: .browse(.movie),
            .popularSeries: .browse(.tv),
            .seriesGenres: .browse(.tv),
            .upcomingSeries: .list(.upcomingSeries),
            .networks: .browse(.tv),
        ]
        for shelf in API.DiscoverShelf.allCases {
            #expect(shelves.seeAllDestination(shelf) == expected[shelf], "\(shelf)")
        }
    }

    @Test func anOlderServerKeepsTheGridLinksOnly() throws {
        var json = try JSONSerialization.jsonObject(with: fixture("discover")) as! [String: Any]
        json.removeValue(forKey: "seeAll")
        let shelves = try APIClient.decoder.decode(API.DiscoverShelves.self, from: JSONSerialization.data(withJSONObject: json))
        #expect(shelves.seeAll == nil)

        let withSeeAll = API.DiscoverShelf.allCases.filter { shelves.seeAllDestination($0) != nil }
        #expect(withSeeAll == [.popularMovies, .movieGenres, .popularSeries, .seriesGenres])
        #expect(shelves.seeAllDestination(.popularMovies) == .browse(.movie))
        #expect(shelves.seeAllDestination(.seriesGenres) == .browse(.tv))
        #expect(shelves.seeAllDestination(.trending) == nil)
    }

    @Test func unknownValuesMeanNoSeeAll() throws {
        let json = #"""
        {
          "recentlyAdded": { "type": "list", "list": "recently-watched", "mediaType": null },
          "trending": { "type": "carousel", "list": "trending", "mediaType": null },
          "popularMovies": { "type": "browse", "list": null, "mediaType": "music" },
          "movieGenres": { "type": "browse", "list": null, "mediaType": null },
          "upcomingMovies": null,
          "popularSeries": { "type": "browse", "list": null, "mediaType": "tv" }
        }
        """#
        let seeAll = try APIClient.decoder.decode(API.DiscoverSeeAll.self, from: Data(json.utf8))
        for shelf in API.DiscoverShelf.allCases where shelf != .popularSeries {
            #expect(API.SeeAllDestination.resolve(shelf, in: seeAll) == nil, "\(shelf)")
        }
        #expect(API.SeeAllDestination.resolve(.popularSeries, in: seeAll) == .browse(.tv))
    }

    @Test func listPagesDecode() throws {
        let page = try APIClient.decoder.decode(API.DiscoverListPage.self, from: fixture("discover-list"))
        #expect(page.list == .trending)
        #expect(page.title == "Trending")
        #expect(page.hasMorePages)
        #expect(page.results.first?.id == API.TitleID(.tv, 299939))
        #expect(API.DiscoverList.trending.mixesMediaTypes)
        #expect(API.DiscoverList.recentlyAdded.mixesMediaTypes)
        #expect(!API.DiscoverList.upcomingSeries.mixesMediaTypes)
    }
}

private final class FixtureAnchor {}
