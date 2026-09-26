using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Windows.Services;

namespace Marquee.Windows.ViewModels;

// Settings › Integrations › Download Clients on a 0.43+ server: any number
// of Sonarr and Radarr servers in place of the four fixed cards. Each row
// has Edit, Make default, Remove and its own webhook; one form below the
// lists adds or edits a server. Every change records
// ServerChange.Integrations, and the tab's reload Apply()s the fresh list.

/// <summary>The "Download Clients" list: the Sonarr servers, the Radarr servers, and the Add/Edit form.</summary>
public sealed partial class ArrServersViewModel : ObservableObject
{
    private readonly AppModel model;

    public ArrServersViewModel(AppModel model)
    {
        this.model = model;
        Editor = new ArrServerEditorViewModel(model);
    }

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasNoSonarr))]
    private IReadOnlyList<ArrServerRow> sonarrServers = [];

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasNoRadarr))]
    private IReadOnlyList<ArrServerRow> radarrServers = [];

    public bool HasNoSonarr => SonarrServers.Count == 0;
    public bool HasNoRadarr => RadarrServers.Count == 0;

    /// <summary>The Add/Edit form under the lists.</summary>
    public ArrServerEditorViewModel Editor { get; }

    internal MarqueeApi Api => model.Api;

    /// <summary>The overview's <c>arrServers</c>: rows for servers already shown keep their state (a pending Remove, "Copied").</summary>
    internal void Apply(IReadOnlyList<ArrServer> servers)
    {
        var existing = SonarrServers.Concat(RadarrServers).ToDictionary(row => row.Id);
        ArrServerRow RowFor(ArrServer server)
        {
            if (existing.TryGetValue(server.Id, out var row))
            {
                row.Apply(server);
                return row;
            }
            return new ArrServerRow(this, server);
        }
        SonarrServers = servers.Where(server => server.Kind == ArrProvider.Sonarr).Select(RowFor).ToList();
        RadarrServers = servers.Where(server => server.Kind == ArrProvider.Radarr).Select(RowFor).ToList();
        Editor.Refresh(servers);
    }

    [RelayCommand]
    private void AddSonarr() => Editor.OpenNew(ArrProvider.Sonarr);

    [RelayCommand]
    private void AddRadarr() => Editor.OpenNew(ArrProvider.Radarr);

    internal void Edit(ArrServerRow row) => Editor.OpenEdit(row.Server);
}

/// <summary>
/// One server in the list: its name, URL and badges (Default, 4K, Needs
/// setup), Edit, Make default and Remove (confirmed in place), and its own
/// webhook URL with Copy and Regenerate (confirmed in place too).
/// </summary>
public sealed partial class ArrServerRow : ObservableObject
{
    private readonly ArrServersViewModel owner;

    public ArrServerRow(ArrServersViewModel owner, ArrServer server)
    {
        this.owner = owner;
        Id = server.Id;
        Server = server;
        Apply(server);
    }

    public string Id { get; }

