namespace Marquee.Core.Models;

// Discover's picture tiles: the Studios/Networks logo cards
// (components/logo-card.tsx, the Mac's LogoCard) and the genre cards
// (components/genre-card.tsx, the Mac's GenreCard), reduced to what a
// tile draws. Also the small logo a studio chip shows elsewhere
// (components/studio-chip.tsx, the Mac's StudioChip).

/// <summary>Which of Discover's tile designs a <see cref="ShelfTile"/> uses.</summary>
public enum ShelfTileKind
{
    /// <summary>A studio or network: its logo on white, or the name when there is none.</summary>
    Logo,

    /// <summary>A genre: its name over a tinted backdrop.</summary>
    Genre,
}

/// <summary>One picture tile in a Discover rail.</summary>
public sealed record ShelfTile
{
    public required ShelfTileKind Kind { get; init; }

    /// <summary>The TMDb id: a company, a network or a genre.</summary>
    public required int Id { get; init; }

    public required string Name { get; init; }

    /// <summary>The logo (w500) or the backdrop (w780); null draws the fallback.</summary>
    public Uri? ImageUrl { get; init; }

    /// <summary>
    /// A genre tile's color as <c>0xRRGGBB</c>, drawn under the backdrop
    /// (or alone without one); null for a logo tile.
    /// </summary>
    public uint? Tint { get; init; }
}

public static class ShelfTiles
{
    /// <summary>genre-card.tsx's GENRE_COLORS (Tailwind's 700/800/900 shades), by TMDb genre id.</summary>
    private static readonly Dictionary<int, uint> GenreColors = new()
    {
        [28] = 0x991B1B, // Action
        [10759] = 0x991B1B, // Action & Adventure (tv)
        [12] = 0x6B21A8, // Adventure
        [16] = 0x0F766E, // Animation
        [35] = 0xA16207, // Comedy
        [80] = 0x1E3A8A, // Crime
        [99] = 0x065F46, // Documentary
        [18] = 0x334155, // Drama
        [10751] = 0x0369A1, // Family
        [14] = 0x3730A3, // Fantasy
        [36] = 0x92400E, // History
        [27] = 0x262626, // Horror
        [10402] = 0x9D174D, // Music
        [9648] = 0x4C1D95, // Mystery
        [10749] = 0x9F1239, // Romance
        [878] = 0x155E75, // Science Fiction
        [10765] = 0x155E75, // Sci-Fi & Fantasy (tv)
        [10770] = 0x44403C, // TV Movie
        [53] = 0x7C2D12, // Thriller
        [10752] = 0x27272A, // War
        [10768] = 0x27272A, // War & Politics (tv)
        [37] = 0x713F12, // Western
        [10762] = 0x3F6212, // Kids
        [10763] = 0x1E40AF, // News
        [10764] = 0x86198F, // Reality
        [10766] = 0x881337, // Soap
        [10767] = 0x115E59, // Talk
    };

    /// <summary>genre-card.tsx's FALLBACK_PALETTE, cycled by position for a genre not listed.</summary>
    private static readonly uint[] FallbackColors = [0x991B1B, 0x6B21A8, 0x0F766E, 0xA16207, 0x1E3A8A, 0x065F46];

    /// <summary>A genre tile's color: its own, or the fallback palette at <paramref name="index"/> (its place in the rail).</summary>
    public static uint GenreTint(int genreId, int index) =>
        GenreColors.TryGetValue(genreId, out var color) ? color : FallbackColors[Math.Abs(index) % FallbackColors.Length];

    public static ShelfTile Tile(this CompanyCard studio) => new()
    {
        Kind = ShelfTileKind.Logo,
        Id = studio.TmdbId,
        Name = studio.Name,
        ImageUrl = studio.LogoPath.Url(ImageSize.W500),
    };

    public static ShelfTile Tile(this NetworkCard network) => new()
    {
        Kind = ShelfTileKind.Logo,
        Id = network.TmdbId,
        Name = network.Name,
        ImageUrl = network.LogoPath.Url(ImageSize.W500),
    };

    /// <param name="index">The tile's place in its rail, for the fallback color.</param>
    public static ShelfTile Tile(this GenreTile genre, int index) => new()
    {
        Kind = ShelfTileKind.Genre,
        Id = genre.Id,
        Name = genre.Name,
        ImageUrl = genre.BackdropPath.Url(ImageSize.W780),
        Tint = GenreTint(genre.Id, index),
    };

    /// <summary>A rail of genre tiles, each colored for its place.</summary>
    public static IReadOnlyList<ShelfTile> Tiles(this IEnumerable<GenreTile> genres) =>
        genres.Select((genre, index) => genre.Tile(index)).ToList();

    /// <summary>The small logo a studio chip shows before the name (w185), or null.</summary>
    public static Uri? ChipLogoUrl(this CompanyCard studio) => studio.LogoPath.Url(ImageSize.W185);
}
