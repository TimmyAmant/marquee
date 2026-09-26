using Marquee.Core.Models;

namespace Marquee.Core.Api;

// API keys (api-v1.md section 16, admin, 0.47+): the "API keys" card under
// Settings › Integrations. Only a signed-in admin (a device token) may manage
// them, never a key. Creating or revoking one is a Settings change like the
// webhook secret, so these record ServerChange.Integrations (the Mac's
// .settings). GET /stats/summary, for dashboard widgets, is here too.

public sealed partial class MarqueeApi
{
    public ApiKeysEndpoints ApiKeys => new(transport);

    public StatsEndpoints Stats => new(transport);
}

public sealed class ApiKeysEndpoints(MarqueeApi.Transport transport)
{
    private const string Path = "/settings/api-keys";

    /// <summary>
    /// <c>GET /settings/api-keys</c>: every key, oldest first. Null from a
    /// server older than 0.47, which answers 404: the card stays hidden.
    /// </summary>
    public async Task<IReadOnlyList<ApiKey>?> ListAsync(CancellationToken ct = default)
    {
        try
        {
            return await transport.GetListAsync<ApiKey>(Path, ct: ct).ConfigureAwait(false);
        }
        catch (ApiException error) when (error.Kind == ApiErrorKind.NotFound)
        {
            return null;
        }
    }

    /// <summary>
    /// <c>POST /settings/api-keys</c>: the new key with its secret, the only
    /// time the secret is ever returned. The name is sent trimmed. Invalid
    /// "Give the key a name, like Homepage." (and the other field messages),
    /// NotFound "That household member doesn't exist any more.".
    /// </summary>
    public Task<CreatedApiKey> CreateAsync(CreateApiKeyRequest request, CancellationToken ct = default) =>
        transport.MutateAsync<CreatedApiKey>(
            HttpMethod.Post, Path,
            body: request with { Name = request.Name.Trim() },
            changes: ServerChange.Integrations, ct: ct);

    /// <summary>
    /// <c>DELETE /settings/api-keys/{id}</c>: "Revoke". Its next call answers
    /// 401. NotFound "That API key doesn't exist any more.".
    /// </summary>
    public Task RevokeAsync(Guid id, CancellationToken ct = default) =>
        transport.MutateAsync<OK>(HttpMethod.Delete, $"{Path}/{MarqueeApi.Segment(id)}", changes: ServerChange.Integrations, ct: ct);
}

public sealed class StatsEndpoints(MarqueeApi.Transport transport)
{
    /// <summary><c>GET /stats/summary</c> (user, 0.47+): the counts dashboard widgets show.</summary>
    public Task<StatsSummary> SummaryAsync(CancellationToken ct = default) =>
        transport.GetAsync<StatsSummary>("/stats/summary", ct: ct);
}
