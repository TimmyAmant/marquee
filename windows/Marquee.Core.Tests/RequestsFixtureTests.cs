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
        var request = Assert.Single(history);

        Assert.Equal(RequestId, request.Id);
        Assert.Equal(RequestStatus.Rejected, request.Status);
        Assert.False(request.ManuallyApproved);
        Assert.Equal("Rejected", request.StatusLabel);
        Assert.Null(request.RequestedBy.UserId);
        Assert.Equal("member1", request.RequestedBy.Label);
        Assert.Equal(Json.ParseDate("2026-09-17T17:12:41.468Z"), request.ReviewedAt);
        Assert.Equal("Not enough space on the server right now", request.RejectionReason);
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
        var reviewed = Assert.Single(Json.Decode<ListResponse<ReviewedRequest>>(history).Results);
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
}
