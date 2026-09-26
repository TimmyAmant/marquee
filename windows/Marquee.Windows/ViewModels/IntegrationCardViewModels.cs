using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Windows.Services;

namespace Marquee.Windows.ViewModels;

// The cards of Settings › Integrations (app/settings/integrations/page.tsx,
// the Mac's IntegrationsSettingsView). Each card writes through its own
// endpoint; the mutation records ServerChange.Integrations and the tab
// reloads GET /settings/integrations, which Apply()s the fresh state to
// every card without touching what's being typed.

/// <summary>components/disconnect-button.tsx: "Disconnect", then "Disconnect Plex?" with Confirm and Cancel in place.</summary>
public sealed partial class DisconnectViewModel : ObservableObject
{
    private readonly Func<Task> disconnect;

    public DisconnectViewModel(string name, Func<Task> disconnect)
    {
        Name = name;
        this.disconnect = disconnect;
    }

    /// <summary>"Plex", "Sonarr", "Emby".</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(Prompt))]
    private string name = "";

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsAsking))]
    private bool isConfirming;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ConfirmLabel))]
    [NotifyPropertyChangedFor(nameof(IsIdle))]
    private bool isPending;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasError))]
    private string? error;

    public string Prompt => $"Disconnect {Name}?";
    public string ConfirmLabel => IsPending ? "Disconnecting…" : "Confirm";

    /// <summary>The plain "Disconnect" button shows.</summary>
    public bool IsAsking => !IsConfirming;

    public bool IsIdle => !IsPending;
    public bool HasError => Error != null;

    [RelayCommand]
    private void Ask()
    {
        Error = null;
        IsConfirming = true;
    }

    [RelayCommand]
    private void Cancel()
    {
        if (!IsPending)
        {
            IsConfirming = false;
        }
    }

    [RelayCommand]
    private async Task ConfirmAsync()
    {
        if (IsPending)
        {
            return;
        }
        IsPending = true;
        Error = null;
        try
        {
            await disconnect();
            IsConfirming = false;
        }
        catch (ApiException failure)
        {
            Error = failure.Message;
        }
        finally
        {
            IsPending = false;
        }
    }
}

/// <summary>components/plex-connect-card.tsx: "Connect Plex" (a plex.tv PIN), the synced library, Disconnect.</summary>
public sealed partial class PlexIntegrationViewModel : ObservableObject
{
    public const string TimedOutMessage = "Timed out waiting for Plex sign-in. Try again.";

    /// <summary>The website polls every 2.5 s and gives up after 2 minutes.</summary>
    private static readonly TimeSpan PollInterval = TimeSpan.FromMilliseconds(2500);
    private static readonly TimeSpan Timeout = TimeSpan.FromMinutes(2);

    private readonly AppModel model;
    private CancellationTokenSource? connectCancellation;
    private PlexSettings? settings;

    public PlexIntegrationViewModel(AppModel model)
    {
        this.model = model;
        Disconnect = new DisconnectViewModel("Plex", () => model.Api.Integrations.Plex.DisconnectAsync());
    }

