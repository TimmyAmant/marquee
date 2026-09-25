using System.Globalization;
using System.Text.Json;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// The section 9 example decoded as the Mac's APIFixtureTests decodes it
// (testCalendarGrid), plus the CalendarMonth value ported from
// testCalendarDayAndMonth. Grid days are DateOnly here, so the day-arithmetic
// half of that Swift test is covered by the grid walk rather than a type of
// our own.

public sealed class CalendarFixtureTests
{
    [Fact]
    public void CalendarGridDecodes()
    {
        var calendar = Fixtures.Decode<CalendarMonthResponse>("calendar");

        Assert.True(calendar.Configured);
        Assert.Equal("2026-09", calendar.Month.ToString());
        Assert.Equal(new CalendarMonth(2026, 8), calendar.PrevMonth);
        Assert.Equal(new CalendarMonth(2026, 10), calendar.NextMonth);
        Assert.Equal(new DateOnly(2026, 8, 30), calendar.GridStart);
        Assert.Equal(new DateOnly(2026, 10, 3), calendar.GridEnd);
        Assert.Equal(new DateOnly(2026, 9, 17), calendar.Today);
        Assert.Equal("America/New_York", calendar.TimeZone);

        Assert.Equal(35, calendar.GridDays.Count);
        Assert.Equal("2026-08-30", Json.FormatCalendarDate(calendar.GridDays[0]));
        Assert.Equal("2026-10-03", Json.FormatCalendarDate(calendar.GridDays[^1]));
        Assert.Equal(DayOfWeek.Sunday, calendar.GridDays[0].DayOfWeek);
        Assert.Equal(DayOfWeek.Saturday, calendar.GridDays[^1].DayOfWeek);

        var severance = new DateOnly(2026, 9, 18);
        Assert.Equal(["S03E02"], calendar.EntriesByDay[severance].Select(entry => entry.Subtitle));
        Assert.False(calendar.EntriesByDay.ContainsKey(new DateOnly(2026, 9, 19)));
        Assert.Equal(calendar.Entries.Count, calendar.Entries.Select(entry => entry.Id).Distinct().Count());
    }

    [Fact]
    public void EntriesDecode()
    {
        var calendar = Fixtures.Decode<CalendarMonthResponse>("calendar");

        Assert.Equal(2, calendar.Entries.Count);
        var episode = calendar.Entries[0];
        Assert.Equal(new DateOnly(2026, 9, 18), episode.Date);
        Assert.Equal(MediaType.Tv, episode.MediaType);
        Assert.Equal(95396, episode.TmdbId);
        Assert.Equal("Severance", episode.Name);
        Assert.Equal("https://image.tmdb.org/t/p/w342/pPHp.jpg", episode.PosterPath.Url(ImageSize.W342)?.AbsoluteUri);
        Assert.Equal("S03E02", episode.Subtitle);
        Assert.Equal("2026-09-18|tv|95396|S03E02", episode.Id);
        Assert.Equal(new TitleId(MediaType.Tv, 95396), episode.TitleId);

        var release = calendar.Entries[1];
        Assert.Equal(MediaType.Movie, release.MediaType);
        Assert.Equal("Digital release", release.Subtitle);
        Assert.Equal("2026-09-22|movie|1061474|Digital release", release.Id);
    }

    [Fact]
    public void SameMovieOnOneDayForTwoReleaseTypesHasDistinctIds()
    {
        var calendar = Fixtures.Decode<CalendarMonthResponse>("calendar");
        var digital = calendar.Entries[1];
        var disc = digital with { Subtitle = "On disc" };

        Assert.NotEqual(digital.Id, disc.Id);
        Assert.Equal(digital.TitleId, disc.TitleId);
    }

    [Fact]
    public void NotConfiguredDecodesWithNoEntries()
    {
        var calendar = Json.Decode<CalendarMonthResponse>("""
            {"configured":false,"month":"2026-09","gridStart":"2026-08-30","gridEnd":"2026-10-03","today":"2026-09-17",
             "prevMonth":"2026-08","nextMonth":"2026-10","timeZone":"UTC","entries":[]}
            """);

        Assert.False(calendar.Configured);
        Assert.Empty(calendar.Entries);
        Assert.Empty(calendar.EntriesByDay);
        Assert.Equal(35, calendar.GridDays.Count);
    }

