using System.Text.Json;
using System.Text.Json.Nodes;
using Marquee.Core.Api;
using Marquee.Core.Connection;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// Sign in with Plex / Jellyfin, linked accounts and member import (the Mac's
// MediaSignInTests): decoding with the new fields present and absent (older
// servers), the request each call sends, and the Plex poll loop against a
// stubbed server. Inline JSON: the doc's fixtures don't cover these yet.

public sealed class MediaSignInDecodingTests
{
    // The fields every User / HouseholdMember has, without the braces.
    private const string UserBase = "\"id\":\"6f1c2a4e-8b1d-4c3e-9f0a-2b7d5e8c1a90\",\"username\":\"timmy\",\"displayName\":\"Timmy\",\"role\":\"member\",\"libraryOwnerId\":\"6f1c2a4e-8b1d-4c3e-9f0a-2b7d5e8c1a90\"";
    private const string MemberBase = "\"id\":\"6f1c2a4e-8b1d-4c3e-9f0a-2b7d5e8c1a90\",\"username\":\"sam\",\"displayName\":null,\"role\":\"member\",\"autoApproveMovies\":false,\"autoApproveTv\":false,\"createdAt\":\"2026-09-01T12:00:00.000Z\",\"isCurrentUser\":false";

    private static T Decode<T>(string json) => JsonSerializer.Deserialize<T>(json, Json.Options)!;

    [Fact]
    public void ServerInfoSignInMethods()
    {
        var info = Decode<ServerInfo>("""{"app":"marquee","apiVersion":1,"version":"0.33.0","setupComplete":true,"status":"ok","signIn":{"password":true,"plex":true,"jellyfin":false}}""");
        Assert.Equal(new SignInMethods { Password = true, Plex = true, Jellyfin = false }, info.SignIn);
        Assert.True(info.OffersPlexSignIn);
        Assert.False(info.OffersJellyfinSignIn);

        var jellyfinOnly = Decode<ServerInfo>("""{"app":"marquee","apiVersion":1,"version":"0.33.0","setupComplete":true,"status":"ok","signIn":{"jellyfin":true}}""");
        Assert.True(jellyfinOnly.SignIn!.Password);
        Assert.False(jellyfinOnly.OffersPlexSignIn);
        Assert.True(jellyfinOnly.OffersJellyfinSignIn);
    }

    [Fact]
    public void ServerInfoJellyfinName()
    {
        // 0.40+: an Emby server connected through the Jellyfin integration.
        var emby = Decode<ServerInfo>("""{"app":"marquee","apiVersion":1,"version":"0.40.0","setupComplete":true,"status":"ok","signIn":{"password":true,"plex":false,"jellyfin":true,"jellyfinName":"Emby"}}""");
        Assert.Equal("Emby", emby.SignIn!.JellyfinName);
        Assert.Equal("Emby", emby.JellyfinName);
        Assert.Equal("Emby", emby.MediaServerName(MediaServerKind.Jellyfin));
        Assert.Equal("Plex", emby.MediaServerName(MediaServerKind.Plex));

        // Before 0.40 the field is missing: "Jellyfin". Blank or null reads the same.
        var older = Decode<ServerInfo>("""{"app":"marquee","apiVersion":1,"version":"0.39.0","setupComplete":true,"status":"ok","signIn":{"jellyfin":true}}""");
        Assert.Equal("Jellyfin", older.SignIn!.JellyfinName);
        Assert.Equal("Jellyfin", older.JellyfinName);
        Assert.Equal("Jellyfin", Decode<SignInMethods>("""{"jellyfinName":null}""").JellyfinName);
        Assert.Equal("Jellyfin", Decode<SignInMethods>("""{"jellyfinName":" "}""").JellyfinName);

        // No signIn at all (older still, or degraded).
        var none = Decode<ServerInfo>("""{"app":"marquee","apiVersion":1,"version":"0.32.0","setupComplete":true,"status":"ok"}""");
        Assert.Equal("Jellyfin", none.JellyfinName);
        Assert.Equal("Jellyfin", none.MediaServerName(MediaServerKind.Jellyfin));
    }

    [Fact]
    public void MediaServerLabels()
    {
        Assert.Equal("Jellyfin", MediaServerKind.Jellyfin.Label());
        Assert.Equal("Emby", MediaServerKind.Jellyfin.Label("Emby"));
        Assert.Equal("Jellyfin", MediaServerKind.Jellyfin.Label(null));
        Assert.Equal("Plex", MediaServerKind.Plex.Label("Emby"));
        // Internal identifiers stay "jellyfin".
        Assert.Equal("jellyfin", MediaServerKind.Jellyfin.WireValue());
    }

