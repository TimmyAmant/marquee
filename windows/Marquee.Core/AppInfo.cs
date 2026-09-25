using System.Reflection;

namespace Marquee.Core;

/// <summary>
/// What this build calls itself: the version in the <c>User-Agent</c> header
/// and the links the About screen opens.
/// </summary>
public static class AppInfo
{
    public const string UserAgentProduct = "Marquee-Windows";

    /// <summary>The <c>Version</c> from Directory.Build.props, e.g. <c>0.1.0</c>.</summary>
    public static string Version { get; } = ReadVersion();

    /// <summary><c>Marquee-Windows/0.1.0</c>, sent with every request so a server log can tell the clients apart.</summary>
    public static string UserAgent => $"{UserAgentProduct}/{Version}";

    public static readonly Uri RepositoryUrl = new("https://github.com/TimmyAmant/marquee");
    public static readonly Uri IssuesUrl = new("https://github.com/TimmyAmant/marquee/issues");

    private static string ReadVersion()
    {
        var assembly = typeof(AppInfo).Assembly;
        var informational = assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion;
        if (!string.IsNullOrWhiteSpace(informational))
        {
            // "0.1.0+abc123" when a build appends the commit: keep the version alone.
            var plus = informational.IndexOf('+');
            return plus >= 0 ? informational[..plus] : informational;
        }
        return assembly.GetName().Version?.ToString(3) ?? "0.0.0";
    }
}
