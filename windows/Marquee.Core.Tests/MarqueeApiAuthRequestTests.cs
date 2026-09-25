using System.Text.Json.Nodes;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// The auth area of the Mac's MarqueeAPIRequestTests: each method against a
// stubbed server must send exactly the method, path, query and JSON body
// docs/api-v1.md specifies, and the doc's example response must decode into
// its return value. Area test classes follow the same pattern.

public sealed class MarqueeApiAuthRequestTests
{
    private static readonly Uri Base = new("http://127.0.0.1:3000");

    /// <param name="Body">Expected JSON body; null means no body at all.</param>
    /// <param name="Response">The fixture the stub answers with.</param>
    private sealed record Case(string Method, string Path, string? Body, string Response, Func<MarqueeApi, Task> Call)
    {
        public string Name => $"{Method} {Path}";
    }

    private static readonly Case[] Cases =
    [
        new("GET", "/server-info", null, "server-info", api => api.Auth.ServerInfoAsync()),
        new("POST", "/auth/login", """{"username":"timmy","password":"pw","deviceName":"PC"}""", "auth-login",
            api => api.Auth.LoginAsync("timmy", "pw", "PC")),
        new("POST", "/auth/setup", """{"username":"timmy","password":"pw","displayName":"Timmy","deviceName":"PC"}""", "auth-login",
            api => api.Auth.SetupAsync("timmy", "pw", "Timmy", "PC")),
        new("POST", "/auth/logout", null, "ok", api => api.Auth.LogoutAsync()),
        new("GET", "/me", null, "me", api => api.MeAsync()),
        new("GET", "/badges", null, "badges", api => api.BadgesAsync()),
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
        // Sign-in plumbing changes nothing the screens show.
        Assert.Equal(0, events.Revision(ServerChange.All));
    }

    [Fact]
    public async Task NoServerThrowsUnauthorizedWithoutSending()
    {
        var api = new MarqueeApi(client: null);
        var error = await Assert.ThrowsAsync<ApiException>(() => api.MeAsync());
        Assert.Equal(ApiErrorKind.Unauthorized, error.Kind);
    }

    [Fact]
    public async Task SuccessfulMutationRecordsItsChanges()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerFixture("ok");
        var events = new ServerEvents();
        ServerChangedEventArgs? raised = null;
        events.Changed += (_, args) => raised = args;
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub), events);

        var before = events.Revision(ServerChange.All);
        await api.transport.MutateAsync<OK>(HttpMethod.Post, "/requests/x/approve", changes: ServerChange.Requests | ServerChange.Library);

        Assert.Equal(before + 2, events.Revision(ServerChange.All));
        Assert.Equal(1, events.Revision(ServerChange.Requests));
        Assert.Equal(0, events.Revision(ServerChange.Notifications));
        Assert.Equal(0, events.RemoteRevision(ServerChange.All));
        Assert.NotNull(raised);
        Assert.Equal(ServerChange.Requests | ServerChange.Library, raised.Change);
        Assert.Equal(ServerChangeSource.Mutation, raised.Source);
    }

    [Fact]
    public async Task FailedMutationRecordsNothing()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(409, """{"error":"Couldn't resolve this show for Sonarr.","code":"conflict"}""");
        var events = new ServerEvents();
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub), events);

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            api.transport.MutateAsync<OK>(HttpMethod.Post, "/requests/x/approve", changes: ServerChange.Requests));
        Assert.True(error.IsSonarrUnresolvable);
        Assert.Equal(0, events.Revision(ServerChange.All));
    }

    private sealed record JobRow
    {
        public required JobId Id { get; init; }
        public required string Name { get; init; }
    }

    [Fact]
    public async Task ListsComeBackUnwrapped()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerFixture("jobs");
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub));

        var jobs = await api.transport.GetListAsync<JobRow>("/settings/jobs");
        Assert.NotEmpty(jobs);
        Assert.Equal(JobId.PlexSync, jobs[0].Id);
        Assert.Equal("Plex Library Sync", jobs[0].Name);
        Assert.All(jobs, job => Assert.True(job.Id.IsKnown));
    }

    [Fact]
    public void PollingRecordsRemoteChanges()
    {
        var events = new ServerEvents();
        events.Record(ServerChange.Notifications, ServerChangeSource.Server);
        Assert.Equal(1, events.Revision(ServerChange.Notifications));
        Assert.Equal(1, events.RemoteRevision(ServerChange.Notifications));
        Assert.Equal(0, events.RemoteRevision(ServerChange.Requests));
        events.Record(ServerChange.None);
        Assert.Equal(1, events.Revision(ServerChange.All));
    }

    // MARK: Fixtures

    [Fact]
    public void FixturesAreLinkedFromTheMacProject()
    {
        var names = Fixtures.Names;
        Assert.True(names.Count >= 54, $"Expected the doc's fixtures, found {names.Count}");
        foreach (var expected in new[] { "server-info", "auth-login", "ok", "me", "badges", "error-upstream" })
        {
            Assert.Contains(expected, names);
        }
    }

    [Fact]
    public void AuthFixturesDecode()
    {
        var info = Fixtures.Decode<ServerInfo>("server-info");
        Assert.True(info.IsMarquee);
        Assert.True(info.IsSupported);
        Assert.Equal("0.22.0", info.Version);
        Assert.True(info.SetupComplete);
        Assert.False(info.IsDegraded);

        var login = Fixtures.Decode<AuthResponse>("auth-login");
        Assert.StartsWith("mqt_", login.Token);
        Assert.True(login.User.IsAdmin);
        Assert.Equal(login.User.Id, login.User.LibraryOwnerId);
        Assert.Equal("Timmy", login.User.Label);
        Assert.Equal(Json.ParseDate("2026-12-16T17:10:57.920Z"), login.ExpiresAt);

        Assert.True(Fixtures.Decode<OK>("ok").Ok);

        var me = Fixtures.Decode<Me>("me");
        Assert.Equal("timmy", me.Username);
        Assert.False(me.AutoApproveMovies);
        Assert.False(me.AutoApproveTv);
        Assert.Equal(Json.ParseDate("2026-09-17T17:10:57.821Z"), me.CreatedAt);
        Assert.Equal(login.User, me.User);

        var badges = Fixtures.Decode<Badges>("badges");
        Assert.Equal(2, badges.UnreadNotifications);
        Assert.Equal(1, badges.PendingRequests);

        var body = Fixtures.Decode<ApiErrorBody>("error-upstream");
        Assert.Equal("upstream", body.Code);
        var error = ApiException.FromResponse(502, Fixtures.Read("error-upstream"), hasApiHeader: true);
        Assert.Equal(ApiErrorKind.Upstream, error.Kind);
        Assert.StartsWith("TMDb isn't configured", error.ServerMessage);
    }
}
