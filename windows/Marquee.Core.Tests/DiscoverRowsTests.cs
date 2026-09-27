using System.Text.Json.Nodes;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// Customisable Discover rows (api-v1.md deviation 18, 0.49+): GET /discover's
// `shelves` and what Discover draws from it (and from an older server's fixed
// keys), the See all of a custom row, Settings › Discover's fixtures, every
// /settings/discover call's method, path, query, body and recorded change,
// and the editing rules (moving a row, the PUT body, the Add row body).

public sealed class DiscoverRowsTests
{
    private static readonly Uri Base = new("http://127.0.0.1:3000");
    private const string Token = "mqt_testtesttesttesttesttesttesttesttesttesttes";
    private const string AnimeId = "5b0f3c2e-8f7a-4d0e-9b1c-2a6d7e8f9a01";

    private static MarqueeApi Api(StubHttpMessageHandler stub, ServerEvents? events = null) =>
        new(new ApiClient(Base, Token, stub), events);

    /// <summary>A fixture with Windows line endings folded, so string edits match on any checkout.</summary>
    private static string Read(string name) => Fixtures.Read(name).Replace("\r\n", "\n", StringComparison.Ordinal);

    // MARK: GET /discover's shelves

    [Fact]
    public void ShelvesDecode()
    {
        var discover = Fixtures.Decode<DiscoverShelves>("discover");
        var shelves = discover.Shelves;
        Assert.NotNull(shelves);
        Assert.Equal(["trending", AnimeId, "movieGenres", "studios"], shelves.Select(shelf => shelf.Id));

        var trending = shelves[0];
        Assert.Equal(new DiscoverRowKind("trending"), trending.Kind);
        Assert.True(trending.Kind.IsKnown);
        Assert.False(trending.Custom);
        Assert.Equal("Trending", trending.Title);
        Assert.Single(trending.Results!);
        Assert.Null(trending.Genres);
        Assert.Null(trending.Logos);
        Assert.Equal(SeeAllKind.List, trending.SeeAll!.Type);
        Assert.Equal(DiscoverListKind.Trending, trending.SeeAll.List);

        var anime = shelves[1];
        Assert.Equal(DiscoverRowKind.Keyword, anime.Kind);
        Assert.True(anime.Custom);
        Assert.Equal("Anime", anime.Title);
        Assert.Equal(AnimeId, anime.SeeAll!.List!.Value.Value);
        Assert.True(anime.SeeAll.List.Value.IsCustomRow);
        Assert.False(anime.SeeAll.List.Value.IsKnown);

        var genres = shelves[2];
        Assert.Null(genres.Results);
        Assert.Equal(28, Assert.Single(genres.Genres!).Id);

        var studios = shelves[3];
        var disney = Assert.Single(studios.Logos!);
        Assert.Equal(2, disney.TmdbId);
        Assert.Equal("Walt Disney Pictures", disney.Name);
        Assert.Equal(new ImageRef("/wdrC.png"), disney.LogoPath);
    }

    [Fact]
    public void ShelvesResolveInTheirOrder()
    {
        var discover = Fixtures.Decode<DiscoverShelves>("discover");
        var rows = DiscoverRows.Resolve(discover);

        Assert.Equal(["trending", AnimeId, "movieGenres", "studios"], rows.Select(row => row.Id));
        var trending = Assert.IsType<DiscoverRow.Posters>(rows[0]);
        Assert.Equal(new SeeAllTarget.DiscoverList(DiscoverListKind.Trending, "Trending"), trending.SeeAll);

        var anime = Assert.IsType<DiscoverRow.Posters>(rows[1]);
        Assert.Equal("Anime", anime.Title);
        var list = Assert.IsType<SeeAllTarget.DiscoverList>(anime.SeeAll);
        Assert.Equal(AnimeId, list.Kind.Value);
        Assert.Equal("Anime", list.Title);

        var genres = Assert.IsType<DiscoverRow.Genres>(rows[2]);
        Assert.Equal(MediaType.Movie, genres.MediaType);
        Assert.Equal(new SeeAllTarget.BrowseGrid(MediaType.Movie), genres.SeeAll);

        var studios = Assert.IsType<DiscoverRow.Studios>(rows[3]);
        var tile = Assert.Single(studios.Logos).Tile();
        Assert.Equal(ShelfTileKind.Logo, tile.Kind);
        Assert.Equal(2, tile.Id);
        Assert.Equal("Walt Disney Pictures", tile.Name);
        Assert.Equal("https://image.tmdb.org/t/p/w500/wdrC.png", tile.ImageUrl?.AbsoluteUri);
    }

