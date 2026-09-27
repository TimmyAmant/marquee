using System.Windows.Input;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core.Api;
using Marquee.Core.Localization;
using Marquee.Core.Models;
using Marquee.Windows.Services;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;

namespace Marquee.Windows.ViewModels;

/// <summary>
/// One row of the Library page's table: the entry's strings, its status
/// pill, and (the admin) the Radarr/Sonarr actions the title page offers,
/// "Search now" and "Stop/Start monitoring", against the same endpoints.
/// The monitoring label flips locally once the server confirms.
/// </summary>
public sealed partial class LibraryRow : ObservableObject
{
    private readonly AppModel model;
    private bool monitored;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(SearchLabel))]
    [NotifyPropertyChangedFor(nameof(CanAct))]
    private bool isSearching;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(MonitorLabel))]
    [NotifyPropertyChangedFor(nameof(CanAct))]
    private bool isTogglingMonitor;

    /// <summary>"Search queued." or the error, under the actions.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasMessage))]
    private string? message;

    [ObservableProperty]
    private bool messageIsError;

    public LibraryRow(AppModel model, LibraryEntry entry, ICommand open, bool isAdmin)
    {
        this.model = model;
        Entry = entry;
        Open = open;
        Id = entry.Id;
        Name = entry.Name;
        Year = entry.Year.NonBlank() ?? "";
        ResolutionLabel = entry.Resolution?.Label ?? "";
        HdrLabel = entry.Hdr.NonBlank() ?? "";
        VideoCodecLabel = entry.VideoCodec.NonBlank() ?? "";
        AudioCodecLabel = entry.AudioCodec.NonBlank() ?? "";
        QualityName = entry.Resolution == null && entry.Hdr.NonBlank() == null && entry.VideoCodec.NonBlank() == null && entry.AudioCodec.NonBlank() == null
            ? entry.Quality.NonBlank() ?? ""
            : "";
        UpgradeLabel = entry.UpgradeAvailable ? Loc.Get("Library_UpgradeAvailable") : "";
        SizeLabel = entry.SizeLabel ?? "";
        MetaLine = entry.MetaLine;
        // A status this version doesn't know renders no pill rather than a raw wire value.
        StatusLabel = entry.Status is { IsKnown: true } status ? status.Name : "";
        StatusTone = entry.Status is { IsKnown: true } known ? PosterItem.ToneFor(known) : BadgeTone.Neutral;
        SourceLabel = entry.Source.DisplayName;
        Location = isAdmin ? entry.FilePath.NonBlank() ?? "" : "";
        HasTracking = isAdmin && entry.ArrTracking != null;
        monitored = entry.ArrTracking?.Monitored == true;
    }

    public LibraryEntry Entry { get; }
    public TitleId Id { get; }
    public string Name { get; }
    public string Year { get; }

    /// <summary>The click on the title; the row itself is inert.</summary>
    public ICommand Open { get; }

    // MARK: Quality column: one pill each, empty ones collapse.

    public string ResolutionLabel { get; }
    public string HdrLabel { get; }
    public string VideoCodecLabel { get; }
    public string AudioCodecLabel { get; }

    /// <summary>Radarr's quality name, only when nothing else describes the file.</summary>
    public string QualityName { get; }

    public string UpgradeLabel { get; }
    public string SizeLabel { get; }

    /// <summary>"Plex · 29.1 GB · 61 episodes", the grid card's tooltip and the table's secondary line.</summary>
    public string MetaLine { get; }

    public string StatusLabel { get; }
    public BadgeTone StatusTone { get; }
    public string SourceLabel { get; }

    /// <summary>The admin's Location column; empty for members (hidden).</summary>
    public string Location { get; }

    public bool HasLocation => Location.Length > 0;

    /// <summary>The admin's Actions column shows: Radarr/Sonarr has the title.</summary>
    public bool HasTracking { get; }

    public bool CanAct => !IsSearching && !IsTogglingMonitor;
    public bool HasMessage => Message != null;

    public string SearchLabel => IsSearching ? Loc.Get("Title_Searching") : Loc.Get("Title_SearchNow");

    public string MonitorLabel => IsTogglingMonitor
        ? Loc.Get("Title_Updating")
        : monitored ? Loc.Get("Title_StopMonitoring") : Loc.Get("Title_StartMonitoring");

    /// <summary>"Search now": queues a Radarr/Sonarr search, like the title page.</summary>
    [RelayCommand]
    private async Task SearchNowAsync()
    {
        if (!CanAct || !HasTracking)
        {
            return;
        }
        IsSearching = true;
        Message = null;
        try
        {
            await model.Api.Titles.SearchNowAsync(Id.MediaType, Id.TmdbId);
            MessageIsError = false;
            Message = TitleViewModel.SearchQueuedMessage;
        }
        catch (ApiException error)
        {
            MessageIsError = true;
            Message = error.Message;
        }
        finally
        {
            IsSearching = false;
        }
    }

    /// <summary>"Stop monitoring" / "Start monitoring": the label follows what the server confirms.</summary>
    [RelayCommand]
    private async Task ToggleMonitorAsync()
    {
        if (!CanAct || !HasTracking)
        {
            return;
        }
        IsTogglingMonitor = true;
        Message = null;
        try
        {
            monitored = await model.Api.Titles.SetMonitoredAsync(!monitored, Id.MediaType, Id.TmdbId);
        }
        catch (ApiException error)
        {
            MessageIsError = true;
            Message = error.Message;
        }
        finally
        {
            IsTogglingMonitor = false;
        }
        OnPropertyChanged(nameof(MonitorLabel));
    }
}

