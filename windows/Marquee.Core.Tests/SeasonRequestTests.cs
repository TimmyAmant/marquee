using System.Text.Json.Nodes;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// Season requests, as the Mac's SeasonRequestTests: the new optional fields
// decoded from a current server and from one that predates them, the request
// body, the local seasons label, the title page's Request button and the
// picker's selection.
//
// The doc fixtures are rewritten from docs/api-v1.md by
// mac/Scripts/extract-api-fixtures.py (which deletes every other .json in
// that folder), so the season shapes are built here: each case starts from
// a doc example and sets or strips the new keys explicitly, which keeps both
// the "new server" and "old server" cases honest whatever the doc says later.

public sealed class SeasonRequestTests
{
    private static readonly Uri Base = new("http://127.0.0.1:3000");
    private static readonly string[] SeasonKeys = ["monitored", "requested", "requestable"];
    private static readonly string[] ViewerKeys = ["canRequestSeasons", "requestedSeasons"];
    private static readonly string[] RequestKeys = ["seasons", "seasonsLabel"];

    private static JsonObject Fixture(string name) => JsonNode.Parse(Fixtures.Read(name))!.AsObject();

    private static T Decode<T>(JsonNode node) => Json.Decode<T>(node.ToJsonString());

    private static JsonObject Season(
        int number, int episodes = 8, int? have = null, int? total = null,
        bool? monitored = null, bool requested = false, bool requestable = true) => new()
    {
        ["seasonNumber"] = number,
        ["name"] = number == 0 ? "Specials" : $"Season {number}",
        ["episodeCount"] = episodes,
        ["airDate"] = null,
        ["posterPath"] = null,
        ["have"] = have,
        ["total"] = total,
        ["monitored"] = monitored,
        ["requested"] = requested,
        ["requestable"] = requestable,
    };

    private static JsonObject NewViewer(bool canRequestSeasons = true, int[]? requestedSeasons = null) => new()
    {
        ["canRequestSeasons"] = canRequestSeasons,
        ["requestedSeasons"] = requestedSeasons == null ? null : new JsonArray(requestedSeasons.Select(n => (JsonNode?)n).ToArray()),
    };

    /// <summary>The doc's title as a TV show with <paramref name="seasons"/>; a null <paramref name="viewer"/> strips the new keys (an older server).</summary>
    private static TitleDetail TvDetail(
        IEnumerable<JsonObject> seasons,
        JsonObject? viewer,
        bool canRequest = true,
        string status = "untracked",
        bool alreadyRequested = false,
        string? requestStatus = null)
    {
        var json = Fixture("title-detail");
        json["mediaType"] = "tv";
        json["seasons"] = new JsonArray(seasons.Select(season => (JsonNode?)season).ToArray());
        json["library"]!["status"] = status;
        var viewerJson = json["viewer"]!.AsObject();
        foreach (var key in ViewerKeys)
        {
            viewerJson.Remove(key);
        }
        if (viewer != null)
        {
            foreach (var (key, value) in viewer.ToList())
            {
                viewer.Remove(key);
                viewerJson[key] = value;
            }
        }
        viewerJson["canRequest"] = canRequest;
        viewerJson["alreadyRequested"] = alreadyRequested;
        viewerJson["requestStatus"] = requestStatus;
        viewerJson["isAdmin"] = false;
        viewerJson["canAdd"] = false;
        return Decode<TitleDetail>(json);
    }

    // MARK: Decoding

    [Fact]
    public void SeasonFieldsDecode()
    {
        var detail = TvDetail(
            [
                Season(3),
                Season(2, monitored: true, requestable: false),
                Season(1, have: 10, total: 10, monitored: true, requestable: false),
                Season(0, requested: true, requestable: false),
            ],
            NewViewer(requestedSeasons: [1, 2, 3]));

        Assert.True(detail.Viewer.CanRequestSeasons);
        Assert.Equal([1, 2, 3], detail.Viewer.RequestedSeasons!);
        Assert.Equal(new bool?[] { true, false, false, false }, detail.Seasons.Select(season => season.Requestable));
        Assert.Equal(new bool?[] { null, true, true, null }, detail.Seasons.Select(season => season.Monitored));
        Assert.Equal(
            [SeasonRequestState.Requestable, SeasonRequestState.Monitored, SeasonRequestState.InLibrary, SeasonRequestState.Requested],
            detail.Seasons.Select(season => season.RequestState));
        Assert.Equal(["", "Monitored", "In library", "Requested"], detail.Seasons.Select(season => season.RequestState.Tag()));
    }

