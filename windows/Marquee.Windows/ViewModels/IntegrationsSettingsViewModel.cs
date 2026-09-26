using System.ComponentModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Windows.Services;

namespace Marquee.Windows.ViewModels;

/// <summary>
/// Settings › Integrations (app/settings/integrations/page.tsx, the Mac's
/// IntegrationsSettingsView), the admin's: Media Libraries (Plex, Jellyfin
/// or Emby), Download Clients (Sonarr, Radarr and the optional 4K ones),
/// Metadata Sources (TMDb, Trakt with list import, TheTVDB) and
/// Notifications (the Sonarr/Radarr webhooks, Discord, ntfy, Telegram,
/// Pushover, email, a custom webhook), plus "Sync now". One
/// <c>GET /settings/integrations</c> describes every card; each card writes
/// through its own endpoint and the overview reloads after any change.
/// </summary>
public sealed partial class IntegrationsSettingsViewModel : ObservableObject
{
    private readonly AppModel model;
    private readonly ArrIntegrationViewModel sonarr4k;
    private readonly ArrIntegrationViewModel radarr4k;
    private CancellationTokenSource? loadCancellation;
    private bool active;

    public IntegrationsSettingsViewModel(AppModel model)
    {
        this.model = model;
        Plex = new PlexIntegrationViewModel(model);
        Jellyfin = new JellyfinIntegrationViewModel(model);
        var sonarr = new ArrIntegrationViewModel(model, ArrProvider.Sonarr);
        var radarr = new ArrIntegrationViewModel(model, ArrProvider.Radarr);
        sonarr4k = new ArrIntegrationViewModel(
            model,
            ArrProvider.Sonarr4k,
            "4K Sonarr (optional)",
            "A second Sonarr for 4K copies. Once it's set up, members can request shows in 4K, and approving those adds them here instead of to the main Sonarr.");
        radarr4k = new ArrIntegrationViewModel(
            model,
            ArrProvider.Radarr4k,
            "4K Radarr (optional)",
            "A second Radarr for 4K copies. Once it's set up, members can request movies in 4K, and approving those adds them here instead of to the main Radarr.");
        mainArrCards = [sonarr, radarr];
        ArrCards = mainArrCards;
        ArrServers = new ArrServersViewModel(model);

        Tmdb = new SecretCardViewModel(
            model,
            "TMDb",
            "Shared by everyone on this server — every poster, search, and title page comes from here.",
            "API key or access token",
            "v3 API key or v4 access token, from themoviedb.org/settings/api",
            "Remove saved token",
            (api, value) => api.Integrations.Tmdb.SaveAsync(value),
            api => api.Integrations.Tmdb.RemoveAsync());
        Trakt = new SecretCardViewModel(
            model,
            "Trakt",
            "Import a public Trakt list or watchlist as requests — doesn't require Trakt sign-in, just a free API app.",
            "Client ID",
            "From a Trakt API app at trakt.tv/oauth/applications",
            "Remove saved client ID",
            (api, value) => api.Integrations.Trakt.SaveAsync(value),
            api => api.Integrations.Trakt.RemoveAsync());
        TraktImport = new TraktImportViewModel(model);
        Tvdb = new SecretCardViewModel(
            model,
            "TheTVDB",
            "Fills in poster art and an overview for TV shows when TMDb doesn't have them yet — Sonarr's own metadata comes from here too.",
            "API key",
            "From thetvdb.com/dashboard/account/apikey",
            "Remove saved key",
            (api, value) => api.Integrations.Tvdb.SaveAsync(value),
            api => api.Integrations.Tvdb.RemoveAsync());

        Webhooks = new ArrWebhooksViewModel(model);
        Discord = new SecretCardViewModel(
            model,
            "Discord notifications",
            "Posts a message to a Discord channel whenever something is grabbed, downloaded, or a request is approved/rejected.",
            "Webhook URL",
            "From a channel's Integrations → Webhooks settings in Discord",
            "Remove saved webhook",
            (api, value) => api.Integrations.Discord.SaveAsync(value),
            api => api.Integrations.Discord.RemoveAsync(),
            "Connected — check the channel for a test message.");
        Ntfy = new SecretCardViewModel(
            model,
            "ntfy notifications",
            "Sends a push notification via ntfy.sh (or a self-hosted ntfy server) for the same events.",
            "Topic URL",
            "https://ntfy.sh/your-topic-name",
            "Remove saved topic",
            (api, value) => api.Integrations.Ntfy.SaveAsync(value),
            api => api.Integrations.Ntfy.RemoveAsync(),
            "Connected — check the topic for a test message.");
        Channels = new NotificationChannelsViewModel(model);
        GenericWebhook = new SecretCardViewModel(
            model,
            "Custom webhook",
            "Posts a JSON payload ({ event, title, message }) to any URL for the same events — for your own automation or a notification gateway.",
            "Webhook URL",
            "https://your-endpoint.example.com/hook",
            "Remove saved webhook",
            (api, value) => api.Integrations.Webhook.SaveAsync(value),
            api => api.Integrations.Webhook.RemoveAsync(),
            "Connected — check your endpoint for a test request.");
    }

