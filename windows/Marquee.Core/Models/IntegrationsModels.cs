namespace Marquee.Core.Models;

// Settings, Integrations (api-v1.md section 12). Mirrors
// mac/Marquee/API/Models/IntegrationsModels.swift. Secrets (API keys, tokens,
// the webhook URLs of Discord, ntfy and the generic webhook, the Telegram bot
// token, the Pushover keys, the SMTP password) are never returned, only
// whether they're set.

/// <summary>
/// <c>GET /settings/integrations</c>. Page sections: Media Libraries (Plex,
/// Jellyfin), Download Clients (Sonarr, Radarr), Metadata Sources (TMDb,
/// Trakt, TheTVDB), Notifications (Sonarr/Radarr webhooks, Discord, ntfy,
/// Telegram, Pushover, email, generic webhook).
/// </summary>
public sealed record IntegrationsOverview
{
    public required PlexSettings Plex { get; init; }
    public required JellyfinSettings Jellyfin { get; init; }
    public required ArrSettings Sonarr { get; init; }
    public required ArrSettings Radarr { get; init; }

    /// <summary>The optional 4K Sonarr (0.37+); null from an older server.</summary>
    public ArrSettings? Sonarr4k { get; init; }

    /// <summary>The optional 4K Radarr (0.37+); null from an older server.</summary>
    public ArrSettings? Radarr4k { get; init; }

    /// <summary>The server offers 4K Sonarr/Radarr (0.37+).</summary>
    public bool HasFourKArr => Sonarr4k != null && Radarr4k != null;

    public required TmdbSettings Tmdb { get; init; }
    public required ConnectionState Trakt { get; init; }
    public required ConnectionState Tvdb { get; init; }
    public required ConnectionState Discord { get; init; }
    public required ConnectionState Ntfy { get; init; }

    /// <summary>Null from a server older than 0.36, which has no Telegram relay.</summary>
    public TelegramSettings? Telegram { get; init; }

    /// <summary>Null from a server older than 0.36.</summary>
    public ConnectionState? Pushover { get; init; }

    /// <summary>Null from a server older than 0.36.</summary>
    public EmailSettings? Email { get; init; }

    /// <summary>The server offers Telegram, Pushover and email (0.36+).</summary>
    public bool HasNotificationChannels => Telegram != null && Pushover != null && Email != null;
    public required ConnectionState GenericWebhook { get; init; }
    public required ArrWebhooks ArrWebhooks { get; init; }

    /// <summary>
    /// Every Sonarr and Radarr server (0.43+; null from an older server):
    /// Sonarr first, then Radarr, standard before 4K, the default first.
    /// When it's there, the "Download Clients" list replaces the four fixed
    /// cards.
    /// </summary>
    public IReadOnlyList<ArrServer>? ArrServers { get; init; }

    /// <summary>The server manages any number of Sonarr/Radarr servers (0.43+).</summary>
    public bool HasArrServers => ArrServers != null;

    /// <summary>The Sonarr or the Radarr servers, in the server's order; empty from an older server.</summary>
    public IReadOnlyList<ArrServer> ArrServersOf(ArrProvider kind) =>
        ArrServers?.Where(server => server.Kind == kind).ToList() ?? [];

    /// <summary>The Sonarr or Radarr section by provider, for a view that renders both from one template.</summary>
    public ArrSettings Arr(ArrProvider provider) => provider == ArrProvider.Sonarr ? Sonarr : Radarr;

    /// <summary>Any of the four by provider; null for a 4K one an older server doesn't send.</summary>
    public ArrSettings? ArrOrNull(ArrProvider provider)
    {
        if (provider == ArrProvider.Sonarr4k) return Sonarr4k;
        if (provider == ArrProvider.Radarr4k) return Radarr4k;
        return Arr(provider);
    }
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

    /// <summary>"Basement · 812 movies · 143 TV shows · 8.3 TB", the connected card's first line.</summary>
    public string SummaryLine => LibrarySummary.Line(Servers, MovieCount, TvCount, TotalBytes);

    /// <summary>"Last synced 5m ago · kept in sync automatically.", against <paramref name="now"/>.</summary>
    public string LastSyncedLine(DateTimeOffset now) => LibrarySummary.LastSynced(Servers, now);
}

public sealed record JellyfinSettings
{
    public required bool Connected { get; init; }

    private readonly string name = MediaServerKindExtensions.DefaultJellyfinName;

    /// <summary>
    /// <c>name</c> (0.40+): "Jellyfin" or "Emby" — the same integration
    /// connects either. Missing or blank (older servers) reads as "Jellyfin".
    /// </summary>
    public string Name
    {
        get => name;
        init => name = MediaServerKindExtensions.NormalizedJellyfinName(value);
    }
    public string? BaseUrl { get; init; }
    public required bool HasApiKey { get; init; }
    public required IReadOnlyList<SyncedServer> Servers { get; init; }
    public required int MovieCount { get; init; }
    public required int TvCount { get; init; }
    public required long TotalBytes { get; init; }

