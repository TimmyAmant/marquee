using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core.Api;
using Marquee.Core.Models;

namespace Marquee.Windows.ViewModels;

/// <summary>One checkbox of a tags picker (a Sonarr/Radarr tag); every change is reported to its owner.</summary>
public sealed partial class TagChoice : ObservableObject
{
    private readonly Action<TagChoice>? changed;

    /// <summary>Two-way bound to the checkbox.</summary>
    [ObservableProperty]
    private bool? isChecked;

    public TagChoice(int id, string label, bool isChecked, Action<TagChoice>? changed)
    {
        Id = id;
        Label = label;
        IsChecked = isChecked;
        // Set last, so the initial state isn't reported as a change.
        this.changed = changed;
    }

    public int Id { get; }
    public string Label { get; }
    public bool Checked => IsChecked == true;

    partial void OnIsCheckedChanged(bool? value) => changed?.Invoke(this);
}

/// <summary>
/// The "Advanced" section under Approve (a review queue row) and the admin's
/// Add / Add to 4K on a title page (0.43+): which Sonarr/Radarr server, and
/// its quality profile, root folder, tags and (TV) series type. Nothing
/// loads until it's first opened (<c>GET /titles/{type}/{id}/add-options</c>),
/// and <see cref="Overrides"/> stays null until then, so an unopened section
/// changes nothing about what Approve or Add send. An older server answers
/// 404: the section hides itself and says so through <see cref="Unsupported"/>.
/// </summary>
public sealed partial class AddOverridesViewModel : ObservableObject
{
    private readonly Func<MarqueeApi> api;
    private readonly bool is4k;
    private MediaType mediaType;
    private int tmdbId;
    private AddOverridesSelection? selection;
    private CancellationTokenSource? loadCancellation;

    /// <summary>The pickers are being refilled: their combo boxes' resets aren't picks.</summary>
    private bool applying;

    public AddOverridesViewModel(Func<MarqueeApi> api, MediaType mediaType, int tmdbId, bool is4k)
    {
        this.api = api;
        this.mediaType = mediaType;
        this.tmdbId = tmdbId;
        this.is4k = is4k;
    }

    /// <summary>Called once when the server turned out not to have add options (older than 0.43).</summary>
    public Action? Unsupported { get; set; }

