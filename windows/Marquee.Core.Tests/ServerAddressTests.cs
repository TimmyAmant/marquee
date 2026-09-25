using Marquee.Core.Connection;

namespace Marquee.Core.Tests;

// Address parsing, ported case for case from the Mac's ConnectionTests.

public sealed class ServerAddressTests
{
    [Fact]
    public void BareIPDefaultsToHttpAndPort3000()
    {
        var address = ServerAddress.Parse("192.168.1.20");
        Assert.Equal(ServerScheme.Http, address.Scheme);
        Assert.Equal("192.168.1.20", address.Host);
        Assert.Equal((int?)3000, address.Port);
        Assert.Equal("http://192.168.1.20:3000", address.BaseUrlString);
        Assert.Equal("192.168.1.20:3000", address.DisplayName);
        Assert.True(address.IsIPLiteral);
    }

    [Fact]
    public void ExplicitPortIsKept()
    {
        Assert.Equal("http://192.168.1.20:3000", ServerAddress.Parse("192.168.1.20:3000").BaseUrlString);
        Assert.Equal("http://192.168.1.20:8080", ServerAddress.Parse("192.168.1.20:8080").BaseUrlString);
        Assert.Equal((int?)80, ServerAddress.Parse("http://192.168.1.20:80").Port);
    }

    [Fact]
    public void HostNamesAreTrimmedAndLowercased()
    {
        var address = ServerAddress.Parse("  TOWER.local \n");
        Assert.Equal("http://tower.local:3000", address.BaseUrlString);
        Assert.False(address.IsIPLiteral);
        Assert.Equal("http://localhost:3001", ServerAddress.Parse("localhost:3001").BaseUrlString);
        Assert.True(ServerAddress.Parse("localhost").IsLoopback);
    }

    [Fact]
    public void UrlsDropTrailingSlashPathQueryAndFragment()
    {
        Assert.Equal("http://tower:4000", ServerAddress.Parse("http://tower:4000/").BaseUrlString);
        Assert.Equal("http://tower:3000", ServerAddress.Parse("HTTP://Tower:3000/discover?tab=movies#top").BaseUrlString);
        // Plain http without a port still means the Docker default.
        Assert.Equal("http://192.168.1.20:3000", ServerAddress.Parse("http://192.168.1.20").BaseUrlString);
    }

    [Fact]
    public void HttpsKeepsItsDefaultPort()
    {
        var address = ServerAddress.Parse("https://marquee.example.com/");
        Assert.Equal(ServerScheme.Https, address.Scheme);
        Assert.Null(address.Port);
        Assert.Equal(443, address.EffectivePort);
        Assert.Equal("https://marquee.example.com", address.BaseUrlString);
        Assert.Equal("https://marquee.example.com", address.DisplayName);

        var custom = ServerAddress.Parse("https://marquee.example.com:8443/login");
        Assert.Equal("https://marquee.example.com:8443", custom.BaseUrlString);
        Assert.Equal(8443, custom.EffectivePort);
    }

    [Fact]
    public void IPv6Literals()
    {
        var address = ServerAddress.Parse("[::1]:3000");
        Assert.Equal("::1", address.Host);
        Assert.Equal("http://[::1]:3000", address.BaseUrlString);
        Assert.Equal(3000, address.BaseUrl.Port);
        Assert.True(address.IsLoopback);
        Assert.True(address.IsIPLiteral);
    }

    [Theory]
    [InlineData("", ServerAddressParseError.Empty, null)]
    [InlineData("   ", ServerAddressParseError.Empty, null)]
    [InlineData("ftp://tower.local", ServerAddressParseError.UnsupportedScheme, "ftp")]
    [InlineData("tower.local:abc", ServerAddressParseError.InvalidPort, null)]
    [InlineData("tower.local:", ServerAddressParseError.InvalidPort, null)]
    [InlineData("tower.local:70000", ServerAddressParseError.InvalidPort, null)]
    [InlineData("192.168.1.20:0", ServerAddressParseError.InvalidPort, null)]
    [InlineData("192.168.1", ServerAddressParseError.Invalid, null)]
    [InlineData("192.168.1.300", ServerAddressParseError.Invalid, null)]
    [InlineData("my server", ServerAddressParseError.Invalid, null)]
    [InlineData("http://", ServerAddressParseError.Invalid, null)]
    [InlineData("http://user:secret@tower.local:3000", ServerAddressParseError.Invalid, null)]
    public void InvalidInput(string input, ServerAddressParseError expected, string? scheme)
    {
        var error = Assert.Throws<ServerAddressParseException>(() => ServerAddress.Parse(input));
        Assert.Equal(expected, error.Error);
        Assert.Equal(scheme, error.Scheme);
        Assert.False(ServerAddress.TryParse(input, out _));
    }

    [Fact]
    public void ParseErrorsHaveMessages()
    {
        Assert.NotEmpty(ServerAddressParseException.MessageFor(ServerAddressParseError.Empty));
        Assert.Contains("192.168.1.20:3000", ServerAddressParseException.MessageFor(ServerAddressParseError.Invalid));
        Assert.Contains("ftp", new ServerAddressParseException(ServerAddressParseError.UnsupportedScheme, "ftp").Message);
        Assert.Contains("65535", ServerAddressParseException.MessageFor(ServerAddressParseError.InvalidPort));
    }

    [Theory]
    [InlineData("192.168.1.20")]
    [InlineData("tower.local:8080")]
    [InlineData("https://marquee.example.com")]
    [InlineData("https://marquee.example.com:8443")]
    public void SavedBaseUrlRoundTrips(string input)
    {
        var address = ServerAddress.Parse(input);
        Assert.Equal(address, ServerAddress.FromBaseUrl(address.BaseUrlString));
    }

    [Fact]
    public void UnusableSavedBaseUrlIsNull()
    {
        Assert.Null(ServerAddress.FromBaseUrl("not a url"));
    }

    [Fact]
    public void IPv4Helpers()
    {
        Assert.Equal((uint?)0xC0A8_0114, IPv4.Parse("192.168.1.20"));
        Assert.Equal("192.168.1.20", IPv4.ToString(0xC0A8_0114));
        Assert.Null(IPv4.Parse("192.168.1"));
        Assert.Null(IPv4.Parse("192.168.1.256"));
        Assert.Null(IPv4.Parse("a.b.c.d"));
    }
}