    [Fact]
    public void OlderServerWithoutSeasonFieldsDecodes()
    {
        var bare = Season(1);
        foreach (var key in SeasonKeys)
        {
            bare.Remove(key);
        }
        var detail = TvDetail([bare], viewer: null);

        Assert.Null(detail.Viewer.CanRequestSeasons);
        Assert.Null(detail.Viewer.RequestedSeasons);
        var season = Assert.Single(detail.Seasons);
        Assert.Null(season.Monitored);
        Assert.Null(season.Requested);
        Assert.Null(season.Requestable);
        Assert.Equal(SeasonRequestState.Unavailable, season.RequestState);
        // An old server keeps today's whole-series Request.
        Assert.Equal(TitleRequestAction.WholeSeries, detail.RequestAction);

        var status = Fixture("title-status");
        var viewer = status["viewer"]!.AsObject();
        foreach (var key in ViewerKeys)
        {
            viewer.Remove(key);
        }
        Assert.Null(Decode<TitleStatus>(status).Viewer.CanRequestSeasons);
    }

    private static JsonObject EditRows(string name, Action<JsonObject> edit)
    {
        var json = Fixture(name);
        foreach (var row in json["results"]!.AsArray())
        {
            edit(row!.AsObject());
        }
        return json;
    }

    private static void WithSeasons(JsonObject row)
    {
        row["mediaType"] = "tv";
        row["seasons"] = new JsonArray(1, 2, 3);
        row["seasonsLabel"] = "Seasons 1–3";
    }

    private static void WithoutSeasons(JsonObject row)
    {
        foreach (var key in RequestKeys)
        {
            row.Remove(key);
        }
    }

    [Fact]
    public void RequestListsDecodeSeasonsWithAndWithout()
    {
        var mine = Decode<ListResponse<MyRequest>>(EditRows("requests-mine", WithSeasons)).Results[0];
        Assert.Equal([1, 2, 3], mine.Seasons!);
        Assert.Equal("Seasons 1–3", mine.SeasonsText);
        var oldMine = Decode<ListResponse<MyRequest>>(EditRows("requests-mine", WithoutSeasons)).Results[0];
        Assert.Null(oldMine.Seasons);
        Assert.Null(oldMine.SeasonsLabel);
        Assert.Equal("", oldMine.SeasonsText);
        var fallback = Decode<ListResponse<MyRequest>>(EditRows("requests-mine", row =>
        {
            row["seasons"] = new JsonArray(2);
            row["seasonsLabel"] = null;
        })).Results[0];
        // No server label: made here.
        Assert.Equal("Season 2", fallback.SeasonsText);

        var pending = Decode<PendingRequests>(EditRows("requests-pending", WithSeasons)).Results[0];
        Assert.Equal("Seasons 1–3", pending.SeasonsText);
        var oldPending = Decode<PendingRequests>(EditRows("requests-pending", WithoutSeasons)).Results[0];
        Assert.Null(oldPending.Seasons);
        Assert.Equal("", oldPending.SeasonsText);

        var history = Decode<ListResponse<ReviewedRequest>>(EditRows("requests-history", WithSeasons)).Results[0];
        Assert.Equal([1, 2, 3], history.Seasons!);
        Assert.Equal("Seasons 1–3", history.SeasonsLabel);
        var oldHistory = Decode<ListResponse<ReviewedRequest>>(EditRows("requests-history", WithoutSeasons)).Results[0];
        Assert.Equal("", oldHistory.SeasonsText);
    }

    // MARK: Request body

