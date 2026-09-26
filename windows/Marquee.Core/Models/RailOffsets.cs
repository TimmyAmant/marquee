namespace Marquee.Core.Models;

/// <summary>
/// The arithmetic behind a sideways rail (Discover's shelves and every other
/// horizontal row): where the ‹ › arrows page to, where a touch pan moves the
/// row, and when each arrow is usable. Offsets run from 0 (the start) to the
/// rail's scrollable width (the end), as a ScrollViewer's HorizontalOffset
/// and ScrollableWidth do.
/// </summary>
public static class RailOffsets
{
    /// <summary>How much of the visible width one arrow click moves (shelf.tsx scrolls by 0.8 × clientWidth).</summary>
    public const double PageFraction = 0.85;

    /// <summary>Offsets within this of an end count as at it (shelf.tsx's 1px).</summary>
    public const double EdgeTolerance = 1;

    /// <summary>
    /// A touch pan must travel this far sideways before the row follows it,
    /// so a tap on a poster still opens it.
    /// </summary>
    public const double PanThreshold = 8;

    /// <summary>An offset kept inside the row: never before the start or past the end.</summary>
    public static double Clamp(double offset, double scrollableWidth)
    {
        var end = Math.Max(0, Sanitize(scrollableWidth));
        return Math.Clamp(Sanitize(offset), 0, end);
    }

    /// <summary>Whether the row is wider than the rail, so the arrows show.</summary>
    public static bool Overflows(double scrollableWidth) => Sanitize(scrollableWidth) > EdgeTolerance;

    /// <summary>Whether ‹ has anywhere to go.</summary>
    public static bool CanPageBack(double offset, double scrollableWidth) =>
        Overflows(scrollableWidth) && Sanitize(offset) > EdgeTolerance;

    /// <summary>Whether › has anywhere to go.</summary>
    public static bool CanPageForward(double offset, double scrollableWidth) =>
        Overflows(scrollableWidth) && Sanitize(offset) < Sanitize(scrollableWidth) - EdgeTolerance;

    /// <summary>The distance one arrow click moves: most of the visible width, at least one pixel.</summary>
    public static double PageSize(double viewportWidth) => Math.Max(1, Sanitize(viewportWidth) * PageFraction);

    /// <summary>
    /// Where an arrow click sends the row: a page back (<paramref name="direction"/> &lt; 0)
    /// or forward (&gt; 0) from <paramref name="from"/>, kept inside the row.
    /// </summary>
    public static double PageTarget(double from, int direction, double viewportWidth, double scrollableWidth) =>
        Clamp(from + Math.Sign(direction) * PageSize(viewportWidth), scrollableWidth);

    /// <summary>
    /// Where a touch pan moves the row: a finger moving right (<paramref name="deltaX"/> &gt; 0)
    /// drags the row right, showing what came before, kept inside the row.
    /// </summary>
    public static double PanTarget(double from, double deltaX, double scrollableWidth) =>
        Clamp(from - Sanitize(deltaX), scrollableWidth);

    /// <summary>Whether a pan has gone far enough sideways to move the row rather than count as a tap.</summary>
    public static bool IsPan(double cumulativeX) => Math.Abs(Sanitize(cumulativeX)) >= PanThreshold;

    /// <summary>
    /// Whether a flick's glide has run into an end: the row stopped at the
    /// start while still heading back, or at the end while still heading
    /// forward. The glide stops there instead of pushing against the edge.
    /// </summary>
    public static bool HitEnd(double offset, double deltaX, double scrollableWidth)
    {
        var dx = Sanitize(deltaX);
        if (dx > 0) return Sanitize(offset) <= EdgeTolerance;
        if (dx < 0) return Sanitize(offset) >= Math.Max(0, Sanitize(scrollableWidth)) - EdgeTolerance;
        return false;
    }

    private static double Sanitize(double value) => double.IsFinite(value) ? value : 0;
}
