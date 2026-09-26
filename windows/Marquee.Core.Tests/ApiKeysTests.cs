using System.Text.Json.Nodes;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// API keys and the stats summary (api-v1.md section 16, 0.47+): the shared
// fixtures, each call's method, path, body and recorded change, the words
// each key's row shows, and ApiKeysModel (the Settings card's rules).

public sealed class ApiKeysTests
{
    private static readonly Uri Base = new("http://127.0.0.1:3000");
    private const string Token = "mqt_testtesttesttesttesttesttesttesttesttesttes";

    // Uppercase on purpose: the path and body carry the lowercase form.
    private static readonly Guid KeyId = Guid.Parse("B3A9E0D4-8C1F-4E2B-A7D6-5F0E9C8B7A61");
    private static readonly Guid KidId = Guid.Parse("83C55A49-6153-4CB9-AE22-4A42D48F4CF3");

    private static MarqueeApi Api(StubHttpMessageHandler stub, ServerEvents? events = null) =>
        new(new ApiClient(Base, Token, stub), events);

    // MARK: Fixtures

    [Fact]
    public void ListFixtureDecodes()
    {
        var keys = Fixtures.Decode<ListResponse<ApiKey>>("api-keys").Results;
        Assert.Equal(2, keys.Count);

        var homepage = keys[0];
        Assert.Equal(Guid.Parse("6f0c1c7e-2a57-4a3e-9d0e-6c1f5f4b2a10"), homepage.Id);
        Assert.Equal("Homepage", homepage.Name);
        Assert.Equal(ApiKeyScope.Read, homepage.Scope);
        Assert.Null(homepage.ActAs);
        Assert.Null(homepage.ActAsLabel);
        Assert.Equal("mq_Q2xp", homepage.Hint);
        Assert.Equal(Json.ParseDate("2026-09-26T10:00:00.000Z"), homepage.CreatedAt);
        Assert.Equal(Json.ParseDate("2026-09-26T11:59:40.000Z"), homepage.LastUsedAt);
        Assert.Null(homepage.ExpiresAt);
        Assert.False(homepage.Expired);
        Assert.Equal("Read-only", homepage.ScopeLabel);
        Assert.Equal("Never expires", homepage.ExpiryLabel);
        Assert.Equal("Created Sep 26, 2026", homepage.CreatedLabel);
        Assert.Equal("Last used 2 minutes ago", homepage.LastUsedLabel(Json.ParseDate("2026-09-26T12:02:00.000Z")!.Value));

        var kid = keys[1];
        Assert.Equal(KeyId, kid.Id);
        Assert.Equal(ApiKeyScope.Full, kid.Scope);
        Assert.Equal("Full access", kid.ScopeLabel);
        Assert.NotNull(kid.ActAs);
        Assert.Equal(KidId, kid.ActAs.UserId);
        Assert.Equal("member1", kid.ActAs.Username);
        Assert.Equal("as Kid", kid.ActAsLabel);
        Assert.Null(kid.LastUsedAt);
        Assert.Equal("Never used", kid.LastUsedLabel(DateTimeOffset.UtcNow));
        Assert.Equal("Expires Dec 19, 2026", kid.ExpiryLabel);
        Assert.Equal("Created Sep 20, 2026", kid.CreatedLabel);
        Assert.Equal("Expired", (kid with { Expired = true }).ExpiryLabel);
    }

    [Fact]
    public void CreatedFixtureDecodes()
    {
        var created = Fixtures.Decode<CreatedApiKey>("api-key-created");
        Assert.StartsWith("mq_", created.Key);
        Assert.Equal(46, created.Key.Length);
        Assert.Equal("Homepage", created.ApiKey.Name);
        Assert.Equal(created.Key[..7], created.ApiKey.Hint);
        Assert.Null(created.ApiKey.LastUsedAt);
    }