    [Fact]
    public void AnUnknownKindWithResultsIsAPosterRowAndWithoutIsSkipped()
    {
        var json = Read("discover")
            .Replace("\"kind\": \"keyword\"", "\"kind\": \"mood\"", StringComparison.Ordinal)
            .Replace("\"kind\": \"studios\"", "\"kind\": \"brands\"", StringComparison.Ordinal)
            .Replace("\"kind\": \"movieGenres\"", "\"kind\": \"vibes\"", StringComparison.Ordinal);
        var discover = Json.Decode<DiscoverShelves>(json);
        Assert.False(discover.Shelves![1].Kind.IsKnown);

        var rows = DiscoverRows.Resolve(discover);

        // "mood" has results: posters. "vibes" (genres) and "brands" (logos)
        // this app can't link anywhere: left out.
        Assert.Equal(["trending", AnimeId], rows.Select(row => row.Id));
        Assert.IsType<DiscoverRow.Posters>(rows[1]);
    }

    [Fact]
    public void EmptyRowsAreLeftOut()
    {
        var discover = Fixtures.Decode<DiscoverShelves>("discover");
        var shelves = discover.Shelves!.ToList();
        shelves[0] = shelves[0] with { Results = [] };
        shelves[2] = shelves[2] with { Genres = [] };

        var rows = DiscoverRows.Resolve(discover with { Shelves = shelves });

        Assert.Equal([AnimeId, "studios"], rows.Select(row => row.Id));
    }

    [Fact]
    public void NetworksAndSeriesGenresLinkToSeries()
    {
        var discover = Fixtures.Decode<DiscoverShelves>("discover");
        var shelves = new List<DiscoverShelf>
        {
            new()
            {
                Id = "seriesGenres", Kind = new("seriesGenres"), Title = "Series Genres",
                Genres = [new GenreTile { Id = 18, Name = "Drama" }],
                SeeAll = new DiscoverSeeAllLink { Type = SeeAllKind.Browse, MediaType = MediaType.Tv },
            },
            new()
            {
                Id = "networks", Kind = new("networks"), Title = "Networks",
                Logos = [new DiscoverLogo { TmdbId = 213, Name = "Netflix" }],
            },
        };

        var rows = DiscoverRows.Resolve(discover with { Shelves = shelves });

        var genres = Assert.IsType<DiscoverRow.Genres>(rows[0]);
        Assert.Equal(MediaType.Tv, genres.MediaType);
        Assert.Equal(new SeeAllTarget.BrowseGrid(MediaType.Tv), genres.SeeAll);
        var networks = Assert.IsType<DiscoverRow.Networks>(rows[1]);
        Assert.Equal(213, Assert.Single(networks.Logos).TmdbId);
        // No link of its own: the fixed keys' map names the Series grid.
        Assert.Equal(new SeeAllTarget.BrowseGrid(MediaType.Tv), networks.SeeAll);
    }

    [Fact]
    public void AnOlderServerShowsTheFixedKeysInPageOrder()
    {
        var discover = Fixtures.Decode<DiscoverShelves>("discover") with { Shelves = null };

        var rows = DiscoverRows.Resolve(discover);

        var expected = DiscoverRows.BuiltIn
            .Select(row => row.Key)
            .Where(key => key switch
            {
                DiscoverShelfKey.RecentlyAdded => discover.RecentlyAdded.Count > 0,
                DiscoverShelfKey.Trending => discover.Trending.Count > 0,
                DiscoverShelfKey.PopularMovies => discover.PopularMovies.Count > 0,
                DiscoverShelfKey.MovieGenres => discover.MovieGenres.Count > 0,
                DiscoverShelfKey.UpcomingMovies => discover.UpcomingMovies.Count > 0,
                DiscoverShelfKey.Studios => discover.Studios.Count > 0,
                DiscoverShelfKey.PopularSeries => discover.PopularSeries.Count > 0,
                DiscoverShelfKey.SeriesGenres => discover.SeriesGenres.Count > 0,
                DiscoverShelfKey.UpcomingSeries => discover.UpcomingSeries.Count > 0,
                _ => discover.Networks.Count > 0,
            })
            .ToList();
        Assert.Equal(expected, rows.Select(row => row.Id));
        Assert.Contains(rows, row => row is DiscoverRow.Genres { MediaType.Value: "movie" });
        Assert.Contains(rows, row => row is DiscoverRow.Studios);
        Assert.Contains(rows, row => row is DiscoverRow.Networks);
        Assert.Equal("Trending", rows.Single(row => row.Id == DiscoverShelfKey.Trending).Title);

        // The See all targets are the fixed map's, as before.
        Assert.Equal(new SeeAllTarget.DiscoverList(DiscoverListKind.Trending), rows.Single(row => row.Id == "trending").SeeAll);
    }

