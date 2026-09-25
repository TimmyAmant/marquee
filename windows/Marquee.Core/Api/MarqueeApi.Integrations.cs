using Marquee.Core.Models;

namespace Marquee.Core.Api;

// Settings, Integrations (api-v1.md section 12). Admin-only except
// SyncNowAsync. The Mac records `.settings` and `.catalog` for these; here
// both are ServerChange.Integrations, which covers the Settings screens and
// what the browse lists are built from.

public sealed partial class MarqueeApi
{
    public IntegrationsEndpoints Integrations => new(transport);
}

public sealed class IntegrationsEndpoints(MarqueeApi.Transport transport)
{
    /// <summary>What a connection change touches: the Settings page and every library badge built from it.</summary>
    internal const ServerChange Reconnected = ServerChange.Integrations | ServerChange.Library;

    /// <summary>
    /// <c>GET /settings/integrations</c>: like the page, first re-syncs any
    /// library data older than 15 minutes, so it can take a few seconds.
    /// </summary>
    public Task<IntegrationsOverview> OverviewAsync(CancellationToken ct = default) =>
        transport.GetAsync<IntegrationsOverview>("/settings/integrations", timeout: MarqueeApi.Timeouts.Integrations, ct: ct);

    /// <summary>
    /// <c>POST /settings/integrations/sync</c>: "Sync now" for every
    /// integration the caller has connected (for a member that's normally
    /// none). Upstream("Some integrations failed to sync…") if any failed.
    /// </summary>
    public Task SyncNowAsync(CancellationToken ct = default) =>
        transport.MutateAsync<OK>(
            HttpMethod.Post, "/settings/integrations/sync",
            timeout: MarqueeApi.Timeouts.LongRunning, changes: Reconnected, ct: ct);

    /// <summary>
    /// <c>POST /settings/integrations/webhook-secret</c>: "Regenerate
    /// secret". The old webhook URLs stop working immediately.
    /// </summary>
    public Task<ArrWebhooks> RegenerateWebhookSecretAsync(CancellationToken ct = default) =>
        transport.MutateAsync<ArrWebhooks>(
            HttpMethod.Post, "/settings/integrations/webhook-secret",
            changes: ServerChange.Integrations, ct: ct);

    public ArrEndpoints Sonarr => new(transport, ArrProvider.Sonarr);
    public ArrEndpoints Radarr => new(transport, ArrProvider.Radarr);

    /// <summary>Sonarr or Radarr by provider, for a view that manages both from one template.</summary>
    public ArrEndpoints Arr(ArrProvider provider) => new(transport, provider);

    public PlexEndpoints Plex => new(transport);
    public JellyfinEndpoints Jellyfin => new(transport);

    /// <summary>
    /// Body <c>{accessToken}</c>: a TMDb v4 read access token or v3 API key.
    /// Removing it falls back to the server's environment variables, if set.
    /// A new key changes what every browse list is built from.
    /// </summary>
    public IntegrationSettingEndpoints Tmdb =>
        new(transport, IntegrationProvider.Tmdb, value => new TmdbSettingRequest(value), Reconnected);

    public TraktEndpoints Trakt => new(transport);

    /// <summary>Body <c>{apiKey}</c>: a TheTVDB v4 API key.</summary>
    public IntegrationSettingEndpoints Tvdb =>
        new(transport, IntegrationProvider.Tvdb, value => new TvdbSettingRequest(value), Reconnected);

    /// <summary>Body <c>{webhookUrl}</c>: posts a test message before saving.</summary>
    public IntegrationSettingEndpoints Discord =>
        new(transport, IntegrationProvider.Discord, value => new DiscordSettingRequest(value), ServerChange.Integrations);

    /// <summary>Body <c>{topicUrl}</c>, e.g. <c>https://ntfy.sh/my-topic</c>: posts a test message before saving.</summary>
    public IntegrationSettingEndpoints Ntfy =>
        new(transport, IntegrationProvider.Ntfy, value => new NtfySettingRequest(value), ServerChange.Integrations);

    /// <summary>The generic JSON webhook. Body <c>{webhookUrl}</c>: posts a test request before saving.</summary>
    public IntegrationSettingEndpoints Webhook =>
        new(transport, IntegrationProvider.Webhook, value => new WebhookSettingRequest(value), ServerChange.Integrations);
}

