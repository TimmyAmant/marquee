using Marquee.Core.Api;
using Marquee.Core.Models;

namespace Marquee.Core.Connection;

/// <summary>What <see cref="ServerSession.RestoreAsync"/> found at launch.</summary>
public abstract record RestoreResult
{
    private RestoreResult()
    {
    }

    public sealed record SignedIn(User User) : RestoreResult;

    /// <summary>No token, or the server rejected it (401). Sign in again.</summary>
    public sealed record SignedOut : RestoreResult;

    /// <summary>
    /// The token store couldn't be read. Not a sign-out: the UI should say
    /// so and offer a retry rather than silently ask for a password again.
    /// </summary>
    public sealed record TokenUnavailable : RestoreResult;

    /// <summary>The server couldn't be used; the outcome says why.</summary>
    public sealed record Unreachable(ProbeOutcome Outcome) : RestoreResult;
}

/// <summary>
/// The connection to one Marquee server: which server (settings), the bearer
/// token (credential store), and who's signed in. The native counterpart of
/// the web app's session cookie, minus the cookie.
///
/// Not tied to a UI thread: state changes are announced through
/// <see cref="StateChanged"/> on whatever thread completed the call, and a
/// view model dispatches from there.
/// </summary>
public sealed class ServerSession
{
    public const string ServerSettingsKey = "marquee.server.baseURL";

    /// <summary>A shorter timeout than data calls: at launch this holds the spinner.</summary>
    public static readonly TimeSpan RestoreTimeout = TimeSpan.FromSeconds(6);

    private static readonly TimeSpan RevokeTimeout = TimeSpan.FromSeconds(5);

    private readonly ISettingsStore settings;
    private readonly ITokenStore tokenStore;
    private readonly InMemoryTokenStore fallbackTokens = new();
    private readonly HttpMessageHandler? handler;
    private readonly object gate = new();

    private string? token;
    private bool tokenLoaded;

    public ServerAddress? Server { get; private set; }

    /// <summary>The last successful <c>server-info</c>: version and whether setup is done.</summary>
    public ServerInfo? ServerInfo { get; private set; }

    public User? User { get; private set; }

    /// <summary>
    /// The token store couldn't be read on the last attempt. Nothing about
    /// the failure is cached, so a caller may simply retry.
    /// </summary>
    public bool TokenUnavailable { get; private set; }

    /// <summary>Shown in the server's device list; <c>name</c> on the token row.</summary>
    public string DeviceName { get; }

    /// <summary>Raised after the server, the signed-in user or the token changed.</summary>
    public event EventHandler? StateChanged;

    /// <summary>Raised after an authenticated call was answered with 401 <c>unauthorized</c> and the token has been dropped.</summary>
    public event EventHandler? Unauthorized;

    /// <param name="handler">Tests pass a stub; the app leaves it null for <see cref="ApiClient.DefaultHandler"/>.</param>
    public ServerSession(ISettingsStore settings, ITokenStore tokenStore, HttpMessageHandler? handler = null, string? deviceName = null)
    {
        this.settings = settings;
        this.tokenStore = tokenStore;
        this.handler = handler;
        DeviceName = deviceName ?? DefaultDeviceName();
        if (settings.GetString(ServerSettingsKey) is { } saved)
        {
            Server = ServerAddress.FromBaseUrl(saved);
        }
    }

    public bool IsSignedIn => User != null;

    /// <summary>Whether a token is saved for the current server (reads the store once).</summary>
    public bool HasToken => CurrentToken() != null;

    /// <summary>
    /// An authenticated client for data calls. A 401 from any call made with
    /// it signs the session out and raises <see cref="Unauthorized"/>.
    /// </summary>
    public ApiClient? Client
    {
        get
        {
            if (Server is not { } server)
            {
                return null;
            }
            var current = CurrentToken();
            return new ApiClient(
                server.BaseUrl,
                current,
                handler,
                current == null ? null : () => HandleUnauthorizedAsync(current));
        }
    }

    /// <summary>The typed API over <see cref="Client"/>, without a change signal.</summary>
    public MarqueeApi Api => new(Client);

    /// <summary>The typed API over <see cref="Client"/>, recording mutations in <paramref name="events"/> for the screens.</summary>
    public MarqueeApi CreateApi(ServerEvents? events) => new(Client, events);

    // MARK: Server

    /// <summary>
    /// Makes <paramref name="address"/> the server this PC talks to. Switching
    /// servers drops the signed-in user; the new server's own saved token (if
    /// any) is used.
    /// </summary>
    public void Select(ServerAddress address, ServerInfo? info)
    {
        lock (gate)
        {
            if (address != Server)
            {
                User = null;
                token = null;
                tokenLoaded = false;
            }
            Server = address;
            if (info != null)
            {
                ServerInfo = info;
            }
        }
        settings.SetString(ServerSettingsKey, address.BaseUrlString);
        RaiseStateChanged();
    }