    [Fact]
    public void GridWalkIsCappedAtSixWeeks()
    {
        // A grid that ends before it starts is empty, and one the server got
        // wrong can't grow past the six rows the website ever draws.
        var calendar = Fixtures.Decode<CalendarMonthResponse>("calendar");
        Assert.Empty((calendar with { GridEnd = calendar.GridStart.AddDays(-1) }).GridDays);
        Assert.Equal(42, (calendar with { GridEnd = calendar.GridStart.AddDays(400) }).GridDays.Count);
    }

    [Fact]
    public void MalformedGridDayFailsDecoding()
    {
        // Grid days are always present, so a blank one is a broken response
        // (the lenient reader is for optional release dates only).
        var json = Fixtures.Read("calendar").Replace("\"gridStart\": \"2026-08-30\"", "\"gridStart\": \"\"", StringComparison.Ordinal);
        Assert.Throws<JsonException>(() => Json.Decode<CalendarMonthResponse>(json));
    }

    [Fact]
    public void CalendarMonthParsesTheWireFormatOnly()
    {
        var month = CalendarMonth.Parse("2026-09");
        Assert.Equal(2026, month.Year);
        Assert.Equal(9, month.Month);
        Assert.Equal(new DateOnly(2026, 9, 1), month.FirstDay);
        Assert.Equal("2026-09", month.ToString());

        Assert.False(CalendarMonth.TryParse("2026-9", out _));
        Assert.False(CalendarMonth.TryParse("2026-00", out _));
        Assert.False(CalendarMonth.TryParse("2026-13", out _));
        Assert.False(CalendarMonth.TryParse("2026-09-17", out _));
        Assert.False(CalendarMonth.TryParse("0000-01", out _));
        Assert.False(CalendarMonth.TryParse("+026-09", out _));
        Assert.False(CalendarMonth.TryParse("", out _));
        Assert.False(CalendarMonth.TryParse(null, out _));
        Assert.Throws<FormatException>(() => CalendarMonth.Parse("September 2026"));
    }

    [Fact]
    public void CalendarMonthValidatesItsParts()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => new CalendarMonth(2026, 0));
        Assert.Throws<ArgumentOutOfRangeException>(() => new CalendarMonth(2026, 13));
        Assert.Throws<ArgumentOutOfRangeException>(() => new CalendarMonth(0, 1));
        Assert.Equal("0001-01", new CalendarMonth(1, 1).ToString());
        Assert.Equal("2027-01", new CalendarMonth(2027, 1).ToString());
    }

    [Fact]
    public void CalendarMonthOrdersAndCompares()
    {
        var august = new CalendarMonth(2026, 8);
        var september = new CalendarMonth(2026, 9);
        var lastDecember = new CalendarMonth(2025, 12);

        // A second September built the other way, so the equal-month
        // comparisons below really go through the operators.
        var alsoSeptember = CalendarMonth.Parse("2026-09");

        Assert.True(august < september);
        Assert.True(lastDecember < august);
        Assert.True(september >= alsoSeptember);
        Assert.True(september <= alsoSeptember);
        Assert.False(september > alsoSeptember);
        Assert.False(september < alsoSeptember);
        Assert.Equal(0, september.CompareTo(alsoSeptember));
        Assert.Equal(september, alsoSeptember);
        Assert.Equal(september, CalendarMonth.Of(new DateOnly(2026, 9, 17)));
        Assert.Equal([lastDecember, august, september], new[] { september, lastDecember, august }.Order());
    }

    [Fact]
    public void CalendarMonthRoundTripsThroughJson()
    {
        var holder = Json.Decode<MonthHolder>("""{"month":"2026-09","optional":null}""");
        Assert.Equal(new CalendarMonth(2026, 9), holder.Month);
        Assert.Null(holder.Optional);

        Assert.Equal("""{"month":"2026-09","optional":"2025-12"}""",
            JsonSerializer.Serialize(new MonthHolder { Month = holder.Month, Optional = new CalendarMonth(2025, 12) }, Json.Options));

        Assert.Throws<JsonException>(() => Json.Decode<MonthHolder>("""{"month":"2026-9","optional":null}"""));
        Assert.Throws<JsonException>(() => Json.Decode<MonthHolder>("""{"month":202609,"optional":null}"""));
    }

    [Fact]
    public void CalendarMonthLabelIsTheWebsitesHeading()
    {
        Assert.Equal("September 2026", new CalendarMonth(2026, 9).LabelIn(CultureInfo.InvariantCulture));
        Assert.Equal("January 2027", new CalendarMonth(2027, 1).LabelIn(CultureInfo.GetCultureInfo("en-US")));
    }

    private sealed record MonthHolder
    {
        public required CalendarMonth Month { get; init; }
        public CalendarMonth? Optional { get; init; }
    }
}
