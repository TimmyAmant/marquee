using System.Text.Json.Nodes;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// Problem reports (0.38+): each call sends the method, path and body the
// doc specifies, and records the change it makes.

public sealed class MarqueeApiIssuesRequestTests
{
    private static readonly Uri Base = new("http://127.0.0.1:3000");
    private const string Token = "mqt_testtesttesttesttesttesttesttesttesttesttes";

    // Uppercase on purpose: the path carries the lowercase form.
    private static readonly Guid IssueId = Guid.Parse("83BEDF64-C5D8-4F43-98A0-BB615C4B9897");

    private const string Reported = """{"ok":true,"issueId":"83bedf64-c5d8-4f43-98a0-bb615c4b9897"}""";

    /// <param name="Body">Expected JSON body; null means no body at all.</param>
    /// <param name="Response">A fixture name, or raw JSON when it starts with "{".</param>
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

    private static readonly Case[] Cases =
    [
        new("GET", "/issues", null, "issues", ServerChange.None, api => api.Issues.ListAsync()),
        new("POST", "/titles/tv/1396/issues", """{"kind":"audio","message":"Out of sync after 20 minutes","seasonNumber":2,"episodeNumber":5}""",
            Reported, ServerChange.Requests,
            api => api.Issues.ReportAsync(MediaType.Tv, 1396, new ReportIssueBody(IssueKind.Audio, "Out of sync after 20 minutes", 2, 5))),
        new("POST", "/titles/movie/603/issues", """{"kind":"wont_play"}""", Reported, ServerChange.Requests,
            api => api.Issues.ReportAsync(MediaType.Movie, 603, new ReportIssueBody(IssueKind.WontPlay))),
        new("POST", "/issues/83bedf64-c5d8-4f43-98a0-bb615c4b9897/resolve", null, "ok", ServerChange.Requests | ServerChange.Notifications,
            api => api.Issues.ResolveAsync(IssueId)),
        new("POST", "/issues/83bedf64-c5d8-4f43-98a0-bb615c4b9897/resolve", """{"note":"Replaced the file"}""", "ok",
            ServerChange.Requests | ServerChange.Notifications,
            api => api.Issues.ResolveAsync(IssueId, "Replaced the file"), Label: "POST /issues/{id}/resolve with a note"),
        new("POST", "/issues/83bedf64-c5d8-4f43-98a0-bb615c4b9897/resolve", null, "ok", ServerChange.Requests | ServerChange.Notifications,
            api => api.Issues.ResolveAsync(IssueId, "   "), Label: "POST /issues/{id}/resolve with a blank note"),
        new("POST", "/issues/83bedf64-c5d8-4f43-98a0-bb615c4b9897/search", null, "ok", ServerChange.Library,
            api => api.Issues.SearchAgainAsync(IssueId)),
        new("DELETE", "/issues/83bedf64-c5d8-4f43-98a0-bb615c4b9897", null, "ok", ServerChange.Requests,
            api => api.Issues.DeleteAsync(IssueId)),
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
        if (testCase.Response.StartsWith('{'))
        {
            stub.AnswerJson(200, testCase.Response);
        }
        else
        {
            stub.AnswerFixture(testCase.Response);
        }
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
    public async Task ReportReturnsTheNewId()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(200, Reported);
        var api = new MarqueeApi(new ApiClient(Base, Token, stub));
        var id = await api.Issues.ReportAsync(MediaType.Tv, 1396, new ReportIssueBody(IssueKind.Audio));
        Assert.Equal(IssueId, id);
    }

    [Fact]
    public async Task ReportSendsTheSharedFixtureBody()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(200, Reported);
        var api = new MarqueeApi(new ApiClient(Base, Token, stub));
        await api.Issues.ReportAsync(MediaType.Tv, 1396, new ReportIssueBody(IssueKind.Audio, "Out of sync after 20 minutes", 2, 5));
        var request = Assert.Single(stub.Requests);
        Assert.True(JsonNode.DeepEquals(JsonNode.Parse(Fixtures.Read("issue-report-body")), request.JsonBody), request.Body);
    }

    [Fact]
    public async Task ARateLimitedReportCarriesTheServersMessage()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(429, """{"code":"rate_limited","error":"That's a lot of reports in a short time. Try again in a while."}""");
        var api = new MarqueeApi(new ApiClient(Base, Token, stub));
        var error = await Assert.ThrowsAsync<ApiException>(() =>
            api.Issues.ReportAsync(MediaType.Movie, 603, new ReportIssueBody(IssueKind.Video)));
        Assert.Equal("That's a lot of reports in a short time. Try again in a while.", error.Message);
    }
}
