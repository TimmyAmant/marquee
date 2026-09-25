using System.Text.Json;

namespace Marquee.Core.Updates;

/// <summary>
/// <c>GET /repos/TimmyAmant/marquee/releases/latest</c>, the parts the
/// updater reads. GitHub's keys are snake_case (<c>tag_name</c>), unlike the
/// Marquee API's, so this has its own options rather than <c>Json.Options</c>.
/// </summary>
public sealed record GitHubRelease
{
    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
    };

    /// <summary>"v0.30.0".</summary>
    public required string TagName { get; init; }

    /// <summary>The release page: "What's new", and "Download manually".</summary>
    public required string HtmlUrl { get; init; }

    public IReadOnlyList<GitHubReleaseAsset> Assets { get; init; } = [];

    /// <exception cref="JsonException">For JSON that isn't a release.</exception>
    public static GitHubRelease Parse(ReadOnlySpan<byte> utf8Json) =>
        JsonSerializer.Deserialize<GitHubRelease>(utf8Json, Options) ?? throw new JsonException("Expected a release, got null.");

    /// <inheritdoc cref="Parse(ReadOnlySpan{byte})"/>
    public static GitHubRelease Parse(string json) =>
        JsonSerializer.Deserialize<GitHubRelease>(json, Options) ?? throw new JsonException("Expected a release, got null.");
}

/// <summary>One file attached to a release.</summary>
public sealed record GitHubReleaseAsset
{
    public required string Name { get; init; }
    public required string BrowserDownloadUrl { get; init; }

    /// <summary>In bytes.</summary>
    public long Size { get; init; }

    /// <summary>"sha256:&lt;hex&gt;"; GitHub adds it to assets uploaded since mid-2025.</summary>
    public string? Digest { get; init; }
}

/// <summary>What a check found: the newest release, and the update when it's newer than this app.</summary>
/// <param name="Latest">The newest release's version.</param>
/// <param name="Update">Null when this app is already that version or newer.</param>
public sealed record UpdateCheck(AppVersion Latest, AvailableUpdate? Update)
{
    public bool IsUpToDate => Update == null;
}

/// <summary>
/// A release newer than this app, with a Windows download
/// (.github/workflows/apps.yml attaches <c>Marquee-Setup-0.31.0.exe</c> and
/// its <c>.sha256</c>, and the same installer as <c>Marquee-Setup.exe</c>
/// for 0.30.0, whose updater only knows that name).
/// </summary>
public sealed class AvailableUpdate
{
    /// <summary>The unversioned name, from releases before 0.31.0.</summary>
    public const string AssetName = "Marquee-Setup.exe";
    public const string ChecksumAssetName = "Marquee-Setup.exe.sha256";

    /// <summary>"Marquee-Setup-0.31.0.exe", the name releases use from 0.31.0 on.</summary>
    public static string VersionedAssetName(AppVersion version) => $"Marquee-Setup-{version.Text}.exe";

    public AvailableUpdate(AppVersion version, Uri releasePage, Uri download, long size, string? sha256, Uri? checksumFile)
    {
        Version = version;
        ReleasePage = releasePage;
        Download = download;
        Size = size;
        Sha256 = sha256;
        ChecksumFile = checksumFile;
    }

    public AppVersion Version { get; }

    /// <summary>The release's page on GitHub: "What's new", "Download manually".</summary>
    public Uri ReleasePage { get; }

    /// <summary>The installer.</summary>
    public Uri Download { get; }

    /// <summary>The installer's size in bytes, as GitHub lists it.</summary>
    public long Size { get; }

    /// <summary>Lowercase hex, from the asset's <c>digest</c>; null when GitHub gave none and <see cref="ChecksumFile"/> has it instead.</summary>
    public string? Sha256 { get; }

    public Uri? ChecksumFile { get; }

    /// <summary>Null when the release has no usable Windows download (or its tag isn't a version).</summary>
    public static AvailableUpdate? From(GitHubRelease release)
    {
        if (AppVersion.Parse(release.TagName) is not { } version
            || !Uri.TryCreate(release.HtmlUrl, UriKind.Absolute, out var page))
        {
            return null;
        }
        // Null only when the JSON said "assets": null.
        IReadOnlyList<GitHubReleaseAsset> assets = release.Assets ?? Array.Empty<GitHubReleaseAsset>();
        // The versioned installer when the release has one, else the old name.
        var versioned = VersionedAssetName(version);
        var installer = assets.FirstOrDefault(asset => asset.Name == versioned);
        var checksumName = versioned + ".sha256";
        if (installer == null)
        {
            installer = assets.FirstOrDefault(asset => asset.Name == AssetName);
            checksumName = ChecksumAssetName;
        }
        if (installer == null
            || installer.Size <= 0
            || !Uri.TryCreate(installer.BrowserDownloadUrl, UriKind.Absolute, out var download))
        {
            return null;
        }
        Uri? checksumFile = null;
        if (assets.FirstOrDefault(asset => asset.Name == checksumName) is { } checksum
            && Uri.TryCreate(checksum.BrowserDownloadUrl, UriKind.Absolute, out var checksumUrl))
        {
            checksumFile = checksumUrl;
        }
        var sha256 = installer.Digest is { } digest ? Sha256FromDigest(digest) : null;
        if (sha256 == null && checksumFile == null)
        {
            return null;
        }
        return new AvailableUpdate(version, page, download, installer.Size, sha256, checksumFile);
    }

    /// <summary>"sha256:&lt;64 hex&gt;" to the hex, lowercased; null for any other algorithm or shape.</summary>
    public static string? Sha256FromDigest(string digest)
    {
        var colon = digest.IndexOf(':');
        if (colon < 0 || !string.Equals(digest[..colon], "sha256", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }
        return ValidHex(digest[(colon + 1)..]);
    }

    /// <summary>A checksum line ("&lt;hex&gt;  Marquee-Setup.exe") to the hex; null for anything else.</summary>
    public static string? Sha256FromChecksumFile(string text)
    {
        var first = text.Split((char[]?)null, 2, StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
        return first == null ? null : ValidHex(first);
    }

    private static string? ValidHex(string text)
    {
        var hex = text.Trim().ToLowerInvariant();
        return hex.Length == 64 && hex.All(char.IsAsciiHexDigit) ? hex : null;
    }
}
