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

    public bool IsAdmin => Role == UserRole.Admin;

    /// <summary>What the website prints: the display name, else the username.</summary>
    public string Label => DisplayName.NonBlank() ?? Username;
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
