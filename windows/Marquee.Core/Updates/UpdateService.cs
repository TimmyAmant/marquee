using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Marquee.Core.Updates;

/// <summary>
/// GitHub's side of updating: which release is newest, and its Windows
/// installer, fetched over HTTPS from GitHub's own hosts only (redirects
/// included, each one checked before it's followed) and checked against the
/// size and SHA-256 GitHub lists before anything runs it. The Mac app's
/// <c>UpdateService</c>, for <c>Marquee-Setup.exe</c>.
///
/// Every method throws <see cref="UpdateException"/>, and only that, except
/// for an <see cref="OperationCanceledException"/> when the caller cancels.
/// </summary>
public sealed class UpdateService
{
    public static readonly Uri LatestReleaseUrl = new("https://api.github.com/repos/TimmyAmant/marquee/releases/latest");

    /// <summary>"Download manually" when there's no release page to point at.</summary>
    public static readonly Uri ReleasesPage = new("https://github.com/TimmyAmant/marquee/releases/latest");

    public static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(30);
    public static readonly TimeSpan DownloadTimeout = TimeSpan.FromMinutes(30);

    /// <summary>A release download goes github.com, then one hop to *.githubusercontent.com; this is plenty.</summary>
    private const int MaxRedirects = 10;

    private const int ChunkSize = 256 * 1024;

    /// <summary>
    /// Redirects are never followed automatically: <see cref="SendAsync"/>
    /// follows them itself, and only to an allowed host. No cookies.
    /// </summary>
    public static HttpMessageHandler DefaultHandler { get; } = new SocketsHttpHandler
    {
        AllowAutoRedirect = false,
        UseCookies = false,
        AutomaticDecompression = DecompressionMethods.All,
        PooledConnectionLifetime = TimeSpan.FromMinutes(5),
    };

    private readonly HttpClient http;

    /// <param name="handler">Tests pass a stub; the app leaves it null for <see cref="DefaultHandler"/>.</param>
    public UpdateService(HttpMessageHandler? handler = null)
    {
        // Timeouts come from each call's own cancellation, so a 70 MB
        // download isn't cut off by the client's default 100 seconds.
        http = new HttpClient(handler ?? DefaultHandler, disposeHandler: false)
        {
            Timeout = System.Threading.Timeout.InfiniteTimeSpan,
            MaxResponseContentBufferSize = 4 * 1024 * 1024,
        };
    }

