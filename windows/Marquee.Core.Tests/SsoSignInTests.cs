using System.Text.Json;
using System.Text.Json.Nodes;
using Marquee.Core.Api;
using Marquee.Core.Connection;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// Single sign-on and Jellyfin Quick Connect (0.44+): the doc's new and
// updated fixtures, an older server that leaves the new fields out, which
// sign-in pages the app may open, the request each call sends, and the
// polls against a stubbed server.

public sealed class SsoDecodingTests
{
    private static T Decode<T>(string json) => JsonSerializer.Deserialize<T>(json, Json.Options)!;

    [Fact]
    public void ServerInfoFixtureOffersSsoAndQuickConnect()
    {
        var info = Fixtures.Decode<ServerInfo>("server-info");
        Assert.Equal(new SsoSignIn { Name = "Authentik", Signup = false }, info.SignIn!.Sso);
        Assert.True(info.SignIn.QuickConnect);
        Assert.True(info.OffersSsoSignIn);
        Assert.Equal("Authentik", info.SsoName);
        Assert.True(info.OffersQuickConnect);

        // The raw text says so too (a Windows checkout may have \r\n).
        var text = Fixtures.Read("server-info").Replace("\r\n", "\n");
        Assert.Contains("\"quickConnect\": true", text);
    }

    [Fact]
    public void OlderServerInfoHasNeither()
    {
        // 0.43: signIn without sso or quickConnect.
        var older = Decode<ServerInfo>("""{"app":"marquee","apiVersion":1,"version":"0.43.0","setupComplete":true,"status":"ok","signIn":{"password":true,"plex":true,"jellyfin":true,"jellyfinName":"Jellyfin","signup":false}}""");
        Assert.Null(older.SignIn!.Sso);
        Assert.False(older.SignIn.QuickConnect);
        Assert.False(older.OffersSsoSignIn);
        Assert.Null(older.SsoName);
        Assert.False(older.OffersQuickConnect);

        // Set up, then turned off: an explicit null.
        var off = Decode<ServerInfo>("""{"app":"marquee","apiVersion":1,"version":"0.44.0","setupComplete":true,"status":"ok","signIn":{"jellyfin":true,"quickConnect":false,"sso":null}}""");
        Assert.False(off.OffersSsoSignIn);
        Assert.False(off.OffersQuickConnect);

        // No signIn at all.
        var none = Decode<ServerInfo>("""{"app":"marquee","apiVersion":1,"version":"0.32.0","setupComplete":true,"status":"ok"}""");
        Assert.False(none.OffersSsoSignIn);
        Assert.False(none.OffersQuickConnect);

        // `sso` missing its name isn't one we can label: decoding fails.
        Assert.ThrowsAny<JsonException>(() => Decode<SsoSignIn>("""{"signup":true}"""));
        Assert.False(Decode<SsoSignIn>("""{"name":"Pocket ID"}""").Signup);
    }

    [Fact]
    public void QuickConnectNeedsJellyfinSignIn()
    {
        var withoutJellyfin = Decode<ServerInfo>("""{"app":"marquee","apiVersion":1,"version":"0.44.0","setupComplete":true,"status":"ok","signIn":{"jellyfin":false,"quickConnect":true}}""");
        Assert.False(withoutJellyfin.OffersQuickConnect);
    }

