using System.Globalization;

namespace Marquee.Core.Models;

/// <summary>
/// The fill of the "MOVIE" / "SERIES" corner pill on a poster (the Mac's
/// PosterCard: a solid blue pill for a movie, magenta for anything else).
/// </summary>
public enum TypeBadgeStyle
{
    /// <summary>Blue, <c>#2563EB</c>.</summary>
    Movie,

    /// <summary>Magenta, <c>#C026D3</c>.</summary>
    Series,
}

/// <summary>
/// What a poster card draws in its top corners, the same as the Mac's
/// PosterCard: the media type pill (or, on the Movies/Series grid, the
/// rating chip) top-left, and the library status pill top-right.
/// </summary>
public static class PosterBadges
{
    /// <summary>"MOVIE" / "SERIES"; a type this app doesn't know, upper-cased (the Mac's <c>typeLabel</c>).</summary>
    public static string TypeLabel(MediaType mediaType)
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

    /// <summary>Blue for a movie, magenta for everything else, as the Mac picks it from the label.</summary>
    public static TypeBadgeStyle TypeBadgeStyle(MediaType mediaType) =>
        mediaType == MediaType.Movie ? Models.TypeBadgeStyle.Movie : Models.TypeBadgeStyle.Series;

    /// <summary>
    /// The rating chip's number, "7.9", or null for no chip: an unrated title
    /// (null or 0) shows none. Always a point, like the Mac's <c>%.1f</c>.
    /// </summary>
    public static string? RatingLabel(double? rating) =>
        rating is > 0 and var value ? value.ToString("0.0", CultureInfo.InvariantCulture) : null;
}