/// <summary>
/// One franchise on the "Missing from collections" tab: the heading with
/// its missing count, the posters, and the "Add all N missing" (admin) or
/// "Request all N missing" (member) button, done exactly as the title
/// page's franchise row does it: adds one at a time, requests in one call,
/// then the tab reloads quietly so the badges catch up.
/// </summary>
public sealed partial class LibraryCollectionItem : ObservableObject
{
    private readonly AppModel model;
    private readonly LibraryCollection collection;
    private readonly Func<Task> reload;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(AddAllLabel))]
    [NotifyPropertyChangedFor(nameof(CanAddAll))]
    private bool isAddingAll;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsAddAll))]
    [NotifyPropertyChangedFor(nameof(HasAddAllResult))]
    private string? addAllResult;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(RequestAllLabel))]
    [NotifyPropertyChangedFor(nameof(CanRequestAll))]
    private bool isRequestingAll;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsRequestAll))]
    [NotifyPropertyChangedFor(nameof(HasRequestAllResult))]
    private string? requestAllResult;

    /// <param name="reload">Refetches the tab after "Add all" / "Request all", keeping this item's result line.</param>
    public LibraryCollectionItem(AppModel model, LibraryCollection collection, ICommand openTitle, Func<Task> reload)
    {
        this.model = model;
        this.collection = collection;
        this.reload = reload;
        Posters = collection.Items.Select(card => new PosterItem(model, card, openTitle)).ToList();
    }

    public string Key => collection.Key;

    /// <summary>"The Matrix Collection · 2 missing".</summary>
    public string Heading => collection.Heading;

    public IReadOnlyList<PosterItem> Posters { get; }

    public int MissingCount => collection.AddAllMissing.Count;
    public string AddAllLabel => IsAddingAll ? Loc.Get("Title_Adding") : Loc.Plural("Title_AddAllMissing", MissingCount);
    public bool ShowsAddAll => MissingCount > 0 && AddAllResult == null;
    public bool CanAddAll => !IsAddingAll;
    public bool HasAddAllResult => AddAllResult != null;
    public string AddAllConfirmation => Loc.Plural("Title_AddAllQuestion", MissingCount);

    public int RequestableCount => collection.RequestAllMissing.Count;
    public string RequestAllLabel => TitleFranchise.RequestAllLabel(RequestableCount, IsRequestingAll);
    public bool ShowsRequestAll => RequestableCount > 0 && RequestAllResult == null;
    public bool CanRequestAll => !IsRequestingAll;
    public bool HasRequestAllResult => RequestAllResult != null;
    public string RequestAllConfirmation => TitleFranchise.RequestAllConfirmation(RequestableCount);

    /// <summary>"Add all N missing", one title at a time like the website.</summary>
    [RelayCommand]
    private async Task AddAllMissingAsync()
    {
        if (IsAddingAll || collection.AddAllMissing is not { Count: > 0 } targets)
        {
            return;
        }
        IsAddingAll = true;
        AddAllResult = null;
        var failures = 0;
        try
        {
            foreach (var target in targets)
            {
                try
                {
                    await model.Api.Titles.AddAsync(target.MediaType, target.TmdbId);
                }
                catch (ApiException)
                {
                    failures++;
                }
            }
            AddAllResult = failures > 0
                ? Loc.Format("Title_AddAllPartial", targets.Count - failures, targets.Count, failures)
                : Loc.Plural("Title_AddAllDone", targets.Count);
        }
        finally
        {
            IsAddingAll = false;
        }
        await reload();
    }

    /// <summary>"Request all N missing" (members): one call to the owned part; the server requests each.</summary>
    [RelayCommand]
    private async Task RequestAllMissingAsync()
    {
        if (IsRequestingAll || RequestableCount == 0)
        {
            return;
        }
        IsRequestingAll = true;
        RequestAllResult = null;
        try
        {
            var target = collection.RequestAllTarget;
            RequestAllResult = (await model.Api.Titles.RequestAllMissingAsync(target.MediaType, target.TmdbId)).Message;
        }
        catch (ApiException error)
        {
            RequestAllResult = error.Message;
        }
        finally
        {
            IsRequestingAll = false;
        }
        await reload();
    }

    /// <summary>Carries a result line over to the same collection in a reloaded list.</summary>
    public void KeepResultsFrom(LibraryCollectionItem previous)
    {
        AddAllResult = previous.AddAllResult;
        RequestAllResult = previous.RequestAllResult;
    }
}

