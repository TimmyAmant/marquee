using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core.Api;
using Marquee.Core.Localization;
using Marquee.Core.Models;
using Marquee.Windows.Services;

namespace Marquee.Windows.ViewModels;

/// <summary>
/// One kept-in-sync Trakt list on the "Trakt lists" card: its name and link,
/// whose it is (the admin's view of everyone's), the Movies/TV shows
/// switches, the last check, Check now and Remove. The switches send a
/// <c>PATCH</c> as they flip; the row redraws from every answer.
/// </summary>
public sealed partial class TraktSyncRow : ObservableObject
{
    private readonly TraktSyncsViewModel owner;
    private bool syncing;

    public TraktSyncRow(TraktSyncsViewModel owner, TraktSync sync, Guid? viewerId, bool showsDivider)
    {
        this.owner = owner;
        ViewerId = viewerId;
        ShowsDivider = showsDivider;
        Show(sync);
    }

    private Guid? ViewerId { get; }

    public bool ShowsDivider { get; }

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(Name), nameof(Url), nameof(OwnerLine), nameof(Summary), nameof(LastError), nameof(HasLastError))]
    private TraktSync sync = null!;

    public string Name => Sync.Name;
    public string Url => Sync.Url;

    /// <summary>"Requests as Anna" for someone else's; empty (collapsed) for your own.</summary>
    public string OwnerLine => TraktSyncLabels.OwnerLine(Sync, ViewerId) ?? "";

    /// <summary>"Checked 5m ago · 4 titles requested so far".</summary>
    public string Summary => Sync.Summary(DateTimeOffset.UtcNow);

    public string LastError => Sync.LastError ?? "";
    public bool HasLastError => LastError.Length > 0;

    [ObservableProperty]
    private bool movies;

    [ObservableProperty]
    private bool tv;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CanChange), nameof(CheckLabel))]
    private bool isChecking;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CanChange))]
    private bool isChanging;

    /// <summary>A failed change, Check now ("Checked a moment ago. Try again in a minute.") or Remove.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasError))]
    private string? error;

    public bool HasError => Error != null;
    public bool CanChange => !IsChecking && !IsChanging;
    public string CheckLabel => IsChecking ? Loc.Get("Trakt_Checking") : Loc.Get("Trakt_CheckNow");

    /// <summary>Shows what the server has, moving the switches without sending anything.</summary>
    internal void Show(TraktSync fresh)
    {
        Sync = fresh;
        syncing = true;
        try
        {
            Movies = fresh.Movies;
            Tv = fresh.Tv;
        }
        finally
        {
            syncing = false;
        }
    }

    partial void OnMoviesChanged(bool value)
    {
        if (!syncing)
        {
            _ = owner.SetTypesAsync(this, movies: value, tv: null);
        }
    }

    partial void OnTvChanged(bool value)
    {
        if (!syncing)
        {
            _ = owner.SetTypesAsync(this, movies: null, tv: value);
        }
    }

    [RelayCommand]
    private Task CheckAsync() => owner.CheckAsync(this);

    [RelayCommand]
    private Task RemoveAsync() => owner.RemoveAsync(this);
}

/// <summary>
/// Settings › Account › "Trakt lists" (0.49+), for every account: keep a
/// public Trakt watchlist or list in sync, so new titles on it are requested
/// for you every few hours. Your lists (the admin's: everyone's, with whose
/// each is), and a form to add one: the link, Movies/TV shows, and "Also
/// request what's on it now". Without Trakt connected the form gives way to
/// a note. Hidden on an older server, whose <c>GET /trakt-syncs</c> answers 404.
/// </summary>
public sealed partial class TraktSyncsViewModel : ObservableObject
{
    private readonly AppModel model;
    private CancellationTokenSource? loadCancellation;

    public TraktSyncsViewModel(AppModel model)
    {
        this.model = model;
    }

    /// <summary>Set by the page: "Stop syncing {name}?", true only when confirmed.</summary>
    internal Func<TraktSyncRow, Task<bool>>? RemovePrompt { get; set; }

    public string Description => TraktSyncLabels.Description;
    public string UnavailableText => TraktSyncLabels.UnavailableMessage;
    public string EmptyText => TraktSyncLabels.EmptyText;
    public string RequestExistingLabel => TraktSyncLabels.RequestExistingLabel;

    /// <summary><c>GET /trakt-syncs</c> answered: the card shows (never on an older server).</summary>
    [ObservableProperty]
    private bool isVisible;

    /// <summary>Trakt is connected: the add form shows, else the note.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsUnavailable), nameof(CanAdd))]
    private bool isAvailable;

