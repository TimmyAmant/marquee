using Marquee.Core.Api;
using Marquee.Core.Connection;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// The session's restore, login and sign-out paths against a stubbed server
// (the Mac's ServerSessionTests), plus the token-store cases the Windows
// credential store makes worth spelling out.

public sealed class ServerSessionTests
{
    private const string UserJson = """{"id":"6f1c2a4e-8b1d-4c3e-9f0a-2b7d5e8c1a90","username":"timmy","displayName":"Timmy","role":"admin","libraryOwnerId":"6f1c2a4e-8b1d-4c3e-9f0a-2b7d5e8c1a90"}""";
    private const string LoginJson = $$"""{"token":"mqt_freshfreshfreshfreshfreshfreshfreshfreshfre","expiresAt":"2026-12-16T12:00:00.000Z","user":{{UserJson}}}""";
    private const string UnauthorizedJson = """{"error":"Unauthorized","code":"unauthorized"}""";

    private static readonly ServerAddress Server = new("127.0.0.1", 9);

    private static ServerInfo Info(bool? setupComplete) =>
        new() { App = "marquee", ApiVersion = 1, Version = "0.22.0", SetupComplete = setupComplete };

    private sealed record Harness(ServerSession Session, InMemoryTokenStore Store, InMemorySettingsStore Settings, StubHttpMessageHandler Stub);

    private static Harness Make(string? token = "mqt_savedsavedsavedsavedsavedsavedsavedsavedsav", ITokenStore? tokenStore = null)
    {
        var settings = new InMemorySettingsStore();
        settings.SetString(ServerSession.ServerSettingsKey, Server.BaseUrlString);
        var store = new InMemoryTokenStore();
        if (token != null)
        {
            store.Save(token, Server.BaseUrlString);
        }
        var stub = new StubHttpMessageHandler();
        var session = new ServerSession(settings, tokenStore ?? store, stub, deviceName: "Test PC");
        return new Harness(session, store, settings, stub);
    }

    /// <summary>A credential store that can't be read right now.</summary>
    private sealed class UnavailableTokenStore : ITokenStore
    {
        public TokenLookup Lookup(string server) => TokenLookup.Unavailable;
        public bool Save(string token, string server) => true;
        public void Delete(string server)
        {
        }
    }

    // MARK: Restore

    [Fact]
    public async Task RestoreWithValidToken()
    {
        var (session, _, _, stub) = Make();
        stub.AnswerJson(200, UserJson);
        Assert.Equal(Server, session.Server);
        Assert.True(session.HasToken);

        var result = await session.RestoreAsync();
        var signedIn = Assert.IsType<RestoreResult.SignedIn>(result);
        Assert.Equal("timmy", signedIn.User.Username);
        Assert.Equal(signedIn.User, session.User);

        var request = Assert.Single(stub.Requests);
        Assert.Equal("/api/v1/me", request.Path);
        Assert.Equal("Bearer mqt_savedsavedsavedsavedsavedsavedsavedsavedsav", request.Authorization);
    }

    [Fact]
    public async Task RestoreWithRejectedTokenSignsOut()
    {
        var (session, store, _, stub) = Make();
        stub.AnswerJson(401, UnauthorizedJson);
        var result = await session.RestoreAsync();
        Assert.IsType<RestoreResult.SignedOut>(result);
        Assert.Null(store.Token(Server.BaseUrlString));
        Assert.False(session.HasToken);
        // A rejected token keeps the server.
        Assert.Equal(Server, session.Server);
    }

    [Fact]
    public async Task RestoreWhenServerIsDownIsUnreachableNotSignedOut()
    {
        var (session, store, _, stub) = Make();
        stub.Fail(StubHttpMessageHandler.ConnectionRefused());
        var result = await session.RestoreAsync();
        var unreachable = Assert.IsType<RestoreResult.Unreachable>(result);
        Assert.Equal(new ProbeOutcome.Unreachable(UnreachableReason.Refused), unreachable.Outcome);
        // An offline server must not cost the token.
        Assert.Equal("mqt_savedsavedsavedsavedsavedsavedsavedsavedsav", store.Token(Server.BaseUrlString));
        Assert.Null(session.User);
    }