    // Internal: a Core type the XAML never binds.
    internal ArrServer Server { get; private set; }

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(RemovePrompt))]
    private string name = "";

    [ObservableProperty]
    private string baseUrl = "";

    [ObservableProperty]
    private string webhookUrl = "";

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(DefaultBadge))]
    [NotifyPropertyChangedFor(nameof(CanMakeDefault))]
    private bool isDefault;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(FourKBadge))]
    private bool is4k;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(SetupBadge))]
    private bool needsSetup;

    /// <summary>"default", "remove" or "webhook" while that call is in flight.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CanAct))]
    [NotifyPropertyChangedFor(nameof(CanMakeDefault))]
    [NotifyPropertyChangedFor(nameof(MakeDefaultLabel))]
    [NotifyPropertyChangedFor(nameof(RemoveConfirmLabel))]
    [NotifyPropertyChangedFor(nameof(RegenerateConfirmLabel))]
    private string? busy;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasError))]
    private string? error;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsActions))]
    private bool isConfirmingRemove;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsRegenerate))]
    private bool isConfirmingRegenerate;

    [ObservableProperty]
    private string copyLabel = "Copy";

    public string DefaultBadge => IsDefault ? "Default" : "";
    public BadgeTone DefaultTone { get; } = BadgeTone.Owned;
    public string FourKBadge => Is4k ? "4K" : "";
    public BadgeTone FourKTone { get; } = BadgeTone.Tracked;
    public string SetupBadge => NeedsSetup ? "Needs setup" : "";
    public BadgeTone SetupTone { get; } = BadgeTone.Neutral;

    public bool CanAct => Busy == null;

    /// <summary>"Make default" on any server that isn't its kind's default already.</summary>
    public bool CanMakeDefault => !IsDefault && Busy == null;

    public string MakeDefaultLabel => Busy == "default" ? "Saving…" : "Make default";

    /// <summary>Edit / Make default / Remove, until Remove asks to confirm.</summary>
    public bool ShowsActions => !IsConfirmingRemove;

    public string RemovePrompt => $"Remove {Name}?";
    public string RemoveConfirmLabel => Busy == "remove" ? "Removing…" : "Remove";
    public bool ShowsRegenerate => !IsConfirmingRegenerate;
    public string RegenerateConfirmLabel => Busy == "webhook" ? "Regenerating…" : "Confirm";
    public bool HasError => Error != null;

    internal void Apply(ArrServer server)
    {
        Server = server;
        Name = server.Name;
        BaseUrl = server.BaseUrl;
        WebhookUrl = server.WebhookUrl;
        IsDefault = server.IsDefault;
        Is4k = server.Is4k;
        NeedsSetup = !server.FullyConfigured;
    }

    [RelayCommand]
    private void Edit()
    {
        Error = null;
        owner.Edit(this);
    }

    /// <summary><c>PATCH …/{id}</c> with <c>{"isDefault": true}</c>: takes the default from the current one.</summary>
    [RelayCommand]
    private Task MakeDefaultAsync() =>
        RunAsync("default", async api => Apply(await api.Integrations.ArrServers.UpdateAsync(Id, new ArrServerUpdateRequest { IsDefault = true })));

    [RelayCommand]
    private void AskRemove()
    {
        Error = null;
        IsConfirmingRemove = true;
    }

    [RelayCommand]
    private void CancelRemove()
    {
        if (Busy == null)
        {
            IsConfirmingRemove = false;
        }
    }

    /// <summary><c>DELETE …/{id}</c>: the reload the change triggers drops the row.</summary>
    [RelayCommand]
    private Task ConfirmRemoveAsync() =>
        RunAsync("remove", async api =>
        {
            await api.Integrations.ArrServers.RemoveAsync(Id);
            IsConfirmingRemove = false;
        });

    [RelayCommand]
    private async Task CopyWebhookAsync()
    {
        if (!ClipboardText.Copy(WebhookUrl))
        {
            return;
        }
        CopyLabel = "Copied";
        await Task.Delay(TimeSpan.FromSeconds(1.5));
        CopyLabel = "Copy";
    }

    [RelayCommand]
    private void AskRegenerate()
    {
        Error = null;
        IsConfirmingRegenerate = true;
    }

    [RelayCommand]
    private void CancelRegenerate()
    {
        if (Busy == null)
        {
            IsConfirmingRegenerate = false;
        }
    }

    /// <summary><c>POST …/{id}/webhook-secret</c>: the old URL stops working at once.</summary>
    [RelayCommand]
    private Task ConfirmRegenerateAsync() =>
        RunAsync("webhook", async api =>
        {
            WebhookUrl = await api.Integrations.ArrServers.RegenerateWebhookSecretAsync(Id);
            IsConfirmingRegenerate = false;
        });

    private async Task RunAsync(string label, Func<MarqueeApi, Task> action)
    {
        if (Busy != null)
        {
            return;
        }
        Busy = label;
        Error = null;
        try
        {
            await action(owner.Api);
        }
        catch (ApiException failure)
        {
            Error = failure.Message;
        }
        finally
        {
            Busy = null;
        }
    }
}

/// <summary>
/// The Add/Edit server form: Name, URL, API key, 4K and Default, Test
/// (which loads the pickers), the quality profile, root folder and tags
/// used when adding, and for Sonarr the series type, season folders and the
/// anime overrides. Save is <c>POST /settings/arr-servers</c> for a new
/// server and <c>PATCH …/{id}</c> for a saved one. The typing and picking
/// live in <see cref="ArrServerDraft"/>; this mirrors it for the view.
/// </summary>
public sealed partial class ArrServerEditorViewModel : ObservableObject
{
    public const string SameAsAbove = "Same as above";

