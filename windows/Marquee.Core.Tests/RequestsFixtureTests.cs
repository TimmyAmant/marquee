using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// The section 7 examples decoded as the Mac's APIFixtureTests decodes them
// (testRequestsAndNotifications, testSonarrUnresolvableDetection), plus the
// 0.28.0 rejection-reason fields: the fixtures in this tree predate them, so
// the lenient defaults are what those assert, and inline JSON covers the
// values.

public sealed class RequestsFixtureTests
{
    private static readonly Guid RequestId = Guid.Parse("28713d50-27f2-4230-9c95-c1e6a000f6c0");
    private static readonly Guid MemberId = Guid.Parse("83c55a49-6153-4cb9-ae22-4a42d48f4cf3");

    [Fact]
    public void MyRequestsDecode()
    {
        var mine = Fixtures.Decode<ListResponse<MyRequest>>("requests-mine").Results;
        var request = Assert.Single(mine);

        Assert.Equal(RequestId, request.Id);
        Assert.Equal(MediaType.Movie, request.MediaType);
        Assert.Equal(603, request.TmdbId);
        Assert.Equal("The Matrix", request.Title);
        Assert.Equal(RequestStatus.Approved, request.Status);
        Assert.False(request.ManuallyApproved);
        Assert.Equal(LibraryStatus.TrackedDownloading, request.LibraryStatus);
        Assert.Equal("Downloading", request.StatusLabel);
        Assert.Equal(RequestTone.Downloading, request.StatusTone);
        Assert.Equal(Json.ParseDate("2026-09-17T17:12:41.415Z"), request.CreatedAt);
        Assert.Equal(Json.ParseDate("2026-09-17T18:00:02.118Z"), request.ReviewedAt);
        Assert.Equal(new TitleId(MediaType.Movie, 603), request.TitleId);
        Assert.Equal("movie:603", request.TitleId.ToString());
        // An approved request carries no reason.
        Assert.Null(request.RejectionReason);
    }

    [Fact]
    public void PendingQueueDecodes()
    {
        var pending = Fixtures.Decode<PendingRequests>("requests-pending");

        Assert.Equal("http://192.168.1.10:8989", pending.SonarrUrl);
        // The movie request, then a season request for a show.
        Assert.Equal(2, pending.Results.Count);
        var request = pending.Results[0];
        Assert.Equal(RequestId, request.Id);
        Assert.Equal("The Matrix", request.Title);
        Assert.Equal(MemberId, request.RequestedBy.UserId);
        Assert.Null(request.RequestedBy.DisplayName);
        Assert.Equal("member1", request.RequestedBy.Username);
        Assert.Equal("member1", request.RequestedBy.Label);
        Assert.Equal(Json.ParseDate("2026-09-17T17:12:41.415Z"), request.CreatedAt);
        Assert.Equal(new TitleId(MediaType.Movie, 603), request.TitleId);
        Assert.Equal(5, pending.RejectionReasons.Count);
        Assert.Equal("Already available on a streaming service we have", pending.RejectionReasons[0]);

        Assert.Equal("http://192.168.1.10:8989/add/new?term=The%20Matrix", pending.ManualSonarrAddUrl(request)?.AbsoluteUri);

        Assert.Null(request.Seasons);
        var seasons = pending.Results[1];
        Assert.Equal("Severance", seasons.Title);
        Assert.Equal(new[] { 2 }, seasons.Seasons);
        Assert.Equal("Season 2", seasons.SeasonsLabel);
    }

    [Fact]
    public void ManualSonarrAddUrlEncodesLikeTheWebsite()
    {
        var pending = Fixtures.Decode<PendingRequests>("requests-pending");
        var request = pending.Results[0];

        // encodeURIComponent: a "+" must not turn into a space on Sonarr's side.
        var plus = request with { Title = "Romeo + Juliet" };
        Assert.Equal("http://192.168.1.10:8989/add/new?term=Romeo%20%2B%20Juliet", pending.ManualSonarrAddUrl(plus)?.AbsoluteUri);

        var ampersand = request with { Title = "Tom & Jerry / Friends?" };
        Assert.Equal("http://192.168.1.10:8989/add/new?term=Tom%20%26%20Jerry%20%2F%20Friends%3F", pending.ManualSonarrAddUrl(ampersand)?.AbsoluteUri);

        // A trailing slash on the base URL doesn't double up.
        var slashed = pending with { SonarrUrl = "http://192.168.1.10:8989/" };
        Assert.Equal("http://192.168.1.10:8989/add/new?term=The%20Matrix", slashed.ManualSonarrAddUrl(request)?.AbsoluteUri);

        // Not connected: nothing to link to.
        Assert.Null((pending with { SonarrUrl = null }).ManualSonarrAddUrl(request));
        Assert.Null((pending with { SonarrUrl = "  " }).ManualSonarrAddUrl(request));
    }

