using System.Text.Json.Nodes;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// The requests area of the Mac's MarqueeAPIRequestTests, plus the 0.28.0
// addition: a reject can carry {"reason": ...}, and without one it sends no
// body at all (what every server version accepts).

public sealed class MarqueeApiRequestsRequestTests
{
    private static readonly Uri Base = new("http://127.0.0.1:3000");

    // Parsed from uppercase on purpose: the path must carry the lowercase
    // form the server prints, whatever the caller's Guid came from.
    private static readonly Guid RequestId = Guid.Parse("28713D50-27F2-4230-9C95-C1E6A000F6C0");

    /// <param name="Body">Expected JSON body; null means no body at all.</param>
    /// <param name="Changes">What a successful call records; None for a read.</param>
    /// <param name="Label">Distinguishes two cases on the same endpoint.</param>
    private sealed record Case(
        string Method,
        string Path,
        string? Body,
        string Response,
        ServerChange Changes,
        Func<MarqueeApi, Task> Call,
        string? Label = null)
    {
        public string Name => Label ?? $"{Method} {Path}";
    }

    private const ServerChange Reviewed = ServerChange.Requests | ServerChange.Notifications;
    private const ServerChange Added = ServerChange.Requests | ServerChange.Library | ServerChange.Notifications;

    private static readonly Case[] Cases =
    [
        new("GET", "/requests/mine", null, "requests-mine", ServerChange.None, api => api.Requests.MineAsync()),
        new("GET", "/requests/pending", null, "requests-pending", ServerChange.None, api => api.Requests.PendingAsync()),
        new("GET", "/requests/history", null, "requests-history", ServerChange.None, api => api.Requests.HistoryAsync()),
        new("GET", "/requests/pending-count", null, "requests-pending-count", ServerChange.None, api => api.Requests.PendingCountAsync()),
        new("POST", "/requests/28713d50-27f2-4230-9c95-c1e6a000f6c0/approve", null, "ok", Added,
            api => api.Requests.ApproveAsync(RequestId)),
        new("POST", "/requests/28713d50-27f2-4230-9c95-c1e6a000f6c0/approve",
            """{"serverId":"b3e1f7a2-9c4d-4e8b-a1f0-6d2c5e7b9a31","qualityProfileId":6,"rootFolderPath":"/movies-kids","tags":[2]}""", "ok", Added,
            api => api.Requests.ApproveAsync(RequestId, new AddOverrides
            {
                ServerId = "b3e1f7a2-9c4d-4e8b-a1f0-6d2c5e7b9a31",
                QualityProfileId = 6,
                RootFolderPath = "/movies-kids",
                Tags = [2],
            }),
            Label: "POST /requests/{id}/approve with add overrides"),
        new("POST", "/requests/28713d50-27f2-4230-9c95-c1e6a000f6c0/manual-approve", null, "ok", Reviewed,
            api => api.Requests.ManuallyApproveAsync(RequestId)),
        new("POST", "/requests/28713d50-27f2-4230-9c95-c1e6a000f6c0/reject", null, "ok", Reviewed,
            api => api.Requests.RejectAsync(RequestId)),
        new("POST", "/requests/28713d50-27f2-4230-9c95-c1e6a000f6c0/reject", """{"reason":"Not a fit"}""", "ok", Reviewed,
            api => api.Requests.RejectAsync(RequestId, "Not a fit"), Label: "POST /requests/{id}/reject with a reason"),
        new("POST", "/requests/approve-all", null, "requests-approve-all", Added, api => api.Requests.ApproveAllAsync()),
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
        var raised = new List<ServerChangedEventArgs>();
        events.Changed += (_, args) => raised.Add(args);
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

        if (testCase.Changes == ServerChange.None)
        {
            Assert.Empty(raised);
            Assert.Equal(0, events.Revision(ServerChange.All));
        }
        else
        {
            var change = Assert.Single(raised);
            Assert.Equal(testCase.Changes, change.Change);
            Assert.Equal(ServerChangeSource.Mutation, change.Source);
            Assert.Equal(1, events.Revision(ServerChange.Requests));
            Assert.Equal(testCase.Changes.HasFlag(ServerChange.Library) ? 1 : 0, events.Revision(ServerChange.Library));
            Assert.Equal(0, events.Revision(ServerChange.Favorites));
        }
    }

