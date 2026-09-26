using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// The doc's example responses for Discover / Browse / Search and the shared
// card shapes, decoded with their DTOs (the Mac's APIFixtureTests for this
// area), plus the helpers the cards compute.

public sealed class DiscoverFixtureTests
{
    [Fact]
    public void EveryDiscoverExampleDecodes()
    {
        Fixtures.Decode<TitleCard>("title-card");
        Fixtures.Decode<PersonCard>("person-card");
        Fixtures.Decode<CompanyCard>("company-card");
        Fixtures.Decode<NetworkCard>("network-card");
        Fixtures.Decode<DiscoverShelves>("discover");
        Fixtures.Decode<DiscoverListResults>("discover-list");
        Fixtures.Decode<Paginated<TitleCard>>("browse-page");
        Fixtures.Decode<BrowseExtras>("browse-extras");
        Fixtures.Decode<TitleId>("surprise");
        Fixtures.Decode<SearchResults>("search");
        Fixtures.Decode<ListResponse<SearchSuggestion>>("search-suggest");
    }

    [Fact]
    public void TitleCardValues()
    {
        var card = Fixtures.Decode<TitleCard>("title-card");
        Assert.Equal(new TitleId(MediaType.Movie, 603), card.Id);
        Assert.Equal("The Matrix", card.Name);
        Assert.Equal("https://image.tmdb.org/t/p/w342/aOIuZAjPaRIE6CMzbazvcHuHXDc.jpg", card.PosterPath.Url(ImageSize.W342)?.AbsoluteUri);
        Assert.Equal("1999", card.Year);
        Assert.Null(card.Subtitle);
        Assert.Null(card.Overview);
        Assert.Null(card.Rating);
        Assert.Null(card.Status);
        Assert.False(card.Favorited);
        Assert.Null(card.Requested);
        Assert.False(card.CanQuickAdd);
        Assert.False(card.CanRequest);
        Assert.Equal("1999", card.FooterLine);

        // Redrawing a card after this PC changed it, the way the Mac's
        // TitleStateStore does.
        var added = card with { Status = LibraryStatus.TrackedMonitored, CanQuickAdd = false, Requested = true };
        Assert.Equal(LibraryStatus.TrackedMonitored, added.Status);
        Assert.True(added.Requested);
        Assert.Equal(card.Id, added.Id);

        Assert.Equal("Neo · 1999", (card with { Subtitle = "Neo" }).FooterLine);
        Assert.Equal("Neo", (card with { Subtitle = "Neo", Year = null }).FooterLine);
        Assert.Equal("", (card with { Subtitle = " ", Year = "" }).FooterLine);
    }

    [Fact]
    public void OtherCards()
    {
        var person = Fixtures.Decode<PersonCard>("person-card");
        Assert.Equal(6384, person.Id);
        Assert.Equal("Keanu Reeves", person.Name);
        Assert.Equal("Acting", person.KnownForDepartment);
        Assert.False(person.Favorited);
        Assert.Equal("https://image.tmdb.org/t/p/w185/8RZL.jpg", person.ProfilePath.Url(ImageSize.W185)?.AbsoluteUri);

        var company = Fixtures.Decode<CompanyCard>("company-card");
        Assert.Equal(420, company.Id);
        Assert.Equal("Marvel Studios", company.Name);
        Assert.False(company.Favorited);
        Assert.NotNull(company.LogoPath);

        var network = Fixtures.Decode<NetworkCard>("network-card");
        Assert.Equal(213, network.Id);
        Assert.Equal("Netflix", network.Name);
        Assert.Equal(new ImageRef("/wwem.png"), network.LogoPath);
    }

