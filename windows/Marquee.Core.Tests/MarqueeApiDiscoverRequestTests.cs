using System.Text.Json.Nodes;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// The Discover / Browse / Search rows of the Mac's MarqueeAPIRequestTests:
// each method against a stubbed server must send exactly the method, path,
// query and JSON body docs/api-v1.md specifies, and the doc's example
// response must decode into its return value.

public sealed class MarqueeApiDiscoverRequestTests
{
    private static readonly Uri Base = new("http://127.0.0.1:3000");

    /// <param name="Query">Expected query, percent-decoded; empty means none.</param>
    /// <param name="Body">Expected JSON body; null means no body at all.</param>
    /// <param name="Response">The fixture the stub answers with.</param>
    private sealed record Case(string Method, string Path, IReadOnlyDictionary<string, string> Query, string? Body, string Response, Func<MarqueeApi, Task> Call)
    {
        public string Name => $"{Method} {Path}";
    }

    private static IReadOnlyDictionary<string, string> Query(params (string Key, string Value)[] pairs) =>
        pairs.ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.Ordinal);

    // Declared before Cases: static initializers run in textual order.
    private static readonly IReadOnlyDictionary<string, string> NoQuery = Query();

    private static readonly BrowseQuery FilteredQuery = new()
    {
        Sort = BrowseSort.TopRated,
        GenreId = 28,
        Year = 1999,
        NetworkId = 213,
        HideOwned = false,
    };

    private static readonly Case[] Cases =
    [
        new("GET", "/discover", NoQuery, null, "discover", api => api.Discover.ShelvesAsync()),
        new("GET", "/discover/lists/trending", Query(("page", "3")), null, "discover-list",
            api => api.Discover.ListPageAsync(DiscoverListKind.Trending, page: 3)),
        new("GET", "/discover/lists/recently-added", Query(("page", "1")), null, "discover-list",
            api => api.Discover.ListPageAsync(DiscoverListKind.RecentlyAdded)),
        new("GET", "/movies",
            Query(("sort", "top_rated"), ("genre", "28"), ("year", "1999"), ("network", "213"), ("hideOwned", "false"), ("page", "2")),
            null, "browse-page", api => api.Browse.PageAsync(MediaType.Movie, FilteredQuery, page: 2)),
        new("GET", "/movies/extras", Query(("genre", "28"), ("year", "1999"), ("network", "213")), null, "browse-extras",
            api => api.Browse.ExtrasAsync(MediaType.Movie, FilteredQuery)),
        new("GET", "/series", Query(("sort", "popularity"), ("hideOwned", "true"), ("page", "1")), null, "browse-page",
            api => api.Browse.PageAsync(MediaType.Tv)),
        new("GET", "/series/extras", NoQuery, null, "browse-extras", api => api.Browse.ExtrasAsync(MediaType.Tv)),
        new("POST", "/surprise", NoQuery, """{"type":"tv","genreId":18,"hideOwned":false}""", "surprise",
            api => api.Discover.SurpriseAsync(new SurpriseRequest(SurpriseKind.Tv, GenreId: 18, HideOwned: false))),
        new("GET", "/search", Query(("q", "Romeo + Juliet & co")), null, "search", api => api.Search.ResultsAsync("Romeo + Juliet & co")),
        new("GET", "/search/suggest", Query(("q", "ma")), null, "search-suggest", api => api.Search.SuggestionsAsync("ma")),
    ];

    public static TheoryData<string> CaseNames
    {
        get
        {
            var data = new TheoryData<string>();
            foreach (var testCase in Cases)
            {
                data.Add(testCase.Name);
            }
            return data;
        }
    }

    [Theory]
    [MemberData(nameof(CaseNames))]
    public async Task SendsWhatTheDocSpecifies(string name)
    {
        var testCase = Cases.Single(candidate => candidate.Name == name);
        var stub = new StubHttpMessageHandler();
        stub.AnswerFixture(testCase.Response);
        var events = new ServerEvents();
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub), events);

        await testCase.Call(api);

        var request = Assert.Single(stub.Requests);
        Assert.Equal(testCase.Method, request.Method.Method);
        Assert.Equal("/api/v1" + testCase.Path, request.Path);
        Assert.Equal(testCase.Query.Count, request.Query.Count);
        foreach (var (key, value) in testCase.Query)
        {
            Assert.True(request.Query.TryGetValue(key, out var actual), $"{name} is missing ?{key}");
            Assert.Equal(value, actual);
        }
        Assert.Equal("Bearer mqt_testtesttesttesttesttesttesttesttesttesttes", request.Authorization);
        if (testCase.Body is { } expected)
        {
            Assert.Equal("application/json", request.ContentType);
            Assert.True(JsonNode.DeepEquals(JsonNode.Parse(expected), request.JsonBody), $"{name} body was {request.Body}");
        }
        else
        {
            Assert.Equal("", request.Body);
            Assert.Null(request.ContentType);
        }
        // Reads never signal a change, and neither does Surprise me: a POST
        // that only reads.
        Assert.Equal(0, events.Revision(ServerChange.All));
    }

    [Fact]
    public async Task PlusSignsAreEncodedInQueries()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerFixture("search");
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub));

        await api.Search.ResultsAsync("Romeo + Juliet");

        // encodeURIComponent semantics: a literal "+" would read as a space.
        Assert.Equal("?q=Romeo%20%2B%20Juliet", Assert.Single(stub.Requests).Uri.Query);
    }

    [Fact]
    public async Task DiscoverListNamesAreOnePathSegment()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerFixture("discover-list");
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub));

        var page = await api.Discover.ListPageAsync(DiscoverListKind.FromValue("new releases/2026"), page: 2);

        // A list the server grows is sent as-is, but can't add a path segment.
        var request = Assert.Single(stub.Requests);
        Assert.Equal("/api/v1/discover/lists/new%20releases%2F2026", request.Path);
        Assert.Equal("?page=2", request.Uri.Query);
        Assert.Equal(DiscoverListKind.Trending, page.List);
    }

    [Fact]
    public async Task UnknownMediaTypeIsNotFoundForBrowseWithoutSending()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerFixture("browse-page");
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub));
        var music = MediaType.FromValue("music");

        var pageError = await Assert.ThrowsAsync<ApiException>(() => api.Browse.PageAsync(music));
        Assert.Equal(ApiErrorKind.NotFound, pageError.Kind);
        var extrasError = await Assert.ThrowsAsync<ApiException>(() => api.Browse.ExtrasAsync(music));
        Assert.Equal(ApiErrorKind.NotFound, extrasError.Kind);
        Assert.Empty(stub.Requests);
    }

    [Fact]
    public async Task SurpriseWithDefaultsSendsAnEmptyObject()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerFixture("surprise");
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub));

        var id = await api.Discover.SurpriseAsync();

        // The server fills in `type: "all"` and `hideOwned: true` itself.
        var request = Assert.Single(stub.Requests);
        Assert.Equal("application/json", request.ContentType);
        Assert.True(JsonNode.DeepEquals(JsonNode.Parse("{}"), request.JsonBody), $"body was {request.Body}");
        Assert.Equal(new TitleId(MediaType.Movie, 424694), id);
    }

    [Fact]
    public async Task SuggestionsComeBackUnwrapped()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerFixture("search-suggest");
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub));

        var suggestions = await api.Search.SuggestionsAsync("ma");

        Assert.Equal(4, suggestions.Count);
        Assert.Equal("The Matrix", suggestions[0].Name);
        Assert.Equal(SuggestionKind.Person, suggestions[1].MediaType);
    }

    [Fact]
    public async Task TmdbUnconfiguredIsRecognized()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(502, Fixtures.Read("error-upstream"));
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub));

        var error = await Assert.ThrowsAsync<ApiException>(() => api.Discover.ShelvesAsync());

        Assert.Equal(ApiErrorKind.Upstream, error.Kind);
        Assert.True(error.IsTmdbUnconfigured());
        Assert.Equal(TmdbErrors.UnconfiguredMessage, error.ServerMessage);

        // Only that exact upstream message means "connect TMDb"; any other
        // upstream failure, or the same words under another code, is an error.
        Assert.False(ApiException.Upstream("TMDb timed out.").IsTmdbUnconfigured());
        Assert.False(ApiException.Conflict(TmdbErrors.UnconfiguredMessage).IsTmdbUnconfigured());
    }
}
