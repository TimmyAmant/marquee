using System.Windows.Input;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Windows.Services;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;

namespace Marquee.Windows.ViewModels;

// The small display items the pages share besides PosterItem (Shelves.cs):
// a person card, a collection card, a link pill, a fact row, a search
// suggestion. Like PosterItem, each holds final strings and creates its
// BitmapImage lazily on the UI thread.

/// <summary>Segoe Fluent glyphs for the favorite star, so the pages agree on one pair.</summary>
public static class FavoriteGlyphs
{
    public const string Filled = "";
    public const string Outline = "";

    public static string For(bool favorited) => favorited ? Filled : Outline;

    /// <summary>What a screen reader calls the star.</summary>
    public static string Label(bool favorited) => favorited ? "Remove from favorites" : "Add to favorites";
}

/// <summary>The tones the badge palette has, from a request's <c>statusTone</c> (requests/page.tsx's myRequestBadge).</summary>
public static class RequestToneExtensions
{
    public static BadgeTone ToBadgeTone(this RequestTone tone)
    {
        if (tone == RequestTone.Owned)
        {
            return BadgeTone.Owned;
        }
        if (tone == RequestTone.Pending || tone == RequestTone.Downloading || tone == RequestTone.Approved)
        {
            return BadgeTone.Tracked;
        }
        return BadgeTone.Neutral;
    }
}

/// <summary>
/// A person tile (search results, a title's cast, favorites): photo, name,
/// a subtitle (the known-for department or the character) and the star.
/// Observable because the star flips in place; the rest never changes.
/// </summary>
public sealed partial class PersonItem : ObservableObject
{
    private readonly AppModel model;
    private readonly Uri? photoUrl;
    private ImageSource? photo;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(FavoriteGlyph))]
    [NotifyPropertyChangedFor(nameof(FavoriteLabel))]
    private bool isFavorited;

    [ObservableProperty]
    private bool isTogglingFavorite;

    /// <param name="favorited">Null where the list shows no star (Discover has none).</param>
    public PersonItem(AppModel model, int tmdbId, string name, string? subtitle, ImageRef? profilePath, bool? favorited)
    {
        this.model = model;
        TmdbId = tmdbId;
        Name = name;
        Subtitle = subtitle.NonBlank();
        photoUrl = profilePath.Url(ImageSize.W342);
        CanFavorite = favorited != null;
        IsFavorited = favorited == true;
        Open = new RelayCommand(() => model.OpenPerson(tmdbId));
    }

    public int TmdbId { get; }
    public string Name { get; }
    public string? Subtitle { get; }

    /// <summary>The star is only drawn where the website draws one.</summary>
    public bool CanFavorite { get; }

    public bool HasPhoto => photoUrl != null;

    /// <summary>The w342 profile photo, created on first use (UI thread only).</summary>
    public ImageSource? Photo => photoUrl == null ? null : photo ??= new BitmapImage(photoUrl);

    public string FavoriteGlyph => FavoriteGlyphs.For(IsFavorited);
    public string FavoriteLabel => FavoriteGlyphs.Label(IsFavorited);

    public ICommand Open { get; }

    /// <summary>
    /// The star: an explicit PUT or DELETE (not toggle), so two quick clicks
    /// can't flip each other back. Flips at once like the website's star and
    /// flips back if the server refused.
    /// </summary>
    [RelayCommand]
    private async Task ToggleFavoriteAsync()
    {
        if (IsTogglingFavorite || !CanFavorite)
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
        catch (ApiException)
        {
            IsFavorited = !wanted;
        }
        finally
        {
            IsTogglingFavorite = false;
        }
    }
}

/// <summary>A favorited TMDb collection: the card opens its earliest movie.</summary>
public sealed class CollectionItem
{
    private readonly Uri? posterUrl;
    private ImageSource? poster;

    public CollectionItem(AppModel model, FavoriteCollection collection)
    {
        Name = collection.Name;
        posterUrl = collection.PosterPath.Url(ImageSize.W342);
        var first = collection.FirstMovieTmdbId;
        // A collection with no movies has nowhere to go; the card is inert.
        Open = first is { } tmdbId ? new RelayCommand(() => model.OpenTitle(MediaType.Movie, tmdbId)) : null;
    }

