namespace Marquee.Core.Updates;

/// <summary>Every way checking for or downloading an update can fail.</summary>
public enum UpdateErrorKind
{
    /// <summary>GitHub didn't answer (offline, a timeout, an error page).</summary>
    Unreachable,

    /// <summary>GitHub answered, but not with a release this app can read.</summary>
    UnreadableRelease,

    /// <summary>No published release yet, or the newest one has no Windows download (yet).</summary>
    NoDownload,

    DownloadFailed,

    /// <summary>A URL, or a redirect, led off GitHub's hosts or off HTTPS.</summary>
    UntrustedHost,

    SizeMismatch,
    ChecksumMismatch,

    /// <summary>The downloaded installer couldn't be started.</summary>
    LaunchFailed,
}

/// <summary>
/// The only exception the updater throws. <see cref="Exception.Message"/>
/// is written for the person using the app, in the Mac updater's words.
/// </summary>
public sealed class UpdateException : Exception
{
    public UpdateException(UpdateErrorKind kind, Exception? inner = null, string? host = null)
        : base(MessageFor(kind, host), inner)
    {
        Kind = kind;
        Host = host;
    }

    public UpdateErrorKind Kind { get; }

    /// <summary>Where an <see cref="UpdateErrorKind.UntrustedHost"/> download was sent.</summary>
    public string? Host { get; }

    public static UpdateException UntrustedHost(Uri url) =>
        new(UpdateErrorKind.UntrustedHost, host: url.IsAbsoluteUri && url.Host.Length > 0 ? url.Host : url.OriginalString);

    private static string MessageFor(UpdateErrorKind kind, string? host) => kind switch
    {
        UpdateErrorKind.Unreachable =>
            "Couldn't reach GitHub to check for updates. Check your internet connection and try again.",
        UpdateErrorKind.UnreadableRelease =>
            "GitHub's answer about the latest release couldn't be read. Try again later.",
        UpdateErrorKind.NoDownload =>
            "The newest release doesn't have a Windows download yet. Try again in a few minutes.",
        UpdateErrorKind.DownloadFailed =>
            "The download didn't finish. Check your internet connection and try again.",
        UpdateErrorKind.UntrustedHost =>
            $"The download was sent somewhere unexpected ({host ?? "an unknown host"}), so Marquee stopped it.",
        UpdateErrorKind.SizeMismatch or UpdateErrorKind.ChecksumMismatch =>
            "The download didn't match what GitHub says it should be, so Marquee didn't install it.",
        UpdateErrorKind.LaunchFailed =>
            "Marquee couldn't start its installer.",
        _ => "Marquee couldn't update.",
    };
}
