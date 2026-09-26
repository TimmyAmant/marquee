using System.Globalization;

namespace Marquee.Core.Models;

// API keys (api-v1.md section 16, 0.47+): admin-issued keys for dashboards
// (Homepage, Homarr), scripts and other apps, under Settings › Integrations ›
// API keys. The secret is returned once, by POST /settings/api-keys; the
// list only carries its first seven characters (hint). An older server
// answers 404 and the card stays hidden. Also GET /stats/summary, the counts
// dashboard widgets show.

/// <summary>What a key may do: <c>read</c> (GET only) or <c>full</c> (whatever the account may).</summary>
public readonly record struct ApiKeyScope(string Value) : IOpenEnum<ApiKeyScope>
{
    public static readonly ApiKeyScope Read = new("read");
    public static readonly ApiKeyScope Full = new("full");

    public static IReadOnlyList<ApiKeyScope> Known { get; } = [Read, Full];
    public static ApiKeyScope FromValue(string value) => new(value);
    public bool IsKnown => Known.Contains(this);
    public override string ToString() => Value;

    /// <summary>lib/api/api-key-labels.ts apiKeyScopeLabel: "Read-only" or "Full access".</summary>
    public string Label => this == Read ? "Read-only" : "Full access";
}

/// <summary>One row of <c>GET /settings/api-keys</c> (admin), oldest first. Never the secret.</summary>
public sealed record ApiKey
{
    public required Guid Id { get; init; }
    public required string Name { get; init; }
    public required ApiKeyScope Scope { get; init; }

    /// <summary>The household member it signs in as; null for the admin who made it.</summary>
    public RequestPerson? ActAs { get; init; }

    /// <summary>The key's first seven characters (<c>mq_Q2xp</c>), to tell keys apart.</summary>
    public required string Hint { get; init; }

    public required DateTimeOffset CreatedAt { get; init; }

    /// <summary>Recorded at most once a minute; null while it's never been used.</summary>
    public DateTimeOffset? LastUsedAt { get; init; }

    /// <summary>Null for a key that never expires.</summary>
    public DateTimeOffset? ExpiresAt { get; init; }

    public required bool Expired { get; init; }

    /// <summary>"Read-only" or "Full access".</summary>
    public string ScopeLabel => ApiKeyLabels.Scope(Scope);

    /// <summary>"as Kid"; null for a key that acts as the admin.</summary>
    public string? ActAsLabel => ApiKeyLabels.ActAs(ActAs);

    /// <summary>"Expired", "Never expires" or "Expires Dec 19, 2026".</summary>
    public string ExpiryLabel => ApiKeyLabels.Expiry(ExpiresAt, Expired);

    /// <summary>"Created Sep 20, 2026".</summary>
    public string CreatedLabel => ApiKeyLabels.Created(CreatedAt);

    /// <summary>"Never used", "Last used 2 minutes ago", …</summary>
    public string LastUsedLabel(DateTimeOffset now) => ApiKeyLabels.LastUsed(LastUsedAt, now);
}

/// <summary><c>POST /settings/api-keys</c>'s 201: the secret, shown once, and the new row.</summary>
public sealed record CreatedApiKey
{
    /// <summary><c>mq_</c> and 43 base64url characters. Never returned again.</summary>
    public required string Key { get; init; }

    public required ApiKey ApiKey { get; init; }
}

/// <summary>
/// <c>POST /settings/api-keys</c> body. Null fields are left out: no
/// <c>actAsUserId</c> means the admin, no <c>expiresInDays</c> means never.
/// </summary>
/// <param name="Name">1–80 characters after trimming.</param>
/// <param name="ActAsUserId">A household member's id; null for the admin.</param>
/// <param name="ExpiresInDays">1–3650; null for never.</param>
public sealed record CreateApiKeyRequest(string Name, ApiKeyScope Scope, Guid? ActAsUserId = null, int? ExpiresInDays = null);

/// <summary>One of the create form's expiry choices: its label and days (null for never).</summary>
public sealed record ApiKeyExpiryChoice(string Label, int? Days);

/// <summary>
/// One of the create form's "Act as" choices: <see cref="ApiKeyLabels.AdminChoiceLabel"/>
/// (no one, <see cref="UserId"/> null) or a household member by their label.
/// </summary>
public sealed record ApiKeyActAsChoice(string Label, Guid? UserId)
{
    public static ApiKeyActAsChoice Admin { get; } = new(ApiKeyLabels.AdminChoiceLabel, null);