    [Fact]
    public void OlderServerInfoOffersNoNewButtons()
    {
        var info = Decode<ServerInfo>("""{"app":"marquee","apiVersion":1,"version":"0.32.0","setupComplete":true,"status":"ok"}""");
        Assert.Null(info.SignIn);
        Assert.False(info.OffersPlexSignIn);
        Assert.False(info.OffersJellyfinSignIn);
    }

    [Fact]
    public void UserLinkedAndHasPassword()
    {
        var linked = Decode<User>($$"""{{{UserBase}},"linked":{"plex":true,"jellyfin":false},"hasPassword":false}""");
        Assert.Equal(new LinkedAccounts { Plex = true, Jellyfin = false }, linked.Linked);
        Assert.False(linked.HasPassword);
        Assert.True(linked.Linked!.IsLinked(MediaServerKind.Plex));
        Assert.False(linked.Linked.IsLinked(MediaServerKind.Jellyfin));

        var old = Decode<User>($$"""{{{UserBase}}}""");
        Assert.Null(old.Linked);
        Assert.Null(old.HasPassword);

        var me = Decode<Me>($$"""{{{UserBase}},"autoApproveMovies":false,"autoApproveTv":false,"createdAt":"2026-09-01T12:00:00.000Z","linked":{"plex":false,"jellyfin":true},"hasPassword":true}""");
        Assert.Equal(new LinkedAccounts { Plex = false, Jellyfin = true }, me.User.Linked);
        Assert.True(me.User.HasPassword);
        var oldMe = Decode<Me>($$"""{{{UserBase}},"autoApproveMovies":false,"autoApproveTv":false,"createdAt":"2026-09-01T12:00:00.000Z"}""");
        Assert.Null(oldMe.User.Linked);
    }

    [Fact]
    public void HouseholdMemberTags()
    {
        var member = Decode<HouseholdMember>($$"""{{{MemberBase}},"linked":{"plex":true,"jellyfin":true},"hasPassword":false}""");
        Assert.Equal(new LinkedAccounts { Plex = true, Jellyfin = true }, member.Linked);
        Assert.False(member.HasPassword);

        var old = Decode<HouseholdMember>($$"""{{{MemberBase}}}""");
        Assert.Null(old.Linked);
        Assert.Null(old.HasPassword);
    }

    [Fact]
    public void PlexStartAndImportShapes()
    {
        var start = Decode<PlexSignInStart>("""{"handle":"h_123","authUrl":"https://app.plex.tv/auth#?code=ABCD","expiresAt":"2026-09-25T12:10:00.000Z"}""");
        Assert.Equal("h_123", start.Handle);
        Assert.Equal(new DateTimeOffset(2026, 9, 25, 12, 10, 0, TimeSpan.Zero), start.ExpiresAt);

        var list = Decode<ListResponse<ImportCandidate>>("""
            {"results":[
              {"id":12345,"username":"sam","displayName":"Sam","thumb":"https://plex.tv/users/abc/avatar","alreadyMember":false},
              {"id":"f3a1c2","username":"alex","displayName":null,"thumb":null,"alreadyMember":true},
              {"id":"9","username":"kim"}
            ]}
            """);
        Assert.Equal(new[] { new ExternalId(12345), new ExternalId("f3a1c2"), new ExternalId("9") }, list.Results.Select(row => row.Id));
        Assert.Equal(new[] { false, true, false }, list.Results.Select(row => row.AlreadyMember));
        Assert.Equal("Sam", list.Results[0].Label);
        Assert.Equal("alex", list.Results[1].Label);
        Assert.Null(list.Results[2].Thumb);

        var result = Decode<ImportUsersResult>($$"""{"created":[{{{MemberBase}},"linked":{"plex":true,"jellyfin":false},"hasPassword":false}],"skipped":2}""");
        Assert.Single(result.Created);
        Assert.True(result.Created[0].Linked!.Plex);
        Assert.Equal(2, result.Skipped);

        Assert.False(Decode<SignInSettings>("""{"mediaServerSignup":false}""").MediaServerSignup);
    }