    [Fact]
    public void SignupHintNamesSsoFirst()
    {
        var ssoOnly = Decode<ServerInfo>("""{"app":"marquee","apiVersion":1,"version":"0.44.0","setupComplete":true,"status":"ok","signIn":{"plex":true,"signup":false,"sso":{"name":"Authentik","signup":true}}}""");
        Assert.Equal("New here? Use Sign in with Authentik — your account is made for you.", ssoOnly.SignupHint);

        var ssoAndPlex = Decode<ServerInfo>("""{"app":"marquee","apiVersion":1,"version":"0.44.0","setupComplete":true,"status":"ok","signIn":{"plex":true,"signup":true,"sso":{"name":"Authentik","signup":true}}}""");
        Assert.Equal("New here? Use Sign in with Authentik (or Plex) — your account is made for you.", ssoAndPlex.SignupHint);

        var all = Decode<ServerInfo>("""{"app":"marquee","apiVersion":1,"version":"0.44.0","setupComplete":true,"status":"ok","signIn":{"plex":true,"jellyfin":true,"jellyfinName":"Emby","signup":true,"sso":{"name":"Pocket ID","signup":true}}}""");
        Assert.Equal("New here? Use Sign in with Pocket ID (or Plex or Emby) — your account is made for you.", all.SignupHint);

        // SSO without sign-up says nothing about it.
        var ssoNoSignup = Decode<ServerInfo>("""{"app":"marquee","apiVersion":1,"version":"0.44.0","setupComplete":true,"status":"ok","signIn":{"signup":false,"sso":{"name":"Authentik","signup":false}}}""");
        Assert.Null(ssoNoSignup.SignupHint);
    }

    [Fact]
    public void LinkedSso()
    {
        var me = Fixtures.Decode<Me>("me");
        Assert.False(me.Linked!.Sso);
        Assert.Equal(new LinkedAccounts { Plex = true, Jellyfin = false, Sso = false }, me.User.Linked);

        var member = Fixtures.Decode<HouseholdMember>("household-member");
        Assert.Equal(new LinkedAccounts { Plex = false, Jellyfin = true, Sso = false }, member.Linked);

        // Before 0.44 there's no `sso`: not linked.
        Assert.False(Decode<LinkedAccounts>("""{"plex":true,"jellyfin":false}""").Sso);
        Assert.True(Decode<LinkedAccounts>("""{"plex":false,"jellyfin":false,"sso":true}""").Sso);
    }

    [Fact]
    public void StartFixturesDecode()
    {
        var sso = Fixtures.Decode<SsoSignInStart>("auth-sso-start");
        Assert.Equal("pX2vR…43 chars…", sso.Handle);
        Assert.Equal("https://marquee.example.com/login/sso/app?key=Hc9…43 chars…", sso.AuthUrl);
        Assert.Equal(Json.ParseDate("2026-09-25T17:40:00.000Z"), sso.ExpiresAt);
        // https: opens whatever the server's address.
        Assert.NotNull(sso.UrlOn(new Uri("http://192.168.1.20:3000")));

        var quickConnect = Fixtures.Decode<QuickConnectStart>("auth-quick-connect-start");
        Assert.Equal("Qc7Lm…43 chars…", quickConnect.Handle);
        Assert.Equal("482915", quickConnect.Code);
        Assert.Equal(Json.ParseDate("2026-09-25T17:40:00.000Z"), quickConnect.ExpiresAt);
    }

    [Fact]
    public void SettingsFixturesDecode()
    {
        var settings = Fixtures.Decode<SsoSettings>("sso-settings");
        Assert.True(settings.Configured);
        Assert.Equal("Authentik", settings.Name);
        Assert.Equal("https://auth.example.com/application/o/marquee/", settings.Issuer);
        Assert.Equal("marquee", settings.ClientId);
        Assert.True(settings.HasClientSecret);
        Assert.Equal(SsoSettings.DefaultScopes, settings.Scopes);
        Assert.Equal("https://marquee.example.com", settings.PublicUrl);
        Assert.Equal("https://marquee.example.com/api/auth/sso/callback", settings.CallbackUrl);
        Assert.False(settings.AllowSignup);
        Assert.False(settings.MatchEmail);
        Assert.Equal("marquee-users", settings.RequiredGroup);
        Assert.Null(settings.TrustedGroup);
        Assert.Equal(SsoSettings.DefaultGroupsClaim, settings.GroupsClaim);
        // The app computes the same redirect URI the server does.
        Assert.Equal(settings.CallbackUrl, SsoSettings.CallbackUrlFor(settings.PublicUrl));

        var test = Fixtures.Decode<SsoTestResult>("sso-test");
        Assert.Equal("https://auth.example.com/application/o/marquee/", test.Issuer);
        Assert.Equal("https://auth.example.com/application/o/authorize/", test.AuthorizationEndpoint);
        Assert.Equal("https://auth.example.com/application/o/token/", test.TokenEndpoint);
        Assert.Equal("https://auth.example.com/application/o/userinfo/", test.UserinfoEndpoint);
        Assert.Empty(test.Warnings);

        var noUserinfo = Decode<SsoTestResult>("""{"issuer":"http://auth.lan","authorizationEndpoint":"http://auth.lan/a","tokenEndpoint":"http://auth.lan/t","userinfoEndpoint":null,"warnings":["The provider isn't using https."]}""");
        Assert.Null(noUserinfo.UserinfoEndpoint);
        Assert.Equal(["The provider isn't using https."], noUserinfo.Warnings);
    }

