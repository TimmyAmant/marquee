using System.Net;
using System.Security.Cryptography;
using Marquee.Core.Tests.Support;
using Marquee.Core.Updates;

namespace Marquee.Core.Tests;

// The Windows updater's GitHub side: versions, reading a release, and a
// download that's only kept when it's exactly what the release lists.

public sealed class UpdateServiceTests : IDisposable
{
    private const string InstallerUrl = "https://github.com/TimmyAmant/marquee/releases/download/v0.31.0/Marquee-Setup.exe";
    private const string ChecksumUrl = "https://github.com/TimmyAmant/marquee/releases/download/v0.31.0/Marquee-Setup.exe.sha256";
    private const string CdnUrl = "https://release-assets.githubusercontent.com/github-production-release-asset/1/installer";

    private static readonly byte[] Installer = Enumerable.Range(0, 300_000).Select(index => (byte)(index % 251)).ToArray();
    private static readonly string InstallerSha256 = Convert.ToHexString(SHA256.HashData(Installer)).ToLowerInvariant();

    private readonly string folder = Path.Combine(Path.GetTempPath(), $"marquee-update-tests-{Guid.NewGuid():N}");

    public void Dispose()
    {
        if (Directory.Exists(folder))
        {
            Directory.Delete(folder, recursive: true);
        }
    }

    private static string Release(string tag = "v0.31.0", string? digest = null, bool withInstaller = true, bool withChecksum = true, long? size = null)
    {
        var assets = new List<string>();
        if (withInstaller)
        {
            var digestJson = digest == null ? "null" : $"\"{digest}\"";
            assets.Add($$"""{"name":"Marquee-Setup.exe","browser_download_url":"{{InstallerUrl}}","size":{{size ?? Installer.Length}},"digest":{{digestJson}}}""");
        }
        if (withChecksum)
        {
            assets.Add($$"""{"name":"Marquee-Setup.exe.sha256","browser_download_url":"{{ChecksumUrl}}","size":85}""");
        }
        assets.Add("""{"name":"Marquee.dmg","browser_download_url":"https://github.com/TimmyAmant/marquee/releases/download/v0.31.0/Marquee.dmg","size":10}""");
        return $$"""{"tag_name":"{{tag}}","html_url":"https://github.com/TimmyAmant/marquee/releases/tag/{{tag}}","assets":[{{string.Join(",", assets)}}]}""";
    }

    private static HttpResponseMessage Bytes(byte[] body) =>
        new(HttpStatusCode.OK) { Content = new ByteArrayContent(body) };

    // MARK: Versions

    [Theory]
    [InlineData("0.29.10", "0.29.9", 1)]
    [InlineData("v0.30.0", "0.30.0", 0)]
    [InlineData("1.0", "1.0.0", 0)]
    [InlineData("0.30.0-beta.1", "0.30.0", 0)]
    [InlineData("0.30.0", "0.31.0", -1)]
    public void VersionsCompareNumerically(string left, string right, int expected)
    {
        Assert.Equal(expected, AppVersion.Compare(AppVersion.Parse(left), AppVersion.Parse(right)));
    }

    [Theory]
    [InlineData("latest")]
    [InlineData("")]
    [InlineData("1..0")]
    [InlineData(null)]
    public void NonVersionsDontParse(string? text)
    {
        Assert.Null(AppVersion.Parse(text));
    }

    // MARK: Reading a release

    [Fact]
    public void ReleaseWithDigestUsesIt()
    {
        var update = AvailableUpdate.From(GitHubRelease.Parse(Release(digest: $"sha256:{InstallerSha256.ToUpperInvariant()}")));
        Assert.NotNull(update);
        Assert.Equal("0.31.0", update.Version.Text);
        Assert.Equal(InstallerSha256, update.Sha256);
        Assert.Equal(new Uri(InstallerUrl), update.Download);
        Assert.Equal(Installer.Length, update.Size);
    }