    private readonly AppModel model;
    private ArrServerDraft draft = new(ArrProvider.Sonarr);
    private CancellationTokenSource? optionsCancellation;

    /// <summary>The pickers are being refilled: their combo boxes' resets aren't picks.</summary>
    private bool applying;

    public ArrServerEditorViewModel(AppModel model)
    {
        this.model = model;
    }

    [ObservableProperty]
    private bool isOpen;

    /// <summary>"Add Sonarr server" / "Edit Radarr 2".</summary>
    [ObservableProperty]
    private string title = "";

    [ObservableProperty]
    private bool isSonarr;

    [ObservableProperty]
    private string name = "";

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(NeedsKeyAgain))]
    private string baseUrl = "";

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(NeedsKeyAgain))]
    private string apiKey = "";

    [ObservableProperty]
    private string apiKeyPlaceholder = "";

    [ObservableProperty]
    private string baseUrlPlaceholder = "";

    /// <summary>"Use for 4K requests"; a 4K server only takes 4K requests and "Add in 4K".</summary>
    [ObservableProperty]
    private bool is4k;

    [ObservableProperty]
    private bool isDefault;

    /// <summary>The saved default can't be switched off here: another server has to be made the default.</summary>
    [ObservableProperty]
    private bool canChangeDefault = true;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasOptions))]
    private IReadOnlyList<string> qualityProfiles = [];

    [ObservableProperty]
    private int qualityProfileIndex = -1;

    [ObservableProperty]
    private IReadOnlyList<string> rootFolders = [];

    [ObservableProperty]
    private int rootFolderIndex = -1;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasTags))]
    private IReadOnlyList<TagChoice> tags = [];

    [ObservableProperty]
    private int seriesTypeIndex;

    [ObservableProperty]
    private bool seasonFolders = true;

    /// <summary>"Same as above", then the quality profiles.</summary>
    [ObservableProperty]
    private IReadOnlyList<string> animeQualityProfiles = [];

    [ObservableProperty]
    private int animeQualityProfileIndex = -1;

    /// <summary>"Same as above", then the root folders.</summary>
    [ObservableProperty]
    private IReadOnlyList<string> animeRootFolders = [];

    [ObservableProperty]
    private int animeRootFolderIndex = -1;

    [ObservableProperty]
    private IReadOnlyList<TagChoice> animeTags = [];

    [ObservableProperty]
    private bool isLoadingOptions;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(TestLabel))]
    [NotifyPropertyChangedFor(nameof(CanAct))]
    private bool isTesting;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(SaveLabel))]
    [NotifyPropertyChangedFor(nameof(CanAct))]
    private bool isSaving;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasError))]
    private string? error;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasNotice))]
    private string? notice;

    public IReadOnlyList<string> SeriesTypes { get; } = AddOverridesSelection.SeriesTypes.Select(type => type.Label).ToList();

    /// <summary>The pickers show once Test (or the saved server's options) answered.</summary>
    public bool HasOptions => QualityProfiles.Count > 0 || RootFolders.Count > 0;

    public bool HasTags => Tags.Count > 0;

    /// <summary>"Enter the API key again to change the URL." under the key.</summary>
    public bool NeedsKeyAgain => draft.NeedsKeyAgain;

    public string KeyAgainMessage => ArrServerDraft.KeyAgainMessage;
    public string TestLabel => IsTesting ? "Testing…" : "Test";
    public string SaveLabel => IsSaving ? "Saving…" : draft.IsEditing ? "Save" : "Add server";
    public bool CanAct => !IsTesting && !IsSaving;
    public bool HasError => Error != null;
    public bool HasNotice => Notice != null;

    // MARK: Opening

    internal void OpenNew(ArrProvider kind)
    {
        Load(new ArrServerDraft(kind), $"Add {kind.DisplayName} server");
    }

    /// <summary>Edit: the saved settings, then the saved server's pickers (<c>GET …/{id}/options</c>).</summary>
    internal void OpenEdit(ArrServer server)
    {
        Load(new ArrServerDraft(server), $"Edit {server.Name}");
        _ = LoadOptionsAsync(server.Id);
    }

    /// <summary>The server being edited was removed elsewhere: the form closes.</summary>
    internal void Refresh(IReadOnlyList<ArrServer> servers)
    {
        if (IsOpen && draft.Saved is { } saved && servers.All(server => server.Id != saved.Id))
        {
            Close();
        }
    }

    private void Load(ArrServerDraft fresh, string heading)
    {
        optionsCancellation?.Cancel();
        draft = fresh;
        Title = heading;
        IsSonarr = fresh.IsSonarr;
        Name = fresh.Name;
        BaseUrl = fresh.BaseUrl;
        ApiKey = "";
        ApiKeyPlaceholder = fresh.ApiKeyPlaceholder;
        BaseUrlPlaceholder = fresh.BaseUrlPlaceholder;
        Is4k = fresh.Is4k;
        IsDefault = fresh.IsDefault;
        CanChangeDefault = fresh.Saved?.IsDefault != true;
        SeriesTypeIndex = Math.Max(0, IndexOf(AddOverridesSelection.SeriesTypes, fresh.SeriesType));
        SeasonFolders = fresh.SeasonFolders;
        Error = null;
        Notice = null;
        ShowPickers();
        OnPropertyChanged(nameof(SaveLabel));
        OnPropertyChanged(nameof(NeedsKeyAgain));
        IsOpen = true;
    }

    private async Task LoadOptionsAsync(string id)
    {
        var cancellation = new CancellationTokenSource();
        optionsCancellation = cancellation;
        var token = cancellation.Token;
        var editing = draft;
        IsLoadingOptions = true;
        try
        {
            var options = await model.Api.Integrations.ArrServers.OptionsAsync(id, token);
            if (!token.IsCancellationRequested && ReferenceEquals(editing, draft) && draft.Options == null)
            {
                draft.ApplyOptions(options);
                ShowPickers();
            }
        }
        catch (ApiException failure)
        {
            if (!failure.IsCancellation && !token.IsCancellationRequested && ReferenceEquals(editing, draft))
            {
                // "Couldn't reach Radarr 2. …": Test still works once it's back.
                Error = failure.Message;
            }
        }
        finally
        {
            if (ReferenceEquals(optionsCancellation, cancellation))
            {
                IsLoadingOptions = false;
            }
        }
    }

    // MARK: Following the fields

    partial void OnNameChanged(string value) => draft.Name = value;

    partial void OnBaseUrlChanged(string value) => draft.BaseUrl = value;

    partial void OnApiKeyChanged(string value) => draft.ApiKey = value;

    partial void OnIs4kChanged(bool value) => draft.Is4k = value;

    partial void OnIsDefaultChanged(bool value) => draft.IsDefault = value;

    partial void OnSeasonFoldersChanged(bool value) => draft.SeasonFolders = value;

    partial void OnSeriesTypeIndexChanged(int value)
    {
        if (value >= 0 && value < AddOverridesSelection.SeriesTypes.Count)
        {
            draft.SeriesType = AddOverridesSelection.SeriesTypes[value];
        }
    }

    partial void OnQualityProfileIndexChanged(int value)
    {
        if (!applying && draft.Options is { } options && value >= 0 && value < options.QualityProfiles.Count)
        {
            draft.QualityProfileId = options.QualityProfiles[value].Id;
        }
    }

    partial void OnRootFolderIndexChanged(int value)
    {
        if (!applying && draft.Options is { } options && value >= 0 && value < options.RootFolders.Count)
        {
            draft.RootFolderPath = options.RootFolders[value].Path;
        }
    }

    /// <summary>0 is "Same as above" (null); the rest are the quality profiles.</summary>
    partial void OnAnimeQualityProfileIndexChanged(int value)
    {
        if (!applying && draft.Options is { } options && value >= 0 && value <= options.QualityProfiles.Count)
        {
            draft.AnimeQualityProfileId = value == 0 ? null : options.QualityProfiles[value - 1].Id;
        }
    }

    partial void OnAnimeRootFolderIndexChanged(int value)
    {
        if (!applying && draft.Options is { } options && value >= 0 && value <= options.RootFolders.Count)
        {
            draft.AnimeRootFolderPath = value == 0 ? null : options.RootFolders[value - 1].Path;
        }
    }

    private void OnTagChanged(TagChoice tag) => Toggle(draft.Tags, tag);

    private void OnAnimeTagChanged(TagChoice tag) => Toggle(draft.AnimeTags, tag);

    private static void Toggle(List<int> ids, TagChoice tag)
    {
        ids.Remove(tag.Id);
        if (tag.Checked)
        {
            ids.Add(tag.Id);
        }
    }

    /// <summary>Lists first, then the picks, so each combo box finds its item.</summary>
    private void ShowPickers()
    {
        applying = true;
        try
        {
            var options = draft.Options;
            var profiles = options?.QualityProfiles ?? [];
            var folders = options?.RootFolders ?? [];
            QualityProfiles = profiles.Select(profile => profile.Name).ToList();
            QualityProfileIndex = draft.QualityProfileId is { } profileId ? IndexWhere(profiles, profile => profile.Id == profileId) : -1;
            RootFolders = folders.Select(folder => folder.Path).ToList();
            RootFolderIndex = draft.RootFolderPath is { } path ? IndexWhere(folders, folder => folder.Path == path) : -1;
            AnimeQualityProfiles = options == null ? [] : [SameAsAbove, .. QualityProfiles];
            AnimeQualityProfileIndex = options == null
                ? -1
                : draft.AnimeQualityProfileId is { } animeProfileId ? IndexWhere(profiles, profile => profile.Id == animeProfileId) + 1 : 0;
            AnimeRootFolders = options == null ? [] : [SameAsAbove, .. RootFolders];
            AnimeRootFolderIndex = options == null
                ? -1
                : draft.AnimeRootFolderPath is { } animePath ? IndexWhere(folders, folder => folder.Path == animePath) + 1 : 0;
            var available = options?.Tags ?? [];
            Tags = available.Select(tag => new TagChoice(tag.Id, tag.Label, draft.Tags.Contains(tag.Id), OnTagChanged)).ToList();
            AnimeTags = available.Select(tag => new TagChoice(tag.Id, tag.Label, draft.AnimeTags.Contains(tag.Id), OnAnimeTagChanged)).ToList();
        }
        finally
        {
            applying = false;
        }
    }

    // MARK: Actions

    /// <summary><c>POST /settings/arr-servers/test</c>: checks without saving and loads the pickers.</summary>
    [RelayCommand]
    private async Task TestAsync()
    {
        if (!CanAct)
        {
            return;
        }
        optionsCancellation?.Cancel();
        var editing = draft;
        Error = null;
        Notice = null;
        IsTesting = true;
        try
        {
            var result = await model.Api.Integrations.ArrServers.TestAsync(editing.TestRequest());
            if (!ReferenceEquals(editing, draft))
            {
                return;
            }
            draft.ApplyOptions(result.Options);
            ShowPickers();
            Notice = result.Version.NonBlank() is { } version
                ? $"Connected to {draft.Kind.DisplayName} {version}."
                : "Connected successfully.";
        }
        catch (ApiException failure)
        {
            if (ReferenceEquals(editing, draft))
            {
                Error = failure.Message;
            }
        }
        finally
        {
            IsTesting = false;
        }
    }

    /// <summary>"Add server" / "Save": the server tests a new connection first; its message shows here on failure.</summary>
    [RelayCommand]
    private async Task SaveAsync()
    {
        if (!CanAct)
        {
            return;
        }
        var editing = draft;
        Error = null;
        Notice = null;
        IsSaving = true;
        try
        {
            var servers = model.Api.Integrations.ArrServers;
            if (editing.Saved is { } saved)
            {
                await servers.UpdateAsync(saved.Id, editing.UpdateRequest());
            }
            else
            {
                await servers.AddAsync(editing.CreateRequest());
            }
            if (ReferenceEquals(editing, draft))
            {
                Close();
            }
        }
        catch (ApiException failure)
        {
            if (ReferenceEquals(editing, draft))
            {
                Error = failure.Message;
            }
        }
        finally
        {
            IsSaving = false;
        }
    }

    [RelayCommand]
    private void Cancel()
    {
        if (!IsSaving)
        {
            Close();
        }
    }

    private void Close()
    {
        optionsCancellation?.Cancel();
        IsOpen = false;
        ApiKey = "";
        Error = null;
        Notice = null;
    }

    private static int IndexOf<T>(IReadOnlyList<T> list, T item) => IndexWhere(list, candidate => EqualityComparer<T>.Default.Equals(candidate, item));

    private static int IndexWhere<T>(IReadOnlyList<T> list, Func<T, bool> match)
    {
        for (var index = 0; index < list.Count; index++)
        {
            if (match(list[index]))
            {
                return index;
            }
        }
        return -1;
    }
}