    /// <summary>
    /// What it's connected to once connected and synced ("Emby" or
    /// "Jellyfin"); null before, like the website's card.
    /// </summary>
    public string? ConnectedName => Connected && Servers.Count > 0 ? Name : null;

    /// <summary>"Living room · 812 movies · 143 TV shows · 8.3 TB".</summary>
    public string SummaryLine => LibrarySummary.Line(Servers, MovieCount, TvCount, TotalBytes);
}

/// <summary>
/// The Plex and Jellyfin cards' lines about a synced library (the Mac's
/// <c>summaryLine</c> and <c>lastSyncedLine</c> in IntegrationsSettingsView).
/// </summary>
public static class LibrarySummary
{
    /// <summary>"Basement, Attic · 812 movies · 143 TV shows · 8.3 TB"; no size when it's 0, no names when there are none.</summary>
    public static string Line(IReadOnlyList<SyncedServer> servers, int movieCount, int tvCount, long totalBytes)
    {
        var names = string.Join(", ", servers.Select(server => server.Name.NonBlank()).OfType<string>());
        var counts = $"{movieCount} movies · {tvCount} TV shows";
        if (totalBytes > 0)
        {
            counts += $" · {FileDetails.FormatBytes(totalBytes)}";
        }
        return names.Length == 0 ? counts : $"{names} · {counts}";
    }

    /// <summary>"Last synced 5m ago · kept in sync automatically.", from the most recent server; a plainer line before any sync.</summary>
    public static string LastSynced(IReadOnlyList<SyncedServer> servers, DateTimeOffset now)
    {
        var synced = servers.Select(server => server.LastSyncedAt).OfType<DateTimeOffset>().ToList();
        return synced.Count == 0
            ? "Your library is kept in sync automatically."
            : $"Last synced {NotificationItem.TimeAgoLabel(synced.Max(), now)} · kept in sync automatically.";
    }
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
/// <c>telegram</c>: a household-wide relay through the admin's own bot. The
/// token is never returned; the chat it posts to is, to prefill the form.
/// </summary>
public sealed record TelegramSettings
{
    public required bool Connected { get; init; }
    public string? ChatId { get; init; }
}

/// <summary>
/// <c>email</c>: a household-wide relay through the admin's SMTP server.
/// Everything but the password comes back, to prefill the form.
/// </summary>
public sealed record EmailSettings
{
    public required bool Connected { get; init; }
    public string? Host { get; init; }
    public int? Port { get; init; }

    /// <summary>TLS from the start (usually 465); otherwise STARTTLS when offered.</summary>
    public bool Secure { get; init; }

    public string? Username { get; init; }
    public string? From { get; init; }
    public IReadOnlyList<string> To { get; init; } = [];
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

    /// <summary>The 4K Radarr's webhook (0.37+, same secret); null from an older server.</summary>
    public string? Radarr4kUrl { get; init; }

    /// <summary>The 4K Sonarr's webhook (0.37+, same secret); null from an older server.</summary>
    public string? Sonarr4kUrl { get; init; }

    /// <summary>The webhook URL for one provider's Connect settings.</summary>
    public string Url(ArrProvider provider) => provider == ArrProvider.Sonarr ? SonarrUrl : RadarrUrl;

    /// <summary>Any of the four by provider; null for a 4K one an older server doesn't send.</summary>
    public string? UrlOrNull(ArrProvider provider)
    {
        if (provider == ArrProvider.Sonarr4k) return Sonarr4kUrl;
        if (provider == ArrProvider.Radarr4k) return Radarr4kUrl;
        return Url(provider);
    }
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

    /// <summary>"Imported 12 titles (3 skipped — already owned or requested).", the Trakt card's line.</summary>
    public string Summary
    {
        get
        {
            var skipped = SkippedCount > 0 ? $" ({SkippedCount} skipped — already owned or requested)." : ".";
            return $"Imported {ImportedCount} title{(ImportedCount == 1 ? "" : "s")}{skipped}";
        }
    }
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

/// <summary>
/// <c>PUT /settings/integrations/telegram</c>: <c>123456789:AA…</c> from
/// @BotFather and a chat id (a number, <c>-100…</c> for groups and channels,
/// or <c>@channelname</c>). A blank <paramref name="BotToken"/> keeps the saved one.
/// </summary>
public sealed record TelegramSettingRequest(string BotToken, string ChatId);

/// <summary>
/// <c>PUT /settings/integrations/pushover</c>: both 30 characters. A blank
/// <paramref name="AppToken"/> keeps the saved one.
/// </summary>
public sealed record PushoverSettingRequest(string AppToken, string UserKey);

/// <summary>
/// <c>PUT /settings/integrations/email</c>. <paramref name="Username"/> and
/// <paramref name="Password"/> both or neither; a blank password keeps the
/// saved one while host and username are unchanged. At most 20 recipients.
/// </summary>
public sealed record EmailSettingRequest(
    string Host,
    int Port,
    bool Secure,
    string Username,
    string Password,
    string From,
    IReadOnlyList<string> To);

/// <summary><c>POST /settings/integrations/trakt/import</c> body: a public list or watchlist URL.</summary>
public sealed record TraktImportRequest(string Url);