    [Fact]
    public async Task RejectWithAReasonSendsItAsTheBody()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerFixture("ok");
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub));

        await api.Requests.RejectAsync(RequestId, "Not a fit");

        var request = Assert.Single(stub.Requests);
        Assert.Equal("/api/v1/requests/28713d50-27f2-4230-9c95-c1e6a000f6c0/reject", request.Path);
        Assert.Equal("application/json", request.ContentType);
        Assert.Equal("""{"reason":"Not a fit"}""", request.Body);
    }

    [Fact]
    public async Task RejectWithoutAReasonSendsNoBody()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerFixture("ok");
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub));

        await api.Requests.RejectAsync(RequestId, null);

        var request = Assert.Single(stub.Requests);
        Assert.Equal("", request.Body);
        Assert.Null(request.ContentType);
        Assert.Null(request.JsonBody);
    }

    [Fact]
    public async Task ResultsDecodeIntoTheirValues()
    {
        var stub = new StubHttpMessageHandler();
        stub.Answer(request => request.Path switch
        {
            "/api/v1/requests/mine" => StubHttpMessageHandler.Fixture("requests-mine"),
            "/api/v1/requests/pending" => StubHttpMessageHandler.Fixture("requests-pending"),
            "/api/v1/requests/history" => StubHttpMessageHandler.Fixture("requests-history"),
            "/api/v1/requests/pending-count" => StubHttpMessageHandler.Fixture("requests-pending-count"),
            _ => StubHttpMessageHandler.Fixture("requests-approve-all"),
        });
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub));

        var mine = await api.Requests.MineAsync();
        Assert.Equal(["The Matrix", "Severance"], mine.Select(request => request.Title));

        var pending = await api.Requests.PendingAsync();
        Assert.Equal("http://192.168.1.10:8989", pending.SonarrUrl);
        Assert.Equal(2, pending.Results.Count);

        var history = await api.Requests.HistoryAsync();
        Assert.Equal(3, history.Count);
        Assert.Equal(RequestStatus.Rejected, history[1].Status);
        Assert.Equal("Added to Radarr 2", history[2].AddedToLine);

        Assert.Equal(3, await api.Requests.PendingCountAsync());

        var approved = await api.Requests.ApproveAllAsync();
        Assert.Equal(4, approved.ApprovedCount);
        Assert.Equal(1, approved.FailedCount);
    }

    [Fact]
    public async Task SonarrUnresolvableApproveRecordsNothing()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(409, """{"error":"Couldn't resolve this show for Sonarr.","code":"conflict"}""");
        var events = new ServerEvents();
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub), events);

        var error = await Assert.ThrowsAsync<ApiException>(() => api.Requests.ApproveAsync(RequestId));

        Assert.Equal(ApiErrorKind.Conflict, error.Kind);
        Assert.True(error.IsSonarrUnresolvable);
        Assert.Equal(0, events.Revision(ServerChange.All));
    }

    [Fact]
    public async Task AlreadyReviewedIsAConflictWithTheServersWording()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(409, """{"error":"Request was already reviewed.","code":"conflict"}""");
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub));

        var error = await Assert.ThrowsAsync<ApiException>(() => api.Requests.RejectAsync(RequestId, "Late"));

        Assert.Equal(ApiErrorKind.Conflict, error.Kind);
        Assert.False(error.IsSonarrUnresolvable);
        Assert.Equal("Request was already reviewed.", error.Message);
    }

    [Fact]
    public async Task MemberCallingAdminEndpointIsForbidden()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(403, """{"error":"Admin only.","code":"forbidden"}""");
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub));

        var error = await Assert.ThrowsAsync<ApiException>(() => api.Requests.PendingAsync());
        Assert.Equal(ApiErrorKind.Forbidden, error.Kind);
    }
}
