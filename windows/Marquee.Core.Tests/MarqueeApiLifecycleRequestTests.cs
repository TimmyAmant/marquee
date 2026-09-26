using System.Text.Json.Nodes;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// The 0.46 request lifecycle endpoints: PATCH /requests/{id} (absent vs null
// seasons), its edit options, DELETE (cancel), retry, and the conversation
// endpoints of requests and problem reports; then CommentThreadModel, the
// conversation's state behind the Windows view model, against a stub server.

public sealed class MarqueeApiLifecycleRequestTests
{
    private static readonly Uri Base = new("http://127.0.0.1:3000");
    private const string Token = "mqt_testtesttesttesttesttesttesttesttesttesttes";

    // Uppercase on purpose: the path carries the lowercase form.
    private static readonly Guid RequestId = Guid.Parse("5B0F1D8E-8A8C-4F5E-9D51-1F0C7A0E2B44");
    private static readonly Guid IssueId = Guid.Parse("83BEDF64-C5D8-4F43-98A0-BB615C4B9897");
    private const string RequestPath = "/requests/5b0f1d8e-8a8c-4f5e-9d51-1f0c7a0e2b44";
    private const string IssuePath = "/issues/83bedf64-c5d8-4f43-98a0-bb615c4b9897";
    private const string CommentId = "7e9d1c3b-5a2f-4e6d-8b0a-9c1d2e3f4a5b";
    private const string AddedComment = """{"ok":true,"commentId":"7e9d1c3b-5a2f-4e6d-8b0a-9c1d2e3f4a5b"}""";

    private const ServerChange Changed = ServerChange.Requests | ServerChange.Notifications;
    private const ServerChange Added = ServerChange.Requests | ServerChange.Library | ServerChange.Notifications;

    /// <param name="Body">Expected JSON body; null means no body at all.</param>
    /// <param name="Response">A fixture name, or JSON when it starts with <c>{</c>.</param>
    private sealed record Case(
        string Method,
        string Path,
        string? Body,
        string Response,
        ServerChange Changes,
        Func<MarqueeApi, Task> Call,
        string Label);

    private static readonly Case[] Cases =
    [
        new("PATCH", RequestPath, """{"seasons":[2,3],"is4k":false}""", "ok", Changed,
            api => api.Requests.EditAsync(RequestId, [3, 2], false), "edit: just these seasons"),
        new("PATCH", RequestPath, """{"seasons":null}""", "ok", Changed,
            api => api.Requests.EditAsync(RequestId, null, null), "edit: the whole series (explicit null)"),
        new("PATCH", RequestPath, """{"is4k":true}""", "ok", Changed,
            api => api.Requests.EditAsync(RequestId, RequestEdit.FourK(true)), "edit: 4K only (seasons absent)"),
        new("GET", RequestPath + "/edit-options", null, "request-edit-options", ServerChange.None,
            api => api.Requests.EditOptionsAsync(RequestId), "edit options"),
        new("DELETE", RequestPath, null, "ok", Changed,
            api => api.Requests.CancelAsync(RequestId), "cancel"),
        new("POST", RequestPath + "/retry", null, "ok", Added,
            api => api.Requests.RetryAsync(RequestId), "retry"),
        new("POST", RequestPath + "/retry", """{"serverId":"b3e1f7a2-9c4d-4e8b-a1f0-6d2c5e7b9a31","qualityProfileId":6}""", "ok", Added,
            api => api.Requests.RetryAsync(RequestId, new AddOverrides { ServerId = "b3e1f7a2-9c4d-4e8b-a1f0-6d2c5e7b9a31", QualityProfileId = 6 }),
            "retry with add overrides"),
        new("GET", RequestPath + "/comments", null, "comment-thread", ServerChange.None,
            api => api.RequestComments.ListAsync(RequestId), "request comments"),
        new("POST", RequestPath + "/comments", """{"body":"Could it be the 4K one?"}""", AddedComment, ServerChange.None,
            api => api.RequestComments.AddAsync(RequestId, "Could it be the 4K one?"), "add a request comment"),
        new("PATCH", RequestPath + "/comments/" + CommentId, """{"body":"Or the regular one"}""", "ok", ServerChange.None,
            api => api.RequestComments.EditAsync(RequestId, CommentId, "Or the regular one"), "edit a request comment"),
        new("DELETE", RequestPath + "/comments/" + CommentId, null, "ok", ServerChange.None,
            api => api.RequestComments.DeleteAsync(RequestId, CommentId), "delete a request comment"),
        new("GET", IssuePath + "/comments", null, "comment-thread", ServerChange.None,
            api => api.IssueComments.ListAsync(IssueId), "issue comments"),
        new("POST", IssuePath + "/comments", """{"body":"Episode 5"}""", AddedComment, ServerChange.None,
            api => api.Comments(CommentSubject.Issue).AddAsync(IssueId, "Episode 5"), "add an issue comment"),
        new("PATCH", IssuePath + "/comments/" + CommentId, """{"body":"Episode 6"}""", "ok", ServerChange.None,
            api => api.IssueComments.EditAsync(IssueId, CommentId, "Episode 6"), "edit an issue comment"),
        new("DELETE", IssuePath + "/comments/" + CommentId, null, "ok", ServerChange.None,
            api => api.IssueComments.DeleteAsync(IssueId, CommentId), "delete an issue comment"),
    ];

