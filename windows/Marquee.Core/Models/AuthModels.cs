namespace Marquee.Core.Models;

// Discovery, sign-in, /me and /badges (api-v1.md section 1), plus the shared
// shapes every area uses. Keys are the server's camelCase names in PascalCase;
// Json.Options does the mapping, so no attributes are needed.
//
// Response DTOs mark every non-nullable wire field `required`: a missing key
// then fails decoding the way Swift's synthesized Decodable does, instead of
// silently reading as 0 or null. Nullable fields are plain `T?` so a key an
// older server omits reads as null.

/// <summary><c>User</c> from the contract: the signed-in account as <c>/me</c> and login return it.</summary>
public sealed record User
{
    public required Guid Id { get; init; }
    public required string Username { get; init; }
    public string? DisplayName { get; init; }

    /// <summary>Open: a role a newer server adds decodes as an unknown value instead of failing sign-in.</summary>
    public required UserRole Role { get; init; }

    /// <summary>Whose integrations and library this user sees.</summary>
    public required Guid LibraryOwnerId { get; init; }

    /// <summary>
    /// The profile photo as a server-relative path
    /// (<c>/api/v1/users/{id}/avatar?v=…</c>), fetched with the bearer token
    /// (<c>ApiClient.GetBytesAsync</c>); null when there is none, and on a
    /// server older than 0.29.0. It changes whenever the photo does, so the
    /// image can be cached under it for good.
    /// </summary>
    public string? AvatarUrl { get; init; }

    /// <summary>
    /// Which Plex/Jellyfin accounts sign in to this one; null from servers
    /// that predate Plex/Jellyfin sign-in.
    /// </summary>
    public LinkedAccounts? Linked { get; init; }

    /// <summary>
    /// False for an account made by Plex/Jellyfin sign-in or import that
    /// hasn't set a password; null from older servers (which always have one).
    /// </summary>
    public bool? HasPassword { get; init; }

    public bool IsAdmin => Role == UserRole.Admin;

    /// <inheritdoc cref="UserRole.ReviewsRequests"/>
    public bool ReviewsRequests => Role.ReviewsRequests;

    /// <summary>What the website prints: the display name, else the username.</summary>
    public string Label => DisplayName.NonBlank() ?? Username;
}

/// <summary><c>GET /me</c>: the <see cref="User"/> plus the account's own settings.</summary>
public sealed record Me
{
    public required Guid Id { get; init; }
    public required string Username { get; init; }
    public string? DisplayName { get; init; }
    public required UserRole Role { get; init; }
    public required Guid LibraryOwnerId { get; init; }

    /// <inheritdoc cref="User.AvatarUrl"/>
    public string? AvatarUrl { get; init; }

    public required bool AutoApproveMovies { get; init; }
    public required bool AutoApproveTv { get; init; }
    public required DateTimeOffset CreatedAt { get; init; }

    /// <inheritdoc cref="User.Linked"/>
    public LinkedAccounts? Linked { get; init; }

    /// <inheritdoc cref="User.HasPassword"/>
    public bool? HasPassword { get; init; }

    /// <summary>
    /// 0.39+: the account's request limits (each null when that type isn't
    /// limited, always so for the admin and trusted members); null from an
    /// older server, which has none.
    /// </summary>
    public RequestLimits? RequestLimits { get; init; }

    public bool IsAdmin => Role == UserRole.Admin;

    /// <inheritdoc cref="UserRole.ReviewsRequests"/>
    public bool ReviewsRequests => Role.ReviewsRequests;

    /// <summary>What the website prints: the display name, else the username.</summary>
    public string Label => DisplayName.NonBlank() ?? Username;

    public User User => new()
    {
        Id = Id,
        Username = Username,
        DisplayName = DisplayName,
        Role = Role,
        LibraryOwnerId = LibraryOwnerId,
        AvatarUrl = AvatarUrl,
        Linked = Linked,
        HasPassword = HasPassword,
    };
}

/// <summary><c>GET /server-info</c>, the public discovery endpoint.</summary>
public sealed record ServerInfo
{
    public const int SupportedApiVersion = 1;

    /// <summary>The first server release with the v1 API, what "Update required" asks for.</summary>
    public const string MinimumServerVersion = "0.22.0";

