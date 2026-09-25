namespace Marquee.Core.Models;

// Settings, Integrations (api-v1.md section 12). Mirrors
// mac/Marquee/API/Models/IntegrationsModels.swift. Secrets (API keys, tokens,
// the webhook URLs of Discord, ntfy and the generic webhook) are never
// returned, only whether they're set.

/// <summary>
/// <c>GET /settings/integrations</c>. Page sections: Media Libraries (Plex,
/// Jellyfin), Download Clients (Sonarr, Radarr), Metadata Sources (TMDb,
/// Trakt, TheTVDB), Notifications (Sonarr/Radarr webhooks, Discord, ntfy,
/// generic webhook).
/// </summary>
public sealed record IntegrationsOverview
{
    public required PlexSettings Plex { get; init; }
    public required JellyfinSettings Jellyfin { get; init; }
    public required ArrSettings Sonarr { get; init; }
    public required ArrSettings Radarr { get; init; }
    public required TmdbSettings Tmdb { get; init; }
    public required ConnectionState Trakt { get; init; }
    public required ConnectionState Tvdb { get; init; }
    public required ConnectionState Discord { get; init; }
    public required ConnectionState Ntfy { get; init; }
    public required ConnectionState GenericWebhook { get; init; }
    public required ArrWebhooks ArrWebhooks { get; init; }

    /// <summary>The Sonarr or Radarr section by provider, for a view that renders both from one template.</summary>
    public ArrSettings Arr(ArrProvider provider) => provider == ArrProvider.Sonarr ? Sonarr : Radarr;
}

/// <summary>A Plex or Jellyfin server whose library was synced.</summary>
public sealed record SyncedServer
{
    public string? Name { get; init; }
    public DateTimeOffset? LastSyncedAt { get; init; }
}

public sealed record PlexSettings
{
    public required bool Connected { get; init; }
    public required IReadOnlyList<SyncedServer> Servers { get; init; }
    public required int MovieCount { get; init; }
    public required int TvCount { get; init; }
    public required long TotalBytes { get; init; }
}

public sealed record JellyfinSettings
{
    public required bool Connected { get; init; }
    public string? BaseUrl { get; init; }
    public required bool HasApiKey { get; init; }
    public required IReadOnlyList<SyncedServer> Servers { get; init; }
    public required int MovieCount { get; init; }
    public required int TvCount { get; init; }
    public required long TotalBytes { get; init; }
}

public sealed record ArrSettings
{
    public required bool Connected { get; init; }
    public string? BaseUrl { get; init; }
    public required bool HasApiKey { get; init; }
    public string? RootFolderPath { get; init; }
    public int? QualityProfileId { get; init; }

    /// <summary>A root folder and quality profile are picked (required for adding titles).</summary>
    public required bool FullyConfigured { get; init; }
}

public sealed record TmdbSettings
{
    /// <summary>TMDb is usable at all.</summary>
    public required bool Connected { get; init; }

    /// <summary>The page's "Connected" chip.</summary>
    public required bool SavedInSettings { get; init; }

    /// <summary>Without <see cref="SavedInSettings"/>: "Using environment variable".</summary>
    public required bool ConfiguredFromEnv { get; init; }
}

public sealed record ConnectionState
{
    public required bool Connected { get; init; }
}

/// <summary>
/// Paste into Radarr/Sonarr, Settings, Connect, Add, Webhook (method POST,
/// trigger on Grab + Download). Built from the address this client used to
/// reach the server (the request's <c>Host</c> and <c>X-Forwarded-Proto</c>).
/// Also <c>POST …/webhook-secret</c>'s response.
/// </summary>
public sealed record ArrWebhooks
{
    public required string Secret { get; init; }
    public required string RadarrUrl { get; init; }
    public required string SonarrUrl { get; init; }

    /// <summary>The webhook URL for one provider's Connect settings.</summary>
    public string Url(ArrProvider provider) => provider == ArrProvider.Sonarr ? SonarrUrl : RadarrUrl;
}

public sealed record RootFolder
{
    public required int Id { get; init; }
    public required string Path { get; init; }
}

public sealed record QualityProfile
{
    public required int Id { get; init; }
    public required string Name { get; init; }
}