    [Fact]
    public async Task RestoreRetriesOnceWhenTheServerIsUp()
    {
        var (session, _, _, stub) = Make();
        var attempts = 0;
        stub.Answer(request =>
        {
            if (request.Path == "/api/v1/server-info")
            {
                return StubHttpMessageHandler.Fixture("server-info");
            }
            // The first /me fails as if the server was still booting; the retry succeeds.
            return ++attempts == 1
                ? StubHttpMessageHandler.Json(503, "", apiHeader: false)
                : StubHttpMessageHandler.Json(200, UserJson);
        });
        var result = await session.RestoreAsync();
        Assert.IsType<RestoreResult.SignedIn>(result);
        Assert.Equal("0.22.0", session.ServerInfo?.Version);
        Assert.Equal(3, stub.Requests.Count);
    }

    [Fact]
    public async Task RestoreWithoutTokenIsSignedOut()
    {
        var (session, _, _, stub) = Make(token: null);
        Assert.IsType<RestoreResult.SignedOut>(await session.RestoreAsync());
        Assert.Empty(stub.Requests);
    }

    [Fact]
    public async Task RestoreWithUnavailableTokenStoreIsNotASignOut()
    {
        var (session, _, _, stub) = Make(tokenStore: new UnavailableTokenStore());
        Assert.IsType<RestoreResult.TokenUnavailable>(await session.RestoreAsync());
        Assert.True(session.TokenUnavailable);
        Assert.False(session.HasToken);
        Assert.Empty(stub.Requests);
    }

    [Fact]
    public async Task ProxyJson401KeepsTheToken()
    {
        var (session, store, _, stub) = Make();
        // An auth proxy answers everything with its own JSON 401 (no X-Marquee-API).
        stub.AnswerJson(401, UnauthorizedJson, apiHeader: false);
        var result = await session.RestoreAsync();
        var unreachable = Assert.IsType<RestoreResult.Unreachable>(result);
        Assert.Equal(new ProbeOutcome.NotMarquee(), unreachable.Outcome);
        Assert.Equal("mqt_savedsavedsavedsavedsavedsavedsavedsavedsav", store.Token(Server.BaseUrlString));
        Assert.True(session.HasToken);
    }

    // MARK: Login and setup

    [Fact]
    public async Task LoginStoresTokenAndSendsDeviceName()
    {
        var (session, store, _, stub) = Make(token: null);
        stub.AnswerJson(200, LoginJson);
        var changes = 0;
        session.StateChanged += (_, _) => changes++;

        var user = await session.LoginAsync(" timmy ", "hunter22");
        Assert.Equal("Timmy", user.DisplayName);
        Assert.Equal("mqt_freshfreshfreshfreshfreshfreshfreshfreshfre", store.Token(Server.BaseUrlString));
        Assert.Equal("mqt_freshfreshfreshfreshfreshfreshfreshfreshfre", session.Client?.Token);
        Assert.True(session.IsSignedIn);
        Assert.Equal(1, changes);

        var request = Assert.Single(stub.Requests);
        Assert.Equal("/api/v1/auth/login", request.Path);
        Assert.Equal(HttpMethod.Post, request.Method);
        Assert.Null(request.Authorization);
        Assert.Equal("timmy", request.JsonBody?["username"]?.GetValue<string>());
        Assert.Equal("Test PC", request.JsonBody?["deviceName"]?.GetValue<string>());
    }

    [Fact]
    public async Task LoginErrorsAreTyped()
    {
        var (session, _, _, stub) = Make(token: null);

        stub.AnswerJson(401, """{"error":"Incorrect username or password","code":"invalid_credentials"}""");
        var credentials = await Assert.ThrowsAsync<ApiException>(() => session.LoginAsync("timmy", "wrong"));
        Assert.Equal(ApiErrorKind.InvalidCredentials, credentials.Kind);

        stub.AnswerJson(429, """{"error":"Too many attempts.","code":"rate_limited"}""");
        var limited = await Assert.ThrowsAsync<ApiException>(() => session.LoginAsync("timmy", "wrong"));
        Assert.Equal(ApiErrorKind.RateLimited, limited.Kind);
        Assert.Equal("Too many attempts.", limited.Message);

        // An old server redirects to its HTML login page.
        stub.Answer(() => StubHttpMessageHandler.Html(200, "<html><title>Marquee</title></html>"));
        var legacy = await Assert.ThrowsAsync<ApiException>(() => session.LoginAsync("timmy", "hunter22"));
        Assert.Equal(ApiErrorKind.NotMarquee, legacy.Kind);

        stub.Requests.Clear();
        var blank = await Assert.ThrowsAsync<ApiException>(() => session.LoginAsync("  ", ""));
        Assert.Equal(ApiErrorKind.Invalid, blank.Kind);
        Assert.Equal("Enter your username and password.", blank.Message);
        // Empty fields never reach the server's rate limiter.
        Assert.Empty(stub.Requests);
        Assert.False(session.IsSignedIn);
    }