    [Fact]
    public void StatsSummaryFixtureDecodes()
    {
        var stats = Fixtures.Decode<StatsSummary>("stats-summary");
        Assert.Equal(3, stats.PendingRequests);
        Assert.Equal(1, stats.OpenIssues);
        Assert.Equal(2, stats.CantFind);
        Assert.Equal(812, stats.Movies);
        Assert.Equal(164, stats.Series);
        Assert.Equal(4, stats.Downloading);
    }

    [Fact]
    public void AnUnknownScopeDecodes()
    {
        var json = Fixtures.Read("api-keys").Replace("\"scope\": \"full\"", "\"scope\": \"admin\"");
        var key = Json.Decode<ListResponse<ApiKey>>(json).Results[1];
        Assert.False(key.Scope.IsKnown);
        Assert.Equal("Full access", key.ScopeLabel);
    }

    // MARK: Labels

    [Theory]
    [InlineData(null, "Never used")]
    [InlineData(0, "Last used just now")]
    [InlineData(119, "Last used just now")]
    [InlineData(120, "Last used 2 minutes ago")]
    [InlineData(59 * 60, "Last used 59 minutes ago")]
    [InlineData(60 * 60, "Last used 1 hour ago")]
    [InlineData(5 * 60 * 60, "Last used 5 hours ago")]
    [InlineData(24 * 60 * 60, "Last used yesterday")]
    [InlineData(3 * 24 * 60 * 60, "Last used 3 days ago")]
    [InlineData(29 * 24 * 60 * 60, "Last used 29 days ago")]
    [InlineData(30 * 24 * 60 * 60, "Last used Aug 27, 2026")]
    public void LastUsedLabels(int? secondsAgo, string expected)
    {
        var now = new DateTimeOffset(2026, 9, 26, 12, 0, 0, TimeSpan.Zero);
        DateTimeOffset? used = secondsAgo is { } seconds ? now.AddSeconds(-seconds) : null;
        Assert.Equal(expected, ApiKeyLabels.LastUsed(used, now));
    }

    [Fact]
    public void DatesArePrintedInUtc()
    {
        // 11:30 pm in New York on Dec 18 is Dec 19 in UTC, as the website prints it.
        var late = new DateTimeOffset(2026, 12, 18, 23, 30, 0, TimeSpan.FromHours(-5));
        Assert.Equal("Expires Dec 19, 2026", ApiKeyLabels.Expiry(late, expired: false));
        Assert.Equal("Created Dec 19, 2026", ApiKeyLabels.Created(late));
        Assert.Equal("Expired", ApiKeyLabels.Expiry(late, expired: true));
        Assert.Equal("Never expires", ApiKeyLabels.Expiry(null, expired: false));
    }

    [Fact]
    public void ExpiryChoicesMatchTheWebsite()
    {
        Assert.Equal(["Never", "30 days", "90 days", "1 year"], ApiKeyLabels.ExpiryChoices.Select(choice => choice.Label));
        Assert.Equal([null, 30, 90, 365], ApiKeyLabels.ExpiryChoices.Select(choice => choice.Days));
    }

    [Fact]
    public void ActAsChoicesLeaveOutTheAdmin()
    {
        var members = Fixtures.Decode<ListResponse<HouseholdMember>>("users").Results;
        var choices = ApiKeyActAsChoice.For(members);
        Assert.Equal(ApiKeyActAsChoice.Admin, choices[0]);
        Assert.Equal("Admin (you)", choices[0].Label);
        Assert.Null(choices[0].UserId);
        Assert.DoesNotContain(choices.Skip(1), choice => members.Any(member => member.Id == choice.UserId && (member.Role == UserRole.Admin || member.IsCurrentUser)));
        Assert.Equal(members.Count(member => member.Role != UserRole.Admin && !member.IsCurrentUser), choices.Count - 1);

        // The admin's own row (and anyone marked as you) is "Admin (you)" already.
        var kid = members.Single(member => member.Username == "member1");
        var household = new[]
        {
            kid with { Id = Guid.NewGuid(), Username = "timmy", DisplayName = "Timmy", Role = UserRole.Admin, IsCurrentUser = true },
            kid,
            kid with { Id = Guid.NewGuid(), Username = "gran", DisplayName = null, Role = UserRole.Trusted },
        };
        Assert.Equal(
            [ApiKeyActAsChoice.Admin, new ApiKeyActAsChoice("Kid", KidId), new ApiKeyActAsChoice("gran", household[2].Id)],
            ApiKeyActAsChoice.For(household));
    }

