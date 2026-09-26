using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Marquee.Core.Models;

/// <summary>
/// A string enum the server may grow. An unrecognized value keeps its raw
/// string instead of failing the whole response, so an older app keeps
/// working against a newer server (it just can't name the new case). A view
/// that renders one checks <c>IsKnown</c> rather than printing a raw wire
/// value.
///
/// Each is a <c>readonly record struct</c> around the wire string, so
/// equality is the wire value and the named cases are plain static fields:
/// <c>card.MediaType == MediaType.Movie</c>.
/// </summary>
public interface IOpenEnum<TSelf> where TSelf : struct, IOpenEnum<TSelf>
{
    /// <summary>The wire value.</summary>
    string Value { get; }

    /// <summary>Wraps any wire value, known or not.</summary>
    static abstract TSelf FromValue(string value);

    /// <summary>Every named case, in declaration order.</summary>
    static abstract IReadOnlyList<TSelf> Known { get; }
}

public static class OpenEnum
{
    /// <summary>False for a value this version of the app doesn't know.</summary>
    public static bool IsKnown<T>(T value) where T : struct, IOpenEnum<T> => T.Known.Contains(value);

    /// <summary>
    /// A readable stand-in for an unknown wire value ("coming_soon" reads as
    /// "Coming_Soon"), the same as Swift's <c>capitalized</c> in the Mac app.
    /// </summary>
    public static string Capitalized(string raw)
    {
        var builder = new StringBuilder(raw.Length);
        var startOfWord = true;
        foreach (var character in raw)
        {
            if (char.IsLetter(character))
            {
                builder.Append(startOfWord ? char.ToUpperInvariant(character) : char.ToLowerInvariant(character));
                startOfWord = false;
            }
            else
            {
                builder.Append(character);
                startOfWord = true;
            }
        }
        return builder.ToString();
    }
}

/// <summary>Reads and writes every <see cref="IOpenEnum{TSelf}"/> as its wire string.</summary>
public sealed class OpenEnumConverterFactory : JsonConverterFactory
{
    public override bool CanConvert(Type typeToConvert) =>
        typeToConvert.IsValueType && typeToConvert.GetInterfaces().Any(candidate =>
            candidate.IsGenericType
            && candidate.GetGenericTypeDefinition() == typeof(IOpenEnum<>)
            && candidate.GetGenericArguments()[0] == typeToConvert);

    public override JsonConverter? CreateConverter(Type typeToConvert, JsonSerializerOptions options) =>
        (JsonConverter?)Activator.CreateInstance(typeof(OpenEnumConverter<>).MakeGenericType(typeToConvert));

    private sealed class OpenEnumConverter<T> : JsonConverter<T> where T : struct, IOpenEnum<T>
    {
        public override T Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            if (reader.TokenType != JsonTokenType.String)
            {
                throw new JsonException($"Expected a string for {typeof(T).Name}, got {reader.TokenType}.");
            }
            return T.FromValue(reader.GetString()!);
        }

        public override void Write(Utf8JsonWriter writer, T value, JsonSerializerOptions options) =>
            writer.WriteStringValue(value.Value);

        public override T ReadAsPropertyName(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
            T.FromValue(reader.GetString()!);

        public override void WriteAsPropertyName(Utf8JsonWriter writer, T value, JsonSerializerOptions options) =>
            writer.WritePropertyName(value.Value);
    }
}

// C# counterparts of the string unions in lib/api/types.ts, mirroring the
// Mac app's API/Models/OpenEnum.swift case for case (plus the closed enums
// the Swift models keep elsewhere, which are open here by convention).