    [Fact]
    public void IdsGoBackAsTheyCame()
    {
        var body = System.Text.Encoding.UTF8.GetString(Json.EncodeBody(new ImportUsersRequest([new ExternalId(12345), new ExternalId("f3a1c2")])));
        Assert.Equal("""{"ids":[12345,"f3a1c2"]}""", body);
    }

    [Fact]
    public void PollSteps()
    {
        static ApiClient.RawResponse Raw(int status, string body) =>
            new(status, true, "application/json", null, System.Text.Encoding.UTF8.GetBytes(body));

        Assert.Null(PlexPoll.Step(Raw(202, """{"status":"pending"}""")));
        Assert.NotNull(PlexPoll.Step(Raw(200, "{}")));

        var expired = Assert.Throws<ApiException>(() => PlexPoll.Step(Raw(410, "")));
        Assert.Equal(ApiErrorKind.Expired, expired.Kind);
        Assert.Equal("The Plex sign-in expired. Try again.", expired.Message);

        var refused = Assert.Throws<ApiException>(() => PlexPoll.Step(Raw(403, """{"error":"Ask the admin to add you first.","code":"forbidden"}""")));
        Assert.Equal(ApiErrorKind.Forbidden, refused.Kind);
        Assert.Equal("Ask the admin to add you first.", refused.Message);

        var bare = Assert.Throws<ApiException>(() => PlexPoll.Step(Raw(403, "nope")));
        Assert.Equal(ApiException.SignInRefusedDefaultMessage, bare.Message);
    }
}

public sealed class MediaSignInRequestTests
{
    private static readonly Uri Base = new("http://127.0.0.1:3000");
    private const string Token = "mqt_testtesttesttesttesttesttesttesttesttesttes";
    private const string MemberJson = """{"id":"6f1c2a4e-8b1d-4c3e-9f0a-2b7d5e8c1a90","username":"sam","displayName":null,"role":"member","autoApproveMovies":false,"autoApproveTv":false,"createdAt":"2026-09-01T12:00:00.000Z","isCurrentUser":false}""";
    private const string LoginJson = """{"token":"mqt_freshfreshfreshfreshfreshfreshfreshfreshfre","expiresAt":"2026-12-16T12:00:00.000Z","user":{"id":"6f1c2a4e-8b1d-4c3e-9f0a-2b7d5e8c1a90","username":"timmy","displayName":"Timmy","role":"member","libraryOwnerId":"6f1c2a4e-8b1d-4c3e-9f0a-2b7d5e8c1a90"}}""";
    private const string StartJson = """{"handle":"h_123","authUrl":"https://app.plex.tv/auth#?code=ABCD","expiresAt":"2099-01-01T00:00:00.000Z"}""";

    /// <param name="Body">Expected JSON body; null means no body at all.</param>
    /// <param name="Records">Whether a success records a change for the screens.</param>
    private sealed record Case(string Name, string Method, string Path, string? Body, int Status, string Response, bool Records, Func<MarqueeApi, Task> Call);

