using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// The section 13 example decoded as the Mac's APIFixtureTests decodes it.

public sealed class JobsFixtureTests
{
    [Fact]
    public void JobsDecode()
    {
        var jobs = Fixtures.Decode<ListResponse<Job>>("jobs").Results;

        Assert.Equal(7, jobs.Count);
        Assert.Equal([JobId.PlexSync, JobId.JellyfinSync, JobId.ArrSync, JobId.PlexWatchlist, JobId.NotFoundCheck, JobId.DiskSpaceSnapshot, JobId.Cleanup], jobs.Select(job => job.Id));
        Assert.All(jobs, job => Assert.True(job.Id.IsKnown));

        var arrSync = jobs[2];
        Assert.Equal("Sonarr/Radarr Sync", arrSync.Name);
        Assert.Equal("Every hour", arrSync.Schedule);
        Assert.Equal("Refreshes tracked/monitored status from every connected Sonarr and Radarr instance.", arrSync.Description);
        Assert.Equal("Plex Watchlist Requests", jobs[3].Name);
        Assert.Equal("Every 10 minutes", jobs[3].Schedule);
        Assert.Equal("Can't Find Check", jobs[4].Name);
        Assert.Equal("Every hour", jobs[4].Schedule);
        Assert.Equal("Daily at 3:00 AM", jobs[5].Schedule);
        Assert.Equal("Daily at 3:30 AM", jobs[6].Schedule);
    }

    [Fact]
    public void NotFoundSettingsDecode()
    {
        var settings = Fixtures.Decode<NotFoundSettings>("not-found-settings");
        Assert.Equal(24, settings.AfterHours);
        Assert.Equal(1, NotFoundSettings.MinAfterHours);
        Assert.Equal(720, NotFoundSettings.MaxAfterHours);
    }

    [Fact]
    public void AJobThisVersionDoesNotKnowStillDecodes()
    {
        var json = Fixtures.Read("jobs").Replace("\"id\": \"arr-sync\"", "\"id\": \"index-rebuild\"", StringComparison.Ordinal);
        var jobs = Json.Decode<ListResponse<Job>>(json).Results;

        var unknown = jobs[2];
        Assert.Equal("index-rebuild", unknown.Id.Value);
        Assert.False(unknown.Id.IsKnown);
        Assert.Equal("index-rebuild", MarqueeApi.Segment(unknown.Id));
    }

    [Fact]
    public void JobIdsAreTheirPathSegments()
    {
        Assert.Equal("plex-sync", MarqueeApi.Segment(JobId.PlexSync));
        Assert.Equal("disk-space-snapshot", MarqueeApi.Segment(JobId.DiskSpaceSnapshot));
        Assert.Equal("plex-watchlist", MarqueeApi.Segment(JobId.PlexWatchlist));
        Assert.Equal("cleanup", JobId.Cleanup.ToString());
        Assert.Equal("not-found-check", MarqueeApi.Segment(JobId.NotFoundCheck));
        Assert.Equal(7, JobId.Known.Count);
    }
}