    [Fact]
    public void VersionedInstallerIsPreferred()
    {
        var json = $$"""
            {"tag_name":"v0.31.0","html_url":"https://github.com/TimmyAmant/marquee/releases/tag/v0.31.0","assets":[
              {"name":"Marquee-Setup.exe","browser_download_url":"{{InstallerUrl}}","size":10},
              {"name":"Marquee-Setup.exe.sha256","browser_download_url":"{{ChecksumUrl}}","size":85},
              {"name":"Marquee-Setup-0.31.0.exe","browser_download_url":"https://github.com/TimmyAmant/marquee/releases/download/v0.31.0/Marquee-Setup-0.31.0.exe","size":20},
              {"name":"Marquee-Setup-0.31.0.exe.sha256","browser_download_url":"https://github.com/TimmyAmant/marquee/releases/download/v0.31.0/Marquee-Setup-0.31.0.exe.sha256","size":92}
            ]}
            """;
        var update = AvailableUpdate.From(GitHubRelease.Parse(json));
        Assert.NotNull(update);
        Assert.EndsWith("/Marquee-Setup-0.31.0.exe", update.Download.AbsoluteUri);
        Assert.EndsWith("/Marquee-Setup-0.31.0.exe.sha256", update.ChecksumFile?.AbsoluteUri);
        Assert.Equal(20, update.Size);
    }

    [Fact]
    public void ReleaseWithoutWindowsDownloadOffersNothing()
    {
        Assert.Null(AvailableUpdate.From(GitHubRelease.Parse(Release(withInstaller: false))));
        Assert.Null(AvailableUpdate.From(GitHubRelease.Parse(Release(withChecksum: false))));
        Assert.Null(AvailableUpdate.From(GitHubRelease.Parse(Release(tag: "nightly"))));
    }

    [Fact]
    public void ChecksumFileLine()
    {
        Assert.Equal(InstallerSha256, AvailableUpdate.Sha256FromChecksumFile($"{InstallerSha256.ToUpperInvariant()}  Marquee-Setup.exe\n"));
        Assert.Null(AvailableUpdate.Sha256FromChecksumFile("not a hash"));
        Assert.Null(AvailableUpdate.Sha256FromDigest($"md5:{InstallerSha256}"));
    }

    // MARK: Checking

    [Fact]
    public async Task NewerReleaseIsOffered()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(200, Release(), apiHeader: false);
        var check = await new UpdateService(stub).CheckAsync(AppVersion.Parse("0.30.0"));