    [Fact]
    public void AServerWithoutShelvesDecodesWithNone()
    {
        var node = JsonNode.Parse(Read("discover"))!.AsObject();
        node.Remove("shelves");
        var discover = Json.Decode<DiscoverShelves>(node.ToJsonString());
        Assert.Null(discover.Shelves);
        Assert.NotEmpty(DiscoverRows.Resolve(discover));
    }

    [Fact]
    public void ACustomListSeeAllAndItsTitle()
    {
        var list = DiscoverListKind.FromValue(AnimeId);
        Assert.True(list.IsCustomRow);
        Assert.Equal("Discover", list.Title);
        Assert.False(DiscoverListKind.Trending.IsCustomRow);
        Assert.Equal("Trending", DiscoverListKind.Trending.Title);

        // An unknown list or type is still no See all.
        var discover = Fixtures.Decode<DiscoverShelves>("discover");
        var shelf = discover.Shelves![1];
        Assert.Null(DiscoverRows.SeeAllFor(discover, shelf with { SeeAll = new DiscoverSeeAllLink { Type = SeeAllKind.List } }));
        Assert.Null(DiscoverRows.SeeAllFor(discover, shelf with { SeeAll = new DiscoverSeeAllLink { Type = new SeeAllKind("sheet") } }));
    }

    [Fact]
    public async Task ACustomRowsListIsItsIdAsOneSegment()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerFixture("discover-list");

        await Api(stub).Discover.ListPageAsync(DiscoverListKind.FromValue(AnimeId), page: 2);

