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

        Assert.Equal(5, jobs.Count);
        Assert.Equal([JobId.PlexSync, JobId.JellyfinSync, JobId.ArrSync, JobId.DiskSpaceSnapshot, JobId.Cleanup], jobs.Select(job => job.Id));
        Assert.All(jobs, job => Assert.True(job.Id.IsKnown));

        var arrSync = jobs[2];
        Assert.Equal("Sonarr/Radarr Sync", arrSync.Name);
        Assert.Equal("Every hour", arrSync.Schedule);
        Assert.Equal("Refreshes tracked/monitored status from every connected Sonarr and Radarr instance.", arrSync.Description);
        Assert.Equal("Daily at 3:00 AM", jobs[3].Schedule);
        Assert.Equal("Daily at 3:30 AM", jobs[4].Schedule);
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
        Assert.Equal("cleanup", JobId.Cleanup.ToString());
        Assert.Equal(5, JobId.Known.Count);
    }
}
