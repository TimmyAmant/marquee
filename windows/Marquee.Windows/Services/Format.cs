using System.Globalization;
using System.Text;

namespace Marquee.Windows.Services;

/// <summary>
/// The date labels the pages print, in the viewer's language (the Mac's
/// <c>Format.shortDate</c> and the website's <c>toLocaleDateString</c>).
/// Timestamps are shown in local time; calendar dates (<see cref="DateOnly"/>)
/// have no time zone and are printed as they are.
/// </summary>
public static class Format
{
    /// <summary>"Sep 17, 2026": the request tables' Requested column.</summary>
    public static string ShortDate(DateTimeOffset moment) =>
        moment.ToLocalTime().ToString("MMM d, yyyy", CultureInfo.CurrentCulture);

    /// <summary>"Sep 17, 2026 4:03 PM": Settings › Activity's timestamps (the Mac's <c>Format.dateTime</c>).</summary>
    public static string DateAndTime(DateTimeOffset moment)
    {
        var local = moment.ToLocalTime();
        return $"{local.ToString("MMM d, yyyy", CultureInfo.CurrentCulture)} {local.ToString("t", CultureInfo.CurrentCulture)}";
    }

    /// <summary>"September 2, 1964": a person's birthday.</summary>
    public static string LongDate(DateOnly day) => day.ToString("MMMM d, yyyy", CultureInfo.CurrentCulture);

    /// <summary>"Sep 2, 1964": an episode's air date.</summary>
    public static string MediumDate(DateOnly day) => day.ToString("MMM d, yyyy", CultureInfo.CurrentCulture);

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

    /// <summary>"3 titles", "1 credit": a count with its noun, the website's list header.</summary>
    public static string Count(int count, string singular, string plural)
    {
        var builder = new StringBuilder();
        builder.Append(count.ToString(CultureInfo.CurrentCulture));
        builder.Append(' ');
        builder.Append(count == 1 ? singular : plural);
        return builder.ToString();
    }
}