    /// <summary>The expander; the first opening loads the options.</summary>
    [ObservableProperty]
    private bool isExpanded;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsVisible))]
    private bool isUnsupported;

    [ObservableProperty]
    private bool isLoading;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasError))]
    private string? error;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsPickers))]
    [NotifyPropertyChangedFor(nameof(ShowsNoServers))]
    [NotifyPropertyChangedFor(nameof(ShowsSeriesType))]
    private bool isLoaded;

    [ObservableProperty]
    private IReadOnlyList<string> serverNames = [];

    [ObservableProperty]
    private int serverIndex = -1;

    [ObservableProperty]
    private IReadOnlyList<string> qualityProfiles = [];

    [ObservableProperty]
    private int qualityProfileIndex = -1;

    [ObservableProperty]
    private IReadOnlyList<string> rootFolders = [];

    [ObservableProperty]
    private int rootFolderIndex = -1;

    [ObservableProperty]
    private int seriesTypeIndex = -1;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasTags))]
    private IReadOnlyList<TagChoice> tags = [];

    /// <summary>The picked server didn't answer: its lists are empty, its saved settings still apply.</summary>
    [ObservableProperty]
    private bool serverIsDown;

    /// <summary>Collapsed on a server older than 0.43.</summary>
    public bool IsVisible => !IsUnsupported;

    public bool HasError => Error != null;
    public bool HasTags => Tags.Count > 0;
    public bool ShowsPickers => IsLoaded && selection?.HasServers == true;
    public bool ShowsNoServers => IsLoaded && selection?.HasServers != true;
    public bool ShowsSeriesType => ShowsPickers && mediaType == MediaType.Tv;
    public IReadOnlyList<string> SeriesTypes { get; } = AddOverridesSelection.SeriesTypes.Select(type => type.Label).ToList();
    public string NoServersMessage => $"No {(is4k ? "4K " : "")}{mediaType.ArrName} is set up for this yet.";

    /// <summary>What Approve / Add send: null (no body, the server's defaults) until the section has loaded.</summary>
    public AddOverrides? Overrides => IsLoaded ? selection?.Overrides : null;

    /// <summary>A title page shows another title: back to closed and unloaded.</summary>
    public void Reset(MediaType mediaType, int tmdbId)
    {
        loadCancellation?.Cancel();
        loadCancellation = null;
        this.mediaType = mediaType;
        this.tmdbId = tmdbId;
        selection = null;
        IsExpanded = false;
        IsLoading = false;
        Error = null;
        IsLoaded = false;
        Show();
        OnPropertyChanged(nameof(NoServersMessage));
    }

    partial void OnIsExpandedChanged(bool value)
    {
        if (value && !IsLoaded && !IsLoading)
        {
            _ = LoadAsync();
        }
    }

    [RelayCommand]
    private async Task LoadAsync()
    {
        loadCancellation?.Cancel();
        var cancellation = new CancellationTokenSource();
        loadCancellation = cancellation;
        var token = cancellation.Token;
        IsLoading = true;
        Error = null;
        try
        {
            var options = await api().Titles.AddOptionsAsync(mediaType, tmdbId, is4k, token);
            if (token.IsCancellationRequested)
            {
                return;
            }
            selection = new AddOverridesSelection(options);
            IsLoaded = true;
            Show();
        }
        catch (ApiException failure)
        {
            if (failure.IsCancellation || token.IsCancellationRequested)
            {
                return;
            }
            if (failure.Kind == ApiErrorKind.NotFound)
            {
                IsUnsupported = true;
                Unsupported?.Invoke();
            }
            else
            {
                Error = failure.Message;
            }
        }
        finally
        {
            if (!token.IsCancellationRequested)
            {
                IsLoading = false;
            }
        }
    }

    /// <summary>Another server was picked: every other pick goes back to its defaults.</summary>
    partial void OnServerIndexChanged(int value)
    {
        if (applying || selection == null || value < 0 || value == selection.ServerIndex)
        {
            return;
        }
        selection.ServerIndex = value;
        Show();
    }

    partial void OnQualityProfileIndexChanged(int value)
    {
        if (!applying && selection != null)
        {
            selection.QualityProfileIndex = value;
        }
    }

    partial void OnRootFolderIndexChanged(int value)
    {
        if (!applying && selection != null)
        {
            selection.RootFolderIndex = value;
        }
    }

    partial void OnSeriesTypeIndexChanged(int value)
    {
        if (!applying && selection != null)
        {
            selection.SeriesTypeIndex = value;
        }
    }

    private void OnTagChanged(TagChoice tag) => selection?.SetTag(tag.Id, tag.Checked);

    /// <summary>Lists first, then the picks, so each combo box finds its item.</summary>
    private void Show()
    {
        applying = true;
        try
        {
            // The server list doesn't change when another server is picked:
            // left alone, its combo box isn't reset in the middle of its own selection.
            var names = selection?.ServerNames ?? [];
            if (!names.SequenceEqual(ServerNames))
            {
                ServerNames = names;
            }
            ServerIndex = selection?.ServerIndex ?? -1;
            QualityProfiles = selection?.QualityProfileNames ?? [];
            QualityProfileIndex = selection?.QualityProfileIndex ?? -1;
            RootFolders = selection?.RootFolderPaths ?? [];
            RootFolderIndex = selection?.RootFolderIndex ?? -1;
            SeriesTypeIndex = selection?.SeriesTypeIndex ?? -1;
            ServerIsDown = selection?.Server?.Reachable == false;
            var current = selection;
            Tags = current == null
                ? []
                : current.AvailableTags.Select(tag => new TagChoice(tag.Id, tag.Label, current.HasTag(tag.Id), OnTagChanged)).ToList();
        }
        finally
        {
            applying = false;
        }
        OnPropertyChanged(nameof(ShowsPickers));
        OnPropertyChanged(nameof(ShowsNoServers));
        OnPropertyChanged(nameof(ShowsSeriesType));
    }
}
