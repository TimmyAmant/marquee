using Marquee.Core.Models;

namespace Marquee.Core.Api;

// The admin tools of 0.58 (api-v1.md): the server's log, override rules,
// job schedules, removing a title from Sonarr/Radarr, the blocklist's
// automatic rules and the Gotify, Slack and Pushbullet channels. Each
// answers NotFound from an older server; the screens then say so.

public sealed partial class MarqueeApi
{
    public LogsEndpoints Logs => new(transport);
    public OverrideRulesEndpoints OverrideRules => new(transport);
    public AdminToolsEndpoints AdminTools => new(transport);
}

public sealed class LogsEndpoints(MarqueeApi.Transport transport)
{
    /// <summary>
    /// <c>GET /settings/logs</c> (admin, never an API key): the lines at
    /// <paramref name="level"/> and up containing <paramref name="query"/>,
    /// newer than <paramref name="after"/>, oldest first.
    /// </summary>
    public Task<LogsResponse> ListAsync(LogLevel? level, string? query, int? after = null, CancellationToken ct = default) =>
        transport.GetAsync<LogsResponse>(
            "/settings/logs",
            new Dictionary<string, string?>
            {
                ["level"] = level?.Value,
                ["q"] = query.NonBlank()?.Trim(),
                ["after"] = after?.ToString(System.Globalization.CultureInfo.InvariantCulture),
            },
            ct: ct);
}

public sealed class OverrideRulesEndpoints(MarqueeApi.Transport transport)
{
    /// <summary><c>GET /settings/override-rules</c> (admin), in order.</summary>
    public Task<IReadOnlyList<OverrideRule>> ListAsync(CancellationToken ct = default) =>
        transport.GetListAsync<OverrideRule>("/settings/override-rules", ct: ct);

    /// <summary>Adds (an empty <see cref="OverrideRule.Id"/>) or replaces a rule; answers it as saved.</summary>
    public async Task<OverrideRule> SaveAsync(OverrideRule rule, CancellationToken ct = default)
    {
        var body = OverrideRuleBody.From(rule);
        var saved = rule.Id.Length == 0
            ? await transport.MutateAsync<OverrideRuleSaved>(
                HttpMethod.Post, "/settings/override-rules", body: body, changes: ServerChange.Integrations, ct: ct).ConfigureAwait(false)
            : await transport.MutateAsync<OverrideRuleSaved>(
                HttpMethod.Put, $"/settings/override-rules/{MarqueeApi.Segment(rule.Id)}", body: body,
                changes: ServerChange.Integrations, ct: ct).ConfigureAwait(false);
        return saved.Rule;
    }

    public Task DeleteAsync(string id, CancellationToken ct = default) =>
        transport.MutateAsync<OK>(
            HttpMethod.Delete, $"/settings/override-rules/{MarqueeApi.Segment(id)}", changes: ServerChange.Integrations, ct: ct);
}

public sealed class AdminToolsEndpoints(MarqueeApi.Transport transport)
{
    /// <summary><c>PUT /settings/jobs/{id}</c> (admin, 0.58+): how often it runs (null: its default). Answers the job.</summary>
    public Task<Job> SetJobIntervalAsync(JobId id, JobInterval? interval, CancellationToken ct = default) =>
        transport.MutateAsync<Job>(
            HttpMethod.Put, $"/settings/jobs/{MarqueeApi.Segment(id)}", body: new JobIntervalBody { Interval = interval },
            changes: ServerChange.Jobs, ct: ct);

    /// <summary>
    /// <c>POST /titles/{type}/{tmdbId}/remove-from-arr</c> (admin, 0.58+):
    /// "Remove from Radarr/Sonarr", with its files when
    /// <paramref name="deleteFiles"/>. Conflict "Not tracked in Radarr/Sonarr.".
    /// </summary>
    public Task<RemoveFromArrResult> RemoveFromArrAsync(MediaType type, int tmdbId, bool deleteFiles, CancellationToken ct = default) =>
        transport.MutateAsync<RemoveFromArrResult>(
            HttpMethod.Post, $"{TitlesEndpoints.Path(type, tmdbId)}/remove-from-arr",
            body: new RemoveFromArrBody { DeleteFiles = deleteFiles },
            timeout: MarqueeApi.Timeouts.Integrations, changes: ServerChange.Library | ServerChange.Requests, ct: ct);

    /// <summary><c>GET /titles/{type}/{tmdbId}/add-options</c> for a request being reviewed: the override rule that applies comes first.</summary>
    public Task<AddOptions> AddOptionsForRequestAsync(MediaType type, int tmdbId, bool is4k, string requestId, CancellationToken ct = default) =>
        transport.GetAsync<AddOptions>(
            $"{TitlesEndpoints.Path(type, tmdbId)}/add-options",
            query: new Dictionary<string, string?> { ["is4k"] = is4k ? "true" : null, ["requestId"] = requestId },
            timeout: MarqueeApi.Timeouts.Integrations, ct: ct);

    /// <summary><c>POST /settings/blocklist</c> with a <c>kind</c> (0.58+): a keyword or genre, a rating in a country, or adult titles.</summary>
    public Task BlockAsync(BlockRuleBody rule, CancellationToken ct = default) =>
        transport.MutateAsync<OK>(
            HttpMethod.Post, "/settings/blocklist", body: rule, changes: ServerChange.Library | ServerChange.Requests, ct: ct);

    /// <summary><c>POST /settings/blocklist/preview</c> (0.58+): what it would block.</summary>
    public Task<BlockPreview> PreviewBlockAsync(BlockRuleBody rule, CancellationToken ct = default) =>
        transport.PostAsync<BlockPreview>("/settings/blocklist/preview", rule, ct: ct);

    /// <summary><c>PUT /settings/integrations/{gotify|slack|pushbullet}</c> (0.58+): sends a test first, then saves.</summary>
    public Task SaveChannelAsync(string channel, object request, CancellationToken ct = default) =>
        transport.MutateAsync<OK>(
            HttpMethod.Put, $"/settings/integrations/{MarqueeApi.Segment(channel)}", body: request,
            timeout: MarqueeApi.Timeouts.Integrations, changes: ServerChange.Integrations, ct: ct);

    /// <summary><c>DELETE /settings/integrations/{gotify|slack|pushbullet}</c>.</summary>
    public Task RemoveChannelAsync(string channel, CancellationToken ct = default) =>
        transport.MutateAsync<OK>(
            HttpMethod.Delete, $"/settings/integrations/{MarqueeApi.Segment(channel)}", changes: ServerChange.Integrations, ct: ct);
}