/// <summary><c>GET …/{provider}/options</c>: the defaults pickers' choices.</summary>
public sealed record ArrOptions
{
    public required IReadOnlyList<RootFolder> RootFolders { get; init; }
    public required IReadOnlyList<QualityProfile> QualityProfiles { get; init; }
}

/// <summary>
/// <c>PUT …/{provider}</c> ("Test &amp; save") response. The add defaults
/// were reset to the first root folder and quality profile; the website then
/// shows "Defaults used when adding new titles:" with the pickers.
/// </summary>
public sealed record ArrConnectionResult
{
    public required bool Ok { get; init; }

    /// <summary>Trailing slashes trimmed.</summary>
    public required string BaseUrl { get; init; }

    public required IReadOnlyList<RootFolder> RootFolders { get; init; }
    public required IReadOnlyList<QualityProfile> QualityProfiles { get; init; }
    public string? SelectedRootFolder { get; init; }
    public int? SelectedQualityProfileId { get; init; }

    /// <summary>The same choices as <c>GET …/options</c> would return, to feed the pickers without a second call.</summary>
    public ArrOptions Options => new() { RootFolders = RootFolders, QualityProfiles = QualityProfiles };
}

/// <summary><c>PUT …/{sonarr|radarr|jellyfin}</c> body.</summary>
public sealed record ServiceConnectionRequest(string BaseUrl, string ApiKey);

/// <summary><c>PUT …/{provider}/defaults</c> body.</summary>
public sealed record ArrDefaultsRequest(string RootFolderPath, int QualityProfileId);

/// <summary><c>POST …/plex/pin</c>: open <see cref="AuthUrl"/> in the browser, then poll <see cref="PinId"/>.</summary>
public sealed record PlexPinStart
{
    public required string AuthUrl { get; init; }
    public required int PinId { get; init; }

    /// <summary><see cref="AuthUrl"/> if it's a plex.tv page (see <see cref="PlexWeb.Url"/>).</summary>
    public Uri? Url => PlexWeb.Url(AuthUrl);
}

/// <summary>
/// <c>GET …/plex/pin/{pinId}</c>: one poll. The website polls every 2.5 s and
/// gives up after 2 minutes ("Timed out waiting for Plex sign-in. Try again.").
/// </summary>
public sealed record PlexPinStatus
{
    /// <summary>The first <c>true</c> has already saved the token and run a first library sync.</summary>
    public required bool Connected { get; init; }

    public int? MovieCount { get; init; }
    public int? TvCount { get; init; }
}

/// <summary>
/// <c>POST …/trakt/import</c> response. The website prints "Imported 12
/// titles" with the skipped count in parentheses (already owned or requested).
/// </summary>
public sealed record TraktImportResult
{
    public required bool Ok { get; init; }
    public required int ImportedCount { get; init; }
    public required int SkippedCount { get; init; }
}

// The instance-wide settings' PUT bodies: one field each, verified against
// the service before saving. Declared records rather than a dictionary so
// the field name lives next to the endpoint that sends it.

/// <summary><c>PUT /settings/integrations/tmdb</c>: a v4 read access token or v3 API key.</summary>
public sealed record TmdbSettingRequest(string AccessToken);

/// <summary><c>PUT /settings/integrations/trakt</c>: a client id from trakt.tv/oauth/applications.</summary>
public sealed record TraktSettingRequest(string ClientId);

/// <summary><c>PUT /settings/integrations/tvdb</c>: a TheTVDB v4 API key.</summary>
public sealed record TvdbSettingRequest(string ApiKey);

/// <summary><c>PUT /settings/integrations/discord</c>: <c>https://discord.com/api/webhooks/…</c>.</summary>
public sealed record DiscordSettingRequest(string WebhookUrl);

/// <summary><c>PUT /settings/integrations/ntfy</c>: <c>https://ntfy.sh/my-topic</c>.</summary>
public sealed record NtfySettingRequest(string TopicUrl);

/// <summary><c>PUT /settings/integrations/webhook</c>: the generic JSON webhook's URL.</summary>
public sealed record WebhookSettingRequest(string WebhookUrl);

/// <summary><c>POST /settings/integrations/trakt/import</c> body: a public list or watchlist URL.</summary>
public sealed record TraktImportRequest(string Url);