    [Fact]
    public void CardsAndSuggestions()
    {
        var suggestions = Fixtures.Decode<ListResponse<SearchSuggestion>>("search-suggest").Results;
        Assert.Equal(["movie-603", "person-6384", "movie-604", "movie-624860"], suggestions.Select(suggestion => suggestion.StableId));
        Assert.Equal(["Movie", "Actor", "Movie", "Movie"], suggestions.Select(suggestion => suggestion.MediaType.Label));
        Assert.Equal(new TitleId(MediaType.Movie, 603), suggestions[0].TitleId);
        Assert.Null(suggestions[1].TitleId);
        Assert.Equal("1999", suggestions[0].Subtitle);
        Assert.Equal("Acting", suggestions[1].Subtitle);
        Assert.Equal(
            [LibraryStatus.Owned, null, LibraryStatus.TrackedDownloading, LibraryStatus.Untracked],
            suggestions.Select(suggestion => suggestion.Status));
        Assert.Equal("Movie · In your library", suggestions[0].KindAccessibleLabel);
        Assert.Equal("Actor", suggestions[1].KindAccessibleLabel);
        Assert.Equal("Movie · Downloading", suggestions[2].KindAccessibleLabel);

        // A server from before suggestion statuses sends no status: neutral.
        var older = Json.Decode<SearchSuggestion>("""{"id":603,"mediaType":"movie","name":"The Matrix","posterPath":null,"subtitle":"1999"}""");
        Assert.Null(older.Status);
        Assert.Null(older.StatusLabel);
        Assert.Equal("Movie", older.KindAccessibleLabel);

        var series = Json.Decode<SearchSuggestion>("""{"id":1399,"mediaType":"tv","name":"Game of Thrones","posterPath":null,"subtitle":"2011","status":"tracked_monitored"}""");
        Assert.Equal(LibraryStatus.TrackedMonitored, series.Status);
        Assert.Equal("TV · Missing", series.KindAccessibleLabel);

        // A status this app doesn't know still decodes and reads as neutral.
        var future = Json.Decode<SearchSuggestion>("""{"id":1,"mediaType":"movie","name":"X","posterPath":null,"subtitle":null,"status":"archived"}""");
        Assert.Equal(LibraryStatus.FromValue("archived"), future.Status);
        Assert.Null(future.StatusLabel);
        Assert.Equal("Movie", future.KindAccessibleLabel);

        var page = Fixtures.Decode<Paginated<TitleCard>>("browse-page");
        Assert.True(page.HasMorePages);
        Assert.Equal(2, page.Page);
        Assert.Equal(23, page.TotalPages);
        Assert.Equal(4584, page.TotalResults);
        var first = Assert.Single(page.Results);
        Assert.Equal(7.832, first.Rating);
        Assert.Equal("Thriller · 1964", first.FooterLine);
        Assert.StartsWith("Because of a technical defect", first.Overview);
    }

    [Fact]
    public void DiscoverShelvesValues()
    {
        var shelves = Fixtures.Decode<DiscoverShelves>("discover");
        Assert.Equal(603, Assert.Single(shelves.RecentlyAdded).TmdbId);
        var trending = Assert.Single(shelves.Trending);
        Assert.Equal(new TitleId(MediaType.Tv, 299939), trending.Id);
        Assert.Null(trending.Favorited);
        var genre = Assert.Single(shelves.MovieGenres);
        Assert.Equal(28, genre.Id);
        Assert.Equal("Action", genre.Name);
        Assert.Equal(new ImageRef("/qeQJ.jpg"), genre.BackdropPath);
        var studio = Assert.Single(shelves.Studios);
        Assert.Equal("Walt Disney Pictures", studio.Name);
        Assert.Null(studio.Favorited);
        Assert.Equal(10759, Assert.Single(shelves.SeriesGenres).Id);
        Assert.Equal("Netflix", Assert.Single(shelves.Networks).Name);
        Assert.Single(shelves.PopularMovies);
        Assert.Single(shelves.UpcomingMovies);
        Assert.Single(shelves.PopularSeries);
        Assert.Single(shelves.UpcomingSeries);
    }

