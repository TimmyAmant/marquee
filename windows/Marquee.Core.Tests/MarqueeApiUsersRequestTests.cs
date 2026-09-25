using System.Text.Json.Nodes;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// The users rows of the Mac's MarqueeAPIRequestTests: each method against a
// stubbed server must send exactly the method, path and JSON body
// docs/api-v1.md section 11 specifies (optional body fields left out, never
// null), and the doc's example response must decode into its return value.

public sealed class MarqueeApiUsersRequestTests
{
    private static readonly Uri Base = new("http://127.0.0.1:3000");

    // Parsed from uppercase on purpose: the path must carry the lowercase
    // form the server prints (it compares this id as a string when you edit
    // your own account).
    private static readonly Guid MemberId = Guid.Parse("83C55A49-6153-4CB9-AE22-4A42D48F4CF3");

    /// <param name="Body">Expected JSON body; null means no body at all.</param>
    /// <param name="Changes">What a successful call records; None for a read.</param>
    private sealed record Case(
        string Method,
        string Path,
        string? Body,
        string Response,
        ServerChange Changes,
        Func<MarqueeApi, Task> Call)
    {
        public string Name => $"{Method} {Path}";
    }

    private const ServerChange Removed = ServerChange.Users | ServerChange.Requests | ServerChange.Notifications;

    private static readonly Case[] Cases =
    [
        new("GET", "/users", null, "users", ServerChange.None, api => api.Users.ListAsync()),
        new("POST", "/users", """{"username":"kid","password":"correct-horse"}""", "household-member", ServerChange.Users,
            api => api.Users.CreateAsync(new CreateUserRequest("kid", "correct-horse"))),
        new("PATCH", "/users/83c55a49-6153-4cb9-ae22-4a42d48f4cf3", """{"username":"kid","autoApproveTv":true}""", "user-update", ServerChange.Users,
            api => api.Users.UpdateAsync(MemberId, new UpdateUserRequest("kid", AutoApproveTv: true))),
        new("DELETE", "/users/83c55a49-6153-4cb9-ae22-4a42d48f4cf3", null, "ok", Removed,
            api => api.Users.RemoveAsync(MemberId)),
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
            Assert.Equal(1, events.Revision(ServerChange.Users));
            Assert.Equal(testCase.Changes.HasFlag(ServerChange.Requests) ? 1 : 0, events.Revision(ServerChange.Requests));
            Assert.Equal(testCase.Changes.HasFlag(ServerChange.Notifications) ? 1 : 0, events.Revision(ServerChange.Notifications));
            Assert.Equal(0, events.Revision(ServerChange.Library | ServerChange.Favorites | ServerChange.Integrations | ServerChange.Jobs));
        }
    }

    [Fact]
    public async Task CreateSendsTheDisplayNameWhenGiven()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerFixture("household-member");
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub));

        var member = await api.Users.CreateAsync(new CreateUserRequest("kid", "correct-horse", "Kid"));

        var request = Assert.Single(stub.Requests);
        Assert.Equal("""{"username":"kid","password":"correct-horse","displayName":"Kid"}""", request.Body);
        Assert.Equal("Kid", member.Label);
        Assert.Equal(MemberId, member.Id);
    }

    [Fact]
    public async Task UpdateSendsEveryFieldTheFormFilled()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerFixture("user-update");
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub));

        var result = await api.Users.UpdateAsync(MemberId, new UpdateUserRequest(
            "kid", DisplayName: "Kid", Password: "correct-horse-battery", AutoApproveMovies: false, AutoApproveTv: true));

        var request = Assert.Single(stub.Requests);
        Assert.Equal(
            """{"username":"kid","displayName":"Kid","password":"correct-horse-battery","autoApproveMovies":false,"autoApproveTv":true}""",
            request.Body);
        // A password was set, so the server revoked every token of the
        // account: the caller decides whether that was its own.
        Assert.True(result.TokensRevoked);
        Assert.True(result.Ok);
        Assert.Equal("Kid", result.User.Label);
    }

    [Fact]
    public async Task ResultsDecodeIntoTheirValues()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerFixture("users");
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub));

        var members = await api.Users.ListAsync();

        var member = Assert.Single(members);
        Assert.Equal("member1", member.Username);
        Assert.Equal(UserRole.Member, member.Role);
        Assert.False(member.IsAdmin);
        Assert.False(member.IsCurrentUser);
    }

    [Fact]
    public async Task TakenUsernameIsAConflictAndRecordsNothing()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(409, """{"error":"An account with that username already exists","code":"conflict"}""");
        var events = new ServerEvents();
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub), events);

        var error = await Assert.ThrowsAsync<ApiException>(() => api.Users.CreateAsync(new CreateUserRequest("member1", "correct-horse")));

        Assert.Equal(ApiErrorKind.Conflict, error.Kind);
        Assert.Equal("An account with that username already exists", error.Message);
        Assert.Equal(0, events.Revision(ServerChange.All));
    }

    [Fact]
    public async Task RemovingYourselfIsForbidden()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(403, """{"error":"You can't remove your own account.","code":"forbidden"}""");
        var events = new ServerEvents();
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub), events);

        var error = await Assert.ThrowsAsync<ApiException>(() => api.Users.RemoveAsync(MemberId));

        // Forbidden carries no server text (as Swift's .forbidden): the app
        // shows its own wording for it.
        Assert.Equal(ApiErrorKind.Forbidden, error.Kind);
        Assert.Null(error.ServerMessage);
        Assert.Equal(0, events.Revision(ServerChange.All));
    }

    [Fact]
    public async Task UnknownAccountIsNotFound()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(404, """{"error":"Account not found.","code":"not_found"}""");
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub));

        var error = await Assert.ThrowsAsync<ApiException>(() => api.Users.UpdateAsync(Guid.NewGuid(), new UpdateUserRequest("kid")));
        Assert.Equal(ApiErrorKind.NotFound, error.Kind);
    }
}
