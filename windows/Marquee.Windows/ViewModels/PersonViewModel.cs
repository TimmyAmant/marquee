using System.ComponentModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Windows.Services;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;

namespace Marquee.Windows.ViewModels;

/// <summary>
/// app/person/[id]/page.tsx + components/person-header.tsx: the photo, the
/// bio line and the filmography as a filterable grid. Reloads on F5 and
/// when the library or favorites moved on the server.
/// </summary>
public sealed partial class PersonViewModel : ObservableObject
{
    public const string ErrorTitle = "Couldn't load this person";
    public const string EmptyCredits = "No processed filmography found for this person yet.";

    /// <summary>Where the Mac cuts a long biography.</summary>
    public const int BiographyLimit = 600;

    private readonly AppModel model;
    private CancellationTokenSource? loadCancellation;
    private bool active;
    private Uri? photoUrl;
    private ImageSource? photo;

    [ObservableProperty]
    private bool isLoading;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsError))]
    [NotifyPropertyChangedFor(nameof(ShowsInlineError))]
    private string? errorMessage;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasPerson))]
    [NotifyPropertyChangedFor(nameof(ShowsError))]
    [NotifyPropertyChangedFor(nameof(ShowsInlineError))]
    [NotifyPropertyChangedFor(nameof(Name))]
    [NotifyPropertyChangedFor(nameof(LifeLine))]
    [NotifyPropertyChangedFor(nameof(HasLifeLine))]
    [NotifyPropertyChangedFor(nameof(Biography))]
    [NotifyPropertyChangedFor(nameof(HasBiography))]
    [NotifyPropertyChangedFor(nameof(Photo))]
    [NotifyPropertyChangedFor(nameof(HasPhoto))]
    private PersonDetail? person;

    [ObservableProperty]
    private MediaListViewModel? credits;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(FavoriteGlyph))]
    [NotifyPropertyChangedFor(nameof(FavoriteLabel))]
    private bool isFavorited;

    [ObservableProperty]
    private bool isTogglingFavorite;

    public PersonViewModel(AppModel model)
    {
        this.model = model;
    }

    /// <summary>The person this page shows; 0 until <see cref="Activate"/> says which.</summary>
    public int TmdbId { get; private set; }

    public bool HasPerson => Person != null;
    public bool ShowsError => ErrorMessage != null && !HasPerson;

    /// <summary>A failure (a star that didn't stick) while the page is up: a bar in the header, not the empty state.</summary>
    public bool ShowsInlineError => ErrorMessage != null && HasPerson;
    public string Name => Person?.Name ?? "";

    /// <summary>"Born September 2, 1964 · Beirut, Lebanon", with "Died …" when it applies.</summary>
    public string LifeLine => Person is { } current
        ? string.Join(" · ", new[]
        {
            current.Birthday is { } born ? $"Born {Format.LongDate(born)}" : null,
            current.Deathday is { } died ? $"Died {Format.LongDate(died)}" : null,
            current.PlaceOfBirth.NonBlank(),
        }.OfType<string>())
        : "";

    public bool HasLifeLine => LifeLine.Length > 0;
    public string Biography => Person?.Biography.NonBlank() is { } text ? Format.Truncate(text, BiographyLimit) : "";
    public bool HasBiography => Biography.Length > 0;
    public bool HasPhoto => photoUrl != null;
    public ImageSource? Photo => photoUrl == null ? null : photo ??= new BitmapImage(photoUrl);
    public string FavoriteGlyph => FavoriteGlyphs.For(IsFavorited);
    public string FavoriteLabel => FavoriteGlyphs.Label(IsFavorited);

    // MARK: Lifecycle

    /// <summary>The page is on screen for <paramref name="tmdbId"/>: follow reloads and fetch (once).</summary>
    public void Activate(int tmdbId)
    {
        if (active && tmdbId == TmdbId)
        {
            return;
        }
        if (active)
        {
            Deactivate();
        }
        if (tmdbId != TmdbId)
        {
            TmdbId = tmdbId;
            photoUrl = null;
            photo = null;
            Credits = null;
            IsFavorited = false;
            ErrorMessage = null;
            Person = null;
        }
        active = true;
        model.PropertyChanged += OnModelPropertyChanged;
        model.Events.Changed += OnServerChanged;
        if (Person == null)
        {
            _ = LoadAsync();
        }
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

        IsLoading = Person == null;
        ErrorMessage = null;
        try
        {
            var fresh = await model.Api.People.DetailAsync(TmdbId, token);
            if (token.IsCancellationRequested)
            {
                return;
            }
            photoUrl = fresh.ProfilePath.Url(ImageSize.W342);
            photo = null;
            IsFavorited = fresh.Favorited;
            Credits = new MediaListViewModel(model, fresh.Credits, "credit", "credits", EmptyCredits);
            Person = fresh;
        }
        catch (ApiException error)
        {
            if (error.IsCancellation || token.IsCancellationRequested)
            {
                return;
            }
            if (Person == null)
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

    // MARK: Actions

    /// <summary>The star next to the name: an explicit PUT or DELETE, flipped at once and back on failure.</summary>
    [RelayCommand]
    private async Task ToggleFavoriteAsync()
    {
        if (IsTogglingFavorite || Person == null)
        {
            return;
        }
        var wanted = !IsFavorited;
        IsTogglingFavorite = true;
        IsFavorited = wanted;
        try
        {
            IsFavorited = await model.Api.Favorites.SetAsync(wanted, FavoriteEntityType.Person, TmdbId);
        }
        catch (ApiException error)
        {
            IsFavorited = !wanted;
            ErrorMessage = error.Message;
        }
        finally
        {
            IsTogglingFavorite = false;
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
        if (e.Source != ServerChangeSource.Server || (e.Change & (ServerChange.Library | ServerChange.Favorites)) == ServerChange.None)
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
