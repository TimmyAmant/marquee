using System.Text.Json.Nodes;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// "Request from my Plex Watchlist": the doc's example decoded, the request
// each call sends, the approval poll's answers, and an older server's 404.

public sealed class PlexWatchlistDecodingTests
{
    [Fact]
    public void FixtureDecodes()
    {
        var state = Fixtures.Decode<PlexWatchlist>("plex-watchlist");
        Assert.True(state.Available);
        Assert.True(state.Enabled);
        Assert.True(state.Movies);
        Assert.False(state.Tv);
        Assert.Equal(new DateTimeOffset(2026, 9, 25, 18, 40, 5, TimeSpan.Zero), state.LastSyncedAt);
        Assert.Null(state.LastError);
        Assert.Equal(3, state.RequestedCount);
    }

    [Fact]
    public void NeverCheckedAndSwitchedOff()
    {
        var state = Json.Decode<PlexWatchlist>("""{"available":true,"enabled":false,"movies":true,"tv":true,"lastSyncedAt":null,"lastError":"Plex stopped accepting Marquee's access to your watchlist.","requestedCount":0}""");
        Assert.False(state.Enabled);
        Assert.Null(state.LastSyncedAt);
        Assert.Equal("Plex stopped accepting Marquee's access to your watchlist.", state.LastError);
    }

    [Fact]
    public void SummaryReadsLikeTheWebsite()
    {
        var now = new DateTimeOffset(2026, 9, 25, 18, 45, 30, TimeSpan.Zero);
        var state = Fixtures.Decode<PlexWatchlist>("plex-watchlist");
        Assert.Equal("Checked 5m ago · 3 titles requested so far", state.Summary(now));
        Assert.Equal("Checked 5m ago · 1 title requested so far", (state with { RequestedCount = 1 }).Summary(now));
        Assert.Equal("Checked 5m ago", (state with { RequestedCount = 0 }).Summary(now));
        Assert.Equal("Checking your watchlist…", (state with { LastSyncedAt = null, RequestedCount = 0 }).Summary(now));
        Assert.Equal("Checking your watchlist… · 3 titles requested so far", (state with { LastSyncedAt = null }).Summary(now));
    }

    [Fact]
    public void TypesBodyLeavesOutWhatIsntChanging()
    {
        Assert.Equal("""{"movies":false}""", Json.EncodeBodyToString(new PlexWatchlistTypesRequest(false, null)));
        Assert.Equal("""{"tv":true}""", Json.EncodeBodyToString(new PlexWatchlistTypesRequest(null, true)));
    }
}

public sealed class PlexWatchlistRequestTests
{
    private static readonly Uri Base = new("http://127.0.0.1:3000");
    private const string Token = "mqt_testtesttesttesttesttesttesttesttesttesttes";
    private const string StartJson = """{"handle":"h_123","authUrl":"https://app.plex.tv/auth#?code=ABCD","expiresAt":"2099-01-01T00:00:00.000Z"}""";
    private const string OffJson = """{"available":true,"enabled":false,"movies":true,"tv":true,"lastSyncedAt":null,"lastError":null,"requestedCount":0}""";

    /// <param name="Body">Expected JSON body; null means no body at all.</param>
    /// <param name="Changes">What a success records for the screens.</param>
    private sealed record Case(string Name, string Method, string Path, string? Body, int Status, string Response, ServerChange Changes, Func<MarqueeApi, Task> Call);

    private static string State => Fixtures.Read("plex-watchlist");

    private static readonly Case[] Cases =
    [
        new("status", "GET", "/me/plex-watchlist", null, 200, State, ServerChange.None, async api =>
            Assert.Equal(3, (await api.PlexWatchlist.StatusAsync()).RequestedCount)),
        new("start", "POST", "/me/plex-watchlist/start", null, 200, StartJson, ServerChange.None, async api =>
            Assert.NotNull((await api.PlexWatchlist.StartAsync()).Url)),
        new("poll pending", "POST", "/me/plex-watchlist/poll", """{"handle":"h_123"}""", 202, """{"status":"pending"}""", ServerChange.None, async api =>
            Assert.Null(await api.PlexWatchlist.PollAsync("h_123"))),
        new("poll done", "POST", "/me/plex-watchlist/poll", """{"handle":"h_123"}""", 200, State, ServerChange.None, async api =>
            Assert.True((await api.PlexWatchlist.PollAsync("h_123"))!.Enabled)),
        new("movies off", "PATCH", "/me/plex-watchlist", """{"movies":false}""", 200, State, ServerChange.None, async api =>
            Assert.True((await api.PlexWatchlist.SetTypesAsync(false, null)).Available)),
        new("tv on", "PATCH", "/me/plex-watchlist", """{"tv":true}""", 200, State, ServerChange.None, api =>
            api.PlexWatchlist.SetTypesAsync(null, true)),
        new("sync", "POST", "/me/plex-watchlist/sync", null, 200, State, ServerChange.Requests, async api =>
            Assert.NotNull((await api.PlexWatchlist.SyncAsync()).LastSyncedAt)),
        new("disable", "DELETE", "/me/plex-watchlist", null, 200, OffJson, ServerChange.None, async api =>
            Assert.False((await api.PlexWatchlist.DisableAsync()).Enabled)),
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
    public async Task SendsWhatTheContractSpecifies(string name)
    {
        var testCase = Cases.Single(candidate => candidate.Name == name);
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(testCase.Status, testCase.Response);
        var events = new ServerEvents();
        var api = new MarqueeApi(new ApiClient(Base, Token, stub), events);

        await testCase.Call(api);

        var request = Assert.Single(stub.Requests);
        Assert.Equal(testCase.Method, request.Method.Method);
        Assert.Equal("/api/v1" + testCase.Path, request.Path);
        Assert.Empty(request.Query);
        Assert.Equal("Bearer " + Token, request.Authorization);
        if (testCase.Body is { } expected)
        {
            Assert.Equal("application/json", request.ContentType);
            Assert.True(JsonNode.DeepEquals(JsonNode.Parse(expected), request.JsonBody), $"{name} body was {request.Body}");
        }
        else
        {
            Assert.Equal("", request.Body);
        }
        Assert.Equal(testCase.Changes != ServerChange.None, events.Revision(ServerChange.All) != 0);
        if (testCase.Changes != ServerChange.None)
        {
            Assert.NotEqual(0, events.Revision(testCase.Changes));
        }
    }

    [Fact]
    public async Task AnOlderServersNotFoundMeansUnavailable()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(404, """{"error":"Not found","code":"not_found"}""");
        var api = new MarqueeApi(new ApiClient(Base, Token, stub));

        var state = await api.PlexWatchlist.StatusAsync();
        Assert.Same(PlexWatchlist.Unavailable, state);
        Assert.False(state.Available);
        Assert.False(state.Enabled);
    }