/// <summary><c>/settings/integrations/{sonarr|radarr}</c> (default ports 8989 / 7878).</summary>
public sealed class ArrEndpoints(MarqueeApi.Transport transport, ArrProvider provider)
{
    public ArrProvider Provider => provider;

    private string Path => $"/settings/integrations/{MarqueeApi.Segment(provider)}";

    /// <summary>
    /// <c>PUT</c>: "Test &amp; save". Saves the connection and resets the add
    /// defaults to the first root folder and quality profile. Errors:
    /// Invalid("URL and API key are required."), Upstream("Couldn't
    /// connect. Check the URL and API key and try again.").
    /// </summary>
    public Task<ArrConnectionResult> ConnectAsync(string baseUrl, string apiKey, CancellationToken ct = default) =>
        transport.MutateAsync<ArrConnectionResult>(
            HttpMethod.Put, Path, body: new ServiceConnectionRequest(baseUrl, apiKey),
            timeout: MarqueeApi.Timeouts.Integrations, changes: IntegrationsEndpoints.Reconnected, ct: ct);

    /// <summary>
    /// <c>GET …/options</c>: root folders and quality profiles of the saved
    /// connection, to populate the defaults pickers at any time. Errors:
    /// Conflict("Connect Sonarr in Settings first."), Upstream("Couldn't
    /// reach Sonarr. Check its connection in Settings.").
    /// </summary>
    public Task<ArrOptions> OptionsAsync(CancellationToken ct = default) =>
        transport.GetAsync<ArrOptions>(Path + "/options", timeout: MarqueeApi.Timeouts.Integrations, ct: ct);

    /// <summary>
    /// <c>PUT …/defaults</c>: used when adding titles. Errors: Invalid("Pick
    /// a root folder and a quality profile.").
    /// </summary>
    public Task SaveDefaultsAsync(string rootFolderPath, int qualityProfileId, CancellationToken ct = default) =>
        transport.MutateAsync<OK>(
            HttpMethod.Put, Path + "/defaults", body: new ArrDefaultsRequest(rootFolderPath, qualityProfileId),
            changes: IntegrationsEndpoints.Reconnected, ct: ct);

    /// <summary>
    /// <c>DELETE</c>: removes the connection and its cached tracked/monitored
    /// statuses. The website confirms first.
    /// </summary>
    public Task DisconnectAsync(CancellationToken ct = default) =>
        transport.MutateAsync<OK>(
            HttpMethod.Delete, Path,
            timeout: MarqueeApi.Timeouts.Integrations, changes: IntegrationsEndpoints.Reconnected, ct: ct);
}

/// <summary>
/// Plex sign-in is a PIN flow: <see cref="StartPinAsync"/>, open
/// <see cref="PlexPinStart.AuthUrl"/> in the browser, then
/// <see cref="PollPinAsync"/> every 2.5 s for up to 2 minutes.
/// </summary>
public sealed class PlexEndpoints(MarqueeApi.Transport transport)
{
    /// <summary>
    /// <c>POST /settings/integrations/plex/pin</c>: starts Plex sign-in.
    /// Nothing has changed on the server yet, so nothing is recorded.
    /// Upstream("Couldn't start Plex sign-in. Try again.").
    /// </summary>
    public Task<PlexPinStart> StartPinAsync(CancellationToken ct = default) =>
        transport.PostAsync<PlexPinStart>("/settings/integrations/plex/pin", timeout: MarqueeApi.Timeouts.Integrations, ct: ct);

    /// <summary>
    /// <c>GET /settings/integrations/plex/pin/{pinId}</c>: one poll. The
    /// first <c>Connected</c> answer has saved the token and run a full first
    /// library sync before answering (hence the long timeout), which is why
    /// a read records a change here: the library just filled up.
    /// </summary>
    public async Task<PlexPinStatus> PollPinAsync(int pinId, CancellationToken ct = default)
    {
        var status = await transport.GetAsync<PlexPinStatus>(
            $"/settings/integrations/plex/pin/{pinId}", timeout: MarqueeApi.Timeouts.LongRunning, ct: ct).ConfigureAwait(false);
        if (status.Connected)
        {
            transport.Events?.Record(IntegrationsEndpoints.Reconnected);
        }
        return status;
    }

    /// <summary><c>DELETE /settings/integrations/plex</c>: disconnect and delete the synced library.</summary>
    public Task DisconnectAsync(CancellationToken ct = default) =>
        transport.MutateAsync<OK>(
            HttpMethod.Delete, "/settings/integrations/plex",
            timeout: MarqueeApi.Timeouts.Integrations, changes: IntegrationsEndpoints.Reconnected, ct: ct);
}