    public DisconnectViewModel Disconnect { get; }

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ConnectedBadge))]
    [NotifyPropertyChangedFor(nameof(IsDisconnected))]
    private bool isConnected;

    [ObservableProperty]
    private string summaryLine = "";

    [ObservableProperty]
    private string lastSyncedLine = "";

    /// <summary>The browser is open at plex.tv and the poll is running.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ConnectLabel))]
    [NotifyPropertyChangedFor(nameof(CanConnect))]
    private bool isWaiting;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasError))]
    private string? error;

    public string ConnectedBadge => IsConnected ? "Connected" : "";
    public BadgeTone ConnectedTone { get; } = BadgeTone.Owned;
    public bool IsDisconnected => !IsConnected;
    public string ConnectLabel => IsWaiting ? "Waiting for Plex…" : "Connect Plex";
    public bool CanConnect => !IsWaiting;
    public bool HasError => Error != null;

    internal void Apply(PlexSettings fresh)
    {
        settings = fresh;
        IsConnected = fresh.Connected;
        SummaryLine = fresh.SummaryLine;
        RefreshTimes();
    }

    /// <summary>"Last synced 5m ago" is relative to now.</summary>
    internal void RefreshTimes() => LastSyncedLine = settings?.LastSyncedLine(DateTimeOffset.UtcNow) ?? "";

    /// <summary>
    /// <c>POST …/plex/pin</c>, the plex.tv page in the browser, then
    /// <c>GET …/plex/pin/{id}</c> every 2.5 seconds for up to 2 minutes. The
    /// first connected answer has synced the library and recorded the change,
    /// so the tab reloads on its own.
    /// </summary>
    [RelayCommand]
    private async Task ConnectAsync()
    {
        if (IsWaiting)
        {
            return;
        }
        connectCancellation?.Cancel();
        var cancellation = new CancellationTokenSource();
        connectCancellation = cancellation;
        var token = cancellation.Token;
        IsWaiting = true;
        Error = null;
        var api = model.Api;
        try
        {
            var pin = await api.Integrations.Plex.StartPinAsync(token);
            if (pin.Url is not { } url || !await ExternalLinks.OpenAsync(url))
            {
                Error = ConnectViewModel.PlexPageUnopenedMessage;
                return;
            }
            var deadline = DateTimeOffset.UtcNow + Timeout;
            while (DateTimeOffset.UtcNow < deadline)
            {
                await Task.Delay(PollInterval, token);
                if ((await api.Integrations.Plex.PollPinAsync(pin.PinId, token)).Connected)
                {
                    IsConnected = true;
                    return;
                }
            }
            Error = TimedOutMessage;
        }
        catch (OperationCanceledException)
        {
            // Left Settings (or the tab) mid-sign-in: nothing to report.
        }
        catch (ApiException failure)
        {
            if (!failure.IsCancellation && !token.IsCancellationRequested)
            {
                Error = failure.Message;
            }
        }
        finally
        {
            if (ReferenceEquals(connectCancellation, cancellation))
            {
                connectCancellation = null;
                IsWaiting = false;
            }
            cancellation.Dispose();
        }
    }

    /// <summary>Stops waiting for plex.tv (the tab went away).</summary>
    internal void Cancel()
    {
        var cancellation = connectCancellation;
        connectCancellation = null;
        IsWaiting = false;
        cancellation?.Cancel();
    }
}

/// <summary>
/// A form card's result line: the success notice or the server's message.
/// Shared by the cards with "Test &amp; save".
/// </summary>
public abstract partial class IntegrationFormViewModel : ObservableObject
{
    public const string ReplacePlaceholder = "•••••••••••••••• (enter to replace)";

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(SaveLabel))]
    [NotifyPropertyChangedFor(nameof(CanSave))]
    private bool isSaving;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasError))]
    private string? error;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasNotice))]
    private string? notice;

    public string SaveLabel => IsSaving ? "Testing…" : "Test & save";
    public bool CanSave => !IsSaving;
    public bool HasError => Error != null;
    public bool HasNotice => Notice != null;

    protected void ClearMessages()
    {
        Error = null;
        Notice = null;
    }
}

/// <summary>components/jellyfin-connect-card.tsx: "Jellyfin or Emby", server URL and API key.</summary>
public sealed partial class JellyfinIntegrationViewModel : IntegrationFormViewModel
{
    private readonly AppModel model;

    public JellyfinIntegrationViewModel(AppModel model)
    {
        this.model = model;
        Disconnect = new DisconnectViewModel(MediaServerKindExtensions.DefaultJellyfinName, () => model.Api.Integrations.Jellyfin.DisconnectAsync());
    }