    /// <summary>github.com, api.github.com and *.githubusercontent.com (where release downloads redirect to), over HTTPS.</summary>
    public static bool IsAllowed(Uri? url)
    {
        if (url is not { IsAbsoluteUri: true } || !string.Equals(url.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }
        var host = url.Host.ToLowerInvariant();
        return host == "github.com" || host == "api.github.com" || host.EndsWith(".githubusercontent.com", StringComparison.Ordinal);
    }

    // MARK: Checking

    /// <summary>The latest release, and the update when it's newer than <paramref name="current"/> (null: always offer it).</summary>
    public async Task<UpdateCheck> CheckAsync(AppVersion? current, CancellationToken ct = default)
    {
        var release = await LatestReleaseAsync(ct).ConfigureAwait(false);
        var latest = AppVersion.Parse(release.TagName) ?? throw new UpdateException(UpdateErrorKind.UnreadableRelease);
        if (current != null && latest <= current)
        {
            return new UpdateCheck(latest, null);
        }
        // Newer, but CI may not have attached the Windows download yet.
        var update = AvailableUpdate.From(release) ?? throw new UpdateException(UpdateErrorKind.NoDownload);
        return new UpdateCheck(latest, update);
    }

    /// <summary><c>GET /repos/TimmyAmant/marquee/releases/latest</c>. A 404 means no published release yet.</summary>
    public async Task<GitHubRelease> LatestReleaseAsync(CancellationToken ct = default)
    {
        var (status, body) = await GetBufferedAsync(LatestReleaseUrl, api: true, UpdateErrorKind.Unreachable, ct).ConfigureAwait(false);
        if (status == HttpStatusCode.NotFound)
        {
            throw new UpdateException(UpdateErrorKind.NoDownload);
        }
        if (status != HttpStatusCode.OK)
        {
            throw new UpdateException(UpdateErrorKind.Unreachable);
        }
        try
        {
            return GitHubRelease.Parse(body);
        }
        catch (Exception error) when (error is JsonException or NotSupportedException)
        {
            throw new UpdateException(UpdateErrorKind.UnreadableRelease, error);
        }
    }

    /// <summary>The expected SHA-256: the asset's <c>digest</c>, or else its <c>.sha256</c> file.</summary>
    public async Task<string> ExpectedSha256Async(AvailableUpdate update, CancellationToken ct = default)
    {
        if (update.Sha256 is { } sha256)
        {
            return sha256;
        }
        if (update.ChecksumFile is not { } file)
        {
            throw new UpdateException(UpdateErrorKind.NoDownload);
        }
        var (status, body) = await GetBufferedAsync(file, api: false, UpdateErrorKind.DownloadFailed, ct).ConfigureAwait(false);
        if (status != HttpStatusCode.OK
            || AvailableUpdate.Sha256FromChecksumFile(Encoding.UTF8.GetString(body)) is not { } hex)
        {
            throw new UpdateException(UpdateErrorKind.NoDownload);
        }
        return hex;
    }

    // MARK: Downloading

    /// <summary>
    /// Downloads the installer to <paramref name="destination"/>, hashing as
    /// it goes, and keeps it only if its size and SHA-256 match (a mismatch
    /// deletes it). <paramref name="progress"/> gets 0 to 1.
    /// </summary>
    public async Task DownloadAsync(
        AvailableUpdate update,
        string expectedSha256,
        string destination,
        IProgress<double>? progress = null,
        CancellationToken ct = default)
    {
        if (!IsAllowed(update.Download))
        {
            throw UpdateException.UntrustedHost(update.Download);
        }
        var partial = destination + ".partial";
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(DownloadTimeout);
        try
        {
            using var response = await SendAsync(update.Download, api: false, HttpCompletionOption.ResponseHeadersRead, UpdateErrorKind.DownloadFailed, timeout.Token)
                .ConfigureAwait(false);
            if (response.StatusCode != HttpStatusCode.OK)
            {
                throw new UpdateException(UpdateErrorKind.DownloadFailed);
            }

            if (Path.GetDirectoryName(Path.GetFullPath(destination)) is { Length: > 0 } folder)
            {
                Directory.CreateDirectory(folder);
            }
            string actual;
            await using (var body = await response.Content.ReadAsStreamAsync(timeout.Token).ConfigureAwait(false))
            await using (var file = new FileStream(partial, FileMode.Create, FileAccess.Write, FileShare.None, ChunkSize, useAsync: true))
            {
                actual = await CopyHashingAsync(body, file, update.Size, progress, timeout.Token).ConfigureAwait(false);
            }
            if (!string.Equals(actual, expectedSha256.Trim(), StringComparison.OrdinalIgnoreCase))
            {
                throw new UpdateException(UpdateErrorKind.ChecksumMismatch);
            }
            File.Move(partial, destination, overwrite: true);
        }
        catch (UpdateException)
        {
            TryDelete(partial);
            throw;
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            TryDelete(partial);
            throw;
        }
        catch (Exception error) when (error is HttpRequestException or IOException or UnauthorizedAccessException or OperationCanceledException)
        {
            TryDelete(partial);
            throw new UpdateException(UpdateErrorKind.DownloadFailed, error);
        }
    }

    /// <summary>Copies the whole body, refusing it as soon as it's bigger than promised; answers its SHA-256 in lowercase hex.</summary>
    private static async Task<string> CopyHashingAsync(Stream body, Stream file, long expectedSize, IProgress<double>? progress, CancellationToken ct)
    {
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        var buffer = new byte[ChunkSize];
        long received = 0;
        var reported = -1.0;
        while (true)
        {
            var read = await body.ReadAsync(buffer.AsMemory(0, buffer.Length), ct).ConfigureAwait(false);
            if (read == 0)
            {
                break;
            }
            received += read;
            // Bigger than promised: stop now rather than fill the disk.
            if (received > expectedSize)
            {
                throw new UpdateException(UpdateErrorKind.SizeMismatch);
            }
            hash.AppendData(buffer, 0, read);
            await file.WriteAsync(buffer.AsMemory(0, read), ct).ConfigureAwait(false);
            var fraction = (double)received / expectedSize;
            if (fraction - reported >= 0.01)
            {
                reported = fraction;
                progress?.Report(fraction);
            }
        }
        if (received != expectedSize)
        {
            throw new UpdateException(UpdateErrorKind.SizeMismatch);
        }
        progress?.Report(1);
        return Convert.ToHexString(hash.GetHashAndReset()).ToLowerInvariant();
    }

    // MARK: Transport

    /// <summary>A small answer, read whole: the release JSON, a checksum file.</summary>
    private async Task<(HttpStatusCode Status, byte[] Body)> GetBufferedAsync(Uri url, bool api, UpdateErrorKind failure, CancellationToken ct)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(RequestTimeout);
        try
        {
            using var response = await SendAsync(url, api, HttpCompletionOption.ResponseContentRead, failure, timeout.Token).ConfigureAwait(false);
            var body = await response.Content.ReadAsByteArrayAsync(timeout.Token).ConfigureAwait(false);
            return (response.StatusCode, body);
        }
        catch (UpdateException)
        {
            throw;
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception error) when (error is HttpRequestException or IOException or OperationCanceledException)
        {
            throw new UpdateException(failure, error);
        }
    }

    /// <summary>
    /// One GET, following redirects by hand: every hop, the first included,
    /// must be <see cref="IsAllowed"/>, or nothing is sent to it.
    /// </summary>
    private async Task<HttpResponseMessage> SendAsync(Uri url, bool api, HttpCompletionOption completion, UpdateErrorKind failure, CancellationToken ct)
    {
        var current = url;
        for (var hop = 0; ; hop++)
        {
            if (!IsAllowed(current))
            {
                throw UpdateException.UntrustedHost(current);
            }
            using var request = new HttpRequestMessage(HttpMethod.Get, current);
            request.Headers.TryAddWithoutValidation("User-Agent", AppInfo.UserAgent);
            if (api)
            {
                request.Headers.TryAddWithoutValidation("Accept", "application/vnd.github+json");
                request.Headers.TryAddWithoutValidation("X-GitHub-Api-Version", "2022-11-28");
            }
            var response = await http.SendAsync(request, completion, ct).ConfigureAwait(false);
            if (response.StatusCode is not (HttpStatusCode.MovedPermanently or HttpStatusCode.Found or HttpStatusCode.SeeOther
                or HttpStatusCode.TemporaryRedirect or HttpStatusCode.PermanentRedirect))
            {
                return response;
            }
            var location = response.Headers.Location;
            response.Dispose();
            if (location == null || hop >= MaxRedirects)
            {
                throw new UpdateException(failure);
            }
            current = location.IsAbsoluteUri ? location : new Uri(current, location);
        }
    }

    private static void TryDelete(string path)
    {
        try
        {
            File.Delete(path);
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException)
        {
            // A leftover .partial in the temp folder; the next attempt overwrites it.
        }
    }
}