    [Fact]
    public void DiscoverSeeAllMap()
    {
        var shelves = Fixtures.Decode<DiscoverShelves>("discover");
        Assert.NotNull(shelves.SeeAll);
        Assert.Equal(10, shelves.SeeAll.Count);
        var trending = shelves.SeeAll[DiscoverShelfKey.Trending];
        Assert.NotNull(trending);
        Assert.Equal(SeeAllKind.List, trending.Type);
        Assert.Equal(DiscoverListKind.Trending, trending.List);
        Assert.Null(trending.MediaType);
        var studios = shelves.SeeAll[DiscoverShelfKey.Studios];
        Assert.NotNull(studios);
        Assert.Equal(SeeAllKind.Browse, studios.Type);
        Assert.Null(studios.List);
        Assert.Equal(MediaType.Movie, studios.MediaType);

        // Every shelf has one: the four lists, the rest to a grid.
        Assert.Equal(new SeeAllTarget.DiscoverList(DiscoverListKind.RecentlyAdded), DiscoverSeeAll.Resolve(shelves, DiscoverShelfKey.RecentlyAdded));
        Assert.Equal(new SeeAllTarget.DiscoverList(DiscoverListKind.Trending), DiscoverSeeAll.Resolve(shelves, DiscoverShelfKey.Trending));
        Assert.Equal(new SeeAllTarget.BrowseGrid(MediaType.Movie), DiscoverSeeAll.Resolve(shelves, DiscoverShelfKey.PopularMovies));
        Assert.Equal(new SeeAllTarget.BrowseGrid(MediaType.Movie), DiscoverSeeAll.Resolve(shelves, DiscoverShelfKey.MovieGenres));
        Assert.Equal(new SeeAllTarget.DiscoverList(DiscoverListKind.UpcomingMovies), DiscoverSeeAll.Resolve(shelves, DiscoverShelfKey.UpcomingMovies));
        Assert.Equal(new SeeAllTarget.BrowseGrid(MediaType.Movie), DiscoverSeeAll.Resolve(shelves, DiscoverShelfKey.Studios));
        Assert.Equal(new SeeAllTarget.BrowseGrid(MediaType.Tv), DiscoverSeeAll.Resolve(shelves, DiscoverShelfKey.PopularSeries));
        Assert.Equal(new SeeAllTarget.BrowseGrid(MediaType.Tv), DiscoverSeeAll.Resolve(shelves, DiscoverShelfKey.SeriesGenres));
        Assert.Equal(new SeeAllTarget.DiscoverList(DiscoverListKind.UpcomingSeries), DiscoverSeeAll.Resolve(shelves, DiscoverShelfKey.UpcomingSeries));
        Assert.Equal(new SeeAllTarget.BrowseGrid(MediaType.Tv), DiscoverSeeAll.Resolve(shelves, DiscoverShelfKey.Networks));
    }

    [Fact]
    public void DiscoverSeeAllFallsBackForAnOlderServer()
    {
        // An older server has no seeAll: only Popular Movies/Series and the
        // genre shelves link to the grids, as before.
        var shelves = Fixtures.Decode<DiscoverShelves>("discover") with { SeeAll = null };
        Assert.Equal(new SeeAllTarget.BrowseGrid(MediaType.Movie), DiscoverSeeAll.Resolve(shelves, DiscoverShelfKey.PopularMovies));
        Assert.Equal(new SeeAllTarget.BrowseGrid(MediaType.Movie), DiscoverSeeAll.Resolve(shelves, DiscoverShelfKey.MovieGenres));
        Assert.Equal(new SeeAllTarget.BrowseGrid(MediaType.Tv), DiscoverSeeAll.Resolve(shelves, DiscoverShelfKey.PopularSeries));
        Assert.Equal(new SeeAllTarget.BrowseGrid(MediaType.Tv), DiscoverSeeAll.Resolve(shelves, DiscoverShelfKey.SeriesGenres));
        foreach (var key in new[]
        {
            DiscoverShelfKey.RecentlyAdded, DiscoverShelfKey.Trending, DiscoverShelfKey.UpcomingMovies,
            DiscoverShelfKey.Studios, DiscoverShelfKey.UpcomingSeries, DiscoverShelfKey.Networks,
        })
        {
            Assert.Null(DiscoverSeeAll.Resolve(shelves, key));
        }

        // The same body without the key decodes to the same thing.
        var json = System.Text.Json.Nodes.JsonNode.Parse(Fixtures.Read("discover"))!.AsObject();
        json.Remove("seeAll");
        Assert.Null(Json.Decode<DiscoverShelves>(json.ToJsonString()).SeeAll);
    }