    public DisconnectViewModel Disconnect { get; }

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ConnectedBadge))]
    private bool isConnected;

    /// <summary>"Emby speaks the same language as Jellyfin, so either works here — connected to Emby."</summary>
    [ObservableProperty]
    private string description = DescriptionFor(null);

    [ObservableProperty]
    private string summaryLine = "";

    [ObservableProperty]
    private string baseUrl = "";

    [ObservableProperty]
    private string apiKey = "";

    [ObservableProperty]
    private string apiKeyPlaceholder = "";

    public string ConnectedBadge => IsConnected ? "Connected" : "";
    public BadgeTone ConnectedTone { get; } = BadgeTone.Owned;

    private static string DescriptionFor(string? connectedName) =>
        "Emby speaks the same language as Jellyfin, so either works here"
        + (connectedName != null ? $" — connected to {connectedName}" : "") + ".";

    internal void Apply(JellyfinSettings settings)
    {
        IsConnected = settings.Connected;
        Description = DescriptionFor(settings.ConnectedName);
        SummaryLine = settings.Connected ? settings.SummaryLine : "";
        ApiKeyPlaceholder = settings.HasApiKey ? ReplacePlaceholder : "";
        Disconnect.Name = settings.ConnectedName ?? MediaServerKindExtensions.DefaultJellyfinName;
        if (BaseUrl.Length == 0)
        {
            BaseUrl = settings.BaseUrl ?? "";
        }
    }

    /// <summary><c>PUT …/jellyfin</c>: tests, saves, and runs a first library sync before answering.</summary>
    [RelayCommand]
    private async Task SaveAsync()
    {
        if (IsSaving)
        {
            return;
        }
        ClearMessages();
        IsSaving = true;
        try
        {
            await model.Api.Integrations.Jellyfin.ConnectAsync(BaseUrl.Trim(), ApiKey.Trim());
            ApiKey = "";
            Notice = "Connected successfully.";
        }
        catch (ApiException failure)
        {
            Error = failure.Message;
        }
        finally
        {
            IsSaving = false;
        }
    }
}

/// <summary>
/// components/arr-credential-form.tsx: a Sonarr or Radarr (either 4K one
/// too) with "Test &amp; save", then the root folder and quality profile
/// used when adding titles, and Disconnect.
/// </summary>
public sealed partial class ArrIntegrationViewModel : IntegrationFormViewModel
{
    private readonly AppModel model;
    private IReadOnlyList<int> qualityProfileIds = [];
    private bool loadingOptions;

    public ArrIntegrationViewModel(AppModel model, ArrProvider provider, string? title = null, string? description = null)
    {
        this.model = model;
        Provider = provider;
        Title = title ?? provider.DisplayName;
        Description = description ?? "";
        BaseUrlPlaceholder = provider.DefaultPort is { } port ? $"http://localhost:{port}" : "";
        Disconnect = new DisconnectViewModel(provider.DisplayName, () => model.Api.Integrations.Arr(provider).DisconnectAsync());
    }

    // Internal: a Core type the XAML never binds.
    internal ArrProvider Provider { get; }

    /// <summary>"Sonarr", or "4K Sonarr (optional)".</summary>
    public string Title { get; }

    /// <summary>The 4K cards' explanation; empty (collapsed) for the main ones.</summary>
    public string Description { get; }

