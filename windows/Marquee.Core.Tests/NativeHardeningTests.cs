using Marquee.Core.Connection;
using Marquee.Core.Models;

namespace Marquee.Core.Tests;

// marquee:// links, trailer keys, and plain-http servers off the local
// network: the same cases as the Mac's NativeHardeningTests.

public sealed class UnencryptedServerTests
{
    [Theory]
    [InlineData("192.168.1.20")]
    [InlineData("10.0.0.5")]
    [InlineData("172.16.4.2")]
    [InlineData("172.31.255.1")]
    [InlineData("169.254.10.10")]
    [InlineData("127.0.0.1")]
    [InlineData("localhost")]
    [InlineData("tower")]
    [InlineData("tower.local")]
    [InlineData("nas.lan")]
    [InlineData("box.home.arpa")]
    [InlineData("[fe80::1]")]
    [InlineData("[fd12:3456::1]")]
    [InlineData("[::1]")]
    public void TheLocalNetworkIsRecognised(string input)
    {
        var address = ServerAddress.Parse(input);
        Assert.True(address.IsLocalNetwork);
        Assert.False(address.IsUnencryptedRemote);
    }

    [Theory]
    [InlineData("marquee.example.com")]
    [InlineData("172.32.0.1")]
    [InlineData("8.8.8.8")]
    [InlineData("100.64.1.2")]
    [InlineData("[2001:db8::1]")]
    [InlineData("tower.local.example.com")]
    public void EverywhereElseIsRemote(string input)
    {
        var address = ServerAddress.Parse(input);
        Assert.False(address.IsLocalNetwork);
        Assert.True(address.IsUnencryptedRemote);
    }

    [Fact]
    public void HttpsIsEncrypted() =>
        Assert.False(ServerAddress.Parse("https://marquee.example.com").IsUnencryptedRemote);

    [Fact]
    public void ABareRemoteHostTriesHttpsFirst()
    {
        Assert.Equal(
            ["https://marquee.example.com", "http://marquee.example.com:3000"],
            ServerAddress.Candidates("marquee.example.com").Select(address => address.BaseUrlString));
        Assert.Equal(
            ["https://marquee.example.com:8443", "http://marquee.example.com:8443"],
            ServerAddress.Candidates("marquee.example.com:8443/discover").Select(address => address.BaseUrlString));
        // A typed scheme, or a LAN address, is taken as it is.
        Assert.Equal(["http://marquee.example.com:3000"], ServerAddress.Candidates("http://marquee.example.com").Select(address => address.BaseUrlString));
        Assert.Equal(["https://marquee.example.com"], ServerAddress.Candidates("https://marquee.example.com").Select(address => address.BaseUrlString));
        Assert.Equal(["http://192.168.1.20:3000"], ServerAddress.Candidates("192.168.1.20").Select(address => address.BaseUrlString));
        Assert.Equal(["http://tower.local:3000"], ServerAddress.Candidates("tower.local:3000").Select(address => address.BaseUrlString));
        Assert.Throws<ServerAddressParseException>(() => ServerAddress.Candidates(""));
    }
}

public sealed class YouTubeTrailerTests
{
    [Theory]
    [InlineData("dQw4w9WgXcQ")]
    [InlineData("a-b_c1")]
    public void YouTubeShapedKeysAreAccepted(string key)
    {
        Assert.True(YouTubeTrailer.IsValidKey(key));
        Assert.Equal($"https://www.youtube.com/watch?v={key}", YouTubeTrailer.WatchUrl(key)?.AbsoluteUri);
        Assert.Equal($"https://www.youtube-nocookie.com/embed/{key}?autoplay=1&playsinline=1", YouTubeTrailer.EmbedUrl(key)?.AbsoluteUri);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("short")]
    [InlineData("aaaaaaaaaaaaaaaaaaaaa")]
    [InlineData("abc\"><script>")]
    [InlineData("abc def ghi")]
    [InlineData("abc&autoplay=0")]
    [InlineData("ünïcödé123")]
    public void AnythingElseIsRefused(string? key)
    {
        Assert.False(YouTubeTrailer.IsValidKey(key));
        Assert.Null(YouTubeTrailer.WatchUrl(key));
        Assert.Null(YouTubeTrailer.EmbedUrl(key));
        Assert.Null(new TitleLinks { TrailerYoutubeKey = key, External = [] }.TrailerUrl);
    }
}

public sealed class DeepLinkTests
{
    [Fact]
    public void TheMacsLinksAreUnderstood()
    {
        Assert.Equal(new DeepLink.Title(new TitleId(MediaType.Movie, 603)), DeepLink.Parse("marquee://title/movie/603"));
        Assert.Equal(new DeepLink.Title(new TitleId(MediaType.Tv, 1399)), DeepLink.Parse("MARQUEE://title/tv/1399/"));
        Assert.Equal(new DeepLink.Person(287), DeepLink.Parse("marquee://person/287"));
        Assert.Equal(new DeepLink.Company(420), DeepLink.Parse("marquee://company/420"));
        Assert.Equal(new DeepLink.DiscoverList(DiscoverListKind.Trending), DeepLink.Parse("marquee://discover/trending"));
        Assert.Equal(
            new DeepLink.DiscoverList(DiscoverListKind.FromValue("5b0f3c2e-8f7a-4d0e-9b1c-2a6d7e8f9a01")),
            DeepLink.Parse("marquee://discover/5b0f3c2e-8f7a-4d0e-9b1c-2a6d7e8f9a01"));
        Assert.IsType<DeepLink.Settings>(DeepLink.Parse("marquee://settings"));
        Assert.Equal(new DeepLink.Search("the matrix"), DeepLink.Parse("marquee://search?q=the%20matrix"));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("https://example.com/title/movie/603")]
    [InlineData("marquee://title/book/603")]
    [InlineData("marquee://title/movie/abc")]
    [InlineData("marquee://title/movie/-1")]
    [InlineData("marquee://discover/top-secret")]
    [InlineData("marquee://search?q=")]
    [InlineData("marquee://signout")]
    [InlineData("marquee://")]
    public void AnythingElseIsIgnored(string? link) => Assert.Null(DeepLink.Parse(link));

    [Fact]
    public void TheLinkIsFoundInALaunchsCommandLine()
    {
        Assert.Equal(new DeepLink.Person(287), DeepLink.FromCommandLine("\"marquee://person/287\""));
        Assert.Equal(new DeepLink.Person(287), DeepLink.FromCommandLine("marquee://person/287"));
        Assert.Equal(new DeepLink.Person(287), DeepLink.FromCommandLine("--flag \"marquee://person/287\" other"));
        Assert.Null(DeepLink.FromCommandLine(""));
        Assert.Null(DeepLink.FromCommandLine(null));
        Assert.Null(DeepLink.FromCommandLine("--relaunch"));
    }
}

public sealed class PlayLinkTests
{
    [Theory]
    [InlineData("plex://preplay/?metadataKey=%2Flibrary%2Fmetadata%2F1&metadataType=1&server=abc", true)]
    [InlineData("https://app.plex.tv/desktop", false)]
    [InlineData("file:///C:/Windows/System32/calc.exe", false)]
    [InlineData("ms-settings:privacy", false)]
    [InlineData(null, false)]
    public void OnlyTheMediaServersAppSchemesOpenAnApp(string? appUrl, bool opens) =>
        Assert.Equal(opens, new PlayLink { Server = "plex", Label = "Play on Plex", Url = "https://app.plex.tv", AppUrl = appUrl }.AppLink != null);
}