    [Fact]
    public async Task OtherStatusFailuresStillThrow()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(500, """{"error":"Boom","code":"internal"}""");
        var api = new MarqueeApi(new ApiClient(Base, Token, stub));
        var error = await Assert.ThrowsAsync<ApiException>(() => api.PlexWatchlist.StatusAsync());
        Assert.Equal(ApiErrorKind.Server, error.Kind);
    }

    [Fact]
    public async Task PollAnswers()
    {
        var stub = new StubHttpMessageHandler();
        var api = new MarqueeApi(new ApiClient(Base, Token, stub));

        stub.AnswerJson(410, """{"error":"Expired","code":"expired"}""");
        var expired = await Assert.ThrowsAsync<ApiException>(() => api.PlexWatchlist.PollAsync("h"));
        Assert.Equal(ApiErrorKind.Expired, expired.Kind);
        Assert.Equal("The Plex sign-in expired. Try again.", expired.Message);

        stub.AnswerJson(403, """{"error":"That's a different Plex account from the one linked here. Sign in to plex.tv as that one.","code":"forbidden"}""");
        var other = await Assert.ThrowsAsync<ApiException>(() => api.PlexWatchlist.PollAsync("h"));
        Assert.Equal(ApiErrorKind.Forbidden, other.Kind);
        Assert.Equal("That's a different Plex account from the one linked here. Sign in to plex.tv as that one.", other.Message);

        stub.AnswerJson(409, """{"error":"Link your Plex account first.","code":"conflict"}""");
        var unlinked = await Assert.ThrowsAsync<ApiException>(() => api.PlexWatchlist.PollAsync("h"));
        Assert.Equal(ApiErrorKind.Conflict, unlinked.Kind);
        Assert.Equal("Link your Plex account first.", unlinked.Message);
    }

    [Fact]
    public async Task PendingPendingThenOn()
    {
        var stub = new StubHttpMessageHandler();
        var polls = 0;
        stub.Answer(request =>
        {
            Assert.Equal("/api/v1/me/plex-watchlist/poll", request.Path);
            return Interlocked.Increment(ref polls) < 3
                ? StubHttpMessageHandler.Json(202, """{"status":"pending"}""")
                : StubHttpMessageHandler.Json(200, Fixtures.Read("plex-watchlist"));
        });
        var api = new MarqueeApi(new ApiClient(Base, Token, stub));

        var state = await PlexPoll.RunAsync(
            DateTimeOffset.UtcNow.AddMinutes(10),
            token => api.PlexWatchlist.PollAsync("h_123", token),
            TimeSpan.FromMilliseconds(10));
        Assert.Equal(3, polls);
        Assert.True(state.Enabled);
    }

    [Fact]
    public async Task CheckNowTooOftenSaysSo()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(429, """{"error":"Checked a moment ago. Try again in a minute.","code":"rate_limited"}""");
        var events = new ServerEvents();
        var api = new MarqueeApi(new ApiClient(Base, Token, stub), events);

        var error = await Assert.ThrowsAsync<ApiException>(() => api.PlexWatchlist.SyncAsync());
        Assert.Equal(ApiErrorKind.RateLimited, error.Kind);
        Assert.Equal("Checked a moment ago. Try again in a minute.", error.Message);
        Assert.Equal(0, events.Revision(ServerChange.All));
    }

    [Fact]
    public async Task StartBeforeLinkingPlexIsAConflict()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(409, """{"error":"Link your Plex account first.","code":"conflict"}""");
        var api = new MarqueeApi(new ApiClient(Base, Token, stub));
        var error = await Assert.ThrowsAsync<ApiException>(() => api.PlexWatchlist.StartAsync());
        Assert.Equal("Link your Plex account first.", error.Message);
    }
}
