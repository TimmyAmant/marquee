using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Marquee.Core.Models;

// Sign in with Plex / Jellyfin, linked accounts and member import. Every new
// response field is optional so an older server (which sends none of them)
// simply shows no new buttons.

/// <summary>Plex sign-in pages the app is willing to open.</summary>
public static class PlexWeb
{
    /// <summary>
    /// The URL when it's a plex.tv page over https, else null: the app hands
    /// it to the browser, and a server (or something pretending to be one)
    /// mustn't be able to make it open a file or another app's URL scheme.
    /// </summary>
    public static Uri? Url(string? value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var url)
            || !string.Equals(url.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
            return null;
        var host = url.Host.ToLowerInvariant();
        return host == "plex.tv" || host.EndsWith(".plex.tv", StringComparison.Ordinal) ? url : null;
    }
}

/// <summary>The media servers a Marquee account can sign in with.</summary>
public enum MediaServerKind
{
    Plex,
    Jellyfin,
}

public static class MediaServerKindExtensions
{
    /// <summary>The path segment in <c>/me/links/{server}</c> and <c>/users/import/{server}</c>.</summary>
    public static string WireValue(this MediaServerKind server) => server switch
    {
        MediaServerKind.Plex => "plex",
        MediaServerKind.Jellyfin => "jellyfin",
        _ => throw new ArgumentOutOfRangeException(nameof(server)),
    };

    /// <summary>What a server that doesn't say (before 0.40) calls its "jellyfin" server.</summary>
    public const string DefaultJellyfinName = "Jellyfin";

    /// <summary>A server-sent Jellyfin name, with missing or blank read as "Jellyfin".</summary>
    public static string NormalizedJellyfinName(string? name) =>
        string.IsNullOrWhiteSpace(name) ? DefaultJellyfinName : name.Trim();

    public static string Label(this MediaServerKind server) => server.Label(DefaultJellyfinName);

    /// <summary>
    /// The user-facing name, with <paramref name="jellyfinName"/> ("Emby" on
    /// an Emby server — see <c>ServerInfo.JellyfinName</c>) for Jellyfin.
    /// </summary>
    public static string Label(this MediaServerKind server, string? jellyfinName) => server switch
    {
        MediaServerKind.Plex => "Plex",
        MediaServerKind.Jellyfin => NormalizedJellyfinName(jellyfinName),
        _ => throw new ArgumentOutOfRangeException(nameof(server)),
    };
}

/// <summary><c>linked</c> on <c>/me</c> and household members: which media-server accounts sign in to this Marquee account.</summary>
public sealed record LinkedAccounts
{
    public bool Plex { get; init; }
    public bool Jellyfin { get; init; }

    public bool IsLinked(MediaServerKind server) => server == MediaServerKind.Plex ? Plex : Jellyfin;
}

/// <summary>
/// <c>POST /auth/plex/start</c> and <c>/me/links/plex/start</c>: open
/// <see cref="AuthUrl"/> in the browser, then poll with <see cref="Handle"/>
/// (never a bare pin id) until <see cref="ExpiresAt"/>.
/// </summary>
public sealed record PlexSignInStart
{
    public required string Handle { get; init; }
    public required string AuthUrl { get; init; }
    public required DateTimeOffset ExpiresAt { get; init; }

    /// <summary><see cref="AuthUrl"/> if it's a plex.tv page (see <see cref="PlexWeb.Url"/>).</summary>
    public Uri? Url => PlexWeb.Url(AuthUrl);
}

/// <summary><c>POST /auth/plex/poll</c> body.</summary>
public sealed record PlexPollRequest(string Handle, string DeviceName);

/// <summary><c>POST /auth/jellyfin</c> body.</summary>
public sealed record JellyfinLoginRequest(string Username, string Password, string DeviceName);

/// <summary><c>POST /me/links/plex/poll</c> body.</summary>
public sealed record PlexLinkPollRequest(string Handle);

/// <summary><c>POST /me/links/jellyfin</c> body.</summary>
public sealed record JellyfinLinkRequest(string Username, string Password);

/// <summary>
/// A Plex user id (a number) or a Jellyfin one (a string), sent back to the
/// server exactly as it came.
/// </summary>
[JsonConverter(typeof(ExternalIdConverter))]
public readonly record struct ExternalId
{
    public ExternalId(string text)
    {
        Text = text;
        IsNumber = false;
    }

    public ExternalId(long number)
    {
        Text = number.ToString(CultureInfo.InvariantCulture);
        IsNumber = true;
    }

    public string Text { get; }

    /// <summary>It came as a JSON number, and goes back as one.</summary>
    public bool IsNumber { get; }

    public override string ToString() => Text;
}

public sealed class ExternalIdConverter : JsonConverter<ExternalId>
{
    public override ExternalId Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
        reader.TokenType switch
        {
            JsonTokenType.Number when reader.TryGetInt64(out var number) => new ExternalId(number),
            JsonTokenType.String => new ExternalId(reader.GetString() ?? ""),
            _ => throw new JsonException("Expected a string or integer id."),
        };

    public override void Write(Utf8JsonWriter writer, ExternalId value, JsonSerializerOptions options)
    {
        if (value.IsNumber && long.TryParse(value.Text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var number))
        {
            writer.WriteNumberValue(number);
        }
        else
        {
            writer.WriteStringValue(value.Text);
        }
    }
}

/// <summary>A row in "Import from Plex/Jellyfin" (<c>GET /users/import/{server}</c>).</summary>
public sealed record ImportCandidate
{
    public required ExternalId Id { get; init; }
    public required string Username { get; init; }
    public string? DisplayName { get; init; }

    /// <summary>A picture URL on Plex/Jellyfin, when there is one.</summary>
    public string? Thumb { get; init; }

    /// <summary>Already linked to a Marquee account: shown, not selectable.</summary>
    public bool AlreadyMember { get; init; }

    public string Label => DisplayName.NonBlank() ?? Username;
}

/// <summary><c>POST /users/import/{server}</c> body.</summary>
public sealed record ImportUsersRequest(IReadOnlyList<ExternalId> Ids);

/// <summary><c>POST /users/import/{server}</c> response.</summary>
public sealed record ImportUsersResult
{
    public required IReadOnlyList<HouseholdMember> Created { get; init; }
    public required int Skipped { get; init; }
}

/// <summary><c>GET</c>/<c>PUT /settings/sign-in</c> (admin).</summary>
public sealed record SignInSettings
{
    /// <summary>"New accounts from Plex/Jellyfin sign-in".</summary>
    public required bool MediaServerSignup { get; init; }
}