    private static readonly Case[] Cases =
    [
        new("plex start", "POST", "/auth/plex/start", null, 200, StartJson, false, async api =>
            Assert.Equal("h_123", (await api.Auth.PlexStartAsync()).Handle)),
        new("plex poll pending", "POST", "/auth/plex/poll", """{"handle":"h_123","deviceName":"PC"}""", 202, """{"status":"pending"}""", false, async api =>
            Assert.Null(await api.Auth.PlexPollAsync("h_123", "PC"))),
        new("plex poll done", "POST", "/auth/plex/poll", """{"handle":"h_123","deviceName":"PC"}""", 200, LoginJson, false, async api =>
            Assert.Equal("mqt_freshfreshfreshfreshfreshfreshfreshfreshfre", (await api.Auth.PlexPollAsync("h_123", "PC"))!.Token)),
        new("jellyfin", "POST", "/auth/jellyfin", """{"username":"sam","password":"pw","deviceName":"PC"}""", 200, LoginJson, false, async api =>
            Assert.Equal("timmy", (await api.Auth.JellyfinAsync("sam", "pw", "PC")).User.Username)),
        new("link plex start", "POST", "/me/links/plex/start", null, 200, StartJson, false, api => api.Links.PlexStartAsync()),
        new("link plex pending", "POST", "/me/links/plex/poll", """{"handle":"h_123"}""", 202, """{"status":"pending"}""", false, async api =>
            Assert.False(await api.Links.PlexPollAsync("h_123"))),
        new("link plex done", "POST", "/me/links/plex/poll", """{"handle":"h_123"}""", 200, """{"ok":true}""", true, async api =>
            Assert.True(await api.Links.PlexPollAsync("h_123"))),
        new("link jellyfin", "POST", "/me/links/jellyfin", """{"username":"sam","password":"pw"}""", 200, """{"ok":true}""", true, api =>
            api.Links.JellyfinAsync("sam", "pw")),
        new("unlink plex", "DELETE", "/me/links/plex", null, 200, """{"ok":true}""", true, api => api.Links.UnlinkAsync(MediaServerKind.Plex)),
        new("unlink jellyfin", "DELETE", "/me/links/jellyfin", null, 200, """{"ok":true}""", true, api => api.Links.UnlinkAsync(MediaServerKind.Jellyfin)),
        new("import plex list", "GET", "/users/import/plex", null, 200, """{"results":[{"id":1,"username":"sam","displayName":"Sam","thumb":null,"alreadyMember":false}]}""", false, async api =>
            Assert.Equal(new ExternalId(1), (await api.Users.ImportCandidatesAsync(MediaServerKind.Plex))[0].Id)),
        new("import jellyfin list", "GET", "/users/import/jellyfin", null, 200, """{"results":[]}""", false, async api =>
            Assert.Empty(await api.Users.ImportCandidatesAsync(MediaServerKind.Jellyfin))),
        new("import plex", "POST", "/users/import/plex", """{"ids":[1,2]}""", 200, $$"""{"created":[{{MemberJson}}],"skipped":1}""", true, async api =>
            Assert.Equal(1, (await api.Users.ImportAsync(MediaServerKind.Plex, [new ExternalId(1), new ExternalId(2)])).Skipped)),
        new("import jellyfin", "POST", "/users/import/jellyfin", """{"ids":["a1"]}""", 200, """{"created":[],"skipped":0}""", true, api =>
            api.Users.ImportAsync(MediaServerKind.Jellyfin, [new ExternalId("a1")])),
        new("sign-in settings", "GET", "/settings/sign-in", null, 200, """{"mediaServerSignup":true}""", false, async api =>
            Assert.True((await api.Users.SignInSettingsAsync()).MediaServerSignup)),
        new("save sign-in settings", "PUT", "/settings/sign-in", """{"mediaServerSignup":false}""", 200, """{"mediaServerSignup":false}""", true, api =>
            api.Users.SaveSignInSettingsAsync(new SignInSettings { MediaServerSignup = false })),
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
    public async Task SendsWhatTheContractSpecifies(string name)
    {
        var testCase = Cases.Single(candidate => candidate.Name == name);
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(testCase.Status, testCase.Response);
        var events = new ServerEvents();
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
        }
        Assert.Equal(testCase.Records, events.Revision(ServerChange.All) != 0);
    }

    [Fact]
    public async Task RefusalsCarryTheServersMessage()
    {
        var stub = new StubHttpMessageHandler();
        var api = new MarqueeApi(new ApiClient(Base, handler: stub));

        stub.AnswerJson(403, """{"error":"Ask the admin to add you first.","code":"forbidden"}""");
        var refused = await Assert.ThrowsAsync<ApiException>(() => api.Auth.JellyfinAsync("sam", "pw", "PC"));
        Assert.Equal(ApiErrorKind.Forbidden, refused.Kind);
        Assert.Equal("Ask the admin to add you first.", refused.Message);

        stub.AnswerJson(401, """{"error":"Incorrect username or password","code":"invalid_credentials"}""");
        var wrong = await Assert.ThrowsAsync<ApiException>(() => api.Auth.JellyfinAsync("sam", "bad", "PC"));
        Assert.Equal(ApiErrorKind.InvalidCredentials, wrong.Kind);

        // Anything but 202/200/403/410 from a poll is an ordinary API error.
        stub.AnswerJson(429, """{"error":"Slow down.","code":"rate_limited"}""");
        var limited = await Assert.ThrowsAsync<ApiException>(() => api.Auth.PlexPollAsync("h", "PC"));
        Assert.Equal(ApiErrorKind.RateLimited, limited.Kind);
        Assert.Equal("Slow down.", limited.Message);
    }
}

