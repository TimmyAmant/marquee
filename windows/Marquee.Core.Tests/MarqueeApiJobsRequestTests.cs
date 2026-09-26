using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// The jobs area of the Mac's MarqueeAPIRequestTests (api-v1.md section 13).

public sealed class MarqueeApiJobsRequestTests
{
    private static readonly Uri Base = new("http://127.0.0.1:3000");

    private sealed record Case(string Method, string Path, string Response, ServerChange Changes, Func<MarqueeApi, Task> Call)
    {
        public string Name => $"{Method} {Path}";
    }

    private static readonly Case[] Cases =
    [
        new("GET", "/settings/jobs", "jobs", ServerChange.None, api => api.Jobs.ListAsync()),
        // A run moves what "Sync now" moves (the Mac records library, settings and catalog), plus the jobs area.
        new("POST", "/settings/jobs/arr-sync/run", "ok", ServerChange.Library | ServerChange.Integrations | ServerChange.Jobs, api => api.Jobs.RunAsync(JobId.ArrSync)),
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
        Assert.Equal("", request.Body);
        Assert.Null(request.ContentType);

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
            Assert.Equal(1, events.Revision(ServerChange.Jobs));
            Assert.Equal(1, events.Revision(ServerChange.Library));
            Assert.Equal(1, events.Revision(ServerChange.Integrations));
            Assert.Equal(0, events.Revision(ServerChange.Requests | ServerChange.Notifications | ServerChange.Favorites | ServerChange.Users));
        }
    }

    [Fact]
    public async Task RunTakesAnyJobIdTheServerLists()
    {
        // A job this version doesn't know still runs; its id is encoded as a segment.
        var stub = new StubHttpMessageHandler();
        stub.AnswerFixture("ok");
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub));

        await api.Jobs.RunAsync(JobId.FromValue("index rebuild/v2"));

        Assert.Equal("/api/v1/settings/jobs/index%20rebuild%2Fv2/run", Assert.Single(stub.Requests).Path);
    }

    [Fact]
    public async Task ListDecodesIntoJobs()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerFixture("jobs");
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub));

        var jobs = await api.Jobs.ListAsync();

        Assert.Equal([JobId.PlexSync, JobId.JellyfinSync, JobId.ArrSync, JobId.PlexWatchlist, JobId.NotFoundCheck, JobId.DiskSpaceSnapshot, JobId.Cleanup], jobs.Select(job => job.Id));
        Assert.Equal("Daily at 3:00 AM", jobs[5].Schedule);
    }

    [Fact]
    public async Task FailedRunIsAServerErrorAndRecordsNothing()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(500, """{"error":"Job failed. Check the server logs.","code":"internal"}""");
        var events = new ServerEvents();
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub), events);

        var error = await Assert.ThrowsAsync<ApiException>(() => api.Jobs.RunAsync(JobId.PlexSync));

        Assert.Equal(ApiErrorKind.Server, error.Kind);
        Assert.Equal("Job failed. Check the server logs.", error.Message);
        Assert.Equal(0, events.Revision(ServerChange.All));
    }

    [Fact]
    public async Task UnknownJobIsNotFound()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(404, """{"error":"Unknown job.","code":"not_found"}""");
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub));

        var error = await Assert.ThrowsAsync<ApiException>(() => api.Jobs.RunAsync(JobId.FromValue("nope")));
        Assert.Equal(ApiErrorKind.NotFound, error.Kind);
    }

    [Fact]
    public async Task MemberRunningAJobIsForbidden()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(403, """{"error":"Only the admin can run jobs.","code":"forbidden"}""");
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub));

        var error = await Assert.ThrowsAsync<ApiException>(() => api.Jobs.ListAsync());
        Assert.Equal(ApiErrorKind.Forbidden, error.Kind);
    }
}