    /// <summary>"Admin (you)", then every account of <c>GET /users</c> but the admin, in the list's order.</summary>
    public static IReadOnlyList<ApiKeyActAsChoice> For(IEnumerable<HouseholdMember> members) =>
        [
            Admin,
            .. members
                .Where(member => member.Role != UserRole.Admin && !member.IsCurrentUser)
                .Select(member => new ApiKeyActAsChoice(member.Label, member.Id)),
        ];
}

/// <summary>
/// lib/api/api-key-labels.ts: the words each key's row shows, the same on
/// the website and the Mac and Windows apps. Dates are printed in UTC like
/// the website's ("Expires Dec 19, 2026"). Pure.
/// </summary>
public static class ApiKeyLabels
{
    /// <summary>The website's Settings › Integrations › API keys description.</summary>
    public const string Description =
        "Let dashboards like Homepage or Homarr, scripts and other apps use Marquee. A key works like signing in, so keep it secret.";

    /// <summary>The create form's blank-name message (the server's own words for it), shown without asking the server.</summary>
    public const string BlankNameMessage = "Give the key a name, like Homepage.";

    /// <summary>Under the new key, once.</summary>
    public const string CopyNowMessage = "Copy this key now — it won't be shown again.";

    /// <summary>
    /// The server's words for a create's 404 (the "Act as" member was
    /// removed meanwhile); the app's generic NotFound reads wrong here.
    /// </summary>
    public const string MemberGoneMessage = "That household member doesn't exist any more.";

    /// <summary>The server's words for a 403 (only a signed-in admin manages keys).</summary>
    public const string OnlyTheAdminMessage = "Only the admin can manage API keys.";

    /// <summary>The "Act as" choice that means no one: the key signs in as the admin.</summary>
    public const string AdminChoiceLabel = "Admin (you)";

    /// <summary>API_KEY_EXPIRY_CHOICES: Never, 30 days, 90 days, 1 year.</summary>
    public static IReadOnlyList<ApiKeyExpiryChoice> ExpiryChoices { get; } =
    [
        new("Never", null),
        new("30 days", 30),
        new("90 days", 90),
        new("1 year", 365),
    ];

    public static string Scope(ApiKeyScope scope) => scope.Label;

    /// <summary>"as Kid", or null for a key that acts as the admin.</summary>
    public static string? ActAs(RequestPerson? actAs) => actAs is { } person ? $"as {person.Label}" : null;

    public static string Expiry(DateTimeOffset? expiresAt, bool expired)
    {
        if (expired)
        {
            return "Expired";
        }
        return expiresAt is { } at ? $"Expires {ShortDate(at)}" : "Never expires";
    }

    public static string Created(DateTimeOffset createdAt) => $"Created {ShortDate(createdAt)}";

    /// <summary>apiKeyLastUsedLabel: "Never used", "Last used just now", "… 5 minutes ago", "… 1 hour ago", "… yesterday", "… 3 days ago", then the date.</summary>
    public static string LastUsed(DateTimeOffset? lastUsedAt, DateTimeOffset now)
    {
        if (lastUsedAt is not { } used)
        {
            return "Never used";
        }
        var ago = now - used;
        if (ago < TimeSpan.FromMinutes(2))
        {
            return "Last used just now";
        }
        if (ago < TimeSpan.FromHours(1))
        {
            return $"Last used {(int)ago.TotalMinutes} minutes ago";
        }
        if (ago < TimeSpan.FromDays(1))
        {
            var hours = (int)ago.TotalHours;
            return $"Last used {hours} {(hours == 1 ? "hour" : "hours")} ago";
        }
        if (ago < TimeSpan.FromDays(2))
        {
            return "Last used yesterday";
        }
        if (ago < TimeSpan.FromDays(30))
        {
            return $"Last used {(int)ago.TotalDays} days ago";
        }
        return $"Last used {ShortDate(used)}";
    }

    /// <summary>"Dec 19, 2026", in UTC.</summary>
    public static string ShortDate(DateTimeOffset date) =>
        date.ToUniversalTime().ToString("MMM d, yyyy", CultureInfo.InvariantCulture);
}

/// <summary><c>GET /stats/summary</c> (0.47+): a few counts for dashboard widgets.</summary>
public sealed record StatsSummary
{
    /// <summary>0 for an account that doesn't review requests.</summary>
    public required int PendingRequests { get; init; }

    /// <summary>0 for an account that doesn't review requests.</summary>
    public required int OpenIssues { get; init; }

    /// <summary>Approved requests Sonarr/Radarr can't find; 0 for an account that doesn't review requests.</summary>
    public required int CantFind { get; init; }

    /// <summary>Titles in the household library.</summary>
    public required int Movies { get; init; }

    public required int Series { get; init; }

    /// <summary>Titles Sonarr/Radarr are downloading now.</summary>
    public required int Downloading { get; init; }
}
