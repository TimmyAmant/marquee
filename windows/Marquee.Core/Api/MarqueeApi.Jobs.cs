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

    /// <summary>
    /// <c>GET /settings/not-found</c> (0.46+): the Can't Find Check's wait,
    /// "Flag a request after [24] hours without a find". Null from an older
    /// server, which answers 404.
    /// </summary>
    public async Task<NotFoundSettings?> NotFoundSettingsAsync(CancellationToken ct = default)
    {
        try
        {
            return await transport.GetAsync<NotFoundSettings>("/settings/not-found", ct: ct).ConfigureAwait(false);
        }
        catch (ApiException error) when (error.Kind == ApiErrorKind.NotFound)
        {
            return null;
        }
    }

    /// <summary>
    /// <c>PUT /settings/not-found</c> (0.46+): a whole number of hours from
    /// 1 to 720; Invalid otherwise. Answers the saved settings.
    /// </summary>
    public Task<NotFoundSettings> SaveNotFoundSettingsAsync(int afterHours, CancellationToken ct = default) =>
        transport.MutateAsync<NotFoundSettings>(
            HttpMethod.Put, "/settings/not-found", body: new NotFoundSettings { AfterHours = afterHours },
            changes: ServerChange.Jobs, ct: ct);
}
