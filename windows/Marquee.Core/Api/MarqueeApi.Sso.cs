using Marquee.Core.Models;

namespace Marquee.Core.Api;

// Single sign-on settings (admin, 0.44+): the "Single sign-on" card under
// Settings > Integrations. Saving or turning it off changes which sign-in
// buttons server-info offers, which is sign-in setup like /settings/sign-in,
// so these record ServerChange.Users.

public sealed partial class MarqueeApi
{
    public SsoSettingsEndpoints Sso => new(transport);
}

public sealed class SsoSettingsEndpoints(MarqueeApi.Transport transport)
{
    private const string Path = "/settings/sso";

    /// <summary>
    /// <c>GET /settings/sso</c>: the saved settings (never the secret), or
    /// the defaults while it isn't set up. Null from a server older than
    /// 0.44, which answers 404: the card stays hidden.
    /// </summary>
    public async Task<SsoSettings?> GetAsync(CancellationToken ct = default)
    {
        try
        {
            return await transport.GetAsync<SsoSettings>(Path, ct: ct).ConfigureAwait(false);
        }
        catch (ApiException error) when (error.Kind == ApiErrorKind.NotFound)
        {
            return null;
        }
    }

    /// <summary>
    /// <c>PUT /settings/sso</c>: "Test &amp; save". The server fetches the
    /// provider's discovery document first; Invalid with the first bad
    /// field's message, Upstream with why discovery failed. Answers the
    /// saved settings.
    /// </summary>
    public Task<SsoSettings> SaveAsync(SsoSettingsRequest settings, CancellationToken ct = default) =>
        transport.MutateAsync<SsoSettings>(
            HttpMethod.Put, Path, body: settings,
            timeout: MarqueeApi.Timeouts.Integrations, changes: ServerChange.Users, ct: ct);

    /// <summary>
    /// <c>DELETE /settings/sso</c>: "Turn off single sign-on". Answers the
    /// defaults; accounts keep their links for if it's set up again.
    /// </summary>
    public Task<SsoSettings> RemoveAsync(CancellationToken ct = default) =>
        transport.MutateAsync<SsoSettings>(HttpMethod.Delete, Path, changes: ServerChange.Users, ct: ct);

    /// <summary>
    /// <c>POST /settings/sso/test</c>: checks the provider's discovery
    /// document for <paramref name="issuer"/> (or its
    /// <c>…/.well-known/openid-configuration</c> URL) without saving.
    /// Invalid, or Upstream with the reason.
    /// </summary>
    public Task<SsoTestResult> TestAsync(string issuer, CancellationToken ct = default) =>
        transport.PostAsync<SsoTestResult>(Path + "/test", new SsoTestRequest(issuer), MarqueeApi.Timeouts.Integrations, ct);
}
