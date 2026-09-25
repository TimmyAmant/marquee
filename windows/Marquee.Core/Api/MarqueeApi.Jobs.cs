using Marquee.Core.Models;

namespace Marquee.Core.Api;

// Settings, Jobs (api-v1.md section 13). Admin only: members get
// Forbidden("Only the admin can run jobs.").

public sealed partial class MarqueeApi
{
    public JobsEndpoints Jobs => new(transport);
}

public sealed class JobsEndpoints(MarqueeApi.Transport transport)
{
    /// <summary><c>GET /settings/jobs</c>: the maintenance jobs and their schedules.</summary>
    public Task<IReadOnlyList<Job>> ListAsync(CancellationToken ct = default) =>
        transport.GetListAsync<Job>("/settings/jobs", ct: ct);

    /// <summary>
    /// <c>POST /settings/jobs/{id}/run</c>: "Run now". Waits until the job
    /// finishes (a sync can take minutes); the schedule is unaffected. A sync
    /// job moves the same state as "Sync now" (library counts, lastSyncedAt,
    /// what the browse lists are built from), so it records what a
    /// connection change records, plus the jobs area, the way the Mac's
    /// <c>jobs.run</c> records library, settings and catalog. Errors:
    /// NotFound("Unknown job."), Server("Job failed…").
    /// </summary>
    public Task RunAsync(JobId id, CancellationToken ct = default) =>
        transport.MutateAsync<OK>(
            HttpMethod.Post, $"/settings/jobs/{MarqueeApi.Segment(id)}/run",
            timeout: MarqueeApi.Timeouts.LongRunning, changes: IntegrationsEndpoints.Reconnected | ServerChange.Jobs, ct: ct);
}