    public static TheoryData<string> CaseNames
    {
        get
        {
            var data = new TheoryData<string>();
            foreach (var testCase in Cases)
            {
                data.Add(testCase.Label);
            }
            return data;
        }
    }

    private static HttpResponseMessage Answer(string response) =>
        response.StartsWith('{') ? StubHttpMessageHandler.Json(200, response) : StubHttpMessageHandler.Fixture(response);

    [Theory]
    [MemberData(nameof(CaseNames))]
    public async Task SendsWhatTheDocSpecifies(string name)
    {
        var testCase = Cases.Single(candidate => candidate.Label == name);
        var stub = new StubHttpMessageHandler();
        stub.Answer(() => Answer(testCase.Response));
        var events = new ServerEvents();
        var raised = new List<ServerChangedEventArgs>();
        events.Changed += (_, args) => raised.Add(args);
        var api = new MarqueeApi(new ApiClient(Base, Token, stub), events);

        await testCase.Call(api);

        var request = Assert.Single(stub.Requests);
        Assert.Equal(testCase.Method, request.Method.Method);
        Assert.Equal("/api/v1" + testCase.Path, request.Path);
        Assert.Empty(request.Query);
        Assert.Equal("Bearer " + Token, request.Authorization);
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
        }
        else
        {
            var change = Assert.Single(raised);
            Assert.Equal(testCase.Changes, change.Change);
            Assert.Equal(ServerChangeSource.Mutation, change.Source);
        }
    }

    [Fact]
    public async Task EditKeepsNullSeasonsOnTheWire()
    {
        // Absent means "unchanged", null means "the whole series": the two
        // bodies must differ, whatever the encoder does with nulls elsewhere.
        var stub = new StubHttpMessageHandler();
        stub.AnswerFixture("ok");
        var api = new MarqueeApi(new ApiClient(Base, Token, stub));

        await api.Requests.EditAsync(RequestId, RequestEdit.WholeSeries(false));
        await api.Requests.EditAsync(RequestId, RequestEdit.FourK(false));

        var whole = stub.Requests[0].JsonBody!.AsObject();
        Assert.True(whole.ContainsKey("seasons"));
        Assert.Null(whole["seasons"]);
        Assert.False(stub.Requests[1].JsonBody!.AsObject().ContainsKey("seasons"));
    }

    [Fact]
    public async Task ResultsDecodeIntoTheirValues()
    {
        var stub = new StubHttpMessageHandler();
        stub.Answer(request => request.Path.EndsWith("/edit-options", StringComparison.Ordinal)
            ? StubHttpMessageHandler.Fixture("request-edit-options")
            : request.Method == HttpMethod.Post
                ? StubHttpMessageHandler.Json(200, AddedComment)
                : StubHttpMessageHandler.Fixture("comment-thread"));
        var api = new MarqueeApi(new ApiClient(Base, Token, stub));

        var options = await api.Requests.EditOptionsAsync(RequestId);
        Assert.Equal("Severance", options.Title);
        Assert.Equal([2], options.Seasons!);

        var thread = await api.RequestComments.ListAsync(RequestId);
        Assert.Equal(2, thread.Results.Count);

        Assert.Equal(CommentId, await api.RequestComments.AddAsync(RequestId, "Hi"));
    }

    [Fact]
    public async Task ARefusedChangeRecordsNothing()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(409, """{"error":"It's already been reviewed, so it can't be changed. Ask in its comments instead.","code":"conflict"}""");
        var events = new ServerEvents();
        var api = new MarqueeApi(new ApiClient(Base, Token, stub), events);

        var error = await Assert.ThrowsAsync<ApiException>(() => api.Requests.EditAsync(RequestId, RequestEdit.FourK(true)));
        Assert.Equal(ApiErrorKind.Conflict, error.Kind);
        Assert.Equal("It's already been reviewed, so it can't be changed. Ask in its comments instead.", error.Message);
        Assert.Equal(0, events.Revision(ServerChange.All));

        stub.AnswerJson(403, """{"error":"Only whoever asked can cancel it — decline it instead.","code":"forbidden"}""");
        var cancel = await Assert.ThrowsAsync<ApiException>(() => api.Requests.CancelAsync(RequestId));
        Assert.Equal(ApiErrorKind.Forbidden, cancel.Kind);
        Assert.Equal(0, events.Revision(ServerChange.All));
    }

    // MARK: CommentThreadModel

    private static (CommentThreadModel Thread, StubHttpMessageHandler Stub) MakeThread(CommentSubject subject = CommentSubject.Request, int count = 0)
    {
        var stub = new StubHttpMessageHandler();
        var api = new MarqueeApi(new ApiClient(Base, Token, stub));
        return (new CommentThreadModel(() => api, subject, subject == CommentSubject.Issue ? IssueId : RequestId, count), stub);
    }

    [Fact]
    public async Task ThreadLoadsOnDemandAndCountsRealComments()
    {
        var (thread, stub) = MakeThread(count: 5);
        stub.AnswerFixture("comment-thread");

        Assert.False(thread.IsLoaded);
        Assert.Equal(5, thread.Count);
        Assert.False(thread.CanComment);
        Assert.Empty(thread.Comments);
        Assert.Empty(stub.Requests);

        await thread.LoadAsync();

        Assert.True(thread.IsLoaded);
        Assert.Equal("/api/v1" + RequestPath + "/comments", Assert.Single(stub.Requests).Path);
        Assert.Equal(1, thread.Count);
        Assert.True(thread.CanComment);
        Assert.Equal(2000, thread.MaxLength);
        Assert.Equal(2, thread.Comments.Count);
        Assert.Null(thread.LoadError);

        // Once loaded, the thread's own count beats a list reload's.
        thread.UpdateCount(9);
        Assert.Equal(1, thread.Count);
    }

    [Fact]
    public void ACountFromTheListIsTakenUntilLoaded()
    {
        var (thread, _) = MakeThread(count: 1);
        thread.UpdateCount(3);
        Assert.Equal(3, thread.Count);
    }

    [Fact]
    public async Task SendPostsThenReloads()
    {
        var (thread, stub) = MakeThread(CommentSubject.Issue);
        stub.Answer(request => request.Method == HttpMethod.Post
            ? StubHttpMessageHandler.Json(200, AddedComment)
            : StubHttpMessageHandler.Fixture("comment-thread"));

        var error = await thread.SendAsync("  Episode 5,\r\nabout 20 minutes in  ");

        Assert.Null(error);
        Assert.Equal(2, stub.Requests.Count);
        Assert.Equal(HttpMethod.Post, stub.Requests[0].Method);
        Assert.Equal("/api/v1" + IssuePath + "/comments", stub.Requests[0].Path);
        Assert.True(JsonNode.DeepEquals(JsonNode.Parse("""{"body":"Episode 5,\nabout 20 minutes in"}"""), stub.Requests[0].JsonBody));
        Assert.Equal(HttpMethod.Get, stub.Requests[1].Method);
        Assert.True(thread.IsLoaded);
        Assert.Equal(1, thread.Count);
    }

    [Fact]
    public async Task AnEmptyDraftIsNeverSent()
    {
        var (thread, stub) = MakeThread();
        stub.AnswerFixture("ok");

        Assert.Equal("Write something first.", await thread.SendAsync(" \r\n "));
        Assert.Equal("Write something first.", await thread.EditAsync(CommentId, ""));
        Assert.Empty(stub.Requests);
    }

    [Fact]
    public async Task ARefusalIsReturnedAndNothingReloads()
    {
        var (thread, stub) = MakeThread();
        stub.AnswerJson(429, """{"error":"That's a lot of comments in a short time. Try again in a few minutes.","code":"rate_limited"}""");

        var error = await thread.SendAsync("Hi");

        Assert.Equal("That's a lot of comments in a short time. Try again in a few minutes.", error);
        Assert.Single(stub.Requests);
        Assert.False(thread.IsLoaded);
    }

    [Fact]
    public async Task EditAndDeleteReloadTheThread()
    {
        var (thread, stub) = MakeThread();
        stub.Answer(request => request.Method == HttpMethod.Get
            ? StubHttpMessageHandler.Fixture("comment-thread")
            : StubHttpMessageHandler.Fixture("ok"));

        Assert.Null(await thread.EditAsync(CommentId, "Which episode, exactly?"));
        Assert.Equal(HttpMethod.Patch, stub.Requests[0].Method);
        Assert.Equal("/api/v1" + RequestPath + "/comments/" + CommentId, stub.Requests[0].Path);
        Assert.True(JsonNode.DeepEquals(JsonNode.Parse("""{"body":"Which episode, exactly?"}"""), stub.Requests[0].JsonBody));
        Assert.Equal(HttpMethod.Get, stub.Requests[1].Method);

        Assert.Null(await thread.DeleteAsync(CommentId));
        Assert.Equal(HttpMethod.Delete, stub.Requests[2].Method);
        Assert.Equal(HttpMethod.Get, stub.Requests[3].Method);
    }

    [Fact]
    public async Task DeletingAGoneCommentJustReloads()
    {
        var (thread, stub) = MakeThread();
        stub.Answer(request => request.Method == HttpMethod.Delete
            ? StubHttpMessageHandler.Json(404, """{"error":"Comment not found.","code":"not_found"}""")
            : StubHttpMessageHandler.Fixture("comment-thread"));

        Assert.Null(await thread.DeleteAsync(CommentId));
        Assert.Equal(2, stub.Requests.Count);
        Assert.True(thread.IsLoaded);
    }

    [Fact]
    public async Task AnExpiredEditSaysSoInsteadOfAdminsOnly()
    {
        var (thread, stub) = MakeThread();
        stub.AnswerJson(403, """{"error":"Comments can only be changed for 15 minutes after posting.","code":"forbidden"}""");

        Assert.Equal("Comments can only be changed for 15 minutes after posting.", await thread.EditAsync(CommentId, "Later"));
        Assert.Equal("Comments can only be changed for 15 minutes after posting.", await thread.DeleteAsync(CommentId));
        Assert.Equal(2, stub.Requests.Count);
    }

    [Fact]
    public void LifecycleRefusalsUseTheServersWords()
    {
        Assert.Equal("Only whoever asked can cancel it — decline it instead.", LifecycleErrors.ForRequestChange(ApiException.Forbidden(403)));
        Assert.Equal("Request not found.", LifecycleErrors.ForRequestChange(ApiException.NotFound(404)));
        var conflict = ApiException.Conflict("It's already been reviewed, so it can't be cancelled. Ask in its comments instead.");
        Assert.Equal(conflict.Message, LifecycleErrors.ForRequestChange(conflict));

        Assert.Equal("Comment not found.", LifecycleErrors.ForComment(ApiException.NotFound(404)));
        Assert.Equal("Couldn't load the conversation.", LifecycleErrors.ForThread(ApiException.Forbidden(403)));
        Assert.Equal("Something broke", LifecycleErrors.ForThread(ApiException.Server("Something broke")));
    }

    [Fact]
    public async Task ALoadFailureShowsOnlyWithoutAThread()
    {
        var (thread, stub) = MakeThread();
        stub.AnswerJson(404, """{"error":"Not found.","code":"not_found"}""");

        await thread.LoadAsync();
        Assert.False(thread.IsLoaded);
        Assert.Equal("Couldn't load the conversation.", thread.LoadError);

        stub.AnswerFixture("comment-thread");
        await thread.LoadAsync();
        Assert.True(thread.IsLoaded);
        Assert.Null(thread.LoadError);

        // A later failure keeps the thread that's showing.
        stub.AnswerJson(500, """{"error":"Something went wrong.","code":"internal"}""");
        await thread.LoadAsync();
        Assert.True(thread.IsLoaded);
        Assert.Null(thread.LoadError);
        Assert.Equal(2, thread.Comments.Count);
    }
}