    /// <summary>Always <c>"marquee"</c>; anything else isn't one of ours.</summary>
    public required string App { get; init; }

    public required int ApiVersion { get; init; }

    /// <summary>The server's package.json version, e.g. <c>"0.22.0"</c>.</summary>
    public string Version { get; init; } = "unknown";

    /// <summary>Null when the server can't reach its database (<c>Status == "degraded"</c>).</summary>
    public bool? SetupComplete { get; init; }

    public string Status { get; init; } = "ok";

    /// <summary>
    /// Which sign-in methods the server offers; null from servers that
    /// predate Plex/Jellyfin sign-in, which offer only the password.
    /// </summary>
    public SignInMethods? SignIn { get; init; }

    /// <summary>"Sign in with Plex" is offered.</summary>
    public bool OffersPlexSignIn => SignIn?.Plex == true;

    /// <summary>"Sign in with Jellyfin" is offered.</summary>
    public bool OffersJellyfinSignIn => SignIn?.Jellyfin == true;

    /// <summary>
    /// What to call the "jellyfin" server in the UI: "Emby" when that's what
    /// is connected (it speaks the same API), otherwise "Jellyfin" — also for
    /// servers before 0.40, which don't send it.
    /// </summary>
    public string JellyfinName => SignIn?.JellyfinName ?? MediaServerKindExtensions.DefaultJellyfinName;

    /// <summary>The user-facing name of <paramref name="server"/> on this server.</summary>
    public string MediaServerName(MediaServerKind server) => server.Label(JellyfinName);

    /// <summary>
    /// The line under the Plex/Jellyfin buttons telling a newcomer how to
    /// get an account, when the admin has new accounts from sign-in on;
    /// names only the methods that make one, single sign-on first as on the
    /// website ("Authentik (or Plex or Jellyfin)"). Null otherwise (and from
    /// servers older than 0.43, which don't say).
    /// </summary>
    public string? SignupHint
    {
        get
        {
            if (SignIn is not { } signIn) return null;
            var names = new List<string>();
            if (signIn.Sso is { Signup: true } sso) names.Add(sso.Name);
            if (signIn.Signup && signIn.Plex) names.Add("Plex");
            if (signIn.Signup && signIn.Jellyfin) names.Add(JellyfinName);
            if (names.Count == 0) return null;
            var named = names.Count == 1 ? names[0] : $"{names[0]} (or {string.Join(" or ", names.Skip(1))})";
            return $"New here? Use Sign in with {named} — your account is made for you.";
        }
    }

    /// <summary>"Sign in with {name}" for the admin's single sign-on is offered (0.44+).</summary>
    public bool OffersSsoSignIn => SignIn?.Sso != null;

    /// <summary>The single sign-on button's name ("Authentik"); null while it isn't offered.</summary>
    public string? SsoName => SignIn?.Sso?.Name;

    /// <summary>"Use Quick Connect" is offered on the Jellyfin sign-in (0.44+; never for Emby).</summary>
    public bool OffersQuickConnect => SignIn?.QuickConnect == true && OffersJellyfinSignIn;

    public bool IsMarquee => App == "marquee";
    public bool IsSupported => ApiVersion == SupportedApiVersion;
    public bool IsDegraded => Status == "degraded";
}

/// <summary><c>POST /auth/login</c> and <c>/auth/setup</c> response.</summary>
public sealed record AuthResponse
{
    /// <summary><c>mqt_</c> + 43 base64url characters.</summary>
    public required string Token { get; init; }

    public required DateTimeOffset ExpiresAt { get; init; }
    public required User User { get; init; }
}

public sealed record LoginRequest(string Username, string Password, string DeviceName);

/// <summary>
/// <c>server-info.signIn</c>: the sign-in methods this server offers. Plex
/// and Jellyfin appear only while that integration is connected.
/// </summary>
public sealed record SignInMethods
{
    public bool Password { get; init; } = true;
    public bool Plex { get; init; }
    public bool Jellyfin { get; init; }

    private readonly string jellyfinName = MediaServerKindExtensions.DefaultJellyfinName;

