using System.Text.Json.Nodes;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// "Trakt lists" (api-v1.md section 11, 0.49+): the fixture, each
// /trakt-syncs call's method, path, query, body and recorded change, and the
// card's words and add-form rules.

public sealed class TraktSyncsTests
{
    private static readonly Uri Base = new("http://127.0.0.1:3000");
    private const string Token = "mqt_testtesttesttesttesttesttesttesttesttesttes";

    // Uppercase on purpose: the path carries the lowercase form.
    private static readonly Guid SyncId = Guid.Parse("0F9E8D7C-6B5A-4F3E-9D2C-1B0A9F8E7D6C");
    private static readonly Guid AnnaId = Guid.Parse("83c55a49-6153-4cb9-ae22-4a42d48f4cf3");

    private static MarqueeApi Api(StubHttpMessageHandler stub, ServerEvents? events = null) =>
        new(new ApiClient(Base, Token, stub), events);

    private static string Read(string name) => Fixtures.Read(name).Replace("\r\n", "\n", StringComparison.Ordinal);

    private static string OneSync() => JsonNode.Parse(Read("trakt-syncs"))!["results"]![0]!.ToJsonString();

    [Fact]
    public void FixtureDecodes()
    {
        var syncs = Fixtures.Decode<TraktSyncs>("trakt-syncs");
        Assert.True(syncs.Available);
        Assert.Equal(10, syncs.MaxPerMember);

        var sync = Assert.Single(syncs.Results);
        Assert.Equal(SyncId, sync.Id);
        Assert.Equal(TraktSyncKind.List, sync.Kind);
        Assert.Equal("https://trakt.tv/users/someone/lists/best-of-2024", sync.Url);
        Assert.Equal("Best of 2024", sync.Name);
        Assert.True(sync.Movies);
        Assert.False(sync.Tv);
        Assert.Equal(Json.ParseDate("2026-09-25T18:40:05.000Z"), sync.LastSyncedAt);
        Assert.Null(sync.LastError);
        Assert.Equal(4, sync.RequestedCount);
        Assert.Equal(Json.ParseDate("2026-09-20T09:12:44.000Z"), sync.CreatedAt);
        Assert.Equal(AnnaId, sync.Owner.Id);
        Assert.Equal("anna", sync.Owner.Username);
        Assert.Equal("Anna", sync.Owner.Label);
        Assert.Equal("anna", (sync.Owner with { DisplayName = null }).Label);
    }

    [Fact]
    public void AnUnknownKindDecodes()
    {
        var json = Read("trakt-syncs").Replace("\"kind\": \"list\"", "\"kind\": \"collection\"", StringComparison.Ordinal);
        Assert.False(Json.Decode<TraktSyncs>(json).Results[0].Kind.IsKnown);
    }

    [Fact]
    public void Summaries()
    {
        var sync = Fixtures.Decode<TraktSyncs>("trakt-syncs").Results[0];
        var now = Json.ParseDate("2026-09-25T18:45:05.000Z")!.Value;

        Assert.Equal("Checked 5m ago · 4 titles requested so far", sync.Summary(now));
        Assert.Equal("Checked 5m ago · 1 title requested so far", (sync with { RequestedCount = 1 }).Summary(now));
        Assert.Equal("Checked 5m ago", (sync with { RequestedCount = 0 }).Summary(now));
        Assert.Equal("Not checked yet", (sync with { LastSyncedAt = null, RequestedCount = 0 }).Summary(now));
    }

    [Fact]
    public void OwnerLineOnlyForSomeoneElses()
    {
        var sync = Fixtures.Decode<TraktSyncs>("trakt-syncs").Results[0];
        Assert.Null(TraktSyncLabels.OwnerLine(sync, AnnaId));
        Assert.Equal("Requests as Anna", TraktSyncLabels.OwnerLine(sync, Guid.NewGuid()));
    }

    [Fact]
    public void TheAddForm()
    {
        var (request, error) = TraktSyncLabels.AddRequest(" https://trakt.tv/users/someone/watchlist ", movies: true, tv: false, requestExisting: true);
        Assert.Null(error);
        Assert.True(JsonNode.DeepEquals(
            JsonNode.Parse("""{"url":"https://trakt.tv/users/someone/watchlist","movies":true,"tv":false,"requestExisting":true}"""),
            JsonNode.Parse(Json.EncodeBodyToString(request!))));

        Assert.Equal(TraktSyncLabels.BlankLinkMessage, TraktSyncLabels.AddRequest("  ", true, true, false).Error);
        Assert.Equal("Pick movies, TV shows or both.", TraktSyncLabels.AddRequest("https://trakt.tv/users/a/watchlist", false, false, false).Error);
    }

