using System.Globalization;
using System.Text.Json.Serialization;

namespace Marquee.Core.Models;

// Settings > Account: household members (api-v1.md section 11). The two
// request bodies are positional records so a null optional is left out of
// the JSON (Json.RequestOptions): "omitted or empty = unchanged" is the
// server's rule for PATCH, and an explicit null is not the same thing.

/// <summary>A row in "Household members" (admin) or "Your account" (member).</summary>
public sealed record HouseholdMember
{
    public required Guid Id { get; init; }
    public required string Username { get; init; }
    public string? DisplayName { get; init; }

    /// <summary>The "Admin" badge.</summary>
    public required UserRole Role { get; init; }

    /// <summary>"Auto-approve movie requests", shown only for non-admin rows.</summary>
    public required bool AutoApproveMovies { get; init; }

    /// <summary>"Auto-approve TV requests", shown only for non-admin rows.</summary>
    public required bool AutoApproveTv { get; init; }

    public required DateTimeOffset CreatedAt { get; init; }

    /// <summary>The "You" badge. "Edit" is offered on every row for the admin and on this one for a member.</summary>
    public required bool IsCurrentUser { get; init; }

    /// <inheritdoc cref="User.AvatarUrl"/>
    public string? AvatarUrl { get; init; }

    /// <summary>The "Plex" / "Jellyfin" tags; null from older servers.</summary>
    public LinkedAccounts? Linked { get; init; }

    /// <inheritdoc cref="User.HasPassword"/>
    public bool? HasPassword { get; init; }

    private readonly DateTimeOffset? lastActiveAt;

    /// <summary>
    /// When the account last used the website or an app, to within 5
    /// minutes; null when it never has ("Never signed in"). An older server
    /// omits the key: see <see cref="ReportsLastActive"/>.
    /// </summary>
    public DateTimeOffset? LastActiveAt
    {
        get => lastActiveAt;
        init
        {
            lastActiveAt = value;
            ReportsLastActive = true;
        }
    }

    /// <summary>
    /// Whether the server sent <c>lastActiveAt</c> at all, null included.
    /// The decoder only runs the setter for a key that is there, so an
    /// older server (no key) leaves this false and the row shows no line,
    /// where a present null means "Never signed in".
    /// </summary>
    [JsonIgnore]
    public bool ReportsLastActive { get; private init; }

    /// <summary>
    /// The admin's muted line under a member's name ("Active 3 hours ago");
    /// null when the server doesn't report it. <paramref name="zone"/> is
    /// for the "Last active Jul 4, 2026" date, local time by default.
    /// </summary>
    public string? LastActiveLine(DateTimeOffset now, TimeZoneInfo? zone = null) =>
        ReportsLastActive ? LastActiveLabel.Format(LastActiveAt, now, zone) : null;

    public bool IsAdmin => Role == UserRole.Admin;

    /// <summary>What the website prints: the display name, else the username.</summary>
    public string Label => DisplayName.NonBlank() ?? Username;
}

/// <summary>
/// lib/users/last-active-label.ts: "Active 3 hours ago" under each member in
/// Settings, admin only and not on their own row. Kept to the server's
/// 5-minute recording precision: anything in the last ten minutes (or a
/// timestamp slightly ahead of this clock) is "Active now".
/// </summary>
public static class LastActiveLabel
{
    /// <summary>Pure. A null <paramref name="lastActiveAt"/> means the account has never been used.</summary>
    public static string Format(DateTimeOffset? lastActiveAt, DateTimeOffset now, TimeZoneInfo? zone = null)
    {
        if (lastActiveAt is not { } at)
        {
            return "Never signed in";
        }
        var ago = now - at;
        if (ago < TimeSpan.FromMinutes(10))
        {
            return "Active now";
        }
        if (ago < TimeSpan.FromHours(1))
        {
            return $"Active {(int)ago.TotalMinutes} minutes ago";
        }
        if (ago < TimeSpan.FromDays(1))
        {
            var hours = (int)ago.TotalHours;
            return hours == 1 ? "Active 1 hour ago" : $"Active {hours} hours ago";
        }
        if (ago < TimeSpan.FromDays(2))
        {
            return "Active yesterday";
        }
        if (ago < TimeSpan.FromDays(30))
        {
            return $"Active {(int)ago.TotalDays} days ago";
        }
        var local = TimeZoneInfo.ConvertTime(at, zone ?? TimeZoneInfo.Local);
        return $"Last active {local.ToString("MMM d, yyyy", CultureInfo.InvariantCulture)}";
    }
}

/// <summary><c>POST /users</c> body ("Add a household member").</summary>
/// <param name="Username">3 to 32 characters: letters, numbers, <c>_ . -</c>; unique.</param>
/// <param name="Password">At least 8 characters.</param>
/// <param name="DisplayName">Optional, 1 to 80 characters; null sends no key.</param>
public sealed record CreateUserRequest(string Username, string Password, string? DisplayName = null);

/// <summary><c>PATCH /users/{id}</c> body, sent the way the website's edit form sends it.</summary>
/// <param name="Username">Required (3 to 32 characters, unique).</param>
/// <param name="DisplayName">At most 80 characters; null or empty leaves it unchanged.</param>
/// <param name="Password">
/// At least 8 characters; null or empty leaves it unchanged. Setting one
/// revokes every token of the account, including this PC's when editing
/// yourself (deviation 5): sign in again.
/// </param>
/// <param name="AutoApproveMovies">Admin only (silently ignored for members); null leaves it unchanged. Shown only for non-admin rows.</param>
/// <param name="AutoApproveTv">Same, for TV requests.</param>
/// <param name="CurrentPassword">
/// Required alongside <paramref name="Password"/> when editing your own
/// account; the admin resetting someone else's password doesn't send it.
/// </param>
public sealed record UpdateUserRequest(
    string Username,
    string? DisplayName = null,
    string? Password = null,
    bool? AutoApproveMovies = null,
    bool? AutoApproveTv = null,
    string? CurrentPassword = null);

/// <summary><c>PATCH /users/{id}</c> response.</summary>
public sealed record UpdateUserResult
{
    public required bool Ok { get; init; }
    public required HouseholdMember User { get; init; }

    /// <summary>
    /// A password was set: every token of that account is gone. If it was
    /// your own account, this PC is signed out and must sign in again.
    /// </summary>
    public required bool TokensRevoked { get; init; }
}

/// <summary>
/// <c>PUT /users/{id}/avatar</c> and <c>DELETE /users/{id}/avatar</c>: the
/// account's new <see cref="User.AvatarUrl"/>, null once the photo is removed.
/// </summary>
public sealed record AvatarResult
{
    public required bool Ok { get; init; }
    public string? AvatarUrl { get; init; }
}
