namespace Marquee.Core.Connection;

/// <summary>
/// When to try a saved server again while it's down: the "Waiting for your
/// server to come back…" card (the Mac's ReconnectSchedule). Quick at first
/// (a container restart after an update takes seconds), then steady, and
/// after a couple of minutes it hands over to the can't-reach card.
/// </summary>
public sealed record ReconnectSchedule(IReadOnlyList<TimeSpan> Steps, TimeSpan Interval, TimeSpan Limit)
{
    /// <summary>About 2, 3, 5 s, then every 5 s, for about two minutes.</summary>
    public static readonly ReconnectSchedule Standard = new(
        [TimeSpan.FromSeconds(2), TimeSpan.FromSeconds(3), TimeSpan.FromSeconds(5)],
        TimeSpan.FromSeconds(5),
        TimeSpan.FromMinutes(2));

    /// <summary>
    /// Signed in, and the server stopped answering ("Reconnecting to your
    /// server…"): 1, 2, 3, 5 s, then every 10 s for as long as it takes.
    /// </summary>
    public static readonly ReconnectSchedule SignedIn = new(
        [TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(2), TimeSpan.FromSeconds(3), TimeSpan.FromSeconds(5)],
        TimeSpan.FromSeconds(10),
        TimeSpan.MaxValue);

    /// <summary>
    /// How often the can't-reach card tries again by itself, quietly (no
    /// spinner), so a server that comes back later is picked up without a click.
    /// </summary>
    public static readonly TimeSpan QuietRetryInterval = TimeSpan.FromSeconds(30);

    /// <summary>
    /// The wait before attempt <paramref name="attempt"/> (0 = the first
    /// retry), or null when that attempt would start after
    /// <see cref="Limit"/>: time to stop waiting.
    /// </summary>
    /// <param name="elapsed">Time since the server was first found down.</param>
    public TimeSpan? DelayBeforeAttempt(int attempt, TimeSpan elapsed)
    {
        var wait = attempt < Steps.Count ? Steps[Math.Max(attempt, 0)] : Interval;
        return Limit == TimeSpan.MaxValue || elapsed + wait <= Limit ? wait : null;
    }
}

/// <summary>
/// The waiting card's bookkeeping, apart from any timer or UI so it can be
/// tested: when the outage started, how many automatic attempts were made,
/// and what a new outcome means.
/// </summary>
public sealed class ReconnectTracker(ReconnectSchedule schedule, Func<DateTimeOffset> now)
{
    private DateTimeOffset? started;
    private int attempts;

    public ReconnectTracker(ReconnectSchedule schedule)
        : this(schedule, () => DateTimeOffset.UtcNow)
    {
    }

    public ReconnectSchedule Schedule { get; } = schedule;

    /// <summary>An outage is being waited out (or was, and ran out of time).</summary>
    public bool InOutage => started != null;

    /// <summary>
    /// What to do after an attempt that ended in <paramref name="outcome"/>:
    /// the wait before the next automatic attempt, or null for the
    /// can't-reach card. <paramref name="waiting"/> is whether the waiting
    /// card is up now; once the wait ran out, a failed Retry stays on the
    /// card rather than starting over.
    /// </summary>
    public TimeSpan? Next(ProbeOutcome outcome, bool waiting)
    {
        if (!outcome.IsTemporaryOutage)
        {
            started = null;
            return null;
        }
        if (started == null)
        {
            started = now();
            attempts = 0;
        }
        else if (!waiting)
        {
            return null;
        }
        var delay = Schedule.DelayBeforeAttempt(attempts, now() - started.Value);
        if (delay != null)
        {
            attempts++;
        }
        return delay;
    }

    /// <summary>The server answered, or another one was picked: no more waiting.</summary>
    public void Reset()
    {
        started = null;
        attempts = 0;
    }
}

/// <summary>
/// The signed-in outage's bookkeeping ("Reconnecting to your server…" at the
/// top of the window, the Mac's SignedInOutage), apart from any timer so it
/// can be tested. A call that couldn't reach the server starts checks on
/// <see cref="Schedule"/>; the strip goes up once a check fails too (so one
/// dropped request doesn't flash it), and any answer from the server ends it.
/// </summary>
public sealed class SignedInOutage(ReconnectSchedule schedule)
{
    private int attempts;
    private TimeSpan elapsed;

    public SignedInOutage()
        : this(ReconnectSchedule.SignedIn)
    {
    }

    public ReconnectSchedule Schedule { get; } = schedule;

    /// <summary>Checks are under way.</summary>
    public bool IsChecking { get; private set; }

    /// <summary>A check failed as well: the strip is up.</summary>
    public bool IsReconnecting { get; private set; }

    /// <summary>
    /// A call couldn't reach the server: the wait before the first check, or
    /// null when checks are already under way.
    /// </summary>
    public TimeSpan? Suspect()
    {
        if (IsChecking)
        {
            return null;
        }
        IsChecking = true;
        attempts = 0;
        elapsed = TimeSpan.Zero;
        return Next();
    }

    /// <summary>A check couldn't reach it either: the strip goes up, and the wait before the next check.</summary>
    public TimeSpan? CheckFailed()
    {
        if (!IsChecking)
        {
            return null;
        }
        IsReconnecting = true;
        return Next();
    }

    /// <summary>
    /// The server answered. True when the strip was up, so the pages should
    /// reload what they couldn't load meanwhile.
    /// </summary>
    public bool Answered()
    {
        var wasReconnecting = IsReconnecting;
        IsChecking = false;
        IsReconnecting = false;
        attempts = 0;
        elapsed = TimeSpan.Zero;
        return wasReconnecting;
    }

    private TimeSpan? Next()
    {
        if (Schedule.DelayBeforeAttempt(attempts, elapsed) is not { } wait)
        {
            IsChecking = false;
            return null;
        }
        attempts++;
        elapsed += wait;
        return wait;
    }
}