    [Fact]
    public async Task RequestSendsSeasonsOnlyWhenGiven()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerFixture("request-created");
        var events = new ServerEvents();
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub), events);

        var id = await api.Titles.RequestAsync(MediaType.Tv, 1399, [3, 1, 2, 1]);

        Assert.Equal(Guid.Parse("28713d50-27f2-4230-9c95-c1e6a000f6c0"), id);
        var picked = Assert.Single(stub.Requests);
        Assert.Equal("POST", picked.Method.Method);
        Assert.Equal("/api/v1/titles/tv/1399/request", picked.Path);
        Assert.Equal("application/json", picked.ContentType);
        // Sorted and de-duplicated.
        Assert.True(JsonNode.DeepEquals(JsonNode.Parse("""{"seasons":[1,2,3]}"""), picked.JsonBody), picked.Body);
        Assert.Equal(1, events.Revision(ServerChange.Requests));
        Assert.Equal(1, events.Revision(ServerChange.Library));

        stub.Requests.Clear();
        await api.Titles.RequestAsync(MediaType.Tv, 1399);
        var whole = Assert.Single(stub.Requests);
        Assert.Equal("/api/v1/titles/tv/1399/request", whole.Path);
        // The whole series sends no body, as before.
        Assert.Equal("", whole.Body);
        Assert.Null(whole.ContentType);
    }

    [Fact]
    public void SeasonRequestBodyEncodes() =>
        Assert.Equal("""{"seasons":[1,2]}""", Json.EncodeBodyToString(new SeasonRequestBody([1, 2])));

    // MARK: Labels

    [Theory]
    [InlineData(new[] { 2 }, "Season 2")]
    [InlineData(new[] { 1, 2, 3 }, "Seasons 1–3")]
    [InlineData(new[] { 1, 2, 3, 5, 7, 8 }, "Seasons 1–3, 5, 7–8")]
    [InlineData(new[] { 0 }, "Specials")]
    [InlineData(new[] { 0, 1 }, "Specials, Season 1")]
    [InlineData(new[] { 0, 2, 3 }, "Specials, Seasons 2–3")]
    [InlineData(new[] { 1, 3 }, "Seasons 1, 3")]
    [InlineData(new[] { 3, 1, 2, 2 }, "Seasons 1–3")]
    public void SeasonsLabel(int[] seasons, string expected) =>
        Assert.Equal(expected, SeasonLabels.SeasonsLabel(seasons));

    [Fact]
    public void SeasonsLabelIsNullForTheWholeSeries()
    {
        Assert.Null(SeasonLabels.SeasonsLabel(null));
        Assert.Null(SeasonLabels.SeasonsLabel([]));
    }

    [Fact]
    public void PendingLine()
    {
        var seasons = TvDetail(
            [Season(1, requested: true, requestable: false)],
            NewViewer(canRequestSeasons: false, requestedSeasons: [1, 2, 3]),
            canRequest: false, alreadyRequested: true, requestStatus: "pending");
        Assert.Equal("Requested Seasons 1–3, waiting for approval", seasons.Viewer.PendingRequestLine);
        Assert.Equal(TitleRequestAction.None, seasons.RequestAction);

        var whole = TvDetail(
            [Season(1)], NewViewer(canRequestSeasons: false),
            canRequest: false, alreadyRequested: true, requestStatus: "pending");
        Assert.Equal("Requested, waiting for approval", whole.Viewer.PendingRequestLine);
    }

    // MARK: The Request button

    [Fact]
    public void RequestActionForANewServer()
    {
        Assert.Equal(TitleRequestAction.PickSeasons, TvDetail([Season(2), Season(1)], NewViewer()).RequestAction);

        var tracked = TvDetail(
            [Season(2), Season(1, have: 8, total: 8, monitored: true, requestable: false)],
            NewViewer(), canRequest: false, status: "tracked_monitored");
        Assert.Equal(TitleRequestAction.PickMoreSeasons, tracked.RequestAction);

        // An earlier request was approved (say, by hand) but nothing is in the
        // library yet: still just "Request", as on the website.
        var approvedUntracked = TvDetail([Season(2), Season(1)], NewViewer(), canRequest: false, requestStatus: "approved");
        Assert.Equal(TitleRequestAction.PickSeasons, approvedUntracked.RequestAction);

        var nothingLeft = TvDetail(
            [Season(1, monitored: true, requestable: false)],
            NewViewer(canRequestSeasons: false), canRequest: false, status: "tracked_monitored");
        Assert.Equal(TitleRequestAction.None, nothingLeft.RequestAction);

        // Nothing to pick: whole series.
        Assert.Equal(TitleRequestAction.WholeSeries, TvDetail([], NewViewer()).RequestAction);
    }

    // MARK: The picker

    [Fact]
    public void PickerSelection()
    {
        var detail = TvDetail([Season(3), Season(2, monitored: true, requestable: false), Season(1)], NewViewer());
        var selection = new SeasonPickerSelection(detail.Seasons);
        Assert.Equal([3, 1], selection.Requestable);
        Assert.Empty(selection.Seasons);
        Assert.Equal("Request seasons", selection.SubmitTitle);

        selection.Set(2, true);
        // A monitored season can't be picked.
        Assert.Empty(selection.Seasons);
        selection.Set(3, true);
        Assert.Equal("Request 1 season", selection.SubmitTitle);
        Assert.False(selection.AllSelected);

        selection.ToggleAll();
        Assert.True(selection.AllSelected);
        Assert.Equal([1, 3], selection.Seasons);
        Assert.Equal("Request 2 seasons", selection.SubmitTitle);

        selection.ToggleAll();
        Assert.Empty(selection.Seasons);
    }
}
