using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Marquee.Core.Models;

// The calendar (api-v1.md section 9). Grid days and entry dates are DateOnly:
// a "YYYY-MM-DD" has no time or time zone, so converting it to a timestamp
// would shift it a day for anyone west of UTC (the Mac keeps them as
// CalendarDay for the same reason). The month is its own value because
// "2026-09" is both a response field and the ?month= query.

/// <summary>
/// <c>GET /calendar</c>: one month's Sunday-to-Saturday grid (server local
/// time). Upcoming Radarr releases and Sonarr episode air dates from the
/// library owner's connections.
/// </summary>
public sealed record CalendarMonthResponse
{
    /// <summary>
    /// False (and <see cref="Entries"/> empty) when neither Sonarr nor Radarr
    /// is connected. Admin: "Connect Sonarr or Radarr to see upcoming
    /// releases and air dates here." with a link to Integrations; member:
    /// "The household admin hasn't connected Sonarr or Radarr yet."
    /// </summary>
    public required bool Configured { get; init; }

    public required CalendarMonth Month { get; init; }

    /// <summary>The grid's first Sunday.</summary>
    public required DateOnly GridStart { get; init; }

    /// <summary>The grid's last Saturday.</summary>
    public required DateOnly GridEnd { get; init; }

    /// <summary>Today in the server's time zone.</summary>
    public required DateOnly Today { get; init; }

    public required CalendarMonth PrevMonth { get; init; }
    public required CalendarMonth NextMonth { get; init; }

    /// <summary>The server's IANA time zone, e.g. "America/New_York".</summary>
    public required string TimeZone { get; init; }

    /// <summary>Sorted by date; a movie can appear once per matching release type.</summary>
    public required IReadOnlyList<CalendarEntry> Entries { get; init; }

    /// <summary>Every day of the grid, <see cref="GridStart"/> through <see cref="GridEnd"/> (at most six weeks).</summary>
    public IReadOnlyList<DateOnly> GridDays
    {
        get
        {
            var days = new List<DateOnly>(42);
            // Capped like the Mac: a server answer with the grid ends the
            // wrong way round must not produce an endless (or huge) grid.
            for (var day = GridStart; day <= GridEnd && days.Count < 42; day = day.AddDays(1))
            {
                days.Add(day);
                // AddDays past the last representable date throws.
                if (day == DateOnly.MaxValue) break;
            }
            return days;
        }
    }

    /// <summary>Entries keyed by day, in the server's order. The website shows at most 4 per day ("+N more").</summary>
    public IReadOnlyDictionary<DateOnly, IReadOnlyList<CalendarEntry>> EntriesByDay =>
        Entries
            .GroupBy(entry => entry.Date)
            .ToDictionary(group => group.Key, group => (IReadOnlyList<CalendarEntry>)group.ToList());
}

public sealed record CalendarEntry
{
    public required DateOnly Date { get; init; }
    public required MediaType MediaType { get; init; }
    public required int TmdbId { get; init; }
    public required string Name { get; init; }
    public ImageRef? PosterPath { get; init; }

    /// <summary>"S01E03", "In theaters", "Digital release" or "On disc".</summary>
    public required string Subtitle { get; init; }

    /// <summary>
    /// Unique within a month: a title can appear on several days, and a
    /// movie twice on one day for different release types.
    /// </summary>
    public string Id => $"{Json.FormatCalendarDate(Date)}|{MediaType.Value}|{TmdbId}|{Subtitle}";

    public TitleId TitleId => new(MediaType, TmdbId);
}

/// <summary>
/// A <c>"YYYY-MM"</c> month: the calendar's <c>month</c>, <c>prevMonth</c>,
/// <c>nextMonth</c> and its <c>?month=</c> query. Strict on the wire, like
/// the Mac's <c>CalendarMonth</c>: <c>"2026-9"</c> is not a month.
/// </summary>
[JsonConverter(typeof(CalendarMonthConverter))]
public readonly record struct CalendarMonth : IComparable<CalendarMonth>
{
    public int Year { get; }
    public int Month { get; }

    /// <exception cref="ArgumentOutOfRangeException">A month outside 1..12, or a year <see cref="DateOnly"/> can't hold (1..9999).</exception>
    public CalendarMonth(int year, int month)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(month, 1);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(month, 12);
        ArgumentOutOfRangeException.ThrowIfLessThan(year, 1);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(year, 9999);
        Year = year;
        Month = month;
    }

    /// <summary>The month <paramref name="day"/> falls in.</summary>
    public static CalendarMonth Of(DateOnly day) => new(day.Year, day.Month);

    /// <summary>This month on this machine's clock, what the calendar opens on before the server answers.</summary>
    public static CalendarMonth Current => Of(DateOnly.FromDateTime(DateTime.Now));

    /// <summary>Exactly <c>"YYYY-MM"</c>, four digits, a dash, two digits.</summary>
    public static bool TryParse(string? text, out CalendarMonth month)
    {
        month = default;
        if (text is not { Length: 7 } || text[4] != '-')
        {
            return false;
        }
        if (!int.TryParse(text.AsSpan(0, 4), NumberStyles.None, CultureInfo.InvariantCulture, out var year)
            || !int.TryParse(text.AsSpan(5, 2), NumberStyles.None, CultureInfo.InvariantCulture, out var number)
            || number is < 1 or > 12 || year < 1)
        {
            return false;
        }
        month = new CalendarMonth(year, number);
        return true;
    }

    /// <exception cref="FormatException">Not a <c>"YYYY-MM"</c> month.</exception>
    public static CalendarMonth Parse(string text) =>
        TryParse(text, out var month) ? month : throw new FormatException($"Expected a YYYY-MM month, got \"{text}\".");

    public DateOnly FirstDay => new(Year, Month, 1);

    /// <summary>"September 2026", in the viewer's language.</summary>
    public string Label => LabelIn(CultureInfo.CurrentCulture);

    /// <inheritdoc cref="Label"/>
    public string LabelIn(CultureInfo culture) => FirstDay.ToString("MMMM yyyy", culture);

    /// <summary>The wire format, <c>"2026-09"</c>.</summary>
    public override string ToString() => string.Create(CultureInfo.InvariantCulture, $"{Year:D4}-{Month:D2}");

    public int CompareTo(CalendarMonth other) => (Year, Month).CompareTo((other.Year, other.Month));

    public static bool operator <(CalendarMonth left, CalendarMonth right) => left.CompareTo(right) < 0;
    public static bool operator >(CalendarMonth left, CalendarMonth right) => left.CompareTo(right) > 0;
    public static bool operator <=(CalendarMonth left, CalendarMonth right) => left.CompareTo(right) <= 0;
    public static bool operator >=(CalendarMonth left, CalendarMonth right) => left.CompareTo(right) >= 0;
}

/// <summary>A <see cref="CalendarMonth"/> is a bare <c>"YYYY-MM"</c> string on the wire; anything else fails the response.</summary>
public sealed class CalendarMonthConverter : JsonConverter<CalendarMonth>
{
    public override CalendarMonth Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType != JsonTokenType.String)
        {
            throw new JsonException($"Expected a YYYY-MM month string, got {reader.TokenType}.");
        }
        var text = reader.GetString()!;
        return CalendarMonth.TryParse(text, out var month) ? month : throw new JsonException($"Expected a YYYY-MM month, got \"{text}\".");
    }

    public override void Write(Utf8JsonWriter writer, CalendarMonth value, JsonSerializerOptions options) =>
        writer.WriteStringValue(value.ToString());
}