    [Theory]
    [InlineData("https://marquee.example.com", "https://marquee.example.com/api/auth/sso/callback")]
    [InlineData("https://marquee.example.com/some/path/", "https://marquee.example.com/api/auth/sso/callback")]
    [InlineData(" http://192.168.1.20:3000 ", "http://192.168.1.20:3000/api/auth/sso/callback")]
    [InlineData("https://marquee.example.com:8443", "https://marquee.example.com:8443/api/auth/sso/callback")]
    [InlineData("marquee.example.com", null)]
    [InlineData("ftp://marquee.example.com", null)]
    [InlineData("", null)]
    public void CallbackUrlFollowsTheTypedAddress(string publicUrl, string? callback) =>
        Assert.Equal(callback, SsoSettings.CallbackUrlFor(publicUrl));

    [Fact]
    public void SaveRequestLeavesOutWhatIsntSet()
    {
        var request = new SsoSettingsRequest
        {
            Name = "Authentik",
            Issuer = "https://auth.example.com/application/o/marquee/",
            ClientId = "marquee",
            Scopes = "openid profile email",
            PublicUrl = "https://marquee.example.com",
            AllowSignup = false,
            MatchEmail = true,
            RequiredGroup = "marquee-users",
            GroupsClaim = "groups",
        };
        var body = JsonNode.Parse(Json.EncodeBody(request))!.AsObject();
        Assert.False(body.ContainsKey("clientSecret"));
        Assert.False(body.ContainsKey("clearClientSecret"));
        Assert.False(body.ContainsKey("trustedGroup"));
        Assert.True(JsonNode.DeepEquals(
            JsonNode.Parse("""{"name":"Authentik","issuer":"https://auth.example.com/application/o/marquee/","clientId":"marquee","scopes":"openid profile email","publicUrl":"https://marquee.example.com","allowSignup":false,"matchEmail":true,"requiredGroup":"marquee-users","groupsClaim":"groups"}"""),
            body));

        var replacing = JsonNode.Parse(Json.EncodeBody(request with { ClientSecret = "s3cret", ClearClientSecret = true }))!.AsObject();
        Assert.Equal("s3cret", replacing["clientSecret"]!.GetValue<string>());
        Assert.True(replacing["clearClientSecret"]!.GetValue<bool>());
    }
}

public sealed class SignInWebTests
{
    private static readonly Uri HttpServer = new("http://192.168.1.20:3000");
    private static readonly Uri HttpsServer = new("https://marquee.example.com");

