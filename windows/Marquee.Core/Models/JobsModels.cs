namespace Marquee.Core.Models;

// Settings, Jobs (api-v1.md section 13). Mirrors
// mac/Marquee/API/Models/JobsModels.swift.

/// <summary>A scheduled maintenance job ("Run now" is <c>Jobs.RunAsync(job.Id)</c>).</summary>
public sealed record Job
{
    /// <summary>
    /// <c>plex-sync</c>, <c>jellyfin-sync</c>, <c>arr-sync</c>,
    /// <c>plex-watchlist</c>, <c>disk-space-snapshot</c>, <c>cleanup</c>. Open: a job a newer server
    /// adds still lists and runs, the app just can't name it.
    /// </summary>
    public required JobId Id { get; init; }

    public required string Name { get; init; }

    /// <summary>"Every hour", "Daily at 3:00 AM".</summary>
    public required string Schedule { get; init; }

    public required string Description { get; init; }

    /// <summary>0.58+ (null from an older server, which can't change it): how often it runs.</summary>
    public JobInterval? Interval { get; init; }

    public JobInterval? DefaultInterval { get; init; }

    /// <summary>When it runs on its own next (0.58+).</summary>
    public DateTimeOffset? NextRunAt { get; init; }

    /// <summary>When it last finished since the server started (0.58+); null before its first run.</summary>
    public DateTimeOffset? LastRunAt { get; init; }

    /// <summary>Running now (0.58+).</summary>
    public bool? Running { get; init; }
}
