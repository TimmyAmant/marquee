using Marquee.Core.Connection;

namespace Marquee.Core.Tests;

// "Waiting for your server to come back…": the backoff and the state the
// Windows app's AppModel keeps with it (the Mac's ReconnectTests).

public sealed class ReconnectTests
{
    private static readonly ProbeOutcome Refused = new ProbeOutcome.Unreachable(UnreachableReason.Refused);

    [Fact]
    public void StartsQuickThenSettlesEveryFiveSeconds()
    {
        var schedule = ReconnectSchedule.Standard;
        Assert.Equal(TimeSpan.FromSeconds(2), schedule.DelayBeforeAttempt(0, TimeSpan.Zero));
        Assert.Equal(TimeSpan.FromSeconds(3), schedule.DelayBeforeAttempt(1, TimeSpan.FromSeconds(2)));
        Assert.Equal(TimeSpan.FromSeconds(5), schedule.DelayBeforeAttempt(2, TimeSpan.FromSeconds(5)));
        Assert.Equal(TimeSpan.FromSeconds(5), schedule.DelayBeforeAttempt(3, TimeSpan.FromSeconds(10)));
        Assert.Equal(TimeSpan.FromSeconds(5), schedule.DelayBeforeAttempt(20, TimeSpan.FromSeconds(100)));
    }

    [Fact]
    public void GivesUpAfterAboutTwoMinutes()
    {
        var schedule = ReconnectSchedule.Standard;
        Assert.Equal(TimeSpan.FromSeconds(5), schedule.DelayBeforeAttempt(24, TimeSpan.FromSeconds(115)));
        Assert.Null(schedule.DelayBeforeAttempt(25, TimeSpan.FromSeconds(116)));
        // Even an early attempt stops at the limit.
        Assert.Null(schedule.DelayBeforeAttempt(0, TimeSpan.FromSeconds(119)));
    }

    [Fact]
    public void AttemptsFitTheWindow()
    {
        // Every attempt failing instantly: how many the standard schedule
        // makes before it hands over to the can't-reach card.
        var schedule = ReconnectSchedule.Standard;
        var elapsed = TimeSpan.Zero;
        var attempts = 0;
        while (schedule.DelayBeforeAttempt(attempts, elapsed) is { } wait)
        {
            elapsed += wait;
            attempts++;
        }
        Assert.Equal(25, attempts);
        Assert.Equal(TimeSpan.FromMinutes(2), elapsed);
    }

    [Fact]
    public void AnOutageIsWaitedOutThenHandsOverToTheCard()
    {
        var clock = new DateTimeOffset(2026, 9, 28, 12, 0, 0, TimeSpan.Zero);
        var tracker = new ReconnectTracker(ReconnectSchedule.Standard, () => clock);

        Assert.Equal(TimeSpan.FromSeconds(2), tracker.Next(Refused, waiting: false));
        Assert.True(tracker.InOutage);
        clock += TimeSpan.FromSeconds(2);
        Assert.Equal(TimeSpan.FromSeconds(3), tracker.Next(Refused, waiting: true));
        clock += TimeSpan.FromSeconds(3);
        // A proxy's 502 counts as the same outage.
        Assert.Equal(TimeSpan.FromSeconds(5), tracker.Next(new ProbeOutcome.Unreachable(UnreachableReason.ServerError(502)), waiting: true));

        clock += TimeSpan.FromSeconds(116);
        Assert.Null(tracker.Next(Refused, waiting: true));
        // Waited out: a Retry that fails stays on the card.
        Assert.Null(tracker.Next(Refused, waiting: false));
        Assert.True(tracker.InOutage);

        tracker.Reset();
        Assert.False(tracker.InOutage);
        Assert.Equal(TimeSpan.FromSeconds(2), tracker.Next(Refused, waiting: false));
    }

    [Fact]
    public void OtherProblemsGoStraightToTheCard()
    {
        var tracker = new ReconnectTracker(ReconnectSchedule.Standard);
        Assert.Null(tracker.Next(new ProbeOutcome.NotMarquee(), waiting: false));
        Assert.Null(tracker.Next(new ProbeOutcome.Unreachable(UnreachableReason.UnknownHost), waiting: false));
        Assert.False(tracker.InOutage);
    }

    [Fact]
    public void SignedInChecksNeverGiveUp()
    {
        var schedule = ReconnectSchedule.SignedIn;
        Assert.Equal(TimeSpan.FromSeconds(1), schedule.DelayBeforeAttempt(0, TimeSpan.Zero));
        Assert.Equal(TimeSpan.FromSeconds(5), schedule.DelayBeforeAttempt(3, TimeSpan.FromSeconds(6)));
        Assert.Equal(TimeSpan.FromSeconds(10), schedule.DelayBeforeAttempt(4, TimeSpan.FromSeconds(11)));
        Assert.Equal(TimeSpan.FromSeconds(10), schedule.DelayBeforeAttempt(500, TimeSpan.FromDays(1)));
    }

    [Fact]
    public void TheCantReachCardRetriesEveryThirtySeconds() =>
        Assert.Equal(TimeSpan.FromSeconds(30), ReconnectSchedule.QuietRetryInterval);
}

// "Reconnecting to your server…" while signed in: when the strip goes up and
// comes down (the Mac's SignedInOutageTests).

public sealed class SignedInOutageTests
{
    [Fact]
    public void AFailedCallStartsChecksButShowsNothingYet()
    {
        var outage = new SignedInOutage();
        Assert.Equal(TimeSpan.FromSeconds(1), outage.Suspect());
        Assert.True(outage.IsChecking);
        Assert.False(outage.IsReconnecting);
        // Already checking: another failed call changes nothing.
        Assert.Null(outage.Suspect());
    }

    [Fact]
    public void AFailedCheckPutsTheStripUpAndKeepsChecking()
    {
        var outage = new SignedInOutage();
        outage.Suspect();
        Assert.Equal(TimeSpan.FromSeconds(2), outage.CheckFailed());
        Assert.True(outage.IsReconnecting);
        Assert.Equal(TimeSpan.FromSeconds(3), outage.CheckFailed());
        Assert.Equal(TimeSpan.FromSeconds(5), outage.CheckFailed());
        Assert.Equal(TimeSpan.FromSeconds(10), outage.CheckFailed());
        Assert.Equal(TimeSpan.FromSeconds(10), outage.CheckFailed());
    }

    [Fact]
    public void AnAnswerEndsItAndSaysWhetherToReload()
    {
        var outage = new SignedInOutage();
        outage.Suspect();
        // A blip nobody saw: nothing to reload.
        Assert.False(outage.Answered());
        outage.Suspect();
        outage.CheckFailed();
        Assert.True(outage.Answered());
        Assert.False(outage.IsChecking);
        Assert.False(outage.IsReconnecting);
        // The next outage starts over.
        Assert.Equal(TimeSpan.FromSeconds(1), outage.Suspect());
    }

    [Fact]
    public void ACheckWithoutAnOutageIsIgnored()
    {
        var outage = new SignedInOutage();
        Assert.Null(outage.CheckFailed());
        Assert.False(outage.IsReconnecting);
    }
}
