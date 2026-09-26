using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// The notifications rows of the Mac's MarqueeAPIRequestTests: each method
// against a stubbed server must send exactly the method, path and query
// docs/api-v1.md section 8 specifies, and the doc's example response must
// decode into its return value. Marking read records a Notifications change;
// reading never records anything.

public sealed class MarqueeApiNotificationsRequestTests
{
    private static readonly Uri Base = new("http://127.0.0.1:3000");

    // Parsed from uppercase on purpose: the path must carry the lowercase
    // form the server prints, whatever the caller's Guid came from.
    private static readonly Guid NotificationId = Guid.Parse("BEDCB20B-FA30-4683-B000-42AFFC320087");

    /// <param name="Query">Expected query, percent-decoded; empty means none.</param>
    /// <param name="Changes">What a successful call records; None for a read.</param>
    /// <param name="Label">Distinguishes two cases on the same endpoint.</param>
    private sealed record Case(
        string Method,
        string Path,
        IReadOnlyDictionary<string, string> Query,
        string Response,
        ServerChange Changes,
        Func<MarqueeApi, Task> Call,
        string? Label = null)
    {
        public string Name => Label ?? $"{Method} {Path}";
    }

    private static IReadOnlyDictionary<string, string> Query(params (string Key, string Value)[] pairs) =>
        pairs.ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.Ordinal);

    // Declared before Cases: static initializers run in textual order.
    private static readonly IReadOnlyDictionary<string, string> NoQuery = Query();

    private static readonly Case[] Cases =
    [
        new("GET", "/notifications", Query(("limit", "5")), "notifications", ServerChange.None,
            api => api.Notifications.ListAsync(limit: 5)),
        new("GET", "/notifications", NoQuery, "notifications", ServerChange.None,
            api => api.Notifications.ListAsync(), Label: "GET /notifications with the server's default limit"),
        new("GET", "/notifications/unread-count", NoQuery, "notifications-unread-count", ServerChange.None,
            api => api.Notifications.UnreadCountAsync()),
        new("POST", "/notifications/read-all", NoQuery, "ok", ServerChange.Notifications,
            api => api.Notifications.MarkAllReadAsync()),
        new("POST", "/notifications/bedcb20b-fa30-4683-b000-42affc320087/read", NoQuery, "ok", ServerChange.Notifications,
            api => api.Notifications.MarkReadAsync(NotificationId)),
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
        Assert.Equal(testCase.Query.Count, request.Query.Count);
        foreach (var (key, value) in testCase.Query)
        {
            Assert.True(request.Query.TryGetValue(key, out var actual), $"{name} is missing ?{key}");
            Assert.Equal(value, actual);
        }
        Assert.Equal("Bearer mqt_testtesttesttesttesttesttesttesttesttesttes", request.Authorization);
        // None of these takes a body: the two actions send an empty POST,
        // which the contract accepts for parameterless actions.
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
            Assert.Equal(1, events.Revision(ServerChange.Notifications));
            Assert.Equal(0, events.Revision(ServerChange.All & ~ServerChange.Notifications));
        }
    }

    [Fact]
    public async Task ResultsDecodeIntoTheirValues()
    {
        var stub = new StubHttpMessageHandler();
        stub.Answer(request => request.Path switch
        {
            "/api/v1/notifications" => StubHttpMessageHandler.Fixture("notifications"),
            "/api/v1/notifications/unread-count" => StubHttpMessageHandler.Fixture("notifications-unread-count"),
            _ => StubHttpMessageHandler.Fixture("ok"),
        });
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub));

        var list = await api.Notifications.ListAsync();
        Assert.Equal(1, list.UnreadCount);
        Assert.Equal(3, list.Results.Count);
        var item = list.Results[0];
        Assert.Equal(NotificationId, item.Id);
        Assert.Equal(NotificationEventType.RequestRejected, item.EventType);
        Assert.Equal(NotificationEventType.RequestComment, list.Results[1].EventType);
        Assert.Equal(NotificationEventType.TitleShared, list.Results[2].EventType);
        Assert.False(item.Read);

        Assert.Equal(1, await api.Notifications.UnreadCountAsync());

        await api.Notifications.MarkReadAsync(item.Id);
        await api.Notifications.MarkAllReadAsync();
        Assert.Equal(4, stub.Requests.Count);
    }

    [Fact]
    public async Task SomeoneElsesNotificationIsNotFoundAndRecordsNothing()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(404, """{"error":"Notification not found.","code":"not_found"}""");
        var events = new ServerEvents();
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub), events);

        var error = await Assert.ThrowsAsync<ApiException>(() => api.Notifications.MarkReadAsync(NotificationId));

        // NotFound carries no server text (as Swift's .notFound): the app
        // shows its own wording for it.
        Assert.Equal(ApiErrorKind.NotFound, error.Kind);
        Assert.Null(error.ServerMessage);
        Assert.Equal(0, events.Revision(ServerChange.All));
    }

    [Fact]
    public async Task WithoutAServerEveryCallIsUnauthorized()
    {
        var api = new MarqueeApi(null);

        var error = await Assert.ThrowsAsync<ApiException>(() => api.Notifications.ListAsync());
        Assert.Equal(ApiErrorKind.Unauthorized, error.Kind);
    }
}
