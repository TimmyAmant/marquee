using Marquee.Core.Localization;

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
            Loc.Get("Update_Unreachable"),
        UpdateErrorKind.UnreadableRelease =>
            Loc.Get("Update_UnreadableRelease"),
        UpdateErrorKind.NoDownload =>
            Loc.Get("Update_NoDownload"),
        UpdateErrorKind.DownloadFailed =>
            Loc.Get("Update_DownloadFailed"),
        UpdateErrorKind.UntrustedHost =>
            Loc.Format("Update_UntrustedHost", host ?? Loc.Get("Update_UnknownHost")),
        UpdateErrorKind.SizeMismatch or UpdateErrorKind.ChecksumMismatch =>
            Loc.Get("Update_Mismatch"),
        UpdateErrorKind.LaunchFailed =>
            Loc.Get("Update_LaunchFailed"),
        _ => Loc.Get("Update_Failed"),
    };
}