    public string BaseUrlPlaceholder { get; }
    public DisconnectViewModel Disconnect { get; }

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ConnectedBadge))]
    [NotifyPropertyChangedFor(nameof(NeedsDefaults))]
    private bool isConnected;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(NeedsDefaults))]
    private bool isFullyConfigured;

    [ObservableProperty]
    private string baseUrl = "";

    [ObservableProperty]
    private string apiKey = "";

    [ObservableProperty]
    private string apiKeyPlaceholder = "";

    /// <summary>The root folder picker's paths; empty until the options load.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsDefaults))]
    [NotifyPropertyChangedFor(nameof(NeedsDefaults))]
    private IReadOnlyList<string> rootFolders = [];

    /// <summary>The quality profile picker's names.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsDefaults))]
    [NotifyPropertyChangedFor(nameof(NeedsDefaults))]
    private IReadOnlyList<string> qualityProfiles = [];

    [ObservableProperty]
    private int selectedRootFolderIndex = -1;

    [ObservableProperty]
    private int selectedQualityProfileIndex = -1;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(SaveDefaultsLabel))]
    [NotifyPropertyChangedFor(nameof(CanSaveDefaults))]
    private bool isSavingDefaults;

    /// <summary>"Saved." beside Save defaults.</summary>
    [ObservableProperty]
    private bool defaultsSaved;

    public string ConnectedBadge => IsConnected ? "Connected" : "";
    public BadgeTone ConnectedTone { get; } = BadgeTone.Owned;
    public bool HasDescription => Description.Length > 0;

    /// <summary>"Defaults used when adding new titles:" with the pickers.</summary>
    public bool ShowsDefaults => RootFolders.Count > 0 && QualityProfiles.Count > 0;

    /// <summary>Connected, but no root folder or quality profile picked yet, and no pickers to pick them with.</summary>
    public bool NeedsDefaults => IsConnected && !IsFullyConfigured && !ShowsDefaults;

    public string SaveDefaultsLabel => IsSavingDefaults ? "Saving…" : "Save defaults";
    public bool CanSaveDefaults => !IsSavingDefaults;

    internal void Apply(ArrSettings settings)
    {
        IsConnected = settings.Connected;
        IsFullyConfigured = settings.FullyConfigured;
        ApiKeyPlaceholder = settings.HasApiKey ? ReplacePlaceholder : "";
        if (BaseUrl.Length == 0)
        {
            BaseUrl = settings.BaseUrl ?? "";
        }
        if (!settings.Connected)
        {
            // Disconnected: no stale defaults pickers left behind.
            ShowOptions(null, null, null);
            DefaultsSaved = false;
            return;
        }
        if (!ShowsDefaults)
        {
            _ = LoadOptionsAsync(settings);
        }
    }

    /// <summary><c>GET …/options</c> for the pickers; a failure leaves them out (the warning shows instead).</summary>
    private async Task LoadOptionsAsync(ArrSettings settings)
    {
        if (loadingOptions)
        {
            return;
        }
        loadingOptions = true;
        try
        {
            var options = await model.Api.Integrations.Arr(Provider).OptionsAsync();
            if (IsConnected && !ShowsDefaults)
            {
                ShowOptions(options, settings.RootFolderPath, settings.QualityProfileId);
            }
        }
        catch (ApiException)
        {
            // Unreachable just now: the card says to test the connection.
        }
        finally
        {
            loadingOptions = false;
        }
    }

    private void ShowOptions(ArrOptions? options, string? selectedRootFolder, int? selectedQualityProfileId)
    {
        if (options == null)
        {
            RootFolders = [];
            QualityProfiles = [];
            qualityProfileIds = [];
            SelectedRootFolderIndex = -1;
            SelectedQualityProfileIndex = -1;
            return;
        }
        var paths = options.RootFolders.Select(folder => folder.Path).ToList();
        qualityProfileIds = options.QualityProfiles.Select(profile => profile.Id).ToList();
        RootFolders = paths;
        QualityProfiles = options.QualityProfiles.Select(profile => profile.Name).ToList();
        var folderIndex = selectedRootFolder != null ? paths.IndexOf(selectedRootFolder) : -1;
        var profileIndex = selectedQualityProfileId is { } id ? qualityProfileIds.ToList().IndexOf(id) : -1;
        SelectedRootFolderIndex = folderIndex >= 0 ? folderIndex : paths.Count > 0 ? 0 : -1;
        SelectedQualityProfileIndex = profileIndex >= 0 ? profileIndex : qualityProfileIds.Count > 0 ? 0 : -1;
    }

    /// <summary><c>PUT …/{provider}</c>: tests and saves, answering the pickers' choices (reset to the first of each).</summary>
    [RelayCommand]
    private async Task SaveAsync()
    {
        if (IsSaving)
        {
            return;
        }
        ClearMessages();
        DefaultsSaved = false;
        IsSaving = true;
        try
        {
            var result = await model.Api.Integrations.Arr(Provider).ConnectAsync(BaseUrl.Trim(), ApiKey.Trim());
            ApiKey = "";
            BaseUrl = result.BaseUrl;
            IsConnected = true;
            ShowOptions(result.Options, result.SelectedRootFolder, result.SelectedQualityProfileId);
            Notice = "Connected successfully.";
        }
        catch (ApiException failure)
        {
            Error = failure.Message;
        }
        finally
        {
            IsSaving = false;
        }
    }

    /// <summary><c>PUT …/defaults</c>: the root folder and quality profile used when adding titles.</summary>
    [RelayCommand]
    private async Task SaveDefaultsAsync()
    {
        if (IsSavingDefaults)
        {
            return;
        }
        if (SelectedRootFolderIndex < 0 || SelectedRootFolderIndex >= RootFolders.Count
            || SelectedQualityProfileIndex < 0 || SelectedQualityProfileIndex >= qualityProfileIds.Count)
        {
            Error = "Pick a root folder and a quality profile.";
            return;
        }
        var path = RootFolders[SelectedRootFolderIndex];
        var profile = qualityProfileIds[SelectedQualityProfileIndex];
        Error = null;
        DefaultsSaved = false;
        IsSavingDefaults = true;
        try
        {
            await model.Api.Integrations.Arr(Provider).SaveDefaultsAsync(path, profile);
            DefaultsSaved = true;
        }
        catch (ApiException failure)
        {
            Error = failure.Message;
        }
        finally
        {
            IsSavingDefaults = false;
        }
    }
}