/// <summary><c>"movie"</c> or <c>"tv"</c>.</summary>
public readonly record struct MediaType(string Value) : IOpenEnum<MediaType>
{
    public static readonly MediaType Movie = new("movie");
    public static readonly MediaType Tv = new("tv");

    public static IReadOnlyList<MediaType> Known { get; } = [Movie, Tv];
    public static MediaType FromValue(string value) => new(value);
    public bool IsKnown => Known.Contains(this);
    public override string ToString() => Value;

    /// <summary>"Movie" / "TV" (the search suggestion pill wording).</summary>
    public string Label => this == Movie ? "Movie" : this == Tv ? "TV" : OpenEnum.Capitalized(Value);

    /// <summary>"Movies" / "Series" (navigation and page titles).</summary>
    public string PluralLabel => this == Movie ? "Movies" : this == Tv ? "Series" : OpenEnum.Capitalized(Value);

    /// <summary>"Radarr" / "Sonarr": who adds and tracks this media type.</summary>
    public string ArrName => this == Movie ? "Radarr" : this == Tv ? "Sonarr" : "Sonarr/Radarr";
}

public readonly record struct UserRole(string Value) : IOpenEnum<UserRole>
{
    public static readonly UserRole Admin = new("admin");
    public static readonly UserRole Member = new("member");

    public static IReadOnlyList<UserRole> Known { get; } = [Admin, Member];
    public static UserRole FromValue(string value) => new(value);
    public bool IsKnown => Known.Contains(this);
    public override string ToString() => Value;

    public string Label => this == Admin ? "Admin" : this == Member ? "Member" : OpenEnum.Capitalized(Value);
}

public readonly record struct RequestStatus(string Value) : IOpenEnum<RequestStatus>
{
    public static readonly RequestStatus Pending = new("pending");
    public static readonly RequestStatus Approved = new("approved");
    public static readonly RequestStatus Rejected = new("rejected");

    public static IReadOnlyList<RequestStatus> Known { get; } = [Pending, Approved, Rejected];
    public static RequestStatus FromValue(string value) => new(value);
    public bool IsKnown => Known.Contains(this);
    public override string ToString() => Value;
}

/// <summary>
/// components/status-badge.tsx's union. <c>null</c> on the wire (not in the
/// library at all) is a null <c>LibraryStatus?</c>, not a case.
/// </summary>
public readonly record struct LibraryStatus(string Value) : IOpenEnum<LibraryStatus>
{
    public static readonly LibraryStatus Owned = new("owned");
    public static readonly LibraryStatus TrackedDownloading = new("tracked_downloading");
    public static readonly LibraryStatus TrackedMonitored = new("tracked_monitored");
    public static readonly LibraryStatus ComingSoon = new("coming_soon");
    public static readonly LibraryStatus Untracked = new("untracked");

    public static IReadOnlyList<LibraryStatus> Known { get; } = [Owned, TrackedDownloading, TrackedMonitored, ComingSoon, Untracked];
    public static LibraryStatus FromValue(string value) => new(value);
    public bool IsKnown => Known.Contains(this);
    public override string ToString() => Value;

    /// <summary>The title page badge.</summary>
    public string Label
    {
        get
        {
            if (this == Owned) return "Already in your library";
            if (this == TrackedDownloading) return "Downloading";
            if (this == TrackedMonitored) return "Missing";
            if (this == ComingSoon) return "Coming soon";
            if (this == Untracked) return "Not in your library";
            return Value;
        }
    }

    /// <summary>The poster card badge.</summary>
    public string CompactLabel
    {
        get
        {
            if (this == Owned) return "Owned";
            if (this == TrackedDownloading) return "Downloading";
            if (this == TrackedMonitored) return "Missing";
            if (this == ComingSoon) return "Coming soon";
            if (this == Untracked) return "Not owned";
            return Value;
        }
    }

    /// <summary>In the library in any form (owned or tracked by Sonarr/Radarr).</summary>
    public bool IsInLibrary => this == Owned || this == TrackedDownloading || this == TrackedMonitored || this == ComingSoon;
}