    [Theory]
    // Any https page.
    [InlineData("https://marquee.example.com/login/sso/app?key=abc", true)]
    [InlineData("https://auth.example.org/authorize", true)]
    // The server's own origin over http.
    [InlineData("http://192.168.1.20:3000/login/sso/app?key=abc", true)]
    [InlineData("HTTP://192.168.1.20:3000/login/sso/app", true)]
    // http anywhere else.
    [InlineData("http://192.168.1.20:3001/login/sso/app", false)]
    [InlineData("http://192.168.1.21:3000/login/sso/app", false)]
    [InlineData("http://evil.example/login/sso/app", false)]
    [InlineData("http://user@192.168.1.20:3000/login/sso/app", false)]
    // Other schemes, and things that aren't absolute URLs.
    [InlineData("javascript:alert(1)", false)]
    [InlineData("file:///C:/Windows/System32/calc.exe", false)]
    [InlineData("marquee://title/movie/1", false)]
    [InlineData("ms-settings:privacy", false)]
    [InlineData("/login/sso/app?key=abc", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void OpensOnlyHttpsOrTheServersOwnPages(string? authUrl, bool opens)
    {
        Assert.Equal(opens, SignInWeb.Url(authUrl, HttpServer) != null);
        var start = new SsoSignInStart { Handle = "h", AuthUrl = authUrl ?? "", ExpiresAt = DateTimeOffset.UtcNow };
        Assert.Equal(opens, start.UrlOn(HttpServer) != null);
    }

    [Fact]
    public void WithoutAServerOnlyHttpsOpens()
    {
        Assert.NotNull(SignInWeb.Url("https://marquee.example.com/login/sso/app", null));
        Assert.Null(SignInWeb.Url("http://192.168.1.20:3000/login/sso/app", null));
    }

    [Fact]
    public void AnHttpsServerDoesntOpenItsHttpTwin()
    {
        Assert.NotNull(SignInWeb.Url("https://marquee.example.com/login/sso/app", HttpsServer));
        Assert.Null(SignInWeb.Url("http://marquee.example.com/login/sso/app", HttpsServer));
        Assert.Null(SignInWeb.Url("http://marquee.example.com:443/login/sso/app", HttpsServer));
    }

    [Fact]
    public void DefaultPortsMatch()
    {
        // The session's address for "http://marquee.lan" (port 80) and the page's.
        var server = new ServerAddress("marquee.lan", 80).BaseUrl;
        Assert.NotNull(SignInWeb.Url("http://marquee.lan/login/sso/app", server));
        Assert.NotNull(SignInWeb.Url("http://MARQUEE.lan:80/login/sso/app", server));
        Assert.Null(SignInWeb.Url("http://marquee.lan:3000/login/sso/app", server));
    }
}

public sealed class SsoRequestTests
{
    private static readonly Uri Base = new("http://127.0.0.1:3000");
    private const string Token = "mqt_testtesttesttesttesttesttesttesttesttesttes";
    private const string LoginJson = """{"token":"mqt_freshfreshfreshfreshfreshfreshfreshfreshfre","expiresAt":"2026-12-16T12:00:00.000Z","user":{"id":"6f1c2a4e-8b1d-4c3e-9f0a-2b7d5e8c1a90","username":"timmy","displayName":"Timmy","role":"member","libraryOwnerId":"6f1c2a4e-8b1d-4c3e-9f0a-2b7d5e8c1a90"}}""";
    private const string Pending = """{"status":"pending"}""";
    private const string SaveBody = """{"name":"Authentik","issuer":"https://auth.example.com/application/o/marquee/","clientId":"marquee","clientSecret":"s3cret","scopes":"openid profile email","publicUrl":"https://marquee.example.com","allowSignup":true,"matchEmail":false,"requiredGroup":"marquee-users","groupsClaim":"groups"}""";

    private static readonly SsoSettingsRequest SaveRequest = new()
    {
        Name = "Authentik",
        Issuer = "https://auth.example.com/application/o/marquee/",
        ClientId = "marquee",
        ClientSecret = "s3cret",
        Scopes = "openid profile email",
        PublicUrl = "https://marquee.example.com",
        AllowSignup = true,
        MatchEmail = false,
        RequiredGroup = "marquee-users",
        GroupsClaim = "groups",
    };

    /// <param name="Body">Expected JSON body; null means no body at all.</param>
    /// <param name="Response">A fixture name, or raw JSON when it starts with "{".</param>
    /// <param name="Records">Whether a success records a change for the screens.</param>
    private sealed record Case(string Name, string Method, string Path, string? Body, int Status, string Response, bool Records, Func<MarqueeApi, Task> Call);

    private static readonly Case[] Cases =
    [
        new("sso start", "POST", "/auth/sso/start", """{"deviceName":"PC"}""", 200, "auth-sso-start", false, async api =>
            Assert.Equal("pX2vR…43 chars…", (await api.Auth.SsoStartAsync("PC")).Handle)),
        new("sso poll pending", "POST", "/auth/sso/poll", """{"handle":"h_1","deviceName":"PC"}""", 202, Pending, false, async api =>
            Assert.Null(await api.Auth.SsoPollAsync("h_1", "PC"))),
        new("sso poll done", "POST", "/auth/sso/poll", """{"handle":"h_1","deviceName":"PC"}""", 200, LoginJson, false, async api =>
            Assert.Equal("timmy", (await api.Auth.SsoPollAsync("h_1", "PC"))!.User.Username)),
        new("quick connect start", "POST", "/auth/jellyfin/quick-connect/start", null, 200, "auth-quick-connect-start", false, async api =>
            Assert.Equal("482915", (await api.Auth.QuickConnectStartAsync()).Code)),
        new("quick connect pending", "POST", "/auth/jellyfin/quick-connect/poll", """{"handle":"h_2","deviceName":"PC"}""", 202, Pending, false, async api =>
            Assert.Null(await api.Auth.QuickConnectPollAsync("h_2", "PC"))),
        new("quick connect done", "POST", "/auth/jellyfin/quick-connect/poll", """{"handle":"h_2","deviceName":"PC"}""", 200, LoginJson, false, async api =>
            Assert.StartsWith("mqt_", (await api.Auth.QuickConnectPollAsync("h_2", "PC"))!.Token)),
        new("link sso start", "POST", "/me/links/sso/start", null, 200, "auth-sso-start", false, async api =>
            Assert.Equal("pX2vR…43 chars…", (await api.Links.SsoStartAsync()).Handle)),
        new("link sso pending", "POST", "/me/links/sso/poll", """{"handle":"h_3"}""", 202, Pending, false, async api =>
            Assert.False(await api.Links.SsoPollAsync("h_3"))),
        new("link sso done", "POST", "/me/links/sso/poll", """{"handle":"h_3"}""", 200, "me", true, async api =>
            Assert.True(await api.Links.SsoPollAsync("h_3"))),
        new("unlink sso", "DELETE", "/me/links/sso", null, 200, "me", true, api => api.Links.UnlinkSsoAsync()),
        new("sso settings", "GET", "/settings/sso", null, 200, "sso-settings", false, async api =>
            Assert.Equal("Authentik", (await api.Sso.GetAsync())!.Name)),
        new("save sso settings", "PUT", "/settings/sso", SaveBody, 200, "sso-settings", true, async api =>
            Assert.True((await api.Sso.SaveAsync(SaveRequest)).Configured)),
        new("remove sso settings", "DELETE", "/settings/sso", null, 200, "sso-settings", true, api => api.Sso.RemoveAsync()),
        new("test sso", "POST", "/settings/sso/test", """{"issuer":"https://auth.example.com/application/o/marquee/"}""", 200, "sso-test", false, async api =>
            Assert.Equal("https://auth.example.com/application/o/token/", (await api.Sso.TestAsync("https://auth.example.com/application/o/marquee/")).TokenEndpoint)),
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
        stub.AnswerJson(testCase.Status, testCase.Response.StartsWith('{') ? testCase.Response : Fixtures.Read(testCase.Response));
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
    public async Task AnOlderServerHasNoSsoSettings()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(404, """{"error":"Not found","code":"not_found"}""");
        var api = new MarqueeApi(new ApiClient(Base, Token, stub));
        Assert.Null(await api.Sso.GetAsync());

        // Anything else is an error for the card to show.
        stub.AnswerJson(403, """{"error":"Only the admin can change sign-in settings.","code":"forbidden"}""");
        var forbidden = await Assert.ThrowsAsync<ApiException>(() => api.Sso.GetAsync());
        Assert.Equal(ApiErrorKind.Forbidden, forbidden.Kind);
    }

    [Fact]
    public async Task SaveAndTestShowTheServersReason()
    {
        var stub = new StubHttpMessageHandler();
        var api = new MarqueeApi(new ApiClient(Base, Token, stub));

        stub.AnswerJson(400, """{"error":"Enter the client ID from your identity provider.","code":"invalid"}""");
        var invalid = await Assert.ThrowsAsync<ApiException>(() => api.Sso.SaveAsync(SaveRequest));
        Assert.Equal(ApiErrorKind.Invalid, invalid.Kind);
        Assert.Equal("Enter the client ID from your identity provider.", invalid.Message);

        stub.AnswerJson(502, """{"error":"auth.example.com answered 404.","code":"upstream"}""");
        var upstream = await Assert.ThrowsAsync<ApiException>(() => api.Sso.TestAsync("https://auth.example.com"));
        Assert.Equal(ApiErrorKind.Upstream, upstream.Kind);
        Assert.Equal("auth.example.com answered 404.", upstream.ServerMessage);
    }

    [Fact]
    public async Task PollsSayWhichSignInExpired()
    {
        var stub = new StubHttpMessageHandler();
        var api = new MarqueeApi(new ApiClient(Base, Token, stub));

        stub.AnswerJson(410, """{"error":"That sign-in expired. Try again.","code":"expired"}""");
        var sso = await Assert.ThrowsAsync<ApiException>(() => api.Auth.SsoPollAsync("h", "PC"));
        Assert.Equal(ApiErrorKind.Expired, sso.Kind);
        Assert.Equal(ApiException.SsoSignInExpiredMessage, sso.Message);
        var link = await Assert.ThrowsAsync<ApiException>(() => api.Links.SsoPollAsync("h"));
        Assert.Equal(ApiException.SsoSignInExpiredMessage, link.Message);

        stub.AnswerJson(410, """{"error":"That Quick Connect code expired. Try again.","code":"expired"}""");
        var quickConnect = await Assert.ThrowsAsync<ApiException>(() => api.Auth.QuickConnectPollAsync("h", "PC"));
        Assert.Equal(ApiException.QuickConnectExpiredMessage, quickConnect.Message);

        // Plex keeps its own wording.
        var plex = await Assert.ThrowsAsync<ApiException>(() => api.Auth.PlexPollAsync("h", "PC"));
        Assert.Equal(ApiException.PlexSignInExpiredMessage, plex.Message);

        stub.AnswerJson(403, """{"error":"Authentik sign-in was cancelled.","code":"forbidden"}""");
        var cancelled = await Assert.ThrowsAsync<ApiException>(() => api.Auth.SsoPollAsync("h", "PC"));
        Assert.Equal(ApiErrorKind.Forbidden, cancelled.Kind);
        Assert.Equal("Authentik sign-in was cancelled.", cancelled.Message);

        stub.AnswerJson(409, """{"error":"This Authentik account is already linked to another Marquee account.","code":"conflict"}""");
        var taken = await Assert.ThrowsAsync<ApiException>(() => api.Links.SsoPollAsync("h"));
        Assert.Equal(ApiErrorKind.Conflict, taken.Kind);
        Assert.Equal("This Authentik account is already linked to another Marquee account.", taken.Message);
    }

    [Fact]
    public async Task QuickConnectOffOnTheJellyfinServer()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(409, """{"error":"Quick Connect is turned off on this Jellyfin server. The admin can turn it on in Jellyfin's Dashboard → General.","code":"conflict"}""");
        var api = new MarqueeApi(new ApiClient(Base, handler: stub));
        var error = await Assert.ThrowsAsync<ApiException>(() => api.Auth.QuickConnectStartAsync());
        Assert.Equal(ApiErrorKind.Conflict, error.Kind);
        Assert.StartsWith("Quick Connect is turned off", error.Message);
    }
}

/// <summary><see cref="ServerSession"/>'s single sign-on and Quick Connect sign-in against a stubbed server.</summary>
public sealed class SsoSessionTests
{
    private const string Token = "mqt_ssossossossossossossossossossossossossossos";
    private const string LoginJson = $$$"""{"token":"{{{Token}}}","expiresAt":"2026-12-16T12:00:00.000Z","user":{"id":"6f1c2a4e-8b1d-4c3e-9f0a-2b7d5e8c1a90","username":"sam","displayName":"Sam","role":"member","libraryOwnerId":"6f1c2a4e-8b1d-4c3e-9f0a-2b7d5e8c1a90","linked":{"plex":false,"jellyfin":false,"sso":true},"hasPassword":false}}""";
    private static readonly ServerAddress Server = new("127.0.0.1", 9);
    private static readonly TimeSpan Fast = TimeSpan.FromMilliseconds(10);

