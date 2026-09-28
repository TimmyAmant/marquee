using Marquee.Core.Localization;
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
    public string Label => this == Read ? Loc.Get("Model_ApiKeyScopeRead") : Loc.Get("Model_ApiKeyScopeFull");
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
    public static ApiKeyActAsChoice Admin => new(ApiKeyLabels.AdminChoiceLabel, null);

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
    public static string Description => Loc.Get("Model_ApiKeysDescription");

    /// <summary>The create form's blank-name message (the server's own words for it), shown without asking the server.</summary>
    public static string BlankNameMessage => Loc.Get("Model_ApiKeyBlankName");

    /// <summary>Under the new key, once.</summary>
    public static string CopyNowMessage => Loc.Get("Model_ApiKeyCopyNow");

    /// <summary>
    /// The server's words for a create's 404 (the "Act as" member was
    /// removed meanwhile); the app's generic NotFound reads wrong here.
    /// </summary>
    public static string MemberGoneMessage => Loc.Get("Model_ApiKeyMemberGone");

    /// <summary>The server's words for a 403 (only a signed-in admin manages keys).</summary>
    public static string OnlyTheAdminMessage => Loc.Get("Model_ApiKeyOnlyAdmin");

    /// <summary>The "Act as" choice that means no one: the key signs in as the admin.</summary>
    public static string AdminChoiceLabel => Loc.Get("Model_ApiKeyAdminChoice");

    /// <summary>API_KEY_EXPIRY_CHOICES: Never, 30 days, 90 days, 1 year.</summary>
    public static IReadOnlyList<ApiKeyExpiryChoice> ExpiryChoices =>
    [
        new(Loc.Get("Model_ApiKeyExpiryNever"), null),
        new(Loc.Plural("Model_ApiKeyExpiryDays", 30), 30),
        new(Loc.Plural("Model_ApiKeyExpiryDays", 90), 90),
        new(Loc.Get("Model_ApiKeyExpiryYear"), 365),
    ];

    public static string Scope(ApiKeyScope scope) => scope.Label;

    /// <summary>"as Kid", or null for a key that acts as the admin.</summary>
    public static string? ActAs(RequestPerson? actAs) => actAs is { } person ? Loc.Format("Model_ApiKeyActAs", person.Label) : null;

    public static string Expiry(DateTimeOffset? expiresAt, bool expired)
    {
        if (expired)
        {
            return Loc.Get("Model_ApiKeyExpired");
        }
        return expiresAt is { } at ? Loc.Format("Model_ApiKeyExpires", ShortDate(at)) : Loc.Get("Model_ApiKeyNeverExpires");
    }

    public static string Created(DateTimeOffset createdAt) => Loc.Format("Model_ApiKeyCreated", ShortDate(createdAt));

    /// <summary>apiKeyLastUsedLabel: "Never used", "Last used just now", "… 5 minutes ago", "… 1 hour ago", "… yesterday", "… 3 days ago", then the date.</summary>
    public static string LastUsed(DateTimeOffset? lastUsedAt, DateTimeOffset now)
    {
        if (lastUsedAt is not { } used)
        {
            return Loc.Get("Model_ApiKeyNeverUsed");
        }
        var ago = now - used;
        if (ago < TimeSpan.FromMinutes(2))
        {
            return Loc.Get("Model_ApiKeyUsedJustNow");
        }
        if (ago < TimeSpan.FromHours(1))
        {
            return Loc.Plural("Model_ApiKeyUsedMinutesAgo", (int)ago.TotalMinutes);
        }
        if (ago < TimeSpan.FromDays(1))
        {
            return Loc.Plural("Model_ApiKeyUsedHoursAgo", (int)ago.TotalHours);
        }
        if (ago < TimeSpan.FromDays(2))
        {
            return Loc.Get("Model_ApiKeyUsedYesterday");
        }
        if (ago < TimeSpan.FromDays(30))
        {
            return Loc.Plural("Model_ApiKeyUsedDaysAgo", (int)ago.TotalDays);
        }
        return Loc.Format("Model_ApiKeyUsedOn", ShortDate(used));
    }

    /// <summary>"Dec 19, 2026", in UTC, in the app's language (the date pattern is a resource).</summary>
    public static string ShortDate(DateTimeOffset date) =>
        date.ToUniversalTime().ToString(Loc.Get("Model_ShortDatePattern"), CultureInfo.CurrentCulture);
}