/// <summary>
/// A "Test &amp; save" card with one secret (TMDb, Trakt, TheTVDB, Discord,
/// ntfy, the custom webhook): the server verifies it before saving, and
/// "Remove saved …" once there's one.
/// </summary>
public sealed partial class SecretCardViewModel : IntegrationFormViewModel
{
    private readonly AppModel model;
    private readonly Func<MarqueeApi, string, Task> save;
    private readonly Func<MarqueeApi, Task> remove;
    private readonly string placeholder;
    private readonly string successMessage;
    private readonly string removeLabel;

    public SecretCardViewModel(
        AppModel model,
        string title,
        string description,
        string fieldLabel,
        string placeholder,
        string removeLabel,
        Func<MarqueeApi, string, Task> save,
        Func<MarqueeApi, Task> remove,
        string successMessage = "Connected successfully.")
    {
        this.model = model;
        Title = title;
        Description = description;
        FieldLabel = fieldLabel;
        this.placeholder = placeholder;
        this.removeLabel = removeLabel;
        this.save = save;
        this.remove = remove;
        this.successMessage = successMessage;
    }

    public string Title { get; }
    public string Description { get; }
    public string FieldLabel { get; }

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(Placeholder))]
    [NotifyPropertyChangedFor(nameof(ConnectedBadge))]
    [NotifyPropertyChangedFor(nameof(CanRemove))]
    private bool isConnected;

    /// <summary>"Connected", or TMDb's "Using environment variable".</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ConnectedBadge))]
    private string connectedLabel = "Connected";

    /// <summary>An extra line over the field (TMDb's environment variable); empty collapses it.</summary>
    [ObservableProperty]
    private string note = "";

    [ObservableProperty]
    private string secret = "";

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(RemoveButtonLabel))]
    [NotifyPropertyChangedFor(nameof(CanRemove))]
    private bool isRemoving;

    public string Placeholder => IsConnected ? ReplacePlaceholder : placeholder;

    /// <summary>The chip shows for a saved secret, or a server-side environment value; empty collapses it.</summary>
    public string ConnectedBadge => IsConnected || ConnectedLabel != "Connected" ? ConnectedLabel : "";

    public BadgeTone ConnectedTone { get; } = BadgeTone.Owned;
    public string RemoveButtonLabel => IsRemoving ? "Removing…" : removeLabel;
    public bool CanRemove => IsConnected && !IsRemoving;

    internal void Apply(ConnectionState state) => IsConnected = state.Connected;

    /// <summary>TMDb: "Connected" only for a token saved here; the server's own variable says so instead.</summary>
    internal void Apply(TmdbSettings settings)
    {
        IsConnected = settings.SavedInSettings;
        var fromEnv = !settings.SavedInSettings && settings.ConfiguredFromEnv;
        ConnectedLabel = fromEnv ? "Using environment variable" : "Connected";
        Note = fromEnv
            ? "Using the TMDB_ACCESS_TOKEN environment variable set on your server. Saving a token here overrides it."
            : "";
    }

    [RelayCommand]
    private async Task SaveAsync()
    {
        if (IsSaving)
        {
            return;
        }
        ClearMessages();
        IsSaving = true;
        try
        {
            await save(model.Api, Secret.Trim());
            Secret = "";
            IsConnected = true;
            Notice = successMessage;
        }
        catch (ApiException failure)
        {
            Error = failure.Message;
        }
        finally
        {
            IsSaving = false;
        }
    }

    [RelayCommand]
    private async Task RemoveAsync()
    {
        if (!CanRemove)
        {
            return;
        }
        ClearMessages();
        IsRemoving = true;
        try
        {
            await remove(model.Api);
            Secret = "";
            IsConnected = false;
        }
        catch (ApiException failure)
        {
            Error = failure.Message;
        }
        finally
        {
            IsRemoving = false;
        }
    }
}

/// <summary>Trakt's "Import a list": a public list or watchlist URL becomes pending requests.</summary>
public sealed partial class TraktImportViewModel : ObservableObject
{
    private readonly AppModel model;

    public TraktImportViewModel(AppModel model)
    {
        this.model = model;
    }