    private static (ServerSession Session, InMemoryTokenStore Store, StubHttpMessageHandler Stub) Make()
    {
        var settings = new InMemorySettingsStore();
        settings.SetString(ServerSession.ServerSettingsKey, Server.BaseUrlString);
        var store = new InMemoryTokenStore();
        var stub = new StubHttpMessageHandler();
        return (new ServerSession(settings, store, stub, deviceName: "Test PC"), store, stub);
    }

    private static SsoSignInStart SsoStart() => new()
    {
        Handle = "h_sso",
        AuthUrl = "http://127.0.0.1:9/login/sso/app?key=k",
        ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(10),
    };

    private static QuickConnectStart QuickConnect() => new()
    {
        Handle = "h_qc",
        Code = "482915",
        ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(10),
    };

    [Fact]
    public async Task SsoStartSendsTheDeviceName()
    {
        var (session, _, stub) = Make();
        stub.AnswerJson(200, """{"handle":"h_9","authUrl":"http://127.0.0.1:9/login/sso/app?key=k","expiresAt":"2099-01-01T00:00:00.000Z"}""");
        var start = await session.StartSsoSignInAsync();
        Assert.Equal("h_9", start.Handle);
        // The page is on the session's own server: it may open over http.
        Assert.NotNull(start.UrlOn(session.Server!.BaseUrl));
        Assert.Null((start with { AuthUrl = "http://10.0.0.1:9/login/sso/app" }).UrlOn(session.Server.BaseUrl));

        var request = Assert.Single(stub.Requests);
        Assert.Equal("/api/v1/auth/sso/start", request.Path);
        Assert.Equal("POST", request.Method.Method);
        Assert.Null(request.Authorization);
        Assert.True(JsonNode.DeepEquals(JsonNode.Parse("""{"deviceName":"Test PC"}"""), request.JsonBody));
    }