        Assert.False(check.IsUpToDate);
        Assert.Equal("0.31.0", check.Update?.Version.Text);
        var request = Assert.Single(stub.Requests);
        Assert.Equal(UpdateService.LatestReleaseUrl, request.Uri);
        Assert.Equal("application/vnd.github+json", request.Header("Accept"));
    }

    [Fact]
    public async Task SameOrOlderReleaseIsUpToDate()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(200, Release(tag: "v0.30.0"), apiHeader: false);
        var check = await new UpdateService(stub).CheckAsync(AppVersion.Parse("0.30.0"));
        Assert.True(check.IsUpToDate);
    }

    [Fact]
    public async Task NoReleaseOrNoDownloadSaysSo()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(404, """{"message":"Not Found"}""", apiHeader: false);
        var error = await Assert.ThrowsAsync<UpdateException>(() => new UpdateService(stub).CheckAsync(AppVersion.Parse("0.30.0")));
        Assert.Equal(UpdateErrorKind.NoDownload, error.Kind);

        stub.AnswerJson(200, Release(withInstaller: false), apiHeader: false);
        error = await Assert.ThrowsAsync<UpdateException>(() => new UpdateService(stub).CheckAsync(AppVersion.Parse("0.30.0")));
        Assert.Equal(UpdateErrorKind.NoDownload, error.Kind);
    }

    [Fact]
    public async Task OfflineIsUnreachable()
    {
        var stub = new StubHttpMessageHandler();
        stub.Fail(new HttpRequestException("No route to host"));
        var error = await Assert.ThrowsAsync<UpdateException>(() => new UpdateService(stub).CheckAsync(AppVersion.Parse("0.30.0")));
        Assert.Equal(UpdateErrorKind.Unreachable, error.Kind);
    }

    // MARK: Downloading

    [Fact]
    public async Task DownloadFollowsGitHubRedirectAndKeepsAMatchingFile()
    {
        var stub = new StubHttpMessageHandler();
        stub.Answer(request => request.Uri.AbsoluteUri switch
        {
            ChecksumUrl => StubHttpMessageHandler.Text(200, $"{InstallerSha256}  Marquee-Setup.exe\n", "text/plain"),
            InstallerUrl => StubHttpMessageHandler.Redirect(302, CdnUrl),
            CdnUrl => Bytes(Installer),
            _ => new HttpResponseMessage(HttpStatusCode.NotFound),
        });
        var service = new UpdateService(stub);
        var update = AvailableUpdate.From(GitHubRelease.Parse(Release()))!;
        var destination = Path.Combine(folder, "Marquee-Setup.exe");
        var reports = new List<double>();

        var expected = await service.ExpectedSha256Async(update);
        await service.DownloadAsync(update, expected, destination, new SynchronousProgress(reports.Add));

        Assert.Equal(Installer, await File.ReadAllBytesAsync(destination));
        Assert.False(File.Exists(destination + ".partial"));
        Assert.Equal(1, reports[^1]);
    }

    [Fact]
    public async Task MismatchedDownloadIsDeleted()
    {
        var stub = new StubHttpMessageHandler();
        stub.Answer(() => Bytes(Installer));
        var update = AvailableUpdate.From(GitHubRelease.Parse(Release(digest: $"sha256:{new string('0', 64)}")))!;
        var destination = Path.Combine(folder, "Marquee-Setup.exe");

        var error = await Assert.ThrowsAsync<UpdateException>(() =>
            new UpdateService(stub).DownloadAsync(update, update.Sha256!, destination));
        Assert.Equal(UpdateErrorKind.ChecksumMismatch, error.Kind);
        Assert.False(File.Exists(destination));
        Assert.False(File.Exists(destination + ".partial"));
    }

    [Fact]
    public async Task WrongSizeIsRefused()
    {
        var stub = new StubHttpMessageHandler();
        stub.Answer(() => Bytes(Installer));
        var update = AvailableUpdate.From(GitHubRelease.Parse(Release(digest: $"sha256:{InstallerSha256}", size: Installer.Length - 1)))!;

        var error = await Assert.ThrowsAsync<UpdateException>(() =>
            new UpdateService(stub).DownloadAsync(update, InstallerSha256, Path.Combine(folder, "Marquee-Setup.exe")));
        Assert.Equal(UpdateErrorKind.SizeMismatch, error.Kind);
    }

    [Fact]
    public async Task RedirectOffGitHubIsNeverFollowed()
    {
        var stub = new StubHttpMessageHandler();
        stub.Answer(request => request.Uri.AbsoluteUri == InstallerUrl
            ? StubHttpMessageHandler.Redirect(302, "https://evil.example/Marquee-Setup.exe")
            : Bytes(Installer));
        var update = AvailableUpdate.From(GitHubRelease.Parse(Release(digest: $"sha256:{InstallerSha256}")))!;

        var error = await Assert.ThrowsAsync<UpdateException>(() =>
            new UpdateService(stub).DownloadAsync(update, InstallerSha256, Path.Combine(folder, "Marquee-Setup.exe")));
        Assert.Equal(UpdateErrorKind.UntrustedHost, error.Kind);
        Assert.Equal("evil.example", error.Host);
        Assert.Single(stub.Requests);
    }

    [Theory]
    [InlineData("https://github.com/x", true)]
    [InlineData("https://objects.githubusercontent.com/x", true)]
    [InlineData("http://github.com/x", false)]
    [InlineData("https://github.com.evil.example/x", false)]
    [InlineData("https://notgithubusercontent.com/x", false)]
    public void OnlyGitHubOverHttpsIsAllowed(string url, bool allowed)
    {
        Assert.Equal(allowed, UpdateService.IsAllowed(new Uri(url)));
    }

    /// <summary><see cref="Progress{T}"/> posts to a thread pool; tests want the reports in order, now.</summary>
    private sealed class SynchronousProgress(Action<double> report) : IProgress<double>
    {
        public void Report(double value) => report(value);
    }
}