    [ObservableProperty]
    private string listUrl = "";

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ImportLabel))]
    [NotifyPropertyChangedFor(nameof(CanImport))]
    private bool isImporting;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasError))]
    private string? error;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasNotice))]
    private string? notice;

    public string ImportLabel => IsImporting ? "Importing…" : "Import";
    public bool CanImport => !IsImporting;
    public bool HasError => Error != null;
    public bool HasNotice => Notice != null;

    [RelayCommand]
    private async Task ImportAsync()
    {
        if (IsImporting)
        {
            return;
        }
        Error = null;
        Notice = null;
        IsImporting = true;
        try
        {
            var result = await model.Api.Integrations.Trakt.ImportListAsync(ListUrl.Trim());
            Notice = result.Summary;
        }
        catch (ApiException failure)
        {
            Error = failure.Message;
        }
        finally
        {
            IsImporting = false;
        }
    }
}

/// <summary>One webhook URL with its Copy button, which reads "Copied" for a moment.</summary>
public sealed partial class WebhookUrlRow : ObservableObject
{
    public WebhookUrlRow(string label, string url)
    {
        Label = label;
        Url = url;
    }

    public string Label { get; }
    public string Url { get; }

    [ObservableProperty]
    private string copyLabel = "Copy";

    [RelayCommand]
    private async Task CopyAsync()
    {
        if (!ClipboardText.Copy(Url))
        {
            return;
        }
        CopyLabel = "Copied";
        await Task.Delay(TimeSpan.FromSeconds(1.5));
        CopyLabel = "Copy";
    }
}

/// <summary>
/// components/webhook-settings-card.tsx: the URLs to paste into
/// Radarr/Sonarr's Connect settings (a connected 4K one's too), and
/// "Regenerate secret" behind a confirmation.
/// </summary>
public sealed partial class ArrWebhooksViewModel : ObservableObject
{
    private readonly AppModel model;
    private bool radarr4kConnected;
    private bool sonarr4kConnected;

    public ArrWebhooksViewModel(AppModel model)
    {
        this.model = model;
    }

    [ObservableProperty]
    private IReadOnlyList<WebhookUrlRow> urls = [];

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsAsking))]
    private bool isConfirming;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ConfirmLabel))]
    [NotifyPropertyChangedFor(nameof(IsIdle))]
    private bool isRegenerating;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasError))]
    private string? error;

    public string ListeningBadge { get; } = "Listening";
    public BadgeTone ListeningTone { get; } = BadgeTone.Owned;
    public bool IsAsking => !IsConfirming;
    public bool IsIdle => !IsRegenerating;
    public string ConfirmLabel => IsRegenerating ? "Regenerating…" : "Confirm";
    public bool HasError => Error != null;

    internal void Apply(ArrWebhooks webhooks, bool radarr4k, bool sonarr4k)
    {
        radarr4kConnected = radarr4k;
        sonarr4kConnected = sonarr4k;
        Show(webhooks);
    }

    private void Show(ArrWebhooks webhooks)
    {
        var rows = new List<WebhookUrlRow>
        {
            new("Radarr webhook URL", webhooks.RadarrUrl),
            new("Sonarr webhook URL", webhooks.SonarrUrl),
        };
        if (radarr4kConnected && webhooks.Radarr4kUrl is { } radarr4k)
        {
            rows.Add(new("4K Radarr webhook URL", radarr4k));
        }
        if (sonarr4kConnected && webhooks.Sonarr4kUrl is { } sonarr4k)
        {
            rows.Add(new("4K Sonarr webhook URL", sonarr4k));
        }
        Urls = rows;
    }

    [RelayCommand]
    private void Ask()
    {
        Error = null;
        IsConfirming = true;
    }

    [RelayCommand]
    private void Cancel()
    {
        if (!IsRegenerating)
        {
            IsConfirming = false;
        }
    }

    /// <summary><c>POST …/webhook-secret</c>: the old URLs stop working at once.</summary>
    [RelayCommand]
    private async Task ConfirmAsync()
    {
        if (IsRegenerating)
        {
            return;
        }
        Error = null;
        IsRegenerating = true;
        try
        {
            Show(await model.Api.Integrations.RegenerateWebhookSecretAsync());
            IsConfirming = false;
        }
        catch (ApiException failure)
        {
            Error = failure.Message;
        }
        finally
        {
            IsRegenerating = false;
        }
    }
}