/// <summary>Where a title's library status came from (<c>library.provider</c>).</summary>
public readonly record struct LibraryProvider(string Value) : IOpenEnum<LibraryProvider>
{
    public static readonly LibraryProvider Plex = new("plex");
    public static readonly LibraryProvider Jellyfin = new("jellyfin");
    public static readonly LibraryProvider Sonarr = new("sonarr");
    public static readonly LibraryProvider Radarr = new("radarr");

    public static IReadOnlyList<LibraryProvider> Known { get; } = [Plex, Jellyfin, Sonarr, Radarr];
    public static LibraryProvider FromValue(string value) => new(value);
    public bool IsKnown => Known.Contains(this);
    public override string ToString() => Value;

    public string DisplayName
    {
        get
        {
            if (this == Plex) return "Plex";
            if (this == Jellyfin) return "Jellyfin";
            if (this == Sonarr) return "Sonarr";
            if (this == Radarr) return "Radarr";
            return OpenEnum.Capitalized(Value);
        }
    }
}

/// <summary><c>/favorites/{entityType}/{tmdbId}</c>.</summary>
public readonly record struct FavoriteEntityType(string Value) : IOpenEnum<FavoriteEntityType>
{
    public static readonly FavoriteEntityType Movie = new("movie");
    public static readonly FavoriteEntityType Tv = new("tv");
    public static readonly FavoriteEntityType Person = new("person");
    public static readonly FavoriteEntityType Company = new("company");
    public static readonly FavoriteEntityType Collection = new("collection");

    public static IReadOnlyList<FavoriteEntityType> Known { get; } = [Movie, Tv, Person, Company, Collection];
    public static FavoriteEntityType FromValue(string value) => new(value);
    public bool IsKnown => Known.Contains(this);
    public override string ToString() => Value;

    /// <summary>A title's entity type: the media type's wire value is the same string.</summary>
    public static FavoriteEntityType Of(MediaType mediaType) => new(mediaType.Value);
}

public readonly record struct NotificationEventType(string Value) : IOpenEnum<NotificationEventType>
{
    public static readonly NotificationEventType Grabbed = new("grabbed");
    public static readonly NotificationEventType Downloaded = new("downloaded");
    public static readonly NotificationEventType RequestApproved = new("request_approved");
    public static readonly NotificationEventType RequestRejected = new("request_rejected");

    public static IReadOnlyList<NotificationEventType> Known { get; } = [Grabbed, Downloaded, RequestApproved, RequestRejected];
    public static NotificationEventType FromValue(string value) => new(value);
    public bool IsKnown => Known.Contains(this);
    public override string ToString() => Value;

    public string Emoji
    {
        get
        {
            if (this == Grabbed) return "⬇️";
            if (this == Downloaded) return "✅";
            if (this == RequestApproved) return "👍";
            if (this == RequestRejected) return "👎";
            return "🔔";
        }
    }

    /// <summary>
    /// The heading of a system notification for this kind, the same words
    /// the server's own Web Push uses (lib/push/deliver.ts); the message
    /// goes under it. "Marquee" for a kind this app doesn't know.
    /// </summary>
    public string NotificationTitle
    {
        get
        {
            if (this == Grabbed) return "Downloading";
            if (this == Downloaded) return "Ready to watch";
            if (this == RequestApproved) return "Request approved";
            if (this == RequestRejected) return "Request declined";
            return "Marquee";
        }
    }
}

public readonly record struct ActivityEventType(string Value) : IOpenEnum<ActivityEventType>
{
    public static readonly ActivityEventType RequestCreated = new("request_created");
    public static readonly ActivityEventType RequestApproved = new("request_approved");
    public static readonly ActivityEventType RequestRejected = new("request_rejected");
    public static readonly ActivityEventType RequestManuallyApproved = new("request_manually_approved");

    public static IReadOnlyList<ActivityEventType> Known { get; } = [RequestCreated, RequestApproved, RequestRejected, RequestManuallyApproved];
    public static ActivityEventType FromValue(string value) => new(value);
    public bool IsKnown => Known.Contains(this);
    public override string ToString() => Value;
}

