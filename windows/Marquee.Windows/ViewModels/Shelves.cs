using System.Windows.Input;
using Marquee.Core.Models;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;

namespace Marquee.Windows.ViewModels;

/// <summary>Which palette a status badge draws itself in (components/status-badge.tsx's color groups).</summary>
public enum BadgeTone
{
    Owned,
    Tracked,
    Neutral,
}

/// <summary>
/// One poster tile's worth of a <see cref="TitleCard"/>, shaped for
/// <c>PosterCard</c>'s bindings: the strings are final, the status is
/// already a tone, and the poster is an <see cref="ImageSource"/>.
///
/// Immutable, so lists built from one server answer never change under the
/// ItemsRepeater; a page that learns a title's status changed rebuilds the
/// item. <see cref="Poster"/> is created lazily because a <c>BitmapImage</c>
/// is a UI object: it is only ever asked for by a binding, on the UI thread.
/// </summary>
public sealed class PosterItem
{
    private readonly Uri? posterUrl;
    private ImageSource? poster;

    /// <param name="open">Runs with this item as its parameter when the card is clicked.</param>
    /// <param name="showsTypeLabel">The "MOVIE" / "SERIES" corner pill, for rows that mix both.</param>
    public PosterItem(TitleCard card, ICommand? open, bool showsTypeLabel = false)
    {
        Id = card.Id;
        Name = card.Name;
        Year = card.Year.NonBlank();
        Subtitle = card.Subtitle.NonBlank();
        FooterLine = card.FooterLine;
        TypeLabel = showsTypeLabel ? TypeLabelFor(card.MediaType) : null;
        // A status this version of the app doesn't know renders no badge
        // rather than a raw wire value, like the Mac's StatusBadge.
        Status = card.Status is { IsKnown: true } status ? status : null;
        posterUrl = card.PosterPath.Url(ImageSize.W342);
        Open = open;
    }

    public TitleId Id { get; }
    public string Name { get; }
    public string? Year { get; }
    public string? Subtitle { get; }

    /// <summary>"Neo · 1999", or empty.</summary>
    public string FooterLine { get; }

    /// <summary>"MOVIE" / "SERIES", or null when the row is a single media type.</summary>
    public string? TypeLabel { get; }

    public LibraryStatus? Status { get; }

    public string? StatusLabel => Status?.CompactLabel;

    public BadgeTone? Tone => Status is { } status ? ToneFor(status) : null;

    public bool IsOwnedTone => Tone == BadgeTone.Owned;
    public bool IsTrackedTone => Tone == BadgeTone.Tracked;
    public bool IsNeutralTone => Tone == BadgeTone.Neutral;

    public bool HasPoster => posterUrl != null;

    /// <summary>The w342 poster, created on first use (UI thread only).</summary>
    public ImageSource? Poster => posterUrl == null ? null : poster ??= new BitmapImage(posterUrl);

    /// <summary>What a screen reader says for the whole card: "The Matrix, 1999, Already in your library".</summary>
    public string AccessibleName => string.Join(", ", new[] { Name, Year, Status?.Label }.OfType<string>());

    /// <summary>The click action; null makes the card inert.</summary>
    public ICommand? Open { get; }

    public static string TypeLabelFor(MediaType mediaType)
    {
        if (mediaType == MediaType.Movie)
        {
            return "MOVIE";
        }
        if (mediaType == MediaType.Tv)
        {
            return "SERIES";
        }
        return mediaType.Value.ToUpperInvariant();
    }

    public static BadgeTone ToneFor(LibraryStatus status)
    {
        if (status == LibraryStatus.Owned)
        {
            return BadgeTone.Owned;
        }
        if (status == LibraryStatus.TrackedDownloading || status == LibraryStatus.TrackedMonitored)
        {
            return BadgeTone.Tracked;
        }
        return BadgeTone.Neutral;
    }
}

/// <summary>How a <see cref="ChipItem"/> draws itself.</summary>
public enum ChipKind
{
    /// <summary>A pill with the name, and a small logo first when there is one (studio-chip.tsx).</summary>
    Chip,