    [Fact]
    public void DiscoverSeeAllIgnoresWhatItDoesNotKnow()
    {
        var shelves = Json.Decode<DiscoverShelves>("""
            {
              "recentlyAdded": [], "trending": [], "popularMovies": [], "movieGenres": [], "upcomingMovies": [],
              "studios": [], "popularSeries": [], "seriesGenres": [], "upcomingSeries": [], "networks": [],
              "seeAll": {
                "trending": { "type": "list", "list": "most-watched", "mediaType": null },
                "recentlyAdded": { "type": "list", "list": null, "mediaType": null },
                "popularMovies": { "type": "browse", "list": null, "mediaType": "music" },
                "popularSeries": { "type": "browse", "list": null, "mediaType": null },
                "movieGenres": { "type": "search", "list": "trending", "mediaType": "movie" },
                "seriesGenres": null,
                "upcomingMovies": { "type": "list", "list": "upcoming-movies", "mediaType": null }
              }
            }
            """);

        Assert.Null(DiscoverSeeAll.Resolve(shelves, DiscoverShelfKey.Trending));
        Assert.Null(DiscoverSeeAll.Resolve(shelves, DiscoverShelfKey.RecentlyAdded));
        Assert.Null(DiscoverSeeAll.Resolve(shelves, DiscoverShelfKey.PopularMovies));
        Assert.Null(DiscoverSeeAll.Resolve(shelves, DiscoverShelfKey.PopularSeries));
        Assert.Null(DiscoverSeeAll.Resolve(shelves, DiscoverShelfKey.MovieGenres));
        Assert.Null(DiscoverSeeAll.Resolve(shelves, DiscoverShelfKey.SeriesGenres));
        // With a map, a shelf it leaves out has none (no fallback).
        Assert.Null(DiscoverSeeAll.Resolve(shelves, DiscoverShelfKey.Networks));
        Assert.Equal(new SeeAllTarget.DiscoverList(DiscoverListKind.UpcomingMovies), DiscoverSeeAll.Resolve(shelves, DiscoverShelfKey.UpcomingMovies));
    }

    [Fact]
    public void DiscoverListPageValues()
    {
        var page = Fixtures.Decode<DiscoverListResults>("discover-list");
        Assert.Equal(DiscoverListKind.Trending, page.List);
        Assert.Equal("Trending", page.Title);
        Assert.Equal(1, page.Page);
        Assert.Equal(250, page.TotalPages);
        Assert.Equal(1000, page.TotalResults);
        Assert.True(page.HasMorePages);
        var card = Assert.Single(page.Results);
        Assert.Equal(new TitleId(MediaType.Tv, 299939), card.Id);
        Assert.False(card.Favorited);
        Assert.True(card.CanQuickAdd);
        Assert.False((page with { Page = 250 }).HasMorePages);

        Assert.Equal(["trending", "recently-added", "upcoming-movies", "upcoming-series"], DiscoverListKind.Known.Select(kind => kind.Value));
        Assert.Equal(["Trending", "Recently Added", "Upcoming Movies", "Upcoming Series"], DiscoverListKind.Known.Select(kind => kind.Title));
        Assert.Equal([true, true, false, false], DiscoverListKind.Known.Select(kind => kind.MixesMediaTypes));
        Assert.False(DiscoverListKind.FromValue("most-watched").IsKnown);
        Assert.Equal("Most Watched", DiscoverListKind.FromValue("most-watched").Title);
    }

