using System.Text.Json.Nodes;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// The request blocklist (0.41+): the title's viewer.blocked in the shared
// fixtures, an older server that leaves it out, the Settings list, and each
// call's method, path, body and recorded change.

public sealed class BlocklistTests
{
    private static readonly Uri Base = new("http://127.0.0.1:3000");
    private const string Token = "mqt_testtesttesttesttesttesttesttesttesttesttes";
    private const string Ok = """{"ok":true}""";

    // Uppercase on purpose: the path carries the lowercase form.
    private static readonly Guid EntryId = Guid.Parse("5C1D3A2E-8F7B-4E6D-9A0B-1C2D3E4F5A6B");

    private const string ListJson = """
        { "results": [
          { "id": "0e6f2b1a-3c4d-4e5f-8a9b-0c1d2e3f4a5b", "kind": "keyword", "mediaType": null, "tmdbId": null,
            "title": null, "keyword": "anime", "reason": null, "createdAt": "2026-09-20T10:00:00.000Z" },
          { "id": "5c1d3a2e-8f7b-4e6d-9a0b-1c2d3e4f5a6b", "kind": "title", "mediaType": "movie", "tmdbId": 438631,
            "title": "Dune", "keyword": null, "reason": "Already on Max.", "createdAt": "2026-09-21T10:00:00.000Z" }
        ] }
        """;

    [Fact]
    public void BlockedTitleStatusDecodes()
    {
        var viewer = Fixtures.Decode<TitleStatus>("title-status").Viewer;
        Assert.NotNull(viewer.Blocked);
        Assert.Equal("Already on Max.", viewer.Blocked.Reason);
        Assert.Null(viewer.Blocked.Keyword);
        Assert.Equal("Requests are closed for this title — Already on Max.", viewer.Blocked.MemberLine);
        Assert.Null(viewer.Blocked.KeywordLine);
        Assert.False(viewer.CanRequest);
    }

    [Fact]
    public void UnblockedTitleDecodesAsNull()
    {
        var detail = Fixtures.Decode<TitleDetail>("title-detail");
        Assert.Null(detail.Viewer.Blocked);
        Assert.True(detail.Viewer.HasBlocklist);
        Assert.True(Fixtures.Decode<TitleStatus>("title-status").Viewer.HasBlocklist);

        // A status refresh carries it over, and `with` keeps it.
        var updated = detail.Updating(Fixtures.Decode<TitleStatus>("title-status"));
        Assert.NotNull(updated.Viewer.Blocked);
        Assert.True((detail.Viewer with { CanAdd = false }).HasBlocklist);
    }

    [Fact]
    public void OlderServerWithoutBlockedDecodes()
    {
        var json = JsonNode.Parse(Fixtures.Read("title-status"))!.AsObject();
        json["viewer"]!.AsObject().Remove("blocked");
        var viewer = Json.Decode<TitleStatus>(json.ToJsonString()).Viewer;
        Assert.Null(viewer.Blocked);
        Assert.False(viewer.HasBlocklist);
    }

    [Fact]
    public void BlockLines()
    {
        var byKeyword = Json.Decode<TitleBlock>("""{"reason":null,"keyword":"anime"}""");
        Assert.Equal("Requests blocked by “anime”", byKeyword.KeywordLine);
        Assert.Equal("Requests are closed for this title", byKeyword.MemberLine);
        Assert.Equal("Requests are closed for this title", new TitleBlock { Reason = "  " }.MemberLine);
    }