    /// <summary>Re-checks <c>server-info</c>, updating <see cref="ServerInfo"/> when it's a usable server.</summary>
    public async Task<ProbeOutcome> RefreshInfoAsync(CancellationToken ct = default)
    {
        if (Server is not { } server)
        {
            return new ProbeOutcome.Unreachable(UnreachableReason.NoResponse);
        }
        var outcome = await ServerProbe.ProbeAsync(server, handler, ct: ct).ConfigureAwait(false);
        if (server == Server && outcome is ProbeOutcome.Marquee marquee)
        {
            ServerInfo = marquee.Info;
            RaiseStateChanged();
        }
        return outcome;
    }

    /// <summary>Forgets the server and its token (revoking it best-effort), for "Change server".</summary>
    public void ForgetServer()
    {
        if (Server is { } server)
        {
            if (CurrentToken() is { } current)
            {
                Revoke(current, server);
            }
            ClearToken(server);
        }
        lock (gate)
        {
            User = null;
            ServerInfo = null;
            Server = null;
        }
        settings.SetString(ServerSettingsKey, null);
        RaiseStateChanged();
    }

    // MARK: Account

    /// <summary>
    /// <c>GET /me</c> with the saved token. A 401 from the server means
    /// signed out; anything that isn't an answer from the server is
    /// re-probed so the caller can say why.
    /// </summary>
    public async Task<RestoreResult> RestoreAsync(CancellationToken ct = default)
    {
        if (Server is not { } server)
        {
            return new RestoreResult.SignedOut();
        }
        var current = CurrentToken();
        if (current == null)
        {
            return TokenUnavailable ? new RestoreResult.TokenUnavailable() : new RestoreResult.SignedOut();
        }
        var client = new ApiClient(server.BaseUrl, current, handler);

        ApiException firstError;
        try
        {
            return AdoptRestored(await FetchMeAsync(client, ct).ConfigureAwait(false), server);
        }
        catch (ApiException error)
        {
            firstError = error;
        }
        if (firstError.IsRejectedToken)
        {
            ClearToken(server);
            RaiseStateChanged();
            return new RestoreResult.SignedOut();
        }

        var outcome = await ServerProbe.ProbeAsync(server, handler, ct: ct).ConfigureAwait(false);
        if (server != Server)
        {
            return new RestoreResult.SignedOut();
        }
        if (outcome is not ProbeOutcome.Marquee marquee)
        {
            return new RestoreResult.Unreachable(outcome);
        }

        // The server is up (it may have just finished booting); try once more.
        ServerInfo = marquee.Info;
        try
        {
            return AdoptRestored(await FetchMeAsync(client, ct).ConfigureAwait(false), server);
        }
        catch (ApiException retryError)
        {
            if (retryError.IsRejectedToken)
            {
                ClearToken(server);
                RaiseStateChanged();
                return new RestoreResult.SignedOut();
            }
            return new RestoreResult.Unreachable(new ProbeOutcome.Unreachable(UnreachableReason.Failed(retryError.Message)));
        }
    }

    private static Task<User> FetchMeAsync(ApiClient client, CancellationToken ct) =>
        client.GetAsync<User>("/me", timeout: RestoreTimeout, ct: ct);

    /// <summary><c>POST /auth/login</c>.</summary>
    public async Task<User> LoginAsync(string username, string password, CancellationToken ct = default)
    {
        username = username.Trim();
        if (username.Length == 0 || password.Length == 0)
        {
            // Never reaches the server's rate limiter.
            throw ApiException.Invalid("Enter your username and password.");
        }
        if (Server is not { } server)
        {
            throw ApiException.NotMarquee();
        }
        var client = new ApiClient(server.BaseUrl, handler: handler);
        var response = await client.PostAsync<AuthResponse>(
            "/auth/login",
            new LoginRequest(username, password, DeviceName),
            ct: ct).ConfigureAwait(false);
        return Adopt(response, server);
    }

    /// <summary><c>POST /auth/setup</c>: the server's first (admin) account.</summary>
    public async Task<User> SetupAsync(string displayName, string username, string password, CancellationToken ct = default)
    {
        if (Server is not { } server)
        {
            throw ApiException.NotMarquee();
        }
        var client = new ApiClient(server.BaseUrl, handler: handler);
        var response = await client.PostAsync<AuthResponse>(
            "/auth/setup",
            new SetupRequest(username.Trim(), password, displayName.Trim(), DeviceName),
            ct: ct).ConfigureAwait(false);
        var user = Adopt(response, server);
        if (ServerInfo is { } info)
        {
            ServerInfo = info with { SetupComplete = true };
        }
        return user;
    }

    /// <summary>
    /// Signs out locally right away, then revokes the token on the server
    /// best-effort; an unreachable server can't keep this PC signed in.
    /// </summary>
    public async Task SignOutAsync(CancellationToken ct = default)
    {
        if (Server is not { } server)
        {
            return;
        }
        var current = CurrentToken();
        ClearToken(server);
        lock (gate)
        {
            User = null;
        }
        RaiseStateChanged();
        if (current == null)
        {
            return;
        }
        var client = new ApiClient(server.BaseUrl, current, handler);
        try
        {
            await client.PostAsync<EmptyResponse>("/auth/logout", timeout: RevokeTimeout, ct: ct).ConfigureAwait(false);
        }
        catch (ApiException)
        {
            // Best effort: the token is gone locally either way.
        }
    }

