namespace Marquee.Windows.Services;

/// <summary>
/// Opens a link in the user's browser. Only <c>https</c> is ever handed to
/// the shell: a server (or a TMDb record) could carry any URL, and letting
/// an arbitrary scheme through would let a stranger's data launch a
/// protocol handler on this PC.
/// </summary>
public static class ExternalLinks
{
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