/// <summary><c>MyRequest.statusTone</c>: which badge colors the Requests page uses.</summary>
public readonly record struct RequestTone(string Value) : IOpenEnum<RequestTone>
{
    public static readonly RequestTone Pending = new("pending");
    public static readonly RequestTone Declined = new("declined");
    public static readonly RequestTone Owned = new("owned");
    public static readonly RequestTone Downloading = new("downloading");
    public static readonly RequestTone ComingSoon = new("coming_soon");
    public static readonly RequestTone Approved = new("approved");

    public static IReadOnlyList<RequestTone> Known { get; } = [Pending, Declined, Owned, Downloading, ComingSoon, Approved];
    public static RequestTone FromValue(string value) => new(value);
    public bool IsKnown => Known.Contains(this);
    public override string ToString() => Value;
}

/// <summary><c>SearchSuggestion.mediaType</c>: a person or a title.</summary>
public readonly record struct SuggestionKind(string Value) : IOpenEnum<SuggestionKind>
{
    public static readonly SuggestionKind Person = new("person");
    public static readonly SuggestionKind Movie = new("movie");
    public static readonly SuggestionKind Tv = new("tv");

    public static IReadOnlyList<SuggestionKind> Known { get; } = [Person, Movie, Tv];
    public static SuggestionKind FromValue(string value) => new(value);
    public bool IsKnown => Known.Contains(this);
    public override string ToString() => Value;

    /// <summary>The website's pill: "Actor", "Movie", "TV".</summary>
    public string Label => this == Person ? "Actor" : this == Movie ? "Movie" : this == Tv ? "TV" : OpenEnum.Capitalized(Value);

    /// <summary>The title's media type, null for a person (or an unknown kind).</summary>
    public MediaType? MediaType => this == Movie ? Models.MediaType.Movie : this == Tv ? Models.MediaType.Tv : null;
}

/// <summary><c>FileDetails.resolutionTier</c>, derived from the quality name (lib/quality.ts).</summary>
public readonly record struct ResolutionTier(string Value) : IOpenEnum<ResolutionTier>
{
    public static readonly ResolutionTier Uhd = new("4K");
    public static readonly ResolutionTier FullHd = new("1080p");
    public static readonly ResolutionTier Hd = new("720p");

    public static IReadOnlyList<ResolutionTier> Known { get; } = [Uhd, FullHd, Hd];
    public static ResolutionTier FromValue(string value) => new(value);
    public bool IsKnown => Known.Contains(this);
    public override string ToString() => Value;
}

/// <summary>Sonarr or Radarr, as the <c>/settings/integrations/{provider}</c> path segment.</summary>
public readonly record struct ArrProvider(string Value) : IOpenEnum<ArrProvider>
{
    public static readonly ArrProvider Sonarr = new("sonarr");
    public static readonly ArrProvider Radarr = new("radarr");

    /// <summary>The optional 4K Sonarr (0.37+).</summary>
    public static readonly ArrProvider Sonarr4k = new("sonarr4k");

    /// <summary>The optional 4K Radarr (0.37+).</summary>
    public static readonly ArrProvider Radarr4k = new("radarr4k");

    public static IReadOnlyList<ArrProvider> Known { get; } = [Sonarr, Radarr, Sonarr4k, Radarr4k];
    public static ArrProvider FromValue(string value) => new(value);
    public bool IsKnown => Known.Contains(this);
    public override string ToString() => Value;

    /// <summary>The 4K Sonarr or 4K Radarr.</summary>
    public bool IsFourK => this == Sonarr4k || this == Radarr4k;

    public string DisplayName
    {
        get
        {
            if (this == Sonarr) return "Sonarr";
            if (this == Radarr) return "Radarr";
            if (this == Sonarr4k) return "4K Sonarr";
            if (this == Radarr4k) return "4K Radarr";
            return OpenEnum.Capitalized(Value);
        }
    }

    /// <summary>The port the service listens on out of the box; null for a provider this app doesn't know.</summary>
    public int? DefaultPort => this == Sonarr || this == Sonarr4k ? 8989 : this == Radarr || this == Radarr4k ? 7878 : null;

    /// <summary>The media type this provider adds.</summary>
    public MediaType MediaType => this == Sonarr || this == Sonarr4k ? Models.MediaType.Tv : Models.MediaType.Movie;
}