    /// <summary>Discover's Studios/Networks tile: the logo on white (logo-card.tsx, <c>LogoTile</c>).</summary>
    Logo,

    /// <summary>Discover's genre tile: the name over a tinted backdrop (genre-card.tsx, <c>GenreTile</c>).</summary>
    Genre,
}

/// <summary>
/// A labelled button in a rail: a genre, a studio, a network. On Discover
/// it is a picture tile (<see cref="ChipKind.Logo"/>, <see cref="ChipKind.Genre"/>);
/// elsewhere a chip, with the studio's logo when it has one.
///
/// Like <see cref="PosterItem"/>, the image and the tint brush are created
/// lazily, on the UI thread, by the binding that asks for them.
/// </summary>
public sealed class ChipItem
{
    private readonly Uri? imageUrl;
    private readonly uint? tint;
    private ImageSource? image;
    private Brush? tintBrush;

    /// <param name="imageUrl">A studio chip's small logo (<c>CompanyCard.ChipLogoUrl()</c>).</param>
    public ChipItem(string label, ICommand open, Uri? imageUrl = null)
    {
        Label = label;
        Open = open;
        Kind = ChipKind.Chip;
        this.imageUrl = imageUrl;
    }

    /// <summary>A Discover tile, from Core's <see cref="ShelfTiles"/> mapping.</summary>
    public ChipItem(ShelfTile tile, ICommand open)
    {
        Label = tile.Name;
        Open = open;
        Kind = tile.Kind == ShelfTileKind.Genre ? ChipKind.Genre : ChipKind.Logo;
        imageUrl = tile.ImageUrl;
        tint = tile.Tint;
    }

    public string Label { get; }
    public ICommand Open { get; }
    public ChipKind Kind { get; }

    public bool HasImage => imageUrl != null;

    /// <summary>The logo or backdrop, created on first use (UI thread only).</summary>
    public ImageSource? Image => imageUrl == null ? null : image ??= new BitmapImage(imageUrl);

    /// <summary>A genre tile's color, under the backdrop; transparent for anything else.</summary>
    public Brush TintBrush => tintBrush ??= new SolidColorBrush(tint is { } rgb
        ? global::Windows.UI.Color.FromArgb(0xFF, (byte)(rgb >> 16), (byte)(rgb >> 8), (byte)rgb)
        : global::Microsoft.UI.Colors.Transparent);
}

/// <summary>
/// One horizontal rail on Discover: a title and either posters or chips.
/// <c>DiscoverPage</c> shows whichever list is non-empty, and draws chips
/// as the tiles their <see cref="ChipItem.Kind"/> names.
/// </summary>
public sealed class ShelfViewModel
{
    private ShelfViewModel(string title, IReadOnlyList<PosterItem> posters, IReadOnlyList<ChipItem> chips, ICommand? seeAll)
    {
        Title = title;
        Posters = posters;
        Chips = chips;
        SeeAll = seeAll;
    }

    public string Title { get; }
    public IReadOnlyList<PosterItem> Posters { get; }
    public IReadOnlyList<ChipItem> Chips { get; }

    /// <summary>"See all" in the rail header; null hides the link.</summary>
    public ICommand? SeeAll { get; }

    public bool HasPosters => Posters.Count > 0;

    /// <summary>Plain chips: a rail whose first chip is neither a logo nor a genre tile.</summary>
    public bool HasChips => Chips.Count > 0 && Chips[0].Kind == ChipKind.Chip;

    /// <summary>Studios / Networks: white logo tiles.</summary>
    public bool HasLogoTiles => Chips.Count > 0 && Chips[0].Kind == ChipKind.Logo;

    /// <summary>Movie / Series Genres: backdrop tiles.</summary>
    public bool HasGenreTiles => Chips.Count > 0 && Chips[0].Kind == ChipKind.Genre;

    public bool HasSeeAll => SeeAll != null;

    public static ShelfViewModel OfPosters(string title, IReadOnlyList<PosterItem> posters, ICommand? seeAll = null) =>
        new(title, posters, [], seeAll);

    public static ShelfViewModel OfChips(string title, IReadOnlyList<ChipItem> chips, ICommand? seeAll = null) =>
        new(title, [], chips, seeAll);
}