    // MARK: Requests

    /// <param name="Body">Expected JSON body; null means no body at all.</param>
    private sealed record Case(string Method, string Path, string? Body, string Response, ServerChange Changes, Func<MarqueeApi, Task> Call, string? Label = null)
    {
        public string Name => Label ?? $"{Method} {Path}";
    }

    private static readonly Case[] Cases =
    [
        new("GET", "/settings/api-keys", null, "api-keys", ServerChange.None, api => api.ApiKeys.ListAsync()),
        new("POST", "/settings/api-keys", """{"name":"Homepage","scope":"read"}""", "api-key-created", ServerChange.Integrations,
            api => api.ApiKeys.CreateAsync(new CreateApiKeyRequest(" Homepage ", ApiKeyScope.Read))),
        new("POST", "/settings/api-keys",
            """{"name":"Kid's request app","scope":"full","actAsUserId":"83c55a49-6153-4cb9-ae22-4a42d48f4cf3","expiresInDays":90}""",
            "api-key-created", ServerChange.Integrations,
            api => api.ApiKeys.CreateAsync(new CreateApiKeyRequest("Kid's request app", ApiKeyScope.Full, KidId, 90)),
            Label: "POST api-keys acting as a member, expiring"),
        new("DELETE", "/settings/api-keys/b3a9e0d4-8c1f-4e2b-a7d6-5f0e9c8b7a61", null, "ok", ServerChange.Integrations,
            api => api.ApiKeys.RevokeAsync(KeyId)),
        new("GET", "/stats/summary", null, "stats-summary", ServerChange.None, api => api.Stats.SummaryAsync()),
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
        stub.Answer(() => StubHttpMessageHandler.Json(testCase.Method == "POST" ? 201 : 200, Fixtures.Read(testCase.Response)));
        var events = new ServerEvents();
        var raised = new List<ServerChangedEventArgs>();
        events.Changed += (_, args) => raised.Add(args);

        await testCase.Call(Api(stub, events));

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
            Assert.Equal(testCase.Changes, Assert.Single(raised).Change);
        }
    }

    [Fact]
    public async Task AnOlderServersListIsNull()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(404, """{"error":"Not found","code":"not_found"}""");
        Assert.Null(await Api(stub).ApiKeys.ListAsync());
    }

    [Fact]
    public async Task AFailedCreateRecordsNothing()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(400, """{"error":"Keep the name under 80 characters.","code":"invalid"}""");
        var events = new ServerEvents();
        var raised = new List<ServerChangedEventArgs>();
        events.Changed += (_, args) => raised.Add(args);
        var error = await Assert.ThrowsAsync<ApiException>(() => Api(stub, events).ApiKeys.CreateAsync(new CreateApiKeyRequest(new string('x', 81), ApiKeyScope.Read)));
        Assert.Equal(ApiErrorKind.Invalid, error.Kind);
        Assert.Equal("Keep the name under 80 characters.", error.Message);
        Assert.Empty(raised);
    }

    // MARK: ApiKeysModel

    /// <summary>A server with keys and members: GET answers the fixtures, POST the created key, DELETE ok.</summary>
    private static StubHttpMessageHandler Server(int listStatus = 200)
    {
        var stub = new StubHttpMessageHandler();
        stub.Answer(request => (request.Method.Method, request.Path) switch
        {
            ("GET", "/api/v1/settings/api-keys") when listStatus != 200 =>
                StubHttpMessageHandler.Json(listStatus, """{"error":"Nope","code":"x"}"""),
            ("GET", "/api/v1/settings/api-keys") => StubHttpMessageHandler.Fixture("api-keys"),
            ("GET", "/api/v1/users") => StubHttpMessageHandler.Fixture("users"),
            ("POST", "/api/v1/settings/api-keys") => StubHttpMessageHandler.Json(201, CreatedJson),
            ("DELETE", _) => StubHttpMessageHandler.Fixture("ok"),
            _ => StubHttpMessageHandler.Json(404, """{"error":"Not found","code":"not_found"}"""),
        });
        return stub;
    }

    /// <summary>The created fixture as a third key, so it joins the list rather than replacing the first.</summary>
    private static readonly string CreatedJson =
        Fixtures.Read("api-key-created").Replace("6f0c1c7e-2a57-4a3e-9d0e-6c1f5f4b2a10", "11111111-2222-4333-8444-555555555555");

    [Fact]
    public async Task LoadShowsTheKeysAndTheMembers()
    {
        var stub = Server();
        var model = new ApiKeysModel(() => Api(stub));
        Assert.False(model.IsAvailable);
        Assert.Equal([ApiKeyActAsChoice.Admin], model.ActAsChoices);

        await model.LoadAsync();

        Assert.True(model.IsAvailable);
        Assert.Equal(["Homepage", "Kid's request app"], model.Keys.Select(key => key.Name));
        Assert.Equal(["/api/v1/settings/api-keys", "/api/v1/users"], stub.Requests.Select(request => request.Path));
        var members = Fixtures.Decode<ListResponse<HouseholdMember>>("users").Results;
        Assert.Equal(ApiKeyActAsChoice.For(members), model.ActAsChoices);
        Assert.Null(model.NewKey);
    }

    [Theory]
    [InlineData(404)]
    [InlineData(403)]
    public async Task AnOlderServerOrAMemberHidesTheCard(int status)
    {
        var stub = Server(status);
        var model = new ApiKeysModel(() => Api(stub));
        await model.LoadAsync();
        Assert.False(model.IsAvailable);
        Assert.Empty(model.Keys);
        // The member list isn't asked for.
        Assert.Single(stub.Requests);
    }

    [Fact]
    public async Task AFailedReloadKeepsWhatsShown()
    {
        var failing = false;
        var stub = new StubHttpMessageHandler();
        stub.Answer(request => failing
            ? StubHttpMessageHandler.Json(500, """{"error":"Something went wrong.","code":"internal"}""")
            : StubHttpMessageHandler.Fixture(request.Path.EndsWith("/users") ? "users" : "api-keys"));
        var model = new ApiKeysModel(() => Api(stub));
        await model.LoadAsync();
        failing = true;
        await model.LoadAsync();
        Assert.True(model.IsAvailable);
        Assert.Equal(2, model.Keys.Count);
        Assert.True(model.ActAsChoices.Count >= 1);
    }

    [Fact]
    public async Task AFailedMemberListKeepsTheAdminChoice()
    {
        var stub = new StubHttpMessageHandler();
        stub.Answer(request => request.Path.EndsWith("/users")
            ? StubHttpMessageHandler.Json(500, """{"error":"Something went wrong.","code":"internal"}""")
            : StubHttpMessageHandler.Fixture("api-keys"));
        var model = new ApiKeysModel(() => Api(stub));
        await model.LoadAsync();
        Assert.True(model.IsAvailable);
        Assert.Equal([ApiKeyActAsChoice.Admin], model.ActAsChoices);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task ABlankNameIsRefusedWithoutARequest(string? name)
    {
        var stub = Server();
        var model = new ApiKeysModel(() => Api(stub));
        Assert.Equal("Give the key a name, like Homepage.", await model.CreateAsync(name, ApiKeyScope.Read));
        Assert.Empty(stub.Requests);
        Assert.Null(model.NewKey);
    }

    [Fact]
    public async Task CreateShowsTheSecretOnceThenDoneClearsIt()
    {
        var stub = Server();
        var model = new ApiKeysModel(() => Api(stub));
        await model.LoadAsync();
        stub.Requests.Clear();

        var kid = new ApiKeyActAsChoice("Kid", KidId);
        var error = await model.CreateAsync("  Homepage 2 ", ApiKeyScope.Full, kid, ApiKeyLabels.ExpiryChoices[3]);

        Assert.Null(error);
        var request = Assert.Single(stub.Requests);
        Assert.Equal(HttpMethod.Post, request.Method);
        Assert.True(JsonNode.DeepEquals(
            JsonNode.Parse("""{"name":"Homepage 2","scope":"full","actAsUserId":"83c55a49-6153-4cb9-ae22-4a42d48f4cf3","expiresInDays":365}"""),
            request.JsonBody), request.Body);
        Assert.Equal("mq_Q2xpY2tpbmcgdGhpcyBpcyBub3QgYSByZWFsIGtleSE", model.NewKey);
        Assert.Equal(3, model.Keys.Count);
        Assert.Equal(Guid.Parse("11111111-2222-4333-8444-555555555555"), model.Keys[^1].Id);

        model.Done();
        Assert.Null(model.NewKey);
        Assert.Equal(3, model.Keys.Count);
    }

    [Fact]
    public async Task TheAdminChoiceAndNeverSendNeitherField()
    {
        var stub = Server();
        var model = new ApiKeysModel(() => Api(stub));
        Assert.Null(await model.CreateAsync("Homepage", ApiKeyScope.Read, ApiKeyActAsChoice.Admin, ApiKeyLabels.ExpiryChoices[0]));
        var request = Assert.Single(stub.Requests);
        Assert.True(JsonNode.DeepEquals(JsonNode.Parse("""{"name":"Homepage","scope":"read"}"""), request.JsonBody), request.Body);
    }

    [Fact]
    public async Task AFailedCreateSaysWhy()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(404, """{"error":"That household member doesn't exist any more.","code":"not_found"}""");
        var model = new ApiKeysModel(() => Api(stub));
        Assert.Equal("That household member doesn't exist any more.", await model.CreateAsync("Kid", ApiKeyScope.Read, new ApiKeyActAsChoice("Kid", KidId)));
        Assert.Null(model.NewKey);
        Assert.Empty(model.Keys);
    }

    [Fact]
    public async Task RevokeRemovesTheKey()
    {
        var stub = Server();
        var model = new ApiKeysModel(() => Api(stub));
        await model.LoadAsync();
        stub.Requests.Clear();

        Assert.Null(await model.RevokeAsync(KeyId));

        var request = Assert.Single(stub.Requests);
        Assert.Equal(HttpMethod.Delete, request.Method);
        Assert.Equal("/api/v1/settings/api-keys/b3a9e0d4-8c1f-4e2b-a7d6-5f0e9c8b7a61", request.Path);
        Assert.Equal(["Homepage"], model.Keys.Select(key => key.Name));
    }

    [Fact]
    public async Task RevokingAKeyThatsAlreadyGoneJustRemovesIt()
    {
        var stub = Server();
        var model = new ApiKeysModel(() => Api(stub));
        await model.LoadAsync();
        stub.AnswerJson(404, """{"error":"That API key doesn't exist any more.","code":"not_found"}""");
        Assert.Null(await model.RevokeAsync(KeyId));
        Assert.Single(model.Keys);
    }

    [Fact]
    public async Task AFailedRevokeKeepsTheKeyAndSaysWhy()
    {
        var stub = Server();
        var model = new ApiKeysModel(() => Api(stub));
        await model.LoadAsync();
        stub.AnswerJson(403, """{"error":"Only the admin can manage API keys.","code":"forbidden"}""");
        Assert.Equal("Only the admin can manage API keys.", await model.RevokeAsync(KeyId));
        Assert.Equal(2, model.Keys.Count);
    }
}
