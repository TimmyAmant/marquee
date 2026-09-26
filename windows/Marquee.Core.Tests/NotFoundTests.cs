using System.Text.Json.Nodes;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// "Can't find" (0.46+): approved requests Sonarr/Radarr hasn't found. The
// list and its actions, the badge, the history and title-page flags, and the
// words lib/requests/not-found-rules.ts uses.

public sealed class NotFoundTests
{
    private static readonly Uri Base = new("http://127.0.0.1:3000");
    private const string Token = "mqt_testtesttesttesttesttesttesttesttesttesttes";

    // Uppercase on purpose: the path carries the lowercase form.
    private static readonly Guid RequestId = Guid.Parse("9A7D2C11-5E3B-4F0A-8C6D-2B1E0F9A8D77");

    // MARK: Decoding

    [Fact]
    public void ListDecodes()
    {
        var list = Fixtures.Decode<NotFoundRequests>("requests-not-found");
        Assert.Equal(24, list.AfterHours);
        var request = Assert.Single(list.Results);
        Assert.Equal(RequestId, request.Id);
        Assert.Equal(MediaType.Movie, request.MediaType);
        Assert.Equal(425, request.TmdbId);
        Assert.Equal("Ice Age", request.Title);
        Assert.Equal("/gLhHHZUzeseRXShoDyC4VqLgsNv.jpg", request.PosterPath?.Path);
        Assert.Null(request.Seasons);
        Assert.Null(request.SeasonsLabel);
        Assert.False(request.Is4k);
        Assert.Equal("", request.DetailText);
        Assert.Equal("Susan", request.RequestedBy.Label);
        Assert.Equal(Json.ParseDate("2026-09-17T17:02:11.100Z"), request.CreatedAt);
        Assert.Equal(Json.ParseDate("2026-09-17T17:05:40.020Z"), request.ReviewedAt);
        Assert.Equal(Json.ParseDate("2026-09-18T18:20:00.412Z"), request.NotFoundSince);
        Assert.Equal("b3e1f7a2-9c4d-4e8b-a1f0-6d2c5e7b9a31", request.Server?.Id);
        Assert.Equal("Radarr", request.Server?.Name);
        Assert.Equal(ArrProvider.Radarr, request.Server?.Kind);
        Assert.Equal("http://192.168.1.10:7878/movie/425", request.ArrUrl);
        Assert.Equal(new Uri("http://192.168.1.10:7878/movie/425"), request.ArrLink);
        Assert.Equal("Open in Radarr", request.OpenInArrLabel);
        Assert.Equal("Radarr is searching again…", request.SearchingMessage);
        Assert.Equal(NotFoundLabels.Hint(MediaType.Movie), request.HintText);
        Assert.Equal(request.TitleId, new TitleId(MediaType.Movie, 425));
        Assert.Equal(
            "Approved and released, but Sonarr/Radarr still has nothing 24 hours or more after approval. Most often no indexer has a copy yet.",
            list.Explanation);
    }

    [Fact]
    public void ARowWithoutTheOptionalPartsStillDecodes()
    {
        var json = """
            {"results":[{"id":"9a7d2c11-5e3b-4f0a-8c6d-2b1e0f9a8d77","mediaType":"tv","tmdbId":1396,"title":"Breaking Bad",
              "posterPath":null,"seasons":[2],"seasonsLabel":null,"is4k":true,
              "requestedBy":{"userId":null,"displayName":null,"username":"member1","label":"member1"},
              "createdAt":"2026-09-17T17:02:11.100Z","reviewedAt":null,"notFoundSince":"2026-09-18T18:20:00.412Z",
              "server":{"id":null,"name":null,"kind":"sonarr"},"arrUrl":null,"hint":null}]}
            """;
        var request = Assert.Single(Json.Decode<NotFoundRequests>(json).Results);
        Assert.Equal(24, Json.Decode<NotFoundRequests>(json).AfterHours);
        Assert.Equal("Season 2 · In 4K", request.DetailText);
        Assert.Null(request.ArrLink);
        Assert.Equal("Open in Sonarr", request.OpenInArrLabel);
        Assert.Equal("Sonarr is searching again…", request.SearchingMessage);
        Assert.Equal(NotFoundLabels.Hint(MediaType.Tv), request.HintText);
        Assert.StartsWith("In Sonarr,", request.HintText, StringComparison.Ordinal);
        Assert.Equal("member1 · can't find for 2 hours (since Sep 18)",
            request.MetaLine(request.NotFoundSince.AddHours(2.5), "Sep 18"));
    }