    /// <summary>
    /// <c>jellyfinName</c> (0.40+): "Jellyfin" or "Emby". Missing or blank
    /// (older servers) reads as "Jellyfin".
    /// </summary>
    public string JellyfinName
    {
        get => jellyfinName;
        init => jellyfinName = MediaServerKindExtensions.NormalizedJellyfinName(value);
    }

    /// <summary>
    /// <c>signup</c> (0.42.2+): new accounts from Plex/Jellyfin sign-in are on
    /// (and one of them is offered). Missing (older servers) reads as false.
    /// </summary>
    public bool Signup { get; init; }

    /// <summary>
    /// <c>quickConnect</c> (0.44+): Jellyfin sign-in is on and the server is
    /// Jellyfin, not Emby. Missing (older servers) reads as false.
    /// </summary>
    public bool QuickConnect { get; init; }

    /// <summary>
    /// <c>sso</c> (0.44+): single sign-on is set up. Null when it isn't, and
    /// from older servers, which don't send it.
    /// </summary>
    public SsoSignIn? Sso { get; init; }
}

public sealed record SetupRequest(string Username, string Password, string DisplayName, string DeviceName);

/// <summary><c>{"ok": true}</c></summary>
public sealed record OK
{
    public required bool Ok { get; init; }
}

/// <summary>For calls whose body the caller doesn't need (or a 204). An empty body decodes to it without parsing.</summary>
public readonly record struct EmptyResponse;

/// <summary><c>{"count": 3}</c> from <c>/requests/pending-count</c> and <c>/notifications/unread-count</c>.</summary>
public sealed record CountResponse
{
    public required int Count { get; init; }
}

// Both list wrappers constrain T to notnull: an entry is never null on the
// wire, and the constraint is what lets Json's null check read that off the
// element type (an unconstrained T is annotated as maybe-null in metadata).

/// <summary><c>{"page", "totalPages", "totalResults", "results"}</c>: the Movies/Series grids.</summary>
public sealed record Paginated<T> where T : notnull
{
    public required int Page { get; init; }
    public required int TotalPages { get; init; }
    public required int TotalResults { get; init; }
    public required IReadOnlyList<T> Results { get; init; }

    public bool HasMorePages => Page < TotalPages;
}

/// <summary><c>{"results": [...]}</c>: the lists the website shows whole (deviation 6).</summary>
public sealed record ListResponse<T> where T : notnull
{
    public required IReadOnlyList<T> Results { get; init; }
}

/// <summary><c>GET /badges</c>: the header counters, suited to polling.</summary>
public sealed record Badges
{
    public required int UnreadNotifications { get; init; }

    /// <summary>Always 0 for members.</summary>
    public required int PendingRequests { get; init; }

    /// <summary>Open problem reports (0.38+; an older server omits it, meaning 0). Always 0 for members.</summary>
    public int OpenIssues { get; init; }

    /// <summary>The Requests badge: pending requests plus open problem reports, since both wait on that page.</summary>
    public int RequestsBadge => PendingRequests + OpenIssues;

    public static Badges Zero { get; } = new() { UnreadNotifications = 0, PendingRequests = 0 };

    /// <summary>The bell's cap on the website: "9+".</summary>
    public string? BellLabel =>
        UnreadNotifications > 0 ? (UnreadNotifications > 9 ? "9+" : UnreadNotifications.ToString()) : null;

    /// <summary>The taskbar badge's cap: "99+".</summary>
    public string? TaskbarLabel =>
        UnreadNotifications > 0 ? (UnreadNotifications > 99 ? "99+" : UnreadNotifications.ToString()) : null;
}

/// <summary>
/// A movie or TV title's identity: <c>{"mediaType", "tmdbId"}</c> on the wire
/// (<c>POST /surprise</c>, a franchise's <c>addAllMissing</c>).
/// </summary>
public readonly record struct TitleId(MediaType MediaType, int TmdbId)
{
    /// <summary><c>"movie:603"</c>, the website's status-map key.</summary>
    public override string ToString() => $"{MediaType.Value}:{TmdbId}";

    /// <summary><c>marquee://title/movie/603</c>, what notification banners and protocol activation route with.</summary>
    public Uri Route => new($"marquee://title/{MediaType.Value}/{TmdbId}");
}