    [Fact]
    public void HistoryDecodes()
    {
        var history = Fixtures.Decode<ListResponse<ReviewedRequest>>("requests-history").Results;
        // The rejected request, then (0.43+) one approved to a second Radarr.
        Assert.Equal(2, history.Count);
        var request = history[0];

        Assert.Equal(RequestId, request.Id);
        Assert.Equal(RequestStatus.Rejected, request.Status);
        Assert.False(request.ManuallyApproved);
        Assert.Equal("Rejected", request.StatusLabel);
        Assert.Null(request.RequestedBy.UserId);
        Assert.Equal("member1", request.RequestedBy.Label);
        Assert.Equal(Json.ParseDate("2026-09-17T17:12:41.468Z"), request.ReviewedAt);
        Assert.Equal("Not enough space on the server right now", request.RejectionReason);
        Assert.Null(request.AddedTo);
        Assert.Null(request.AddedToLine);
    }

    [Fact]
    public void AddedToDecodes()
    {
        var approved = Fixtures.Decode<ListResponse<ReviewedRequest>>("requests-history").Results[1];

        Assert.Equal("Dune", approved.Title);
        Assert.Equal(RequestStatus.Approved, approved.Status);
        var addedTo = approved.AddedTo!;
        Assert.Equal("b3e1f7a2-9c4d-4e8b-a1f0-6d2c5e7b9a31", addedTo.ServerId);
        Assert.Equal("Radarr 2", addedTo.ServerName);
        Assert.Equal(6, addedTo.QualityProfileId);
        Assert.Equal("/movies-kids", addedTo.RootFolderPath);
        Assert.Equal([2], addedTo.Tags);
        Assert.Null(addedTo.SeriesType);
        Assert.Equal("Added to Radarr 2", approved.AddedToLine);

        // The server was removed since: nothing to name.
        Assert.Null((approved with { AddedTo = addedTo with { ServerName = null } }).AddedToLine);

        // Older than 0.43: no key at all.
        var older = Json.Decode<ReviewedRequest>("""
            {"id":"9a7d2c11-5e3b-4f0a-8c6d-2b1e0f9a8d77","mediaType":"movie","tmdbId":438631,"title":"Dune","posterPath":null,
             "status":"approved","manuallyApproved":false,"statusLabel":"Approved",
             "requestedBy":{"userId":null,"displayName":null,"username":"member1","label":"member1"},
             "createdAt":"2026-09-17T17:02:11.100Z","reviewedAt":"2026-09-17T17:05:40.020Z"}
            """);
        Assert.Null(older.AddedTo);
        Assert.Null(older.AddedToLine);

        var tv = Json.Decode<AddedTo>("""{"serverId":"s","serverName":"Sonarr","qualityProfileId":4,"rootFolderPath":"/anime","tags":[],"seriesType":"anime"}""");
        Assert.Equal(SeriesType.Anime, tv.SeriesType);
        Assert.Empty(tv.Tags);
    }

    [Fact]
    public void RejectionReasonsDecodeWhenTheServerSendsThem()
    {
        // What a 0.28.0 server adds: the key on the queue, the reason on
        // reviewed and own requests.
        var pending = Json.Decode<PendingRequests>("""
            {"sonarrUrl":null,"rejectionReasons":["Not a fit","Already own it"],"results":[]}
            """);
        Assert.Equal(["Not a fit", "Already own it"], pending.RejectionReasons);
        Assert.Null(pending.SonarrUrl);
        Assert.Empty(pending.Results);

        var history = Fixtures.Read("requests-history")
            .Replace("\"statusLabel\": \"Rejected\",", "\"statusLabel\": \"Rejected\", \"rejectionReason\": \"Not a fit\",", StringComparison.Ordinal);
        var reviewed = Json.Decode<ListResponse<ReviewedRequest>>(history).Results[0];
        Assert.Equal("Not a fit", reviewed.RejectionReason);

        var mine = Fixtures.Read("requests-mine")
            .Replace("\"statusLabel\": \"Downloading\",", "\"statusLabel\": \"Downloading\", \"rejectionReason\": null,", StringComparison.Ordinal);
        Assert.Null(Assert.Single(Json.Decode<ListResponse<MyRequest>>(mine).Results).RejectionReason);
    }