/// <summary>
/// Every service under <c>/settings/integrations/{provider}</c>: the library
/// and download-client connections plus the instance-wide settings (api-v1.md
/// section 12). The wire value is the path segment.
/// </summary>
public readonly record struct IntegrationProvider(string Value) : IOpenEnum<IntegrationProvider>
{
    public static readonly IntegrationProvider Plex = new("plex");
    public static readonly IntegrationProvider Jellyfin = new("jellyfin");
    public static readonly IntegrationProvider Sonarr = new("sonarr");
    public static readonly IntegrationProvider Radarr = new("radarr");
    public static readonly IntegrationProvider Tmdb = new("tmdb");
    public static readonly IntegrationProvider Trakt = new("trakt");
    public static readonly IntegrationProvider Tvdb = new("tvdb");
    public static readonly IntegrationProvider Discord = new("discord");
    public static readonly IntegrationProvider Ntfy = new("ntfy");
    public static readonly IntegrationProvider Webhook = new("webhook");
    public static readonly IntegrationProvider Telegram = new("telegram");
    public static readonly IntegrationProvider Pushover = new("pushover");
    public static readonly IntegrationProvider Email = new("email");

    public static IReadOnlyList<IntegrationProvider> Known { get; } = [Plex, Jellyfin, Sonarr, Radarr, Tmdb, Trakt, Tvdb, Discord, Ntfy, Webhook, Telegram, Pushover, Email];
    public static IntegrationProvider FromValue(string value) => new(value);
    public bool IsKnown => Known.Contains(this);
    public override string ToString() => Value;

    public string DisplayName
    {
        get
        {
            if (this == Plex) return "Plex";
            if (this == Jellyfin) return "Jellyfin";
            if (this == Sonarr) return "Sonarr";
            if (this == Radarr) return "Radarr";
            if (this == Tmdb) return "TMDb";
            if (this == Trakt) return "Trakt";
            if (this == Tvdb) return "TheTVDB";
            if (this == Discord) return "Discord";
            if (this == Ntfy) return "ntfy";
            if (this == Webhook) return "Webhook";
            if (this == Telegram) return "Telegram";
            if (this == Pushover) return "Pushover";
            if (this == Email) return "Email";
            return OpenEnum.Capitalized(Value);
        }
    }
}

/// <summary>The Movies/Series grid's <c>?sort=</c>.</summary>
public readonly record struct BrowseSort(string Value) : IOpenEnum<BrowseSort>
{
    public static readonly BrowseSort Popularity = new("popularity");
    public static readonly BrowseSort TopRated = new("top_rated");
    public static readonly BrowseSort Newest = new("newest");

    public static IReadOnlyList<BrowseSort> Known { get; } = [Popularity, TopRated, Newest];
    public static BrowseSort FromValue(string value) => new(value);
    public bool IsKnown => Known.Contains(this);
    public override string ToString() => Value;

    public string Label => this == Popularity ? "Popular" : this == TopRated ? "Top rated" : this == Newest ? "Newest" : OpenEnum.Capitalized(Value);
}

/// <summary>A maintenance job's id (<c>GET /settings/jobs</c>, <c>POST /settings/jobs/{id}/run</c>).</summary>
public readonly record struct JobId(string Value) : IOpenEnum<JobId>
{
    public static readonly JobId PlexSync = new("plex-sync");
    public static readonly JobId JellyfinSync = new("jellyfin-sync");
    public static readonly JobId ArrSync = new("arr-sync");
    public static readonly JobId PlexWatchlist = new("plex-watchlist");
    public static readonly JobId DiskSpaceSnapshot = new("disk-space-snapshot");
    public static readonly JobId Cleanup = new("cleanup");

    public static IReadOnlyList<JobId> Known { get; } = [PlexSync, JellyfinSync, ArrSync, PlexWatchlist, DiskSpaceSnapshot, Cleanup];
    public static JobId FromValue(string value) => new(value);
    public bool IsKnown => Known.Contains(this);
    public override string ToString() => Value;
}
