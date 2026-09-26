using System.ComponentModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Windows.Services;

namespace Marquee.Windows.ViewModels;

/// <summary>
/// app/favorites/page.tsx: one call, five sections (Movies, TV Shows,
/// Collections, People, Studios). Reloads after any favorite changed, this
/// app's own stars included, so an unstarred person leaves the list.
/// </summary>
public sealed partial class FavoritesViewModel : ObservableObject
{
    public const string ErrorTitle = "Couldn't load your favorites";
    public const string EmptyTitle = "Nothing favorited yet";
    public const string EmptyMessage = "Star anything from its page or card to see it here.";

    private readonly AppModel model;
    private CancellationTokenSource? loadCancellation;
    private bool active;

    [ObservableProperty]
    private bool isLoading;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsError))]
    private string? errorMessage;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsError))]
    private bool hasAnswer;

    [ObservableProperty]
    private bool isEmpty;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasMovies))]
    private IReadOnlyList<PosterItem> movies = [];

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasTv))]
    private IReadOnlyList<PosterItem> tv = [];

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasCollections))]
    private IReadOnlyList<CollectionItem> collections = [];

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasPeople))]
    private IReadOnlyList<PersonItem> people = [];

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasStudios))]
    private IReadOnlyList<ChipItem> studios = [];

    public FavoritesViewModel(AppModel model)
    {
        this.model = model;
    }

    public bool ShowsError => ErrorMessage != null && !HasAnswer;
    public bool HasMovies => Movies.Count > 0;
    public bool HasTv => Tv.Count > 0;
    public bool HasCollections => Collections.Count > 0;
    public bool HasPeople => People.Count > 0;
    public bool HasStudios => Studios.Count > 0;

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
    }

    // MARK: Loading

    [RelayCommand]
    private async Task LoadAsync()
    {
        loadCancellation?.Cancel();
        var cancellation = new CancellationTokenSource();
        loadCancellation = cancellation;
        var token = cancellation.Token;

        IsLoading = !HasAnswer;
        ErrorMessage = null;
        try
        {
            var fresh = await model.Api.Favorites.AllAsync(token);
            if (token.IsCancellationRequested)
            {
                return;
            }
            Movies = fresh.Movies.Select(card => new PosterItem(model, card, OpenTitleCommand)).ToList();
            Tv = fresh.Tv.Select(card => new PosterItem(model, card, OpenTitleCommand)).ToList();
            Collections = fresh.Collections.Select(collection => new CollectionItem(model, collection)).ToList();
            // A person on this page is favorited by definition; the server's flag is only null on older answers.
            People = fresh.People
                .Select(person => new PersonItem(model, person.TmdbId, person.Name, person.KnownForDepartment, person.ProfilePath, person.Favorited ?? true))
                .ToList();
            Studios = fresh.Studios
                .Select(studio => new ChipItem(studio.Name, new RelayCommand(() => model.OpenCompany(studio.TmdbId))))
                .ToList();
            IsEmpty = fresh.IsEmpty;
            HasAnswer = true;
        }
        catch (ApiException error)
        {
            if (error.IsCancellation || token.IsCancellationRequested)
            {
                return;
            }
            if (!HasAnswer)
            {
                ErrorMessage = error.Message;
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

    [RelayCommand]
    private void OpenTitle(PosterItem? item)
    {
        if (item != null)
        {
            model.OpenTitle(item.Id);
        }
    }

    // MARK: Reload triggers

    private void OnModelPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(AppModel.ReloadToken))
        {
            _ = LoadAsync();
        }
    }

    private void OnServerChanged(object? sender, ServerChangedEventArgs e)
    {
        var favoritesChanged = e.Change.HasFlag(ServerChange.Favorites);
        var libraryMovedOnServer = e.Source == ServerChangeSource.Server && e.Change.HasFlag(ServerChange.Library);
        if (!favoritesChanged && !libraryMovedOnServer)
        {
            return;
        }
        model.Dispatcher.TryEnqueue(() =>
        {
            if (active)
            {
                _ = LoadAsync();
            }
        });
    }
}
