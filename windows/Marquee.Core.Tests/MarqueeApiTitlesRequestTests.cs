using System.Numerics;
using System.Text.Json.Nodes;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// The title, library-action and request-creation rows of the Mac's
// MarqueeAPIRequestTests, plus the change signal each mutation must record.

public sealed class MarqueeApiTitlesRequestTests
{
    private static readonly Uri Base = new("http://127.0.0.1:3000");

    /// <param name="Body">Expected JSON body; null means no body at all.</param>
    /// <param name="Response">The fixture the stub answers with.</param>
    /// <param name="Changes">What a successful call records; None for a read.</param>
    private sealed record Case(string Method, string Path, string? Body, string Response, ServerChange Changes, Func<MarqueeApi, Task> Call)
    {
        public string Name => $"{Method} {Path}";
    }

    private static readonly Case[] Cases =
    [
        new("GET", "/titles/movie/603", null, "title-detail", ServerChange.None, api => api.Titles.DetailAsync(MediaType.Movie, 603)),
        new("GET", "/titles/tv/1399/seasons/1", null, "season-episodes", ServerChange.None, api => api.Titles.SeasonAsync(1, showTmdbId: 1399)),
        new("GET", "/titles/tv/1399/status", null, "title-status", ServerChange.None, api => api.Titles.StatusAsync(MediaType.Tv, 1399)),
        new("POST", "/titles/movie/603/add", null, "title-add", ServerChange.Library | ServerChange.Requests,
            api => api.Titles.AddAsync(MediaType.Movie, 603)),
        new("POST", "/titles/tv/1399/search", null, "title-search", ServerChange.Library, api => api.Titles.SearchNowAsync(MediaType.Tv, 1399)),
        new("PUT", "/titles/movie/603/monitored", """{"monitored":false}""", "title-monitored", ServerChange.Library,
            api => api.Titles.SetMonitoredAsync(false, MediaType.Movie, 603)),
        new("POST", "/titles/movie/603/relink", """{"imdbId":"tt0133093"}""", "title-relink", ServerChange.Library | ServerChange.Requests,
            api => api.Titles.RelinkAsync(MediaType.Movie, 603, RelinkTarget.Imdb("tt0133093"))),
        new("POST", "/titles/tv/1399/request", null, "request-created", ServerChange.Requests | ServerChange.Library,
            api => api.Titles.RequestAsync(MediaType.Tv, 1399)),
        new("POST", "/titles/tv/1399/add", """{"is4k":true}""", "title-add", ServerChange.Library | ServerChange.Requests,
            api => api.Titles.AddFourKAsync(MediaType.Tv, 1399)),
        new("POST", "/titles/movie/603/request", """{"is4k":true}""", "request-created", ServerChange.Requests | ServerChange.Library,
            api => api.Titles.RequestFourKAsync(MediaType.Movie, 603)),
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
        ServerChangedEventArgs? raised = null;
        events.Changed += (_, args) => raised = args;
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub), events);

        await testCase.Call(api);

        var request = Assert.Single(stub.Requests);
        Assert.Equal(testCase.Method, request.Method.Method);
        Assert.Equal("/api/v1" + testCase.Path, request.Path);
        Assert.Empty(request.Query);
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

        // Reads never signal a change; each mutation records exactly the
        // areas the Mac does, so the right screens (and only those) reload.
        if (testCase.Changes == ServerChange.None)
        {
            Assert.Null(raised);
            Assert.Equal(0, events.Revision(ServerChange.All));
        }
        else
        {
            Assert.NotNull(raised);
            Assert.Equal(testCase.Changes, raised.Change);
            Assert.Equal(ServerChangeSource.Mutation, raised.Source);
            // Each recorded area moved by one, and nothing else moved.
            Assert.Equal(BitOperations.PopCount((uint)testCase.Changes), events.Revision(testCase.Changes));
            Assert.Equal(0, events.Revision(ServerChange.All & ~testCase.Changes));
        }
    }

    [Fact]
    public async Task SetMonitoredReturnsTheNewState()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerFixture("title-monitored");
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub));

        Assert.False(await api.Titles.SetMonitoredAsync(false, MediaType.Movie, 603));
    }

    [Fact]
    public async Task RelinkReturnsTheNewTmdbId()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerFixture("title-relink");
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub));

        Assert.Equal(604, await api.Titles.RelinkAsync(MediaType.Movie, 603, RelinkTarget.Tmdb(604)));
        Assert.True(JsonNode.DeepEquals(JsonNode.Parse("""{"tmdbId":604}"""), Assert.Single(stub.Requests).JsonBody));
    }

    [Fact]
    public void RelinkTargetsPutExactlyOneKeyOnTheWire()
    {
        Assert.Equal("""{"tmdbId":604}""", Json.EncodeBodyToString(RelinkTarget.Tmdb(604)));
        Assert.Equal("""{"imdbId":"tt0133093"}""", Json.EncodeBodyToString(RelinkTarget.Imdb("tt0133093")));
        Assert.Equal("""{"tvdbId":121361}""", Json.EncodeBodyToString(RelinkTarget.Tvdb(121361)));
    }

    [Fact]
    public async Task RequestReturnsTheNewRequestId()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerFixture("request-created");
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub));

        var id = await api.Titles.RequestAsync(MediaType.Tv, 1399);

        Assert.Equal(Guid.Parse("28713d50-27f2-4230-9c95-c1e6a000f6c0"), id);
    }

    [Fact]
    public async Task FailedAddRecordsNothing()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(409, """{"error":"Connect Radarr in Settings first.","code":"conflict"}""");
        var events = new ServerEvents();
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub), events);

        var error = await Assert.ThrowsAsync<ApiException>(() => api.Titles.AddAsync(MediaType.Movie, 603));

        Assert.Equal(ApiErrorKind.Conflict, error.Kind);
        Assert.Equal("Connect Radarr in Settings first.", error.ServerMessage);
        Assert.False(error.IsSonarrUnresolvable);
        Assert.Equal(0, events.Revision(ServerChange.All));
    }

    [Fact]
    public async Task AddingAShowWithoutATvdbIdIsSonarrUnresolvable()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(409, """{"error":"Couldn't resolve this show for Sonarr.","code":"conflict"}""");
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub));

        var error = await Assert.ThrowsAsync<ApiException>(() => api.Titles.AddAsync(MediaType.Tv, 1399));

        Assert.True(error.IsSonarrUnresolvable);
    }

    [Fact]
    public void TitlePathsEncodeTheTypeSegment()
    {
        Assert.Equal("/titles/movie/603", TitlesEndpoints.Path(MediaType.Movie, 603));
        Assert.Equal("/titles/tv/1399", TitlesEndpoints.Path(MediaType.Tv, 1399));
        // An unknown type goes to the server as-is (it answers 404), but can
        // never escape its segment.
        Assert.Equal("/titles/music/1", TitlesEndpoints.Path(MediaType.FromValue("music"), 1));
        Assert.Equal("/titles/a%2Fb/1", TitlesEndpoints.Path(MediaType.FromValue("a/b"), 1));
    }
}