    [Fact]
    public void OnlyHttpAndHttpsArrLinksOpen()
    {
        var request = Fixtures.Decode<NotFoundRequests>("requests-not-found").Results[0];
        Assert.Equal(new Uri("https://radarr.example.com/movie/425"), (request with { ArrUrl = "https://radarr.example.com/movie/425" }).ArrLink);
        Assert.Null((request with { ArrUrl = "file:///C:/Windows/System32/calc.exe" }).ArrLink);
        Assert.Null((request with { ArrUrl = "ms-settings:display" }).ArrLink);
        Assert.Null((request with { ArrUrl = "/movie/425" }).ArrLink);
        Assert.Null((request with { ArrUrl = "  " }).ArrLink);
    }

    [Fact]
    public void MetaLineMatchesTheWebsite()
    {
        var request = Fixtures.Decode<NotFoundRequests>("requests-not-found").Results[0];
        var now = request.NotFoundSince.AddDays(3).AddHours(5);
        Assert.Equal("Susan · can't find for 3 days (since Sep 18, 2026) · Radarr", request.MetaLine(now, "Sep 18, 2026"));

        // Without a server name the last part is left out.
        var unnamed = request with { Server = new NotFoundServer { Kind = ArrProvider.Radarr } };
        Assert.Equal("Susan · can't find for 3 days (since Sep 18, 2026)", unnamed.MetaLine(now, "Sep 18, 2026"));
        Assert.Equal("Radarr is searching again…", unnamed.SearchingMessage);

        // No server at all: the kind comes from the media type.
        var bare = request with { Server = null };
        Assert.Equal("Open in Radarr", bare.OpenInArrLabel);
    }

    [Fact]
    public void AgeLabelMatchesNotFoundAgeLabel()
    {
        var since = new DateTimeOffset(2026, 9, 18, 18, 20, 0, TimeSpan.Zero);
        Assert.Equal("under an hour", NotFoundLabels.AgeLabel(since, since));
        Assert.Equal("under an hour", NotFoundLabels.AgeLabel(since, since.AddMinutes(59)));
        Assert.Equal("under an hour", NotFoundLabels.AgeLabel(since, since.AddHours(-5)));
        Assert.Equal("1 hour", NotFoundLabels.AgeLabel(since, since.AddMinutes(61)));
        Assert.Equal("2 hours", NotFoundLabels.AgeLabel(since, since.AddHours(2)));
        Assert.Equal("47 hours", NotFoundLabels.AgeLabel(since, since.AddHours(47).AddMinutes(59)));
        Assert.Equal("2 days", NotFoundLabels.AgeLabel(since, since.AddHours(48)));
        Assert.Equal("2 days", NotFoundLabels.AgeLabel(since, since.AddHours(71)));
        Assert.Equal("3 days", NotFoundLabels.AgeLabel(since, since.AddHours(72)));
        Assert.Equal("30 days", NotFoundLabels.AgeLabel(since, since.AddDays(30)));
    }

    [Fact]
    public void ExplanationSaysHourForOne()
    {
        var list = new NotFoundRequests { AfterHours = 1, Results = [] };
        Assert.Contains("nothing 1 hour or more", list.Explanation, StringComparison.Ordinal);
    }

    [Fact]
    public void BadgesCountCantFind()
    {
        var badges = Fixtures.Decode<Badges>("badges");
        Assert.Equal(1, badges.NotFoundRequests);
        Assert.Equal(badges.PendingRequests + badges.OpenIssues + badges.NotFoundRequests, badges.RequestsBadge);
        Assert.Equal(3, badges.RequestsBadge);

        // An older server leaves it out: 0.
        var older = Json.Decode<Badges>("""{"unreadNotifications":2,"pendingRequests":3,"openIssues":1}""");
        Assert.Equal(0, older.NotFoundRequests);
        Assert.Equal(4, older.RequestsBadge);
        Assert.NotEqual(badges, badges with { NotFoundRequests = 2 });
    }

    [Fact]
    public void HistoryCarriesNotFoundSince()
    {
        var history = Fixtures.Decode<ListResponse<ReviewedRequest>>("requests-history").Results;
        Assert.Null(history[0].NotFoundSince);
        Assert.False(history[0].IsNotFound);
        Assert.Equal(Json.ParseDate("2026-09-18T18:20:00.412Z"), history[1].NotFoundSince);
        Assert.True(history[1].IsNotFound);

        // Only an approved request shows the badge.
        Assert.False((history[1] with { Status = RequestStatus.Rejected }).IsNotFound);

        // An older server leaves it out.
        var json = JsonNode.Parse(Fixtures.Read("requests-history"))!;
        foreach (var row in json["results"]!.AsArray())
        {
            row!.AsObject().Remove("notFoundSince");
        }
        var older = Json.Decode<ListResponse<ReviewedRequest>>(json.ToJsonString()).Results;
        Assert.All(older, row => Assert.False(row.IsNotFound));
    }