    [Fact]
    public void DiscoverShelfTiles()
    {
        var shelves = Fixtures.Decode<DiscoverShelves>("discover");

        var studio = Assert.Single(shelves.Studios).Tile();
        Assert.Equal(ShelfTileKind.Logo, studio.Kind);
        Assert.Equal(2, studio.Id);
        Assert.Equal("Walt Disney Pictures", studio.Name);
        Assert.Equal("https://image.tmdb.org/t/p/w500/wdrC.png", studio.ImageUrl?.AbsoluteUri);
        Assert.Null(studio.Tint);

        var network = Assert.Single(shelves.Networks).Tile();
        Assert.Equal(ShelfTileKind.Logo, network.Kind);
        Assert.Equal(213, network.Id);
        Assert.Equal("Netflix", network.Name);
        Assert.Equal("https://image.tmdb.org/t/p/w500/wwem.png", network.ImageUrl?.AbsoluteUri);
        Assert.Null(network.Tint);

        var genre = Assert.Single(shelves.MovieGenres.Tiles());
        Assert.Equal(ShelfTileKind.Genre, genre.Kind);
        Assert.Equal(28, genre.Id);
        Assert.Equal("Action", genre.Name);
        Assert.Equal("https://image.tmdb.org/t/p/w780/qeQJ.jpg", genre.ImageUrl?.AbsoluteUri);
        Assert.Equal(0x991B1Bu, genre.Tint);

        var series = Assert.Single(shelves.SeriesGenres.Tiles());
        Assert.Equal("Action & Adventure", series.Name);
        Assert.NotNull(series.ImageUrl);
        Assert.StartsWith("https://image.tmdb.org/t/p/w780/", series.ImageUrl.AbsoluteUri);
        Assert.Equal(0x991B1Bu, series.Tint);

        // No artwork: the tile falls back to the name (logo) or the tint alone (genre).
        Assert.Null((shelves.Studios[0] with { LogoPath = null }).Tile().ImageUrl);
        Assert.Null((shelves.Networks[0] with { LogoPath = null }).Tile().ImageUrl);
        Assert.Null((shelves.MovieGenres[0] with { BackdropPath = null }).Tile(0).ImageUrl);

        // A studio chip's small logo (search results, favorites, a title page).
        var company = Fixtures.Decode<CompanyCard>("company-card");
        Assert.Equal("https://image.tmdb.org/t/p/w185/hUze.png", company.ChipLogoUrl()?.AbsoluteUri);
        Assert.Null((company with { LogoPath = null }).ChipLogoUrl());
    }

    [Fact]
    public void GenreTintsMatchTheWebsite()
    {
        Assert.Equal(0x991B1Bu, ShelfTiles.GenreTint(28, 5));
        Assert.Equal(0x155E75u, ShelfTiles.GenreTint(878, 0));
        Assert.Equal(0x155E75u, ShelfTiles.GenreTint(10765, 0));
        Assert.Equal(0x115E59u, ShelfTiles.GenreTint(10767, 0));

        // An unlisted genre cycles the fallback palette by its place in the rail.
        Assert.Equal(0x991B1Bu, ShelfTiles.GenreTint(1, 0));
        Assert.Equal(0x6B21A8u, ShelfTiles.GenreTint(1, 1));
        Assert.Equal(0x065F46u, ShelfTiles.GenreTint(1, 5));
        Assert.Equal(0x991B1Bu, ShelfTiles.GenreTint(1, 6));

        var genres = new[]
        {
            new GenreTile { Id = 1, Name = "One" },
            new GenreTile { Id = 2, Name = "Two" },
            new GenreTile { Id = 18, Name = "Drama" },
        }.Tiles();
        Assert.Equal([0x991B1Bu, 0x6B21A8u, 0x334155u], genres.Select(tile => tile.Tint!.Value));
        Assert.All(genres, tile => Assert.Null(tile.ImageUrl));
    }

    [Fact]
    public void BrowseExtrasValues()
    {
        var extras = Fixtures.Decode<BrowseExtras>("browse-extras");
        var genre = Assert.Single(extras.Genres);
        Assert.Equal(10759, genre.Id);
        Assert.Equal("Action & Adventure", genre.Name);
        Assert.NotNull(extras.Network);
        Assert.Equal("Netflix", extras.Network.Name);
        Assert.NotNull(extras.BecauseYouWatched);
        Assert.Equal("Severance", extras.BecauseYouWatched.Title);
        Assert.Equal("The Matrix", Assert.Single(extras.BecauseYouWatched.Items).Name);

        var bare = Json.Decode<BrowseExtras>("""{"genres":[],"network":null,"becauseYouWatched":null}""");
        Assert.Empty(bare.Genres);
        Assert.Null(bare.Network);
        Assert.Null(bare.BecauseYouWatched);
    }