public sealed class JellyfinEndpoints(MarqueeApi.Transport transport)
{
    /// <summary>
    /// <c>PUT /settings/integrations/jellyfin</c>: test and save, then a
    /// first library sync before answering. Errors: Invalid("URL and API key
    /// are required."), Upstream("Couldn't connect. Check the URL and API key
    /// and try again.").
    /// </summary>
    public Task ConnectAsync(string baseUrl, string apiKey, CancellationToken ct = default) =>
        transport.MutateAsync<OK>(
            HttpMethod.Put, "/settings/integrations/jellyfin", body: new ServiceConnectionRequest(baseUrl, apiKey),
            timeout: MarqueeApi.Timeouts.LongRunning, changes: IntegrationsEndpoints.Reconnected, ct: ct);

    /// <summary><c>DELETE /settings/integrations/jellyfin</c>: disconnect and delete the synced library.</summary>
    public Task DisconnectAsync(CancellationToken ct = default) =>
        transport.MutateAsync<OK>(
            HttpMethod.Delete, "/settings/integrations/jellyfin",
            timeout: MarqueeApi.Timeouts.Integrations, changes: IntegrationsEndpoints.Reconnected, ct: ct);
}

/// <summary>
/// An instance-wide setting verified against its service before saving:
/// <c>PUT</c> with one body field, <c>DELETE</c> to remove. Which field, and
/// what a change touches, is decided by the property on
/// <see cref="IntegrationsEndpoints"/> that hands one out.
/// </summary>
public sealed class IntegrationSettingEndpoints
{
    private readonly MarqueeApi.Transport transport;
    private readonly Func<string, object> body;
    private readonly ServerChange changes;

    public IntegrationProvider Provider { get; }

    internal IntegrationSettingEndpoints(MarqueeApi.Transport transport, IntegrationProvider provider, Func<string, object> body, ServerChange changes)
    {
        this.transport = transport;
        this.body = body;
        this.changes = changes;
        Provider = provider;
    }

    private string Path => $"/settings/integrations/{MarqueeApi.Segment(Provider)}";

    /// <summary><c>PUT</c>: Invalid with the website's message when verification fails ("Enter an access token.", ...).</summary>
    public Task SaveAsync(string value, CancellationToken ct = default) =>
        transport.MutateAsync<OK>(
            HttpMethod.Put, Path, body: body(value),
            timeout: MarqueeApi.Timeouts.Integrations, changes: changes, ct: ct);

    /// <summary><c>DELETE</c>: removes the saved value.</summary>
    public Task RemoveAsync(CancellationToken ct = default) =>
        transport.MutateAsync<OK>(HttpMethod.Delete, Path, changes: changes, ct: ct);
}

public sealed class TraktEndpoints(MarqueeApi.Transport transport)
{
    private IntegrationSettingEndpoints Setting =>
        new(transport, IntegrationProvider.Trakt, value => new TraktSettingRequest(value), ServerChange.Integrations);

    /// <summary><c>PUT /settings/integrations/trakt</c>: body <c>{clientId}</c> from trakt.tv/oauth/applications.</summary>
    public Task SaveAsync(string clientId, CancellationToken ct = default) =>
        Setting.SaveAsync(clientId, ct);

    /// <summary><c>DELETE /settings/integrations/trakt</c>.</summary>
    public Task RemoveAsync(CancellationToken ct = default) =>
        Setting.RemoveAsync(ct);

    /// <summary>
    /// <c>POST /settings/integrations/trakt/import</c>: a public list or
    /// watchlist URL becomes pending requests from the admin, skipping titles
    /// already in the library or already requested. Errors: Invalid("That
    /// doesn't look like a Trakt list or watchlist URL."), Conflict("Connect
    /// Trakt in Settings first."), Upstream when the list can't be fetched.
    /// </summary>
    public Task<TraktImportResult> ImportListAsync(string url, CancellationToken ct = default) =>
        transport.MutateAsync<TraktImportResult>(
            HttpMethod.Post, "/settings/integrations/trakt/import", body: new TraktImportRequest(url),
            timeout: MarqueeApi.Timeouts.LongRunning, changes: ServerChange.Requests | ServerChange.Integrations, ct: ct);
}