    /// <summary>Re-reads the account (role or display name may have changed on the server).</summary>
    public async Task<User> RefreshUserAsync(CancellationToken ct = default)
    {
        var client = Client ?? throw ApiException.Unauthorized();
        var fresh = await client.GetAsync<User>("/me", ct: ct).ConfigureAwait(false);
        if (CurrentToken() != null)
        {
            lock (gate)
            {
                User = fresh;
            }
            RaiseStateChanged();
        }
        return fresh;
    }

    // MARK: Token

    /// <summary>
    /// The token for the current server, read once and then cached.
    ///
    /// A store that answered Unavailable is deliberately not cached: latching
    /// that failure as "no token" for the rest of the launch would turn one
    /// transient credential-store error into the sign-in card even though
    /// the token is still there.
    /// </summary>
    private string? CurrentToken()
    {
        lock (gate)
        {
            if (Server is not { } server)
            {
                return null;
            }
            if (tokenLoaded)
            {
                return token;
            }
            var lookup = tokenStore.Lookup(server.BaseUrlString);
            switch (lookup.Kind)
            {
                case TokenLookupKind.Found when ApiClient.IsWellFormedToken(lookup.Token):
                    token = lookup.Token;
                    tokenLoaded = true;
                    TokenUnavailable = false;
                    break;
                case TokenLookupKind.Found:
                    // A stored value that can't be a token reads as signed
                    // out, so a damaged credential entry can't wedge launch.
                    tokenStore.Delete(server.BaseUrlString);
                    token = null;
                    tokenLoaded = true;
                    TokenUnavailable = false;
                    break;
                case TokenLookupKind.Missing:
                    // The fallback store holds the token when the credential store refused the write.
                    token = fallbackTokens.Token(server.BaseUrlString);
                    tokenLoaded = true;
                    TokenUnavailable = false;
                    break;
                default:
                    TokenUnavailable = true;
                    return fallbackTokens.Token(server.BaseUrlString);
            }
            return token;
        }
    }

    private User Adopt(AuthResponse response, ServerAddress address)
    {
        lock (gate)
        {
            if (!ApiClient.IsWellFormedToken(response.Token))
            {
                // Never persist a token that would break every later request.
                throw ApiException.Server(ApiException.UnreadableResponseMessage);
            }
            if (address != Server)
            {
                // The server was changed while the request was in flight.
                Revoke(response.Token, address);
                throw ApiException.Unauthorized();
            }
            if (!tokenStore.Save(response.Token, address.BaseUrlString))
            {
                // The credential store refused; the token lasts until the app quits.
                fallbackTokens.Save(response.Token, address.BaseUrlString);
            }
            token = response.Token;
            tokenLoaded = true;
            User = response.User;
        }
        RaiseStateChanged();
        return response.User;
    }

    private RestoreResult AdoptRestored(User restored, ServerAddress address)
    {
        lock (gate)
        {
            if (address != Server)
            {
                return new RestoreResult.SignedOut();
            }
            User = restored;
        }
        RaiseStateChanged();
        return new RestoreResult.SignedIn(restored);
    }

    private void ClearToken(ServerAddress address)
    {
        tokenStore.Delete(address.BaseUrlString);
        fallbackTokens.Delete(address.BaseUrlString);
        lock (gate)
        {
            if (address == Server)
            {
                token = null;
                tokenLoaded = true;
                TokenUnavailable = false;
            }
        }
    }

    private Task HandleUnauthorizedAsync(string rejected)
    {
        // Ignore a late 401 for a token that's already been replaced.
        if (Server is not { } server || rejected != CurrentToken())
        {
            return Task.CompletedTask;
        }
        ClearToken(server);
        lock (gate)
        {
            User = null;
        }
        Unauthorized?.Invoke(this, EventArgs.Empty);
        RaiseStateChanged();
        return Task.CompletedTask;
    }

    private void Revoke(string revokedToken, ServerAddress address)
    {
        var client = new ApiClient(address.BaseUrl, revokedToken, handler);
        _ = Task.Run(async () =>
        {
            try
            {
                await client.PostAsync<EmptyResponse>("/auth/logout", timeout: RevokeTimeout).ConfigureAwait(false);
            }
            catch (ApiException)
            {
                // Best effort.
            }
        });
    }

    private void RaiseStateChanged() => StateChanged?.Invoke(this, EventArgs.Empty);

    private static string DefaultDeviceName()
    {
        try
        {
            return Environment.MachineName.NonBlank() ?? "Windows PC";
        }
        catch (InvalidOperationException)
        {
            return "Windows PC";
        }
    }
}
