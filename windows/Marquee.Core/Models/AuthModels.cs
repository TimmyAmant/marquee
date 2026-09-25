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

    public bool IsAdmin => Role == UserRole.Admin;

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
    public required bool AutoApproveMovies { get; init; }
    public required bool AutoApproveTv { get; init; }
    public required DateTimeOffset CreatedAt { get; init; }

    public bool IsAdmin => Role == UserRole.Admin;

    /// <summary>What the website prints: the display name, else the username.</summary>
    public string Label => DisplayName.NonBlank() ?? Username;

    public User User => new()
    {
        Id = Id,
        Username = Username,
        DisplayName = DisplayName,
        Role = Role,
        LibraryOwnerId = LibraryOwnerId,
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