    public string Name { get; }
    public bool HasPoster => posterUrl != null;
    public ImageSource? Poster => posterUrl == null ? null : poster ??= new BitmapImage(posterUrl);
    public ICommand? Open { get; }
}

/// <summary>
/// A pill that opens a web page: "▶ Trailer", "IMDb", "GitHub". Only https
/// links are ever handed to the browser (see <see cref="ExternalLinks"/>),
/// so a pill for anything else is left out by the page that builds it.
/// </summary>
public sealed class LinkItem
{
    public LinkItem(string label, Uri url)
    {
        Label = label;
        Url = url;
        Open = new AsyncRelayCommand(async () =>
        {
            await ExternalLinks.OpenAsync(url);
        });
    }

    public string Label { get; }
    public Uri Url { get; }
    public ICommand Open { get; }

    /// <summary>A pill for <paramref name="url"/>, or null when it isn't an https link the app would open.</summary>
    public static LinkItem? Https(string label, Uri? url) =>
        url != null && ExternalLinks.CanOpen(url) ? new LinkItem(label, url) : null;
}

/// <summary>A label and its value: the title page's facts card, file details and the About rows.</summary>
public sealed record FactRow(string Label, string Value);

/// <summary>A streaming provider's logo in the facts card ("Currently streaming on").</summary>
public sealed class ProviderItem
{
    private readonly Uri? logoUrl;
    private ImageSource? logo;

    public ProviderItem(WatchProvider provider)
    {
        Name = provider.Name;
        logoUrl = provider.LogoPath.Url(ImageSize.W92);
    }

    public string Name { get; }
    public bool HasLogo => logoUrl != null;
    public ImageSource? Logo => logoUrl == null ? null : logo ??= new BitmapImage(logoUrl);
}

/// <summary>One row of the shell's search type-ahead (<c>GET /search/suggest</c>).</summary>
public sealed class SuggestionItem
{
    private readonly Uri? imageUrl;
    private ImageSource? image;

    public SuggestionItem(SearchSuggestion suggestion)
    {
        Suggestion = suggestion;
        Name = suggestion.Name;
        Subtitle = suggestion.Subtitle.NonBlank();
        KindLabel = suggestion.MediaType.Label;
        KindAccessibleLabel = suggestion.KindAccessibleLabel;
        // The poster badge's palette: green in the library, blue downloading
        // or missing; not in the library, a person or an unknown status stays
        // neutral.
        KindTone = suggestion.Status is { IsKnown: true } status ? PosterItem.ToneFor(status) : BadgeTone.Neutral;
        imageUrl = suggestion.PosterPath.Url(ImageSize.W92);
    }

    public SearchSuggestion Suggestion { get; }
    public string Name { get; }
    public string? Subtitle { get; }

    /// <summary>"Actor", "Movie", "TV".</summary>
    public string KindLabel { get; }

    /// <summary>"Movie · In your library", "TV · Downloading", or just "Actor".</summary>
    public string KindAccessibleLabel { get; }

    /// <summary>The kind pill's palette, from the title's library status.</summary>
    public BadgeTone KindTone { get; }

    public bool HasImage => imageUrl != null;
    public ImageSource? Image => imageUrl == null ? null : image ??= new BitmapImage(imageUrl);

    /// <summary>"The Matrix (1999) · Movie · In your library": what a screen reader calls the row.</summary>
    public string AccessibleName =>
        Subtitle == null ? $"{Name} · {KindAccessibleLabel}" : $"{Name} ({Subtitle}) · {KindAccessibleLabel}";

    /// <summary>"The Matrix (1999) · Movie": what the search box shows while the arrow keys pick a suggestion.</summary>
    public override string ToString() =>
        Subtitle == null ? $"{Name} · {KindLabel}" : $"{Name} ({Subtitle}) · {KindLabel}";

    /// <summary>Opens the title or the person; an unknown kind does nothing.</summary>
    public void Open(AppModel model)
    {
        if (Suggestion.TitleId is { } title)
        {
            model.OpenTitle(title);
        }
        else if (Suggestion.MediaType == SuggestionKind.Person)
        {
            model.OpenPerson(Suggestion.Id);
        }
    }
}