    private readonly IReadOnlyList<ArrIntegrationViewModel> mainArrCards;

    // MARK: Cards

    public PlexIntegrationViewModel Plex { get; }
    public JellyfinIntegrationViewModel Jellyfin { get; }

    /// <summary>Sonarr and Radarr, then the 4K ones when the server has them (0.37+).</summary>
    [ObservableProperty]
    private IReadOnlyList<ArrIntegrationViewModel> arrCards = [];

    /// <summary>Any number of Sonarr and Radarr servers (0.43+), in place of <see cref="ArrCards"/>.</summary>
    public ArrServersViewModel ArrServers { get; }

    /// <summary>
    /// The server sent <c>arrServers</c> (0.43+): the Download Clients list
    /// shows instead of the fixed cards, and each server's own webhook
    /// replaces the shared webhooks card.
    /// </summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsArrCards))]
    private bool showsArrServers;

    /// <summary>The four fixed Sonarr/Radarr cards and the shared webhooks card, from a server older than 0.43.</summary>
    public bool ShowsArrCards => !ShowsArrServers;

    public SecretCardViewModel Tmdb { get; }
    public SecretCardViewModel Trakt { get; }

    /// <summary>"Import a list", under Trakt while it's connected.</summary>
    public TraktImportViewModel TraktImport { get; }

    [ObservableProperty]
    private bool showsTraktImport;

    public SecretCardViewModel Tvdb { get; }
    public ArrWebhooksViewModel Webhooks { get; }
    public SecretCardViewModel Discord { get; }
    public SecretCardViewModel Ntfy { get; }

    /// <summary>Telegram, Pushover and email (0.36+; hidden on an older server).</summary>
    public NotificationChannelsViewModel Channels { get; }

    public SecretCardViewModel GenericWebhook { get; }

    // MARK: The overview