    [Fact]
    public void CountAndApproveAllDecode()
    {
        Assert.Equal(3, Fixtures.Decode<CountResponse>("requests-pending-count").Count);

        var result = Fixtures.Decode<ApproveAllResult>("requests-approve-all");
        Assert.True(result.Ok);
        Assert.Equal(4, result.ApprovedCount);
        Assert.Equal(1, result.FailedCount);
        Assert.Equal("1 request(s) couldn't be approved.", result.Message);

        var clean = Json.Decode<ApproveAllResult>("""{"ok":true,"approvedCount":0,"failedCount":0,"message":null}""");
        Assert.Null(clean.Message);
    }

    [Fact]
    public void RequestPersonDecodes()
    {
        var person = Fixtures.Decode<RequestPerson>("request-person");
        Assert.Equal(MemberId, person.UserId);
        Assert.Null(person.DisplayName);
        Assert.Equal("member1", person.Username);
        Assert.Equal("member1", person.Label);
    }

    [Fact]
    public void UnknownStatusValuesStillDecode()
    {
        var json = Fixtures.Read("requests-mine")
            .Replace("\"statusTone\": \"downloading\"", "\"statusTone\": \"archived\"", StringComparison.Ordinal)
            .Replace("\"libraryStatus\": \"tracked_downloading\"", "\"libraryStatus\": \"vaulted\"", StringComparison.Ordinal);
        var request = Assert.Single(Json.Decode<ListResponse<MyRequest>>(json).Results);
        Assert.Equal("archived", request.StatusTone.Value);
        Assert.False(request.StatusTone.IsKnown);
        Assert.NotNull(request.LibraryStatus);
        Assert.False(request.LibraryStatus.Value.IsKnown);
    }

    [Fact]
    public void RejectBodyEncodesTheReasonOnly()
    {
        Assert.Equal("""{"reason":"Not a fit"}""", Json.EncodeBodyToString(new RejectRequest("Not a fit")));
    }

    [Fact]
    public void SonarrUnresolvableDetection()
    {
        Assert.True(ApiException.Conflict("Couldn't resolve this show for Sonarr.").IsSonarrUnresolvable);
        Assert.False(ApiException.Conflict("Request was already reviewed.").IsSonarrUnresolvable);
        Assert.False(ApiException.Upstream("Couldn't resolve this show for Sonarr.").IsSonarrUnresolvable);
        Assert.Equal("Couldn't resolve this show for Sonarr.", ApiException.SonarrUnresolvableMessage);
    }

    [Fact]
    public void Is4kDecodesOnEveryList()
    {
        var mine = Assert.Single(Fixtures.Decode<ListResponse<MyRequest>>("requests-mine").Results);
        Assert.False(mine.Is4k);
        Assert.Equal("", mine.DetailText);
        Assert.All(Fixtures.Decode<PendingRequests>("requests-pending").Results, request => Assert.False(request.Is4k));
        Assert.All(Fixtures.Decode<ListResponse<ReviewedRequest>>("requests-history").Results, request => Assert.False(request.Is4k));

        var fourK = Json.Decode<ListResponse<MyRequest>>(
            Fixtures.Read("requests-mine").Replace("\"is4k\": false", "\"is4k\": true", StringComparison.Ordinal)).Results[0];
        Assert.True(fourK.Is4k);
        Assert.Equal("In 4K", fourK.DetailText);
    }

    [Fact]
    public void OlderServerWithoutIs4kMeansFalse()
    {
        var mine = Json.Decode<ListResponse<MyRequest>>(
            Fixtures.Read("requests-mine").Replace("\"is4k\": false,", "", StringComparison.Ordinal)).Results[0];
        Assert.False(mine.Is4k);
        var history = Json.Decode<ListResponse<ReviewedRequest>>(
            Fixtures.Read("requests-history").Replace("\"is4k\": false,", "", StringComparison.Ordinal)).Results;
        Assert.All(history, request => Assert.False(request.Is4k));
    }

    [Theory]
    [InlineData("Season 2", true, "Season 2 · In 4K")]
    [InlineData("", true, "In 4K")]
    [InlineData(null, true, "In 4K")]
    [InlineData("Seasons 1–3", false, "Seasons 1–3")]
    [InlineData("", false, "")]
    public void RequestLineMatchesTheWebsite(string? seasons, bool is4k, string expected)
    {
        Assert.Equal(expected, SeasonLabels.RequestLine(seasons, is4k));
    }
}
