using Marquee.Core.Models;

namespace Marquee.Core.Api;

/// <summary>
/// Which notifications get a system banner (a Windows notification), for
/// the app's notification center: only unread ones newer than the newest
/// already shown, and never one the account turned device banners off for
/// (<c>alert: false</c>, 0.45+), which stays in the bell only.
/// </summary>
public static class NotificationBanners
{
    /// <summary>A live one from the stream: banner-worthy unless read, already covered by <paramref name="watermark"/>, or not an alert.</summary>
    public static bool ShowsLive(NotificationItem item, DateTimeOffset? watermark) =>
        item.Alert && !item.Read && (watermark is not { } last || item.CreatedAt > last);

    /// <summary>
    /// A catch-up after (re)connecting: the unread alerts newer than
    /// <paramref name="watermark"/> and not yet shown this run, oldest first,
    /// at most the newest <paramref name="max"/> of them.
    /// </summary>
    public static IReadOnlyList<NotificationItem> CatchUp(
        IEnumerable<NotificationItem> results,
        DateTimeOffset watermark,
        IReadOnlySet<Guid> alreadyShown,
        int max)
    {
        var missed = results
            .Where(item => item.Alert && !item.Read && item.CreatedAt > watermark && !alreadyShown.Contains(item.Id))
            .OrderBy(item => item.CreatedAt)
            .ToList();
        return max <= 0 ? [] : missed.TakeLast(max).ToList();
    }
}