/// <summary><see cref="ServerSession"/>'s Plex and Jellyfin sign-in against a stubbed server.</summary>
public sealed class MediaSignInSessionTests
{
    private const string Token = "mqt_plexplexplexplexplexplexplexplexplexplexple";
    private const string LoginJson = $$$"""{"token":"{{{Token}}}","expiresAt":"2026-12-16T12:00:00.000Z","user":{"id":"6f1c2a4e-8b1d-4c3e-9f0a-2b7d5e8c1a90","username":"sam","displayName":"Sam","role":"member","libraryOwnerId":"6f1c2a4e-8b1d-4c3e-9f0a-2b7d5e8c1a90","linked":{"plex":true,"jellyfin":false},"hasPassword":false}}""";
    private static readonly ServerAddress Server = new("127.0.0.1", 9);
    private static readonly TimeSpan Fast = TimeSpan.FromMilliseconds(10);

    private static PlexSignInStart Start() => new()
    {
        Handle = "h_123",
        AuthUrl = "https://app.plex.tv/auth#?code=ABCD",
        ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(10),
    };

    [Theory]
    [InlineData("https://app.plex.tv/auth#?code=ABCD", true)]
    [InlineData("https://plex.tv/link", true)]
    [InlineData("http://app.plex.tv/auth", false)]
    [InlineData("file:///C:/Windows/System32/calc.exe", false)]
    [InlineData("https://app.plex.tv.evil.example/auth", false)]
    [InlineData("https://evilplex.tv/auth", false)]
    [InlineData("marquee://title/movie/1", false)]
    public void PlexStartOpensOnlyPlexTvOverHttps(string authUrl, bool opens)
    {
        Assert.Equal(opens, (Start() with { AuthUrl = authUrl }).Url != null);
        var pin = new PlexPinStart { AuthUrl = authUrl, PinId = 1 };
        Assert.Equal(opens, pin.Url != null);
    }

    private static (ServerSession Session, InMemoryTokenStore Store, StubHttpMessageHandler Stub) Make()
    {
        var settings = new InMemorySettingsStore();
        settings.SetString(ServerSession.ServerSettingsKey, Server.BaseUrlString);
        var store = new InMemoryTokenStore();
        var stub = new StubHttpMessageHandler();
        return (new ServerSession(settings, store, stub, deviceName: "Test PC"), store, stub);
    }

    [Fact]
    public async Task StartAsksTheServerForAHandle()
    {
        var (session, _, stub) = Make();
        stub.AnswerJson(200, """{"handle":"h_9","authUrl":"https://app.plex.tv/auth#?code=X","expiresAt":"2099-01-01T00:00:00.000Z"}""");
        var start = await session.StartPlexSignInAsync();
        Assert.Equal("h_9", start.Handle);
        var request = Assert.Single(stub.Requests);
        Assert.Equal("/api/v1/auth/plex/start", request.Path);
        Assert.Equal("POST", request.Method.Method);
        Assert.Null(request.Authorization);
    }

    [Fact]
    public async Task PendingPendingThenSignedInStoresTheToken()
    {
        var (session, store, stub) = Make();
        var polls = 0;
        stub.Answer(request =>
        {
            Assert.Equal("/api/v1/auth/plex/poll", request.Path);
            Assert.Null(request.Authorization);
            Assert.Equal("h_123", request.JsonBody!["handle"]!.GetValue<string>());
            Assert.Equal("Test PC", request.JsonBody!["deviceName"]!.GetValue<string>());
            return Interlocked.Increment(ref polls) < 3
                ? StubHttpMessageHandler.Json(202, """{"status":"pending"}""")
                : StubHttpMessageHandler.Json(200, LoginJson);
        });

        var user = await session.FinishPlexSignInAsync(Start(), Fast);
        Assert.Equal(3, polls);
        Assert.Equal("sam", user.Username);
        Assert.True(user.Linked!.Plex);
        // Stored exactly like a password sign-in.
        Assert.Equal(Token, store.Token(Server.BaseUrlString));
        Assert.Equal(Token, session.Client!.Token);
        Assert.True(session.IsSignedIn);
    }

    [Fact]
    public async Task ForbiddenShowsTheServersMessage()
    {
        var (session, store, stub) = Make();
        stub.AnswerJson(403, """{"error":"This Plex account doesn't have access to this server.","code":"forbidden"}""");
        var error = await Assert.ThrowsAsync<ApiException>(() => session.FinishPlexSignInAsync(Start(), Fast));
        Assert.Equal("This Plex account doesn't have access to this server.", error.Message);
        // A 403 ends the polling.
        Assert.Single(stub.Requests);
        Assert.Null(store.Token(Server.BaseUrlString));
        Assert.False(session.IsSignedIn);
    }