    // MARK: Requests

    private sealed record Case(string Method, string Path, IReadOnlyDictionary<string, string> Query, string? Body, string Response, ServerChange Records, Func<MarqueeApi, Task> Call);

    private static IReadOnlyDictionary<string, string> Query(params (string Key, string Value)[] pairs) =>
        pairs.ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.Ordinal);

    private static readonly IReadOnlyDictionary<string, string> NoQuery = Query();
    private const string SyncPath = "/trakt-syncs/0f9e8d7c-6b5a-4f3e-9d2c-1b0a9f8e7d6c";

    private static readonly Case[] Cases =
    [
        new("GET", "/trakt-syncs", NoQuery, null, "trakt-syncs", ServerChange.None, api => api.TraktSyncs.ListAsync()),
        new("GET", "/trakt-syncs", Query(("all", "true")), null, "trakt-syncs", ServerChange.None, api => api.TraktSyncs.ListAsync(all: true)),
        new("POST", "/trakt-syncs", NoQuery,
            """{"url":"https://trakt.tv/users/someone/watchlist","movies":true,"tv":true,"requestExisting":false}""",
            "sync", ServerChange.Requests,
            api => api.TraktSyncs.AddAsync(new NewTraktSyncRequest(" https://trakt.tv/users/someone/watchlist ", true, true, false))),
        new("POST", "/trakt-syncs", NoQuery, """{"url":"https://trakt.tv/users/someone/watchlist"}""", "sync", ServerChange.Requests,
            api => api.TraktSyncs.AddAsync(new NewTraktSyncRequest("https://trakt.tv/users/someone/watchlist"))),
        new("PATCH", SyncPath, NoQuery, """{"tv":true}""", "sync", ServerChange.None,
            api => api.TraktSyncs.SetTypesAsync(SyncId, movies: null, tv: true)),
        new("POST", SyncPath + "/sync", NoQuery, null, "sync", ServerChange.Requests, api => api.TraktSyncs.SyncAsync(SyncId)),
        new("DELETE", SyncPath, NoQuery, null, "ok", ServerChange.None, api => api.TraktSyncs.RemoveAsync(SyncId)),
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
        if (testCase.Response == "sync")
        {
            stub.AnswerJson(200, OneSync());
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
            Assert.True(request.Query.TryGetValue(key, out var actual), $"missing ?{key}");
            Assert.Equal(value, actual);
        }
        Assert.Equal("Bearer " + Token, request.Authorization);
        if (testCase.Body is { } expected)
        {
            Assert.Equal("application/json", request.ContentType);
            Assert.True(JsonNode.DeepEquals(JsonNode.Parse(expected), request.JsonBody), request.Body);
        }
        else
        {
            Assert.Equal("", request.Body);
        }
        foreach (var area in new[] { ServerChange.Library, ServerChange.Requests, ServerChange.Integrations })
        {
            Assert.Equal(testCase.Records.HasFlag(area) ? 1 : 0, events.Revision(area));
        }
    }

    [Fact]
    public async Task AnOlderServerIsNull()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(404, """{"error":"Not found.","code":"not_found"}""");

        Assert.Null(await Api(stub).TraktSyncs.ListAsync());
    }

    [Fact]
    public async Task CheckNowTooOftenIsRateLimitedWithTheServersWords()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(429, """{"error":"Checked a moment ago. Try again in a minute.","code":"rate_limited"}""");
        var events = new ServerEvents();

        var error = await Assert.ThrowsAsync<ApiException>(() => Api(stub, events).TraktSyncs.SyncAsync(SyncId));

        Assert.Equal(ApiErrorKind.RateLimited, error.Kind);
        Assert.Equal("Checked a moment ago. Try again in a minute.", error.Message);
        Assert.Equal(0, events.Revision(ServerChange.All));
    }

    [Fact]
    public async Task EveryonesListIsTheAdminsOnly()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(403, """{"error":"Only the admin can see everyone's Trakt lists.","code":"forbidden"}""");

        var error = await Assert.ThrowsAsync<ApiException>(() => Api(stub).TraktSyncs.ListAsync(all: true));
        Assert.Equal(ApiErrorKind.Forbidden, error.Kind);
    }
}
