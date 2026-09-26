using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// HouseholdMember.lastActiveAt (api-v1.md section 11) and the website's
// lastActiveLabel (lib/users/last-active-label.ts) at each threshold.

public sealed class LastActiveTests
{
    private static readonly DateTimeOffset Now = Json.ParseDate("2026-09-25T18:42:10.000Z")!.Value;

    private static string Label(TimeSpan ago) => LastActiveLabel.Format(Now - ago, Now, TimeZoneInfo.Utc);

    [Fact]
    public void FixtureCarriesLastActive()
    {
        var member = Fixtures.Decode<HouseholdMember>("household-member");

        Assert.True(member.ReportsLastActive);
        Assert.Equal(Now, member.LastActiveAt);
        Assert.Equal("Active now", member.LastActiveLine(Now));
    }

    [Fact]
    public void PresentNullIsNeverSignedIn()
    {
        var json = Fixtures.Read("household-member")
            .Replace("\"lastActiveAt\": \"2026-09-25T18:42:10.000Z\"", "\"lastActiveAt\": null", StringComparison.Ordinal);
        Assert.Contains("\"lastActiveAt\": null", json, StringComparison.Ordinal);
        var member = Json.Decode<HouseholdMember>(json);

        Assert.True(member.ReportsLastActive);
        Assert.Null(member.LastActiveAt);
        Assert.Equal("Never signed in", member.LastActiveLine(Now));
    }

    [Fact]
    public void OlderServerShowsNothing()
    {
        var json = Fixtures.Read("household-member")
            .Replace("\"lastActiveAt\": \"2026-09-25T18:42:10.000Z\"", "\"legacy\": 0", StringComparison.Ordinal);
        Assert.DoesNotContain("lastActiveAt", json, StringComparison.Ordinal);
        var member = Json.Decode<HouseholdMember>(json);

        Assert.False(member.ReportsLastActive);
        Assert.Null(member.LastActiveAt);
        Assert.Null(member.LastActiveLine(Now));
    }

    [Fact]
    public void UserListCarriesLastActive()
    {
        var member = Assert.Single(Fixtures.Decode<ListResponse<HouseholdMember>>("users").Results);

        Assert.True(member.ReportsLastActive);
    }

    [Fact]
    public void NeverSignedIn() => Assert.Equal("Never signed in", LastActiveLabel.Format(null, Now));

    [Fact]
    public void ActiveNowUnderTenMinutes()
    {
        Assert.Equal("Active now", Label(TimeSpan.Zero));
        Assert.Equal("Active now", Label(TimeSpan.FromMinutes(10) - TimeSpan.FromSeconds(1)));
        // A clock slightly behind the server's.
        Assert.Equal("Active now", Label(TimeSpan.FromMinutes(-3)));
    }

    [Fact]
    public void MinutesUnderAnHour()
    {
        Assert.Equal("Active 10 minutes ago", Label(TimeSpan.FromMinutes(10)));
        Assert.Equal("Active 25 minutes ago", Label(TimeSpan.FromMinutes(25) + TimeSpan.FromSeconds(40)));
        Assert.Equal("Active 59 minutes ago", Label(TimeSpan.FromHours(1) - TimeSpan.FromSeconds(1)));
    }

    [Fact]
    public void HoursUnderADay()
    {
        Assert.Equal("Active 1 hour ago", Label(TimeSpan.FromHours(1)));
        Assert.Equal("Active 1 hour ago", Label(TimeSpan.FromMinutes(119)));
        Assert.Equal("Active 2 hours ago", Label(TimeSpan.FromHours(2)));
        Assert.Equal("Active 23 hours ago", Label(TimeSpan.FromDays(1) - TimeSpan.FromSeconds(1)));
    }

    [Fact]
    public void YesterdayUnderTwoDays()
    {
        Assert.Equal("Active yesterday", Label(TimeSpan.FromDays(1)));
        Assert.Equal("Active yesterday", Label(TimeSpan.FromDays(2) - TimeSpan.FromSeconds(1)));
    }

    [Fact]
    public void DaysUnderThirty()
    {
        Assert.Equal("Active 2 days ago", Label(TimeSpan.FromDays(2)));
        Assert.Equal("Active 6 days ago", Label(TimeSpan.FromDays(6.5)));
        Assert.Equal("Active 29 days ago", Label(TimeSpan.FromDays(30) - TimeSpan.FromSeconds(1)));
    }

    [Fact]
    public void DateFromThirtyDays()
    {
        Assert.Equal("Last active Aug 26, 2026", Label(TimeSpan.FromDays(30)));
        var july4 = Json.ParseDate("2026-07-04T12:00:00.000Z")!.Value;
        Assert.Equal("Last active Jul 4, 2026", LastActiveLabel.Format(july4, Now, TimeZoneInfo.Utc));
    }

    [Fact]
    public void DateIsInTheGivenZone()
    {
        var lateUtc = Json.ParseDate("2026-07-05T02:00:00.000Z")!.Value;
        var behindUtc = TimeZoneInfo.CreateCustomTimeZone("UTC-4", TimeSpan.FromHours(-4), "UTC-4", "UTC-4");

        Assert.Equal("Last active Jul 5, 2026", LastActiveLabel.Format(lateUtc, Now, TimeZoneInfo.Utc));
        Assert.Equal("Last active Jul 4, 2026", LastActiveLabel.Format(lateUtc, Now, behindUtc));
    }
}