    [Fact]
    public void SearchResultsValues()
    {
        var results = Fixtures.Decode<SearchResults>("search");
        Assert.Equal("keanu", results.Query);
        Assert.Equal("Keanu Reeves", Assert.Single(results.People).Name);
        Assert.Equal("Marvel Studios", Assert.Single(results.Studios).Name);
        Assert.Equal(603, Assert.Single(results.Titles).TmdbId);
        Assert.NotNull(results.Theme);
        Assert.Equal("Science Fiction", results.Theme.Label);
        Assert.Single(results.Theme.Items);
        Assert.False(results.IsEmpty);

        // "No results for "…"." needs all four lists empty; a theme with no
        // items counts as empty too.
        var empty = results with { People = [], Studios = [], Titles = [], Theme = null };
        Assert.True(empty.IsEmpty);
        Assert.True((empty with { Theme = new SearchTheme { Label = "Science Fiction", Items = [] } }).IsEmpty);
        Assert.False((empty with { Theme = results.Theme }).IsEmpty);
        Assert.False((empty with { People = results.People }).IsEmpty);
    }

    [Fact]
    public void SurpriseIsATitleId()
    {
        var id = Fixtures.Decode<TitleId>("surprise");
        Assert.Equal(new TitleId(MediaType.Movie, 424694), id);
        Assert.Equal("marquee://title/movie/424694", id.Route.AbsoluteUri);
    }

    [Fact]
    public void BrowseQueryItems()
    {
        var defaults = BrowseQuery.Default.QueryItems(3);
        Assert.Equal("popularity", defaults["sort"]);
        Assert.Null(defaults["genre"]);
        Assert.Null(defaults["year"]);
        Assert.Null(defaults["network"]);
        Assert.Equal("true", defaults["hideOwned"]);
        Assert.Equal("3", defaults["page"]);
        Assert.All(BrowseQuery.Default.ExtrasQueryItems.Values, Assert.Null);

        var filtered = new BrowseQuery { Sort = BrowseSort.Newest, GenreId = 28, Year = 1999, NetworkId = 213, HideOwned = false };
        var items = filtered.QueryItems(1);
        Assert.Equal("newest", items["sort"]);
        Assert.Equal("28", items["genre"]);
        Assert.Equal("1999", items["year"]);
        Assert.Equal("213", items["network"]);
        Assert.Equal("false", items["hideOwned"]);
        Assert.Equal("1", items["page"]);

        var extras = filtered.ExtrasQueryItems;
        Assert.Equal(["genre", "network", "year"], extras.Keys.Order(StringComparer.Ordinal));
        Assert.Equal("28", extras["genre"]);

        // Records compare by value, so a screen can key its reloads off the query.
        Assert.Equal(filtered, filtered with { });
        Assert.NotEqual(filtered, filtered with { Year = 2000 });
    }

    [Fact]
    public void SurpriseRequestsOmitUnsetFields()
    {
        Assert.Equal("{}", Json.EncodeBodyToString(new SurpriseRequest()));
        Assert.Equal("""{"type":"all","genreId":18,"year":1999,"hideOwned":true}""",
            Json.EncodeBodyToString(new SurpriseRequest(SurpriseKind.All, 18, 1999, true)));
        Assert.Equal("""{"type":"movie"}""", Json.EncodeBodyToString(new SurpriseRequest(SurpriseKind.Of(MediaType.Movie))));

        Assert.Equal(SurpriseKind.Tv, SurpriseKind.Of(MediaType.Tv));
        Assert.Equal(3, SurpriseKind.Known.Count);
        Assert.False(SurpriseKind.FromValue("music").IsKnown);
        Assert.Equal("all", SurpriseKind.All.ToString());
    }
}
