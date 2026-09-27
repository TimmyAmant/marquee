using System.ComponentModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core.Api;
using Marquee.Core.Localization;
using Marquee.Core.Models;
using Marquee.Windows.Services;

namespace Marquee.Windows.ViewModels;

/// <summary>
/// Settings › Integrations (app/settings/integrations/page.tsx, the Mac's
/// IntegrationsSettingsView), the admin's: Media Libraries (Plex, Jellyfin
/// or Emby), Sign-in (single sign-on, 0.44+), Download Clients (Sonarr,
/// Radarr and the optional 4K ones), Metadata Sources (TMDb, Trakt with list
/// import, TheTVDB) and Notifications (the Sonarr/Radarr webhooks, Discord,
/// ntfy, Telegram, Pushover, email, a custom webhook) and API keys (0.47+),
/// plus "Sync now". One <c>GET /settings/integrations</c> describes every
/// card but single sign-on and API keys, which have their own
/// <c>GET /settings/sso</c> and <c>GET /settings/api-keys</c>; each card
/// writes through its own endpoint and the overview reloads after any change.
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
        Sso = new SsoSettingsViewModel(model);
        ApiKeys = new ApiKeysSettingsViewModel(model);
        var sonarr =new ArrIntegrationViewModel(model, ArrProvider.Sonarr);
        var radarr = new ArrIntegrationViewModel(model, ArrProvider.Radarr);
        sonarr4k = new ArrIntegrationViewModel(
            model,
            ArrProvider.Sonarr4k,
            Loc.Get("Integrations_Sonarr4kTitle"),
            Loc.Get("Integrations_Sonarr4kBlurb"));
        radarr4k = new ArrIntegrationViewModel(
            model,
            ArrProvider.Radarr4k,
            Loc.Get("Integrations_Radarr4kTitle"),
            Loc.Get("Integrations_Radarr4kBlurb"));
        mainArrCards = [sonarr, radarr];
        ArrCards = mainArrCards;
        ArrServers = new ArrServersViewModel(model);

        Tmdb = new SecretCardViewModel(
            model,
            "TMDb",
            Loc.Get("Integrations_TmdbBlurb"),
            Loc.Get("Integrations_TmdbField"),
            Loc.Get("Integrations_TmdbPlaceholder"),
            Loc.Get("Integrations_RemoveSavedToken"),
            (api, value) => api.Integrations.Tmdb.SaveAsync(value),
            api => api.Integrations.Tmdb.RemoveAsync());
        Trakt = new SecretCardViewModel(
            model,
            "Trakt",
            Loc.Get("Integrations_TraktBlurb"),
            Loc.Get("Integrations_TraktField"),
            Loc.Get("Integrations_TraktPlaceholder"),
            Loc.Get("Integrations_RemoveSavedClientId"),
            (api, value) => api.Integrations.Trakt.SaveAsync(value),
            api => api.Integrations.Trakt.RemoveAsync());
        TraktImport = new TraktImportViewModel(model);
        Tvdb = new SecretCardViewModel(
            model,
            "TheTVDB",
            Loc.Get("Integrations_TvdbBlurb"),
            Loc.Get("Integrations_TvdbField"),
            Loc.Get("Integrations_TvdbPlaceholder"),
            Loc.Get("Integrations_RemoveSavedKey"),
            (api, value) => api.Integrations.Tvdb.SaveAsync(value),
            api => api.Integrations.Tvdb.RemoveAsync());
        Omdb = new SecretCardViewModel(
            model,
            "OMDb",
            Loc.Get("Integrations_OmdbBlurb"),
            Loc.Get("Integrations_TvdbField"),
            Loc.Get("Integrations_OmdbPlaceholder"),
            Loc.Get("Integrations_RemoveSavedKey"),
            (api, value) => api.Integrations.Omdb.SaveAsync(value),
            api => api.Integrations.Omdb.RemoveAsync());

        Webhooks = new ArrWebhooksViewModel(model);
        Discord = new SecretCardViewModel(
            model,
            Loc.Get("Integrations_DiscordTitle"),
            Loc.Get("Integrations_DiscordBlurb"),
            Loc.Get("Integrations_WebhookUrlField"),
            Loc.Get("Integrations_DiscordPlaceholder"),
            Loc.Get("Integrations_RemoveSavedWebhook"),
            (api, value) => api.Integrations.Discord.SaveAsync(value),
            api => api.Integrations.Discord.RemoveAsync(),
            Loc.Get("Integrations_DiscordConnected"));
        Ntfy = new SecretCardViewModel(
            model,
            Loc.Get("Integrations_NtfyTitle"),
            Loc.Get("Integrations_NtfyBlurb"),
            Loc.Get("Integrations_NtfyField"),
            "https://ntfy.sh/your-topic-name",
            Loc.Get("Integrations_RemoveSavedTopic"),
            (api, value) => api.Integrations.Ntfy.SaveAsync(value),
            api => api.Integrations.Ntfy.RemoveAsync(),
            Loc.Get("Integrations_NtfyConnected"));
        Channels = new NotificationChannelsViewModel(model);
        GenericWebhook = new SecretCardViewModel(
            model,
            Loc.Get("Integrations_WebhookTitle"),
            Loc.Format("Integrations_WebhookBlurb"),
            Loc.Get("Integrations_WebhookUrlField"),
            "https://your-endpoint.example.com/hook",
            Loc.Get("Integrations_RemoveSavedWebhook"),
            (api, value) => api.Integrations.Webhook.SaveAsync(value),
            api => api.Integrations.Webhook.RemoveAsync(),
            Loc.Get("Integrations_WebhookConnected"));
    }

    private readonly IReadOnlyList<ArrIntegrationViewModel> mainArrCards;

    // MARK: Cards

    public PlexIntegrationViewModel Plex { get; }
    public JellyfinIntegrationViewModel Jellyfin { get; }

    /// <summary>"Single sign-on" under Sign-in (0.44+; hidden on an older server).</summary>
    public SsoSettingsViewModel Sso { get; }

    /// <summary>"API keys" (0.47+; hidden on an older server).</summary>
    public ApiKeysSettingsViewModel ApiKeys { get; }

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

    /// <summary>OMDb, for ratings on title pages (0.53+; hidden on an older server).</summary>
    public SecretCardViewModel Omdb { get; }

    [ObservableProperty]
    private bool showsOmdb;
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

    public string SyncLabel => IsSyncing ? Loc.Get("Integrations_Syncing") : Loc.Get("Integrations_SyncNow");
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
        _ = Sso.LoadAsync();
        _ = ApiKeys.LoadAsync();
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
        Sso.Cancel();
        ApiKeys.Cancel();
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
        ShowsOmdb = overview.Omdb != null;
        if (overview.Omdb is { } omdb)
        {
            Omdb.Apply(omdb);
        }
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
    /// <summary>
    /// "Coming from Seerr?": the website's importer
    /// (app/settings/integrations/import-seerr) in the browser, on the
    /// server's own address (plain http on a home network is fine there).
    /// </summary>
    [RelayCommand]
    private async Task OpenSeerrImportAsync()
    {
        if (model.Session.Server?.BaseUrl is { } server)
        {
            await ExternalLinks.OpenOnServerAsync(server, "/settings/integrations/import-seerr");
        }
    }

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
            SyncNotice = Loc.Get("Integrations_Synced");
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
            _ = Sso.LoadAsync();
            _ = ApiKeys.LoadAsync();
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