        var request = Assert.Single(stub.Requests);
        Assert.Equal($"/api/v1/discover/lists/{AnimeId}", request.Path);
        Assert.Equal("?page=2", request.Uri.Query);
    }

    // MARK: Settings › Discover fixtures

    [Fact]
    public void SettingsFixtureDecodes()
    {
        var settings = Fixtures.Decode<DiscoverSettings>("discover-settings");
        Assert.True(settings.TraktConfigured);
        Assert.Equal(30, settings.MaxCustomShelves);
        Assert.Equal(3, settings.CustomCount);
        Assert.Equal(["recentlyAdded", "trending", AnimeId, "8d1e2f3a-4b5c-4d6e-8f70-1a2b3c4d5e6f", "c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f"],
            settings.Shelves.Select(shelf => shelf.Id));

        var recentlyAdded = settings.Shelves[0];
        Assert.False(recentlyAdded.Custom);
        Assert.False(recentlyAdded.Hidden);
        Assert.Null(recentlyAdded.Source);
        Assert.Equal("Built-in row", recentlyAdded.Subtitle);
        Assert.True(settings.Shelves[1].Hidden);

        var anime = settings.Shelves[2];
        Assert.Equal(DiscoverRowKind.Keyword, anime.Kind);
        Assert.Equal(ShelfMediaType.All, anime.Source!.MediaType);
        Assert.Equal(210024, anime.Source.TmdbId);
        Assert.Equal("anime", anime.Source.Name);
        Assert.Null(anime.Source.Url);
        Assert.Equal("TMDb keyword · anime · Movies and series", anime.Subtitle);

        var a24 = settings.Shelves[3];
        Assert.Equal(DiscoverRowKind.Company, a24.Kind);
        Assert.Equal("Studio · A24 · Movies", a24.Subtitle);

        var trakt = settings.Shelves[4];
        Assert.Equal(DiscoverRowKind.TraktList, trakt.Kind);
        Assert.Equal("Trakt list · https://trakt.tv/users/someone/lists/best-of-2024", trakt.Subtitle);
    }

    [Fact]
    public void AnUnknownCustomKindStillDecodes()
    {
        var json = Read("discover-settings").Replace("\"kind\": \"company\"", "\"kind\": \"podcast\"", StringComparison.Ordinal);
        var shelf = Json.Decode<DiscoverSettings>(json).Shelves[3];
        Assert.False(shelf.Kind.IsKnown);
        Assert.Equal("Podcast · A24", shelf.Subtitle);
    }

    [Fact]
    public void SubtitlesPerKind()
    {
        DiscoverShelfSetting Custom(DiscoverRowKind kind, DiscoverShelfSource source) =>
            new() { Id = "x", Kind = kind, Title = "X", Custom = true, Hidden = false, Source = source };

        Assert.Equal("Genre · Action · Series",
            Custom(DiscoverRowKind.Genre, new() { MediaType = ShelfMediaType.Tv, TmdbId = 28, Name = "Action" }).Subtitle);
        Assert.Equal("Network · Netflix",
            Custom(DiscoverRowKind.Network, new() { MediaType = ShelfMediaType.Tv, TmdbId = 213, Name = "Netflix" }).Subtitle);
        Assert.Equal("TMDb list · #8136",
            Custom(DiscoverRowKind.TmdbList, new() { MediaType = ShelfMediaType.All, TmdbId = 8136 }).Subtitle);
        Assert.Equal("Recently added to Plex/Jellyfin · Movies",
            Custom(DiscoverRowKind.Library, new() { MediaType = ShelfMediaType.Movie }).Subtitle);
    }

    [Fact]
    public void LookupFixtureDecodes()
    {
        var results = Fixtures.Decode<ListResponse<DiscoverLookupResult>>("discover-lookup").Results;
        Assert.Equal(2, results.Count);
        Assert.Equal(41077, results[0].TmdbId);
        Assert.Equal("A24 (US)", results[0].Label);
        Assert.NotNull(results[0].LogoPath);
        Assert.Equal("anime", results[1].Label);
        Assert.Null(results[1].LogoPath);
    }

    // MARK: Requests

    private sealed record Case(string Method, string Path, IReadOnlyDictionary<string, string> Query, string? Body, string Response, bool Records, Func<MarqueeApi, Task> Call)
    {
        public string Name => $"{Method} {Path} {string.Join("&", Query.Select(pair => $"{pair.Key}={pair.Value}"))}";
    }

    private static IReadOnlyDictionary<string, string> Query(params (string Key, string Value)[] pairs) =>
        pairs.ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.Ordinal);

    private static readonly IReadOnlyDictionary<string, string> NoQuery = Query();

    private static readonly Case[] Cases =
    [
        new("GET", "/settings/discover", NoQuery, null, "discover-settings", false, api => api.DiscoverSettings.GetAsync()),
        new("PUT", "/settings/discover", NoQuery,
            """{"shelves":[{"id":"trending","hidden":false},{"id":"recentlyAdded","hidden":true}]}""",
            "discover-settings", true,
            api => api.DiscoverSettings.SaveLayoutAsync(new DiscoverLayoutRequest([new("trending", false), new("recentlyAdded", true)]))),
        new("POST", "/settings/discover/shelves", NoQuery,
            """{"kind":"keyword","tmdbId":210024,"mediaType":"all","name":"anime","title":"Anime"}""",
            "discover-settings-shelf", true,
            api => api.DiscoverSettings.AddShelfAsync(new NewDiscoverShelfRequest(DiscoverRowKind.Keyword, 210024, ShelfMediaType.All, "anime", Title: "Anime"))),
        new("PATCH", $"/settings/discover/shelves/{AnimeId}", NoQuery, """{"title":"Anime!"}""", "discover-settings-shelf", true,
            api => api.DiscoverSettings.UpdateShelfAsync(AnimeId, new DiscoverShelfPatch(Title: "Anime!"))),
        new("PATCH", "/settings/discover/shelves/trending", NoQuery, """{"hidden":true}""", "discover-settings-shelf", true,
            api => api.DiscoverSettings.UpdateShelfAsync("trending", new DiscoverShelfPatch(Hidden: true))),
        new("DELETE", $"/settings/discover/shelves/{AnimeId}", NoQuery, null, "ok", true,
            api => api.DiscoverSettings.RemoveShelfAsync(AnimeId)),
        new("POST", "/settings/discover/reset", NoQuery, null, "discover-settings", true, api => api.DiscoverSettings.ResetAsync()),
        new("GET", "/settings/discover/locale", NoQuery, null, "discover-locale", false, api => api.DiscoverSettings.GetLocaleAsync()),
        new("PUT", "/settings/discover/locale", NoQuery, """{"streamingRegion":"GB","discoverRegion":"","discoverLanguage":"any"}""", "discover-locale", true,
            api => api.DiscoverSettings.SaveLocaleAsync(DiscoverLocaleRequest.From("GB", null, "any"))),
        new("GET", "/settings/discover/lookup", Query(("type", "keyword"), ("q", "anime")), null, "discover-lookup", false,
            api => api.DiscoverSettings.LookupAsync(DiscoverLookupKind.Keyword, " anime ")),
        new("GET", "/settings/discover/lookup", Query(("type", "company"), ("q", "")), null, "discover-lookup", false,
            api => api.DiscoverSettings.LookupAsync(DiscoverLookupKind.Company, null, ShelfMediaType.Movie)),
        new("GET", "/settings/discover/lookup", Query(("type", "genre"), ("q", "act"), ("mediaType", "tv")), null, "discover-lookup", false,
            api => api.DiscoverSettings.LookupAsync(DiscoverLookupKind.Genre, "act", ShelfMediaType.Tv)),
    ];

    public static TheoryData<int> CaseIndexes
    {
        get
        {
            var data = new TheoryData<int>();
            for (var index = 0; index < Cases.Length; index++)
            {
                data.Add(index);
            }
            return data;
        }
    }

    [Theory]
    [MemberData(nameof(CaseIndexes))]
    public async Task SendsWhatTheDocSpecifies(int index)
    {
        var testCase = Cases[index];
        var stub = new StubHttpMessageHandler();
        if (testCase.Response == "discover-settings-shelf")
        {
            stub.AnswerJson(200, JsonNode.Parse(Read("discover-settings"))!["shelves"]![2]!.ToJsonString());
        }
        else
        {
            stub.AnswerFixture(testCase.Response);
        }
        var events = new ServerEvents();

        await testCase.Call(Api(stub, events));

        var request = Assert.Single(stub.Requests);
        Assert.Equal(testCase.Method, request.Method.Method);
        Assert.Equal("/api/v1" + testCase.Path, request.Path);
        Assert.Equal(testCase.Query.Count, request.Query.Count);
        foreach (var (key, value) in testCase.Query)
        {
            Assert.True(request.Query.TryGetValue(key, out var actual), $"{testCase.Name} is missing ?{key}");
            Assert.Equal(value, actual);
        }
        Assert.Equal("Bearer " + Token, request.Authorization);
        if (testCase.Body is { } expected)
        {
            Assert.Equal("application/json", request.ContentType);
            Assert.True(JsonNode.DeepEquals(JsonNode.Parse(expected), request.JsonBody), $"{testCase.Name} body was {request.Body}");
        }
        else
        {
            Assert.Equal("", request.Body);
        }
        // A change reshapes Discover, which reloads on Integrations.
        Assert.Equal(testCase.Records ? 1 : 0, events.Revision(ServerChange.Integrations));
    }

    [Fact]
    public async Task AnOlderServersSettingsAreNull()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(404, """{"error":"Not found.","code":"not_found"}""");

        Assert.Null(await Api(stub).DiscoverSettings.GetAsync());
    }

    [Fact]
    public async Task AMembersSettingsAreForbidden()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(403, """{"error":"Only the admin can arrange Discover.","code":"forbidden"}""");

        var error = await Assert.ThrowsAsync<ApiException>(() => Api(stub).DiscoverSettings.GetAsync());
        Assert.Equal(ApiErrorKind.Forbidden, error.Kind);
    }

    [Fact]
    public async Task AFailedAddShowsTheServersMessageAndRecordsNothing()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(409, """{"error":"Discover can have up to 30 rows of your own. Remove one first.","code":"conflict"}""");
        var events = new ServerEvents();

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            Api(stub, events).DiscoverSettings.AddShelfAsync(new NewDiscoverShelfRequest(DiscoverRowKind.Library)));

        Assert.Equal(ApiErrorKind.Conflict, error.Kind);
        Assert.Equal("Discover can have up to 30 rows of your own. Remove one first.", error.Message);
        Assert.Equal(0, events.Revision(ServerChange.All));
    }

    // MARK: Editing

    private static IReadOnlyList<DiscoverShelfSetting> SettingsRows() => Fixtures.Decode<DiscoverSettings>("discover-settings").Shelves;

    [Fact]
    public void MovingARow()
    {
        var rows = SettingsRows();

        var up = DiscoverLayoutEditing.Move(rows, 2, -1);
        Assert.Equal(["recentlyAdded", AnimeId, "trending"], up.Take(3).Select(row => row.Id));

        var down = DiscoverLayoutEditing.Move(rows, 0, 1);
        Assert.Equal(["trending", "recentlyAdded"], down.Take(2).Select(row => row.Id));
        Assert.Equal(rows.Count, down.Count);

        // Off either end, or out of range: unchanged.
        Assert.Same(rows, DiscoverLayoutEditing.Move(rows, 0, -1));
        Assert.Same(rows, DiscoverLayoutEditing.Move(rows, rows.Count - 1, 1));
        Assert.Same(rows, DiscoverLayoutEditing.Move(rows, 9, -1));
        // The original isn't touched.
        Assert.Equal("recentlyAdded", rows[0].Id);
    }

    [Fact]
    public void TheLayoutBodyNamesEveryRowWithItsVisibility()
    {
        var rows = DiscoverLayoutEditing.SetHidden(DiscoverLayoutEditing.Move(SettingsRows(), 1, -1), "recentlyAdded", true);

        var body = JsonNode.Parse(Json.EncodeBodyToString(DiscoverLayoutEditing.LayoutRequest(rows)));

        var expected = JsonNode.Parse($$"""
            {"shelves":[
              {"id":"trending","hidden":true},
              {"id":"recentlyAdded","hidden":true},
              {"id":"{{AnimeId}}","hidden":false},
              {"id":"8d1e2f3a-4b5c-4d6e-8f70-1a2b3c4d5e6f","hidden":false},
              {"id":"c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f","hidden":false}
            ]}
            """);
        Assert.True(JsonNode.DeepEquals(expected, body), body?.ToJsonString());
    }

    [Fact]
    public void WhatTheAddRowFormAsksForPerKind()
    {
        Assert.Equal(7, DiscoverRowKind.CustomKinds.Count);
        Assert.Equal(
            ["TMDb keyword", "Genre", "Studio", "Network", "TMDb list", "Trakt list", "Recently added to Plex/Jellyfin"],
            DiscoverRowKind.CustomKinds.Select(kind => kind.Label));

        Assert.Equal([ShelfMediaType.All, ShelfMediaType.Movie, ShelfMediaType.Tv], DiscoverLayoutEditing.MediaTypeChoices(DiscoverRowKind.Keyword));
        Assert.Equal([ShelfMediaType.All, ShelfMediaType.Movie, ShelfMediaType.Tv], DiscoverLayoutEditing.MediaTypeChoices(DiscoverRowKind.Company));
        Assert.Equal([ShelfMediaType.All, ShelfMediaType.Movie, ShelfMediaType.Tv], DiscoverLayoutEditing.MediaTypeChoices(DiscoverRowKind.Library));
        Assert.Equal([ShelfMediaType.Movie, ShelfMediaType.Tv], DiscoverLayoutEditing.MediaTypeChoices(DiscoverRowKind.Genre));
        Assert.Empty(DiscoverLayoutEditing.MediaTypeChoices(DiscoverRowKind.Network));
        Assert.Empty(DiscoverLayoutEditing.MediaTypeChoices(DiscoverRowKind.TmdbList));
        Assert.Empty(DiscoverLayoutEditing.MediaTypeChoices(DiscoverRowKind.TraktList));

        Assert.Equal(DiscoverLookupKind.Keyword, DiscoverLayoutEditing.LookupKind(DiscoverRowKind.Keyword));
        Assert.Equal(DiscoverLookupKind.Company, DiscoverLayoutEditing.LookupKind(DiscoverRowKind.Company));
        Assert.Equal(DiscoverLookupKind.Network, DiscoverLayoutEditing.LookupKind(DiscoverRowKind.Network));
        Assert.Equal(DiscoverLookupKind.Genre, DiscoverLayoutEditing.LookupKind(DiscoverRowKind.Genre));
        Assert.Null(DiscoverLayoutEditing.LookupKind(DiscoverRowKind.TmdbList));
        Assert.Null(DiscoverLayoutEditing.LookupKind(DiscoverRowKind.TraktList));
        Assert.Null(DiscoverLayoutEditing.LookupKind(DiscoverRowKind.Library));
    }

    private static readonly DiscoverLookupResult Anime = new() { TmdbId = 210024, Name = "anime" };

    public static TheoryData<string, string> AddRowBodies => new()
    {
        { "keyword", """{"kind":"keyword","tmdbId":210024,"mediaType":"movie","name":"anime"}""" },
        { "company", """{"kind":"company","tmdbId":210024,"mediaType":"movie","name":"anime"}""" },
        { "genre", """{"kind":"genre","tmdbId":210024,"mediaType":"movie","name":"anime"}""" },
        { "network", """{"kind":"network","tmdbId":210024,"name":"anime"}""" },
        { "library", """{"kind":"library","mediaType":"movie"}""" },
    };

    [Theory]
    [MemberData(nameof(AddRowBodies))]
    public void AddRowBodyPerKind(string kind, string expected)
    {
        var (request, error) = DiscoverLayoutEditing.AddRowRequest(
            DiscoverRowKind.FromValue(kind), Anime, ShelfMediaType.Movie, link: "ignored", title: "  ");

        Assert.Null(error);
        var body = JsonNode.Parse(Json.EncodeBodyToString(request!));
        Assert.True(JsonNode.DeepEquals(JsonNode.Parse(expected), body), body?.ToJsonString());
    }

    [Fact]
    public void AddRowBodiesForLinksAndNames()
    {
        string Body(DiscoverRowKind kind, string? link, string? title = null, ShelfMediaType? mediaType = null)
        {
            var (request, error) = DiscoverLayoutEditing.AddRowRequest(kind, null, mediaType, link, title);
            Assert.Null(error);
            return JsonNode.Parse(Json.EncodeBodyToString(request!))!.ToJsonString();
        }

        Assert.Equal("""{"kind":"tmdbList","tmdbId":8136}""", Body(DiscoverRowKind.TmdbList, " 8136 "));
        Assert.Equal("""{"kind":"tmdbList","url":"https://www.themoviedb.org/list/8136-star-wars"}""",
            Body(DiscoverRowKind.TmdbList, "https://www.themoviedb.org/list/8136-star-wars"));
        Assert.Equal("""{"kind":"traktList","url":"https://trakt.tv/users/someone/watchlist","title":"Their picks"}""",
            Body(DiscoverRowKind.TraktList, " https://trakt.tv/users/someone/watchlist ", " Their picks "));
        // A media type the kind doesn't offer falls back to its default.
        Assert.Equal("""{"kind":"library","mediaType":"all"}""", Body(DiscoverRowKind.Library, null));
        Assert.Equal("""{"kind":"library","mediaType":"tv"}""", Body(DiscoverRowKind.Library, null, mediaType: ShelfMediaType.Tv));
    }

    [Fact]
    public void AddRowRefusesWhatTheServerWould()
    {
        Assert.Equal("Pick a keyword.", DiscoverLayoutEditing.AddRowRequest(DiscoverRowKind.Keyword, null, null, null, null).Error);
        Assert.Equal("Pick a studio.", DiscoverLayoutEditing.AddRowRequest(DiscoverRowKind.Company, null, null, null, null).Error);
        Assert.Equal("Pick a genre.", DiscoverLayoutEditing.AddRowRequest(DiscoverRowKind.Genre, null, null, null, null).Error);
        Assert.Equal("Pick a network.", DiscoverLayoutEditing.AddRowRequest(DiscoverRowKind.Network, null, null, null, null).Error);
        Assert.StartsWith("Give the TMDb list's number", DiscoverLayoutEditing.AddRowRequest(DiscoverRowKind.TmdbList, null, null, " ", null).Error);
        Assert.StartsWith("Paste a public Trakt list", DiscoverLayoutEditing.AddRowRequest(DiscoverRowKind.TraktList, null, null, null, null).Error);
        Assert.Equal("Pick what the row shows.", DiscoverLayoutEditing.AddRowRequest(new DiscoverRowKind("podcast"), Anime, null, null, null).Error);
        Assert.Equal(
            "Keep the row's name under 60 characters.",
            DiscoverLayoutEditing.AddRowRequest(DiscoverRowKind.Library, null, null, null, new string('x', 61)).Error);
        Assert.Null(DiscoverLayoutEditing.AddRowRequest(DiscoverRowKind.Library, null, null, null, new string('x', 60)).Error);
    }
}
