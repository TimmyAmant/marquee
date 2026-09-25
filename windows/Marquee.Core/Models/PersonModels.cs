using System.Globalization;

namespace Marquee.Core.Models;

// Person and studio pages (api-v1.md section 5). Their list controls (sort,
// type filter, title search, grid/table) are client-side: see
// TitleListOrder. The cards they are built from (TitleCard) are the shared
// shapes in DiscoverModels.cs.

/// <summary><c>GET /people/{tmdbId}</c>.</summary>
public sealed record PersonDetail
{
    public required int TmdbId { get; init; }
    public required string Name { get; init; }
    public required IReadOnlyList<string> AlsoKnownAs { get; init; }
    public string? Biography { get; init; }

    /// <summary>A calendar date with no time zone; TMDb sends <c>""</c> for an unknown one, which reads as null.</summary>
    public DateOnly? Birthday { get; init; }

    public DateOnly? Deathday { get; init; }
    public string? PlaceOfBirth { get; init; }
    public ImageRef? ProfilePath { get; init; }
    public required bool Favorited { get; init; }

    /// <summary>
    /// The acting filmography (<c>Subtitle</c> = character) with status,
    /// favorites and quick-add. Empty: "No processed filmography found for
    /// this person yet."
    /// </summary>
    public required IReadOnlyList<TitleCard> Credits { get; init; }

    public int Id => TmdbId;

    /// <summary>Age today, or at death. Null without a birthday.</summary>
    public int? Age => AgeOn(DateOnly.FromDateTime(DateTime.Now));

    /// <summary>
    /// Whole years from the birthday to the death day, or to
    /// <paramref name="today"/> while the person is alive. Split out from
    /// <see cref="Age"/> so it can be tested against a fixed day.
    /// </summary>
    public int? AgeOn(DateOnly today)
    {
        if (Birthday is not { } born)
        {
            return null;
        }
        var end = Deathday ?? today;
        var years = end.Year - born.Year;
        // Not yet had this year's birthday: compare month and day rather
        // than adding years to the birthday, which would move a February 29
        // birthday to March 1 and count the day early.
        if (end.Month < born.Month || (end.Month == born.Month && end.Day < born.Day))
        {
            years--;
        }
        return years;
    }
}

/// <summary><c>GET /companies/{tmdbId}</c>.</summary>
public sealed record CompanyDetail
{
    /// <summary>Where the website cuts a long description.</summary>
    public const int DescriptionLimit = 400;

    public required int TmdbId { get; init; }
    public required string Name { get; init; }
    public string? Description { get; init; }
    public ImageRef? LogoPath { get; init; }

    /// <summary>"{titleCount} titles in the catalog".</summary>
    public required int TitleCount { get; init; }

    public required bool Favorited { get; init; }

    /// <summary>With status, favorited and canQuickAdd. Empty: "No titles found for this studio yet."</summary>
    public required IReadOnlyList<TitleCard> Titles { get; init; }

    public int Id => TmdbId;

    /// <summary>The website truncates the description at 400 characters; null for a blank one.</summary>
    public string? ShortDescription =>
        Description.NonBlank() is { } text ? Truncate(text, DescriptionLimit) : null;

    /// <summary>
    /// The first <paramref name="limit"/> characters plus an ellipsis, as the
    /// Mac's <c>String.truncated(to:)</c>. Counted in text elements, so a
    /// cut never lands inside an emoji or a combining sequence.
    /// </summary>
    private static string Truncate(string text, int limit)
    {
        var info = new StringInfo(text);
        if (info.LengthInTextElements <= limit)
        {
            return text;
        }
        return info.SubstringByTextElements(0, limit).Trim() + "…";
    }
}

/// <summary>The person/studio list's client-side sorts.</summary>
public enum TitleListOrder
{
    /// <summary>By year, unknown years last (the website's default).</summary>
    NewestFirst,

    OldestFirst,
    Alphabetical,
}

public static class TitleListOrderExtensions
{
    public static IReadOnlyList<TitleListOrder> All { get; } = [TitleListOrder.NewestFirst, TitleListOrder.OldestFirst, TitleListOrder.Alphabetical];

    public static string Label(this TitleListOrder order) => order switch
    {
        TitleListOrder.NewestFirst => "Newest first",
        TitleListOrder.OldestFirst => "Oldest first",
        TitleListOrder.Alphabetical => "A–Z",
        _ => order.ToString(),
    };

    /// <summary>
    /// Sorted the way the person/studio list offers. LINQ's ordering is
    /// stable, so cards with equal keys (the same year, or no year at all)
    /// keep the server's order, like the Mac's index-tiebreak sort.
    /// </summary>
    public static IReadOnlyList<TitleCard> SortedBy(this IEnumerable<TitleCard> cards, TitleListOrder order)
    {
        switch (order)
        {
            case TitleListOrder.Alphabetical:
                // The website's A–Z ignores case, like Finder's sort on the Mac.
                return cards.OrderBy(card => card.Name, StringComparer.CurrentCultureIgnoreCase).ToList();
            case TitleListOrder.OldestFirst:
                return cards
                    .OrderBy(HasNoYear)
                    .ThenBy(YearKey, StringComparer.Ordinal)
                    .ToList();
            default:
                return cards
                    .OrderBy(HasNoYear)
                    .ThenByDescending(YearKey, StringComparer.Ordinal)
                    .ToList();
        }
    }

    // Years are four-digit strings ("1999"), so ordinal string order is
    // chronological; a blank one sorts after every real year in both directions.
    private static bool HasNoYear(TitleCard card) => card.Year.NonBlank() == null;

    private static string YearKey(TitleCard card) => card.Year.NonBlank() ?? "";
}