    [Fact]
    public async Task SsoPendingThenSignedInStoresTheToken()
    {
        var (session, store, stub) = Make();
        var polls = 0;
        stub.Answer(request =>
        {
            Assert.Equal("/api/v1/auth/sso/poll", request.Path);
            Assert.Null(request.Authorization);
            Assert.True(JsonNode.DeepEquals(JsonNode.Parse("""{"handle":"h_sso","deviceName":"Test PC"}"""), request.JsonBody));
            return Interlocked.Increment(ref polls) < 3
                ? StubHttpMessageHandler.Json(202, """{"status":"pending"}""")
                : StubHttpMessageHandler.Json(200, LoginJson);
        });

        var user = await session.FinishSsoSignInAsync(SsoStart(), Fast);
        Assert.Equal(3, polls);
        Assert.Equal("sam", user.Username);
        Assert.True(user.Linked!.Sso);
        // Stored exactly like a password sign-in.
        Assert.Equal(Token, store.Token(Server.BaseUrlString));
        Assert.True(session.IsSignedIn);
    }

    [Fact]
    public async Task SsoRefusalEndsPolling()
    {
        var (session, store, stub) = Make();
        stub.AnswerJson(403, """{"error":"Your Authentik account isn't allowed to use Marquee. Ask the admin to add you to the right group.","code":"forbidden"}""");
        var error = await Assert.ThrowsAsync<ApiException>(() => session.FinishSsoSignInAsync(SsoStart(), Fast));
        Assert.Equal("Your Authentik account isn't allowed to use Marquee. Ask the admin to add you to the right group.", error.Message);
        Assert.Single(stub.Requests);
        Assert.Null(store.Token(Server.BaseUrlString));
        Assert.False(session.IsSignedIn);
    }