/// <summary>One copy of a duplicated title: the server, the file, its size and quality.</summary>
public sealed class LibraryCopyItem(LibraryCopy copy)
{
    /// <summary>"Tower · Plex".</summary>
    public string ServerLine { get; } = copy.ServerLine;

    public string Location { get; } = copy.FilePath.NonBlank() ?? "";
    public string SizeLabel { get; } = copy.SizeLabel ?? "";
    public QualityLabel Quality { get; } = new(copy.Quality.NonBlank() ?? "");

    public string QualityLabel => Quality.Text;
}

/// <summary>A quality name for a pill; wrapped so the row can bind one property.</summary>
public sealed record QualityLabel(string Text);

/// <summary>One group on the Duplicates tab: the title, why it's listed, and every copy.</summary>
public sealed class LibraryDuplicateItem
{
    private readonly Uri? posterUrl;
    private ImageSource? poster;

    public LibraryDuplicateItem(LibraryDuplicate duplicate, ICommand open)
    {
        Id = duplicate.Id;
        Name = duplicate.Name;
        Year = duplicate.Year.NonBlank() ?? "";
        ReasonLabel = duplicate.Reason.Label;
        Copies = duplicate.Copies.Select(copy => new LibraryCopyItem(copy)).ToList();
        posterUrl = duplicate.PosterPath.Url(ImageSize.W185);
        Open = open;
    }

    public TitleId Id { get; }
    public string Name { get; }
    public string Year { get; }

    /// <summary>"Different files" / "On several servers", in the info palette.</summary>
    public string ReasonLabel { get; }

    public BadgeTone ReasonTone => BadgeTone.Info;

    public IReadOnlyList<LibraryCopyItem> Copies { get; }

    public ICommand Open { get; }

    /// <summary>The small poster, created on first use (UI thread only).</summary>
    public ImageSource? Poster => posterUrl == null ? null : poster ??= new BitmapImage(posterUrl);
}

/// <summary>One root folder on the Storage card.</summary>
public sealed class LibraryFolderItem(LibraryStorageFolder folder)
{
    public string Path { get; } = folder.Path;

    /// <summary>"Radarr · 4K Radarr"; empty from a snapshot.</summary>
    public string ServersLine { get; } = folder.ServersLine;

    public string FreeLabel { get; } = folder.FreeLabel;
}
