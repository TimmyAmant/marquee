using System.Text.Json.Nodes;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// A household member's "Request all N missing" on a franchise row, as the
// Mac's RequestAllMissingTests: the optional franchise.requestAllMissing
// (missing from an older server hides the button), the button's words, the
// result, and the one POST it sends.

public sealed class RequestAllMissingTests
{
    private static readonly Uri Base = new("http://127.0.0.1:3000");

    /// <summary>The doc's title detail with its franchise edited.</summary>
    private static TitleDetail Detail(Action<JsonObject> edit)
    {
        var json = JsonNode.Parse(Fixtures.Read("title-detail"))!.AsObject();
        edit(json["franchise"]!.AsObject());
        return Json.Decode<TitleDetail>(json.ToJsonString());
    }

    [Fact]
    public void DecodesWithAndWithoutTheField()
    {
        var member = Detail(franchise =>
        {
            franchise["addAllMissing"] = new JsonArray();
            franchise["requestAllMissing"] = new JsonArray(
                new JsonObject { ["mediaType"] = "movie", ["tmdbId"] = 57800 },
                new JsonObject { ["mediaType"] = "movie", ["tmdbId"] = 278154 });
        });
        Assert.Equal([new TitleId(MediaType.Movie, 57800), new TitleId(MediaType.Movie, 278154)], member.Franchise!.RequestAllMissing);
        Assert.Equal(2, member.Franchise.RequestAllCount);

        var older = Detail(franchise => franchise.Remove("requestAllMissing"));
        Assert.Null(older.Franchise!.RequestAllMissing);
        Assert.Equal(0, older.Franchise.RequestAllCount);

        // The doc's example is the admin's view: nothing to request.
        var admin = Fixtures.Decode<TitleDetail>("title-detail");
        Assert.Empty(admin.Franchise!.RequestAllMissing!);
        Assert.Equal(0, admin.Franchise.RequestAllCount);
    }

    [Fact]
    public void ButtonWords()
    {
        Assert.Equal("Request all 4 missing", TitleFranchise.RequestAllLabel(4, busy: false));
        Assert.Equal("Requesting…", TitleFranchise.RequestAllLabel(4, busy: true));
        Assert.Equal("Request all 4 missing titles?", TitleFranchise.RequestAllConfirmation(4));
        Assert.Equal("Request all 1 missing title?", TitleFranchise.RequestAllConfirmation(1));
    }

    [Fact]
    public void ResultDecodes()
    {
        var result = Fixtures.Decode<RequestAllMissingResult>("request-all-missing");
        Assert.Equal(4, result.Total);
        Assert.Equal(2, result.Requested);
        Assert.Equal([57800, 278154], result.Refused.Select(refusal => refusal.TmdbId));
        Assert.Equal(MediaType.Movie, result.Refused[0].MediaType);
        Assert.StartsWith("Requested 2 of 4.", result.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task SendsOnePostWithNoBodyAndRecordsTheChange()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerFixture("request-all-missing");
        var events = new ServerEvents();
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub), events);

        var result = await api.Titles.RequestAllMissingAsync(MediaType.Movie, 425);

        var request = Assert.Single(stub.Requests);
        Assert.Equal("POST", request.Method.Method);
        Assert.Equal("/api/v1/titles/movie/425/request-all-missing", request.Path);
        Assert.Equal("", request.Body);
        Assert.Equal(1, events.Revision(ServerChange.Requests));
        Assert.Equal(1, events.Revision(ServerChange.Library));
        Assert.Equal(2, result.Requested);
    }

    [Fact]
    public async Task TheAdminIsTurnedAway()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(403, """{"error":"The admin adds titles straight to the library — use Add all.","code":"forbidden"}""");
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub));

        var error = await Assert.ThrowsAsync<ApiException>(() => api.Titles.RequestAllMissingAsync(MediaType.Movie, 425));
        Assert.Equal(ApiErrorKind.Forbidden, error.Kind);
    }
}