    [Fact]
    public void TitleViewerCarriesNotFoundSince()
    {
        Assert.Null(Fixtures.Decode<TitleDetail>("title-detail").Viewer.NotFoundSince);
        Assert.Equal(Json.ParseDate("2026-09-18T18:20:00.412Z"), Fixtures.Decode<TitleStatus>("title-status").Viewer.NotFoundSince);

        var json = JsonNode.Parse(Fixtures.Read("title-status"))!;
        json["viewer"]!.AsObject().Remove("notFoundSince");
        Assert.Null(Json.Decode<TitleStatus>(json.ToJsonString()).Viewer.NotFoundSince);
    }

    [Fact]
    public void NotificationKind()
    {
        var kind = NotificationEventType.FromValue("request_not_found");
        Assert.Equal(NotificationEventType.RequestNotFound, kind);
        Assert.True(kind.IsKnown);
        Assert.Equal("🔍", kind.Emoji);
        Assert.Equal("Can't find it", kind.NotificationTitle);
    }

    [Fact]
    public void PreferencesListTheNewEventsFromTheServer()
    {
        // The rows come from the server, labels included: nothing here lists them.
        var json = """
            {"events":[
              {"event":"request_not_found","label":"Sonarr/Radarr can't find a request","reviewerOnly":true,"inApp":true,"push":true,"channels":{}},
              {"event":"request_still_looking","label":"Still looking for something I asked for","reviewerOnly":false,"inApp":false,"push":false,"channels":{}}
            ]}
            """;
        var preferences = Json.Decode<NotificationPreferences>(json);
        Assert.Equal(["request_not_found", "request_still_looking"], preferences.Events.Select(row => row.Event));
        Assert.Equal("Sonarr/Radarr can't find a request", preferences.Events[0].Label);
    }

    // MARK: Requests

    /// <param name="Body">Expected JSON body; null means no body at all.</param>
    private sealed record Case(string Method, string Path, string? Body, string Response, ServerChange Changes, Func<MarqueeApi, Task> Call);

    private static readonly Case[] Cases =
    [
        new("GET", "/requests/not-found", null, "requests-not-found", ServerChange.None, api => api.Requests.NotFoundAsync()),
        new("POST", "/requests/9a7d2c11-5e3b-4f0a-8c6d-2b1e0f9a8d77/not-found/search", null, "ok", ServerChange.Library,
            api => api.Requests.SearchNotFoundAsync(RequestId)),
        new("POST", "/requests/9a7d2c11-5e3b-4f0a-8c6d-2b1e0f9a8d77/not-found/dismiss", null, "ok", ServerChange.Requests | ServerChange.Notifications,
            api => api.Requests.DismissNotFoundAsync(RequestId)),
        new("GET", "/settings/not-found", null, "not-found-settings", ServerChange.None, api => api.Jobs.NotFoundSettingsAsync()),
        new("PUT", "/settings/not-found", """{"afterHours":48}""", "not-found-settings", ServerChange.Jobs,
            api => api.Jobs.SaveNotFoundSettingsAsync(48)),
    ];

    public static TheoryData<string> CaseNames
    {
        get
        {
            var data = new TheoryData<string>();
            foreach (var testCase in Cases)
            {
                data.Add($"{testCase.Method} {testCase.Path}");
            }
            return data;
        }
    }

    [Theory]
    [MemberData(nameof(CaseNames))]
    public async Task SendsWhatTheDocSpecifies(string name)
    {
        var testCase = Cases.Single(candidate => $"{candidate.Method} {candidate.Path}" == name);
        var stub = new StubHttpMessageHandler();
        stub.AnswerFixture(testCase.Response);
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
    public async Task AnOlderServerAnswers404()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(404, """{"error":"Not found","code":"not_found"}""");
        var api = new MarqueeApi(new ApiClient(Base, Token, stub));
        var error = await Assert.ThrowsAsync<ApiException>(() => api.Requests.NotFoundAsync());
        Assert.Equal(ApiErrorKind.NotFound, error.Kind);
    }

    [Fact]
    public async Task SettingsFromAnOlderServerAreNull()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(404, """{"error":"Not found","code":"not_found"}""");
        var api = new MarqueeApi(new ApiClient(Base, Token, stub));
        Assert.Null(await api.Jobs.NotFoundSettingsAsync());
    }

    [Fact]
    public async Task AGoneRequestIsNotFoundAndRecordsNothing()
    {
        // The Requests page reloads on NotFound instead of showing an error.
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(404, """{"error":"That request isn't in Can't find any more.","code":"not_found"}""");
        var events = new ServerEvents();
        var raised = new List<ServerChangedEventArgs>();
        events.Changed += (_, args) => raised.Add(args);
        var api = new MarqueeApi(new ApiClient(Base, Token, stub), events);
        var error = await Assert.ThrowsAsync<ApiException>(() => api.Requests.DismissNotFoundAsync(RequestId));
        Assert.Equal(ApiErrorKind.NotFound, error.Kind);
        Assert.Empty(raised);
    }
}