    /// <summary>The first <c>GET /settings/integrations</c> answered: the cards show.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsLoading))]
    [NotifyPropertyChangedFor(nameof(ShowsLoadError))]
    private bool hasOverview;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsLoading))]
    [NotifyPropertyChangedFor(nameof(ShowsLoadError))]
    private string? loadError;

    /// <summary>"Checking your integrations…" until the first answer.</summary>
    public bool IsLoading => !HasOverview && LoadError == null;

    /// <summary>Shown only while there's nothing older to keep showing.</summary>
    public bool ShowsLoadError => !HasOverview && LoadError != null;

    // MARK: Sync now

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(SyncLabel))]
    [NotifyPropertyChangedFor(nameof(CanSync))]
    private bool isSyncing;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasSyncError))]
    private string? syncError;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasSyncNotice))]
    private string? syncNotice;

    public string SyncLabel => IsSyncing ? "Syncing…" : "Sync now";
    public bool CanSync => !IsSyncing;
    public bool HasSyncError => SyncError != null;
    public bool HasSyncNotice => SyncNotice != null;

    // MARK: Lifecycle

    public void Activate()
    {
        if (active)
        {
            return;
        }
        active = true;
        model.PropertyChanged += OnModelPropertyChanged;
        model.Events.Changed += OnServerChanged;
        Plex.RefreshTimes();
        _ = LoadAsync();
    }

    public void Deactivate()
    {
        if (!active)
        {
            return;
        }
        active = false;
        model.PropertyChanged -= OnModelPropertyChanged;
        model.Events.Changed -= OnServerChanged;
        loadCancellation?.Cancel();
        Plex.Cancel();
    }

    /// <summary>
    /// <c>GET /settings/integrations</c>. The server first re-syncs anything
    /// older than 15 minutes, so this can take a few seconds. A failure keeps
    /// the cards already shown, and says so only when there are none.
    /// </summary>
    [RelayCommand]
    private async Task LoadAsync()
    {
        loadCancellation?.Cancel();
        var cancellation = new CancellationTokenSource();
        loadCancellation = cancellation;
        var token = cancellation.Token;
        LoadError = null;
        try
        {
            var overview = await model.Api.Integrations.OverviewAsync(token);
            if (token.IsCancellationRequested)
            {
                return;
            }
            Apply(overview);
            HasOverview = true;
        }
        catch (ApiException error)
        {
            if (error.IsCancellation || token.IsCancellationRequested)
            {
                return;
            }
            if (!HasOverview)
            {
                LoadError = error.Message;
            }
        }
    }

    private void Apply(IntegrationsOverview overview)
    {
        Plex.Apply(overview.Plex);
        Jellyfin.Apply(overview.Jellyfin);
        ShowsArrServers = overview.ArrServers != null;
        if (overview.ArrServers is { } servers)
        {
            ArrServers.Apply(servers);
        }
        else
        {
            ApplyArrCards(overview);
        }
        Tmdb.Apply(overview.Tmdb);
        Trakt.Apply(overview.Trakt);
        ShowsTraktImport = overview.Trakt.Connected;
        Tvdb.Apply(overview.Tvdb);
        Discord.Apply(overview.Discord);
        Ntfy.Apply(overview.Ntfy);
        Channels.Apply(overview);
        GenericWebhook.Apply(overview.GenericWebhook);
    }

    /// <summary>Before 0.43: Sonarr and Radarr, the 4K ones when the server has them, and the shared webhooks.</summary>
    private void ApplyArrCards(IntegrationsOverview overview)
    {
        mainArrCards[0].Apply(overview.Sonarr);
        mainArrCards[1].Apply(overview.Radarr);
        var cards = new List<ArrIntegrationViewModel>(mainArrCards);
        // 0.37+; an older server omits them.
        if (overview.Sonarr4k is { } sonarr4kSettings)
        {
            sonarr4k.Apply(sonarr4kSettings);
            cards.Add(sonarr4k);
        }
        if (overview.Radarr4k is { } radarr4kSettings)
        {
            radarr4k.Apply(radarr4kSettings);
            cards.Add(radarr4k);
        }
        if (cards.Count != ArrCards.Count)
        {
            ArrCards = cards;
        }
        Webhooks.Apply(
            overview.ArrWebhooks,
            radarr4k: overview.Radarr4k?.Connected == true,
            sonarr4k: overview.Sonarr4k?.Connected == true);
    }

    /// <summary><c>POST /settings/integrations/sync</c>: every connected library and download client, now.</summary>
    [RelayCommand]
    private async Task SyncNowAsync()
    {
        if (IsSyncing)
        {
            return;
        }
        IsSyncing = true;
        SyncError = null;
        SyncNotice = null;
        try
        {
            await model.Api.Integrations.SyncNowAsync();
            SyncNotice = "Synced.";
        }
        catch (ApiException error)
        {
            SyncError = error.Message;
        }
        finally
        {
            IsSyncing = false;
        }
    }

    // MARK: Following the model

    private void OnModelPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(AppModel.ReloadToken))
        {
            _ = LoadAsync();
        }
    }

    /// <summary>A card saved or removed something (or a job synced): the overview reloads. Raised on whatever thread finished the request.</summary>
    private void OnServerChanged(object? sender, ServerChangedEventArgs e)
    {
        if (!e.Change.HasFlag(ServerChange.Integrations))
        {
            return;
        }
        model.Dispatcher.TryEnqueue(() =>
        {
            if (active && model.IsSignedIn)
            {
                _ = LoadAsync();
            }
        });
    }
}
