using System.Globalization;
using Marquee.Core.Localization;

namespace Marquee.Windows.Services;

/// <summary>
/// The date labels the pages print, in the viewer's language (the Mac's
/// <c>Format.shortDate</c> and the website's <c>toLocaleDateString</c>).
/// Timestamps are shown in local time; calendar dates (<see cref="DateOnly"/>)
/// have no time zone and are printed as they are.
/// </summary>
public static class Format
{
    // The patterns are strings like any other (Format_* in Resources.resw):
    // each language orders day, month and year its own way ("17 sept. 2026",
    // "17. Sep. 2026"), and the culture AppLocalization set supplies the
    // month names.

    /// <summary>"Sep 17, 2026": the request tables' Requested column.</summary>
    public static string ShortDate(DateTimeOffset moment) =>
        moment.ToLocalTime().ToString(Loc.Get("Format_ShortDatePattern"), CultureInfo.CurrentCulture);

    /// <summary>"Sep 17, 2026 4:03 PM": Settings › Activity's timestamps (the Mac's <c>Format.dateTime</c>).</summary>
    public static string DateAndTime(DateTimeOffset moment)
    {
        var local = moment.ToLocalTime();
        return Loc.Format(
            "Format_DateAndTime",
            local.ToString(Loc.Get("Format_ShortDatePattern"), CultureInfo.CurrentCulture),
            local.ToString("t", CultureInfo.CurrentCulture));
    }

    /// <summary>"Sep 26, 3:02 AM": when a comment was written (the website's thread).</summary>
    public static string MonthDayTime(DateTimeOffset moment)
    {
        var local = moment.ToLocalTime();
        return Loc.Format(
            "Format_DayAndTime",
            local.ToString(Loc.Get("Format_MonthDayPattern"), CultureInfo.CurrentCulture),
            local.ToString("t", CultureInfo.CurrentCulture));
    }

    /// <summary>"September 2, 1964": a person's birthday.</summary>
    public static string LongDate(DateOnly day) => day.ToString(Loc.Get("Format_LongDatePattern"), CultureInfo.CurrentCulture);

    /// <summary>"Sep 2, 1964": an episode's air date.</summary>
    public static string MediumDate(DateOnly day) => day.ToString(Loc.Get("Format_ShortDatePattern"), CultureInfo.CurrentCulture);

    /// <summary>
    /// The first <paramref name="limit"/> characters plus an ellipsis, the
    /// Mac's <c>String.truncated(to:)</c>. Counted in text elements so a cut
    /// never lands inside an emoji or a combining sequence.
    /// </summary>
    public static string Truncate(string text, int limit)
    {
        var info = new StringInfo(text);
        if (info.LengthInTextElements <= limit)
        {
            return text;
        }
        return info.SubstringByTextElements(0, limit).Trim() + "…";
    }
}