    public bool IsUnavailable => !IsAvailable;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsEmpty))]
    private IReadOnlyList<TraktSyncRow> rows = [];

    public bool IsEmpty => Rows.Count == 0;

    [ObservableProperty]
    private string link = "";

    [ObservableProperty]
    private bool newMovies = true;

    [ObservableProperty]
    private bool newTv = true;

    /// <summary>"Also request what's on it now": off by default, so only what's added from now on is requested.</summary>
    [ObservableProperty]
    private bool requestExisting;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(AddLabel), nameof(CanAdd))]
    private bool isAdding;

    /// <summary>A failed add (the server's words: a private list, already synced, the limit).</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasError))]
    private string? error;

    public bool HasError => Error != null;
    public string AddLabel => IsAdding ? Loc.Get("Trakt_Adding") : Loc.Get("Trakt_KeepInSync");
    public bool CanAdd => IsAvailable && !IsAdding;

    private Guid? ViewerId => model.Viewer?.Id;
    private bool IsAdmin => model.Viewer?.IsAdmin == true;

    /// <summary>
    /// <c>GET /trakt-syncs</c> (the admin's <c>?all=true</c>). A 404 (an older
    /// server) hides the card; any other failure keeps what's shown.
    /// </summary>
    public async Task LoadAsync()
    {
        loadCancellation?.Cancel();
        var cancellation = new CancellationTokenSource();
        loadCancellation = cancellation;
        var token = cancellation.Token;
        try
        {
            var syncs = await model.Api.TraktSyncs.ListAsync(all: IsAdmin, token);
            if (token.IsCancellationRequested)
            {
                return;
            }
            if (syncs == null)
            {
                IsVisible = false;
                Rows = [];
                return;
            }
            Apply(syncs);
            IsVisible = true;
        }
        catch (ApiException)
        {
            // Cancelled, or it failed: keep what's shown.
        }
    }

    public void Cancel() => loadCancellation?.Cancel();

    private void Apply(TraktSyncs syncs)
    {
        IsAvailable = syncs.Available;
        var viewer = ViewerId;
        Rows = syncs.Results
            .Select((sync, index) => new TraktSyncRow(this, sync, viewer, index > 0))
            .ToList();
    }

    /// <summary>"Keep in sync" (<c>POST /trakt-syncs</c>): the list is read once straight away; the form clears on success.</summary>
    [RelayCommand]
    private async Task AddAsync()
    {
        if (!CanAdd)
        {
            return;
        }
        var (request, refusal) = TraktSyncLabels.AddRequest(Link, NewMovies, NewTv, RequestExisting);
        if (request == null)
        {
            Error = refusal;
            return;
        }
        IsAdding = true;
        Error = null;
        try
        {
            await model.Api.TraktSyncs.AddAsync(request);
            Link = "";
            RequestExisting = false;
            await LoadAsync();
        }
        catch (ApiException failure)
        {
            Error = failure.Message;
        }
        finally
        {
            IsAdding = false;
        }
    }

    /// <summary>A switch flipped: <c>PATCH /trakt-syncs/{id}</c> with just that kind; a refusal puts it back.</summary>
    internal async Task SetTypesAsync(TraktSyncRow row, bool? movies, bool? tv)
    {
        if (!row.CanChange)
        {
            row.Show(row.Sync);
            return;
        }
        row.IsChanging = true;
        row.Error = null;
        try
        {
            row.Show(await model.Api.TraktSyncs.SetTypesAsync(row.Sync.Id, movies, tv));
        }
        catch (ApiException failure)
        {
            row.Error = failure.Message;
            row.Show(row.Sync);
        }
        finally
        {
            row.IsChanging = false;
        }
    }

    /// <summary>"Check now" (<c>POST /trakt-syncs/{id}/sync</c>), answering once the check is done; 429 says to wait a minute.</summary>
    internal async Task CheckAsync(TraktSyncRow row)
    {
        if (!row.CanChange)
        {
            return;
        }
        row.IsChecking = true;
        row.Error = null;
        try
        {
            row.Show(await model.Api.TraktSyncs.SyncAsync(row.Sync.Id));
        }
        catch (ApiException failure)
        {
            row.Error = failure.Message;
        }
        finally
        {
            row.IsChecking = false;
        }
    }

    /// <summary>"Remove" (<c>DELETE /trakt-syncs/{id}</c>) once confirmed: syncing stops, its requests stay.</summary>
    internal async Task RemoveAsync(TraktSyncRow row)
    {
        if (!row.CanChange || RemovePrompt is not { } confirm || !await confirm(row))
        {
            return;
        }
        row.IsChanging = true;
        row.Error = null;
        try
        {
            await model.Api.TraktSyncs.RemoveAsync(row.Sync.Id);
        }
        catch (ApiException failure) when (failure.Kind != ApiErrorKind.NotFound)
        {
            // A 404 means it's gone already: just re-read.
            row.Error = failure.Message;
            row.IsChanging = false;
            return;
        }
        await LoadAsync();
    }
}