    [Fact]
    public void ListDecodes()
    {
        var list = Json.Decode<ListResponse<BlocklistEntry>>(ListJson).Results;
        Assert.Equal(2, list.Count);

        var keyword = list[0];
        Assert.Equal(BlocklistKind.Keyword, keyword.Kind);
        Assert.Null(keyword.MediaType);
        Assert.Null(keyword.TitleId);
        Assert.Equal("Keyword: anime", keyword.Label);
        Assert.Null(keyword.Reason);

        var title = list[1];
        Assert.Equal(EntryId, title.Id);
        Assert.Equal(BlocklistKind.Title, title.Kind);
        Assert.Equal(new TitleId(MediaType.Movie, 438631), title.TitleId);
        Assert.Equal("Dune", title.Label);
        Assert.Equal("#438631", (title with { Title = null }).Label);
        Assert.Equal("Already on Max.", title.Reason);
        Assert.Equal(Json.ParseDate("2026-09-21T10:00:00.000Z"), title.CreatedAt);
    }

    [Fact]
    public void AnUnknownKindDecodes()
    {
        var json = ListJson.Replace("\"keyword\", \"mediaType\"", "\"collection\", \"mediaType\"");
        var entry = Json.Decode<ListResponse<BlocklistEntry>>(json).Results[0];
        Assert.False(entry.Kind.IsKnown);
    }

    /// <param name="Body">Expected JSON body; null means no body at all.</param>
    private sealed record Case(string Method, string Path, string? Body, string Response, Func<MarqueeApi, Task> Call, string? Label = null)
    {
        public string Name => Label ?? $"{Method} {Path}";
    }

    private static readonly Case[] Cases =
    [
        new("POST", "/titles/movie/438631/block", null, Ok, api => api.Blocklist.BlockTitleAsync(MediaType.Movie, 438631)),
        new("POST", "/titles/tv/1396/block", """{"reason":"Already on Max."}""", Ok,
            api => api.Blocklist.BlockTitleAsync(MediaType.Tv, 1396, " Already on Max. "), Label: "POST block with a reason"),
        new("POST", "/titles/tv/1396/block", null, Ok,
            api => api.Blocklist.BlockTitleAsync(MediaType.Tv, 1396, "   "), Label: "POST block with a blank reason"),
        new("DELETE", "/titles/movie/438631/block", null, Ok, api => api.Blocklist.UnblockTitleAsync(MediaType.Movie, 438631)),
        new("GET", "/settings/blocklist", null, ListJson, api => api.Blocklist.ListAsync()),
        new("POST", "/settings/blocklist", """{"keyword":"anime","reason":"Not for the kids."}""", Ok,
            api => api.Blocklist.BlockKeywordAsync(" anime ", "Not for the kids.")),
        new("POST", "/settings/blocklist", """{"keyword":"reality"}""", Ok,
            api => api.Blocklist.BlockKeywordAsync("reality", ""), Label: "POST keyword without a reason"),
        new("DELETE", "/settings/blocklist/5c1d3a2e-8f7b-4e6d-9a0b-1c2d3e4f5a6b", null, Ok, api => api.Blocklist.RemoveAsync(EntryId)),
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
        stub.AnswerJson(200, testCase.Response);
        var events = new ServerEvents();
        var raised = new List<ServerChangedEventArgs>();
        events.Changed += (_, args) => raised.Add(args);
        var api = new MarqueeApi(new ApiClient(Base, Token, stub), events);

        await testCase.Call(api);

        var request = Assert.Single(stub.Requests);
        Assert.Equal(testCase.Method, request.Method.Method);
        Assert.Equal("/api/v1" + testCase.Path, request.Path);
        Assert.Empty(request.Query);
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

        if (testCase.Method == "GET")
        {
            Assert.Empty(raised);
        }
        else
        {
            var change = Assert.Single(raised);
            Assert.Equal(ServerChange.Library | ServerChange.Requests, change.Change);
        }
    }

    [Fact]
    public async Task AnOlderServersNotFoundSurfaces()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(404, """{"error":"Not found","code":"not_found"}""");
        var api = new MarqueeApi(new ApiClient(Base, Token, stub));
        var error = await Assert.ThrowsAsync<ApiException>(() => api.Blocklist.ListAsync());
        Assert.Equal(ApiErrorKind.NotFound, error.Kind);
    }
}