    [Fact]
    public async Task SsoExpiresAtEndsPollingWithItsOwnWording()
    {
        var ticks = 0;
        var error = await Assert.ThrowsAsync<ApiException>(() => PlexPoll.RunAsync<object>(
            new DateTimeOffset(1970, 1, 1, 0, 16, 40, TimeSpan.Zero),
            _ => Task.FromResult<object?>(null),
            Fast,
            () => DateTimeOffset.FromUnixTimeSeconds(++ticks > 2 ? 2000 : 0),
            expiredMessage: ApiException.SsoSignInExpiredMessage));
        Assert.Equal(ApiErrorKind.Expired, error.Kind);
        Assert.Equal(ApiException.SsoSignInExpiredMessage, error.Message);
    }

    [Fact]
    public async Task QuickConnectStartAsksForACode()
    {
        var (session, _, stub) = Make();
        stub.AnswerFixture("auth-quick-connect-start");
        var start = await session.StartQuickConnectAsync();
        Assert.Equal("482915", start.Code);
        var request = Assert.Single(stub.Requests);
        Assert.Equal("/api/v1/auth/jellyfin/quick-connect/start", request.Path);
        Assert.Equal("POST", request.Method.Method);
        Assert.Equal("", request.Body);
        Assert.Null(request.Authorization);
    }

