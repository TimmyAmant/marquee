using Marquee.Core.Models;

namespace Marquee.Windows.Services;

/// <summary>
/// Opens a link in the user's browser. Only <c>https</c> is ever handed to
/// the shell: a server (or a TMDb record) could carry any URL, and letting
/// an arbitrary scheme through would let a stranger's data launch a
/// protocol handler on this PC. The one exception is a sign-in page on the
/// Marquee server's own address (<see cref="OpenSignInPageAsync"/>), which
/// may be plain http on a home network.
/// </summary>
public static class ExternalLinks
{
    /// <summary>
    /// A single sign-on page: opened when it's https, or on
    /// <paramref name="server"/>'s own origin (see <see cref="SignInWeb.Allows"/>);
    /// false for anything else, or a refused link.
    /// </summary>
    public static async Task<bool> OpenSignInPageAsync(Uri? url, Uri? server)
    {
        if (url == null || !SignInWeb.Allows(url, server))
        {
            return false;
        }
        return await global::Windows.System.Launcher.LaunchUriAsync(url);
    }

    /// <summary>Whether <see cref="OpenAsync"/> would hand this link to the browser: an absolute https URL.</summary>
    public static bool CanOpen(Uri? url) =>
        url != null && url.IsAbsoluteUri && string.Equals(url.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase);

    /// <summary>True when the browser was asked to open it; false for a null, non-https or refused link.</summary>
    public static async Task<bool> OpenAsync(Uri? url)
    {
        if (url == null || !CanOpen(url))
        {
            return false;
        }
        return await global::Windows.System.Launcher.LaunchUriAsync(url);
    }
}