    [Fact]
    public async Task GoneSaysTheSignInExpired()
    {
        var (session, _, stub) = Make();
        var polls = 0;
        stub.Answer(() => Interlocked.Increment(ref polls) == 1
            ? StubHttpMessageHandler.Json(202, """{"status":"pending"}""")
            : StubHttpMessageHandler.Json(410, """{"error":"Expired","code":"expired"}"""));
        var error = await Assert.ThrowsAsync<ApiException>(() => session.FinishPlexSignInAsync(Start(), Fast));
        Assert.Equal(ApiErrorKind.Expired, error.Kind);
        Assert.Equal("The Plex sign-in expired. Try again.", error.Message);
        Assert.Equal(2, polls);
        Assert.False(session.IsSignedIn);
    }

    [Fact]
    public async Task OtherErrorsStopPolling()
    {
        var (session, _, stub) = Make();
        stub.AnswerJson(500, """{"error":"Boom","code":"internal"}""");
        var error = await Assert.ThrowsAsync<ApiException>(() => session.FinishPlexSignInAsync(Start(), Fast));
        Assert.Equal(ApiErrorKind.Server, error.Kind);
        Assert.Single(stub.Requests);
    }

    [Fact]
    public async Task CancelStopsPolling()
    {
        var (session, store, stub) = Make();
        var polls = 0;
        stub.Answer(() =>
        {
            Interlocked.Increment(ref polls);
            return StubHttpMessageHandler.Json(202, """{"status":"pending"}""");
        });
        using var cancel = new CancellationTokenSource();
        var signIn = session.FinishPlexSignInAsync(Start(), Fast, cancel.Token);

        for (var i = 0; i < 200 && Volatile.Read(ref polls) < 2; i++)
        {
            await Task.Delay(10);
        }
        Assert.True(Volatile.Read(ref polls) >= 2);
        cancel.Cancel();
        var error = await Assert.ThrowsAsync<ApiException>(() => signIn);
        Assert.True(error.IsCancellation, error.Message);

        var afterCancel = Volatile.Read(ref polls);
        await Task.Delay(150);
        Assert.Equal(afterCancel, Volatile.Read(ref polls));
        Assert.Null(store.Token(Server.BaseUrlString));
    }

    [Fact]
    public async Task ExpiresAtEndsPolling()
    {
        var ticks = 0;
        var error = await Assert.ThrowsAsync<ApiException>(() => PlexPoll.RunAsync<object>(
            new DateTimeOffset(1970, 1, 1, 0, 16, 40, TimeSpan.Zero),
            _ => Task.FromResult<object?>(null),
            Fast,
            () => DateTimeOffset.FromUnixTimeSeconds(++ticks > 2 ? 2000 : 0)));
        Assert.Equal(ApiErrorKind.Expired, error.Kind);
    }

    [Fact]
    public async Task JellyfinSignInStoresTheToken()
    {
        var (session, store, stub) = Make();
        stub.Answer(request =>
        {
            Assert.Equal("/api/v1/auth/jellyfin", request.Path);
            Assert.True(JsonNode.DeepEquals(
                JsonNode.Parse("""{"username":"sam","password":"pw","deviceName":"Test PC"}"""),
                request.JsonBody));
            return StubHttpMessageHandler.Json(200, LoginJson);
        });
        var user = await session.LoginWithJellyfinAsync(" sam ", "pw");
        Assert.Equal("sam", user.Username);
        Assert.Equal(Token, store.Token(Server.BaseUrlString));
        Assert.True(session.IsSignedIn);
    }

    [Fact]
    public async Task JellyfinRefusalAndEmptyFields()
    {
        var (session, store, stub) = Make();
        stub.AnswerJson(403, """{"error":"Ask the admin to add you first.","code":"forbidden"}""");
        var refused = await Assert.ThrowsAsync<ApiException>(() => session.LoginWithJellyfinAsync("sam", "pw"));
        Assert.Equal("Ask the admin to add you first.", refused.Message);
        Assert.Null(store.Token(Server.BaseUrlString));

        stub.Requests.Clear();
        var empty = await Assert.ThrowsAsync<ApiException>(() => session.LoginWithJellyfinAsync(" ", ""));
        Assert.Equal(ApiErrorKind.Invalid, empty.Kind);
        Assert.Empty(stub.Requests);
    }
}