    [Fact]
    public async Task QuickConnectPendingThenApprovedStoresTheToken()
    {
        var (session, store, stub) = Make();
        var polls = 0;
        stub.Answer(request =>
        {
            Assert.Equal("/api/v1/auth/jellyfin/quick-connect/poll", request.Path);
            Assert.True(JsonNode.DeepEquals(JsonNode.Parse("""{"handle":"h_qc","deviceName":"Test PC"}"""), request.JsonBody));
            return Interlocked.Increment(ref polls) < 2
                ? StubHttpMessageHandler.Json(202, """{"status":"pending"}""")
                : StubHttpMessageHandler.Json(200, LoginJson);
        });

        var user = await session.FinishQuickConnectAsync(QuickConnect(), Fast);
        Assert.Equal(2, polls);
        Assert.Equal("sam", user.Username);
        Assert.Equal(Token, store.Token(Server.BaseUrlString));
        Assert.True(session.IsSignedIn);
    }

    [Fact]
    public async Task QuickConnectGoneSaysTheCodeExpired()
    {
        var (session, _, stub) = Make();
        stub.AnswerJson(410, """{"error":"That Quick Connect code expired. Try again.","code":"expired"}""");
        var error = await Assert.ThrowsAsync<ApiException>(() => session.FinishQuickConnectAsync(QuickConnect(), Fast));
        Assert.Equal(ApiErrorKind.Expired, error.Kind);
        Assert.Equal(ApiException.QuickConnectExpiredMessage, error.Message);
        Assert.False(session.IsSignedIn);
    }

    [Fact]
    public async Task CancelStopsQuickConnect()
    {
        var (session, store, stub) = Make();
        var polls = 0;
        stub.Answer(() =>
        {
            Interlocked.Increment(ref polls);
            return StubHttpMessageHandler.Json(202, """{"status":"pending"}""");
        });
        using var cancel = new CancellationTokenSource();
        var signIn = session.FinishQuickConnectAsync(QuickConnect(), Fast, cancel.Token);
        for (var i = 0; i < 200 && Volatile.Read(ref polls) < 2; i++)
        {
            await Task.Delay(10);
        }
        cancel.Cancel();
        var error = await Assert.ThrowsAsync<ApiException>(() => signIn);
        Assert.True(error.IsCancellation, error.Message);
        Assert.Null(store.Token(Server.BaseUrlString));
    }
}