    [Fact]
    public async Task SetupSignsInAndMarksSetupComplete()
    {
        var (session, store, _, stub) = Make(token: null);
        session.Select(Server, Info(setupComplete: false));
        stub.AnswerJson(200, LoginJson);

        var user = await session.SetupAsync(" Timmy ", " timmy ", "hunter22");
        Assert.True(user.IsAdmin);
        Assert.True(session.ServerInfo?.SetupComplete);
        Assert.Equal("mqt_freshfreshfreshfreshfreshfreshfreshfreshfre", store.Token(Server.BaseUrlString));

        var request = Assert.Single(stub.Requests);
        Assert.Equal("/api/v1/auth/setup", request.Path);
        Assert.Equal("Timmy", request.JsonBody?["displayName"]?.GetValue<string>());
        Assert.Equal("timmy", request.JsonBody?["username"]?.GetValue<string>());
    }

    // MARK: Sign-out and 401s

    [Fact]
    public async Task SignOutClearsTokenEvenWhenRevokeFails()
    {
        var (session, store, _, stub) = Make();
        stub.Fail(StubHttpMessageHandler.ConnectionRefused());
        await session.SignOutAsync();
        Assert.Null(store.Token(Server.BaseUrlString));
        Assert.False(session.HasToken);
        Assert.Null(session.User);

        var request = Assert.Single(stub.Requests);
        Assert.Equal("/api/v1/auth/logout", request.Path);
        Assert.Equal("Bearer mqt_savedsavedsavedsavedsavedsavedsavedsavedsav", request.Authorization);
    }

    [Fact]
    public async Task UnauthorizedDataCallSignsOut()
    {
        var (session, store, _, stub) = Make();
        stub.AnswerJson(401, """{"error":"Token revoked","code":"unauthorized"}""");
        var fired = false;
        session.Unauthorized += (_, _) => fired = true;

        var client = session.Client;
        Assert.NotNull(client);
        var error = await Assert.ThrowsAsync<ApiException>(() => client.GetAsync<EmptyResponse>("/requests"));
        Assert.Equal(ApiErrorKind.Unauthorized, error.Kind);
        Assert.True(fired);
        Assert.Null(store.Token(Server.BaseUrlString));
        Assert.Null(session.User);
        Assert.False(session.HasToken);
    }

    [Fact]
    public async Task Proxy401OnADataCallDoesNotSignOut()
    {
        var (session, store, _, stub) = Make();
        stub.AnswerJson(401, UnauthorizedJson, apiHeader: false);
        var fired = false;
        session.Unauthorized += (_, _) => fired = true;

        var client = session.Client;
        Assert.NotNull(client);
        await Assert.ThrowsAsync<ApiException>(() => client.GetAsync<EmptyResponse>("/requests"));
        Assert.False(fired);
        Assert.Equal("mqt_savedsavedsavedsavedsavedsavedsavedsavedsav", store.Token(Server.BaseUrlString));
    }

    // MARK: Server selection

    [Fact]
    public void SelectAndForgetServer()
    {
        var (session, store, settings, _) = Make();
        var other = new ServerAddress("tower.local");
        session.Select(other, Info(setupComplete: false));
        Assert.Equal("http://tower.local:3000", settings.GetString(ServerSession.ServerSettingsKey));
        Assert.False(session.ServerInfo?.SetupComplete);
        // Each server has its own token.
        Assert.False(session.HasToken);

        session.Select(Server, info: null);
        Assert.True(session.HasToken);
        session.ForgetServer();
        Assert.Null(session.Server);
        Assert.Null(session.ServerInfo);
        Assert.Null(settings.GetString(ServerSession.ServerSettingsKey));
        Assert.Null(store.Token(Server.BaseUrlString));
        Assert.Null(session.Client);
    }

    [Fact]
    public void ApiWithoutAServerThrowsUnauthorized()
    {
        var (session, _, _, _) = Make();
        session.ForgetServer();
        Assert.Null(session.Api.Client);
    }
}
