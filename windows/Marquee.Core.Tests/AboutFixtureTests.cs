using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// The section 14 examples decoded as the Mac's APIFixtureTests decodes them
// (the changelog day in testSettingsShapes), plus the labels the website
// derives from them.

public sealed class AboutFixtureTests
{
    [Fact]
    public void AboutDecodes()
    {
        var about = Fixtures.Decode<AboutInfo>("about");

        Assert.Equal("0.22.0", about.Version);
        Assert.Equal("v0.22.0", about.VersionLabel);
        Assert.Equal(812, about.MovieCount);
        Assert.Equal(143, about.TvCount);
        Assert.Equal(37, about.TrackedCount);
        Assert.Equal(58, about.TotalRequests);
        Assert.Equal("America/New_York", about.TimeZone);
        Assert.Equal("https://github.com/TimmyAmant/marquee", about.RepoUrl);
        Assert.Equal("https://github.com/TimmyAmant/marquee/issues", about.IssuesUrl);
        Assert.Equal("github.com", about.RepoUri?.Host);
        Assert.Equal("/TimmyAmant/marquee/issues", about.IssuesUri?.AbsolutePath);
        Assert.Null((about with { RepoUrl = "" }).RepoUri);
    }

    [Fact]
    public void ChangelogDecodes()
    {
        var changelog = Fixtures.Decode<ListResponse<ChangelogEntry>>("changelog").Results;
        var release = Assert.Single(changelog);

        Assert.Equal("0.22.0", release.Version);
        Assert.Equal("Release v0.22.0", release.Label);
        Assert.Equal(new DateOnly(2026, 9, 17), release.Date);
        Assert.Equal("Added a versioned JSON API at /api/v1 …", Assert.Single(release.Changes));
    }

    [Fact]
    public void AChangelogEntryWithoutADateFailsToDecode()
    {
        // The contract always sends a release day; a blank one is a broken
        // response, not a release with no date.
        var json = Fixtures.Read("changelog").Replace("\"date\": \"2026-09-17\"", "\"date\": \"\"", StringComparison.Ordinal);
        Assert.Throws<System.Text.Json.JsonException>(() => Json.Decode<ListResponse<ChangelogEntry>>(json));
    }

    [Fact]
    public void DaysAgoMatchesTheWebsite()
    {
        var release = Assert.Single(Fixtures.Decode<ListResponse<ChangelogEntry>>("changelog").Results);

        // Whole days since UTC midnight of the release day, as the browser counts them.
        Assert.Equal("Today", release.DaysAgo(new DateTimeOffset(2026, 9, 17, 0, 0, 0, TimeSpan.Zero)));
        Assert.Equal("Today", release.DaysAgo(new DateTimeOffset(2026, 9, 17, 23, 59, 0, TimeSpan.Zero)));
        Assert.Equal("1 day ago", release.DaysAgo(new DateTimeOffset(2026, 9, 18, 9, 30, 0, TimeSpan.Zero)));
        Assert.Equal("12 days ago", release.DaysAgo(new DateTimeOffset(2026, 9, 29, 12, 0, 0, TimeSpan.Zero)));
        // A viewer whose local day is still the 16th: the offset is honored, not the wall clock.
        Assert.Equal("Today", release.DaysAgo(new DateTimeOffset(2026, 9, 16, 22, 0, 0, TimeSpan.FromHours(-5))));
        // A release dated in the future (a server clock ahead of ours) never reads as negative.
        Assert.Equal("Today", release.DaysAgo(new DateTimeOffset(2026, 9, 10, 0, 0, 0, TimeSpan.Zero)));
    }
}
