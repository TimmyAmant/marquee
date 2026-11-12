using Marquee.Core.Localization;
using System.Diagnostics.CodeAnalysis;
using System.Globalization;

namespace Marquee.Core.Connection;

public enum ServerScheme
{
    Http,
    Https,
}

public static class ServerSchemeExtensions
{
    public static string Name(this ServerScheme scheme) => scheme == ServerScheme.Https ? "https" : "http";
    public static int DefaultPort(this ServerScheme scheme) => scheme == ServerScheme.Https ? 443 : 80;
}

public enum ServerAddressParseError
{
    Empty,
    Invalid,
    UnsupportedScheme,
    InvalidPort,
}

/// <summary>Thrown by <see cref="ServerAddress.Parse"/>; <see cref="Exception.Message"/> is the inline error the entry form shows.</summary>
public sealed class ServerAddressParseException : Exception
{
    public ServerAddressParseError Error { get; }

    /// <summary>The scheme that was typed, for <see cref="ServerAddressParseError.UnsupportedScheme"/>.</summary>
    public string? Scheme { get; }

    public ServerAddressParseException(ServerAddressParseError error, string? scheme = null)
        : base(MessageFor(error, scheme))
    {
        Error = error;
        Scheme = scheme;
    }

    public static string MessageFor(ServerAddressParseError error, string? scheme = null) => error switch
    {
        ServerAddressParseError.Empty => Loc.Get("Server_AddressEmpty"),
        ServerAddressParseError.Invalid => Loc.Get("Server_AddressInvalidExample"),
        ServerAddressParseError.UnsupportedScheme => Loc.Format("Server_AddressScheme", scheme),
        ServerAddressParseError.InvalidPort => Loc.Get("Server_AddressPort"),
        _ => Loc.Get("Server_AddressInvalid"),
    };
}

/// <summary>
/// Where a Marquee server lives: scheme, host and port, normalized so the same
/// server always produces the same base URL (the dedupe key for discovery and
/// the credential store's key for its token).
///
/// Accepts what people actually type or paste: <c>192.168.1.20</c>,
/// <c>192.168.1.20:3000</c>, <c>tower.local</c>, <c>http://host:port/</c>, or
/// an <c>https://</c> URL behind a reverse proxy. Plain HTTP without a port
/// means the Docker default <c>APP_PORT</c> of 3000; HTTPS without a port
/// keeps the scheme's 443.
/// </summary>
public sealed record ServerAddress
{
    /// <summary>Marquee's docker-compose default (<c>APP_PORT</c>).</summary>
    public const int DefaultPort = 3000;

    public ServerScheme Scheme { get; }

    /// <summary>Lowercased host name or IP literal, without IPv6 brackets.</summary>
    public string Host { get; }

    /// <summary>Explicit port, or null for HTTPS on its default port.</summary>
    public int? Port { get; }

    public ServerAddress(string host, int? port = null, ServerScheme scheme = ServerScheme.Http)
    {
        Scheme = scheme;
        Host = host.ToLowerInvariant();
        Port = port ?? (scheme == ServerScheme.Http ? DefaultPort : null);
    }

    /// <summary>The port a TCP connection actually uses.</summary>
    public int EffectivePort => Port ?? Scheme.DefaultPort();

    public bool IsIPv6Literal => Host.Contains(':');

    private string HostForUrl => IsIPv6Literal ? $"[{Host}]" : Host;

    /// <summary><c>http://192.168.1.20:3000</c>, with no trailing slash.</summary>
    public string BaseUrlString
    {
        get
        {
            var value = $"{Scheme.Name()}://{HostForUrl}";
            return Port is { } port ? $"{value}:{port}" : value;
        }
    }

    /// <summary>Every component was validated when the address was built, so this never fails.</summary>
    public Uri BaseUrl => new(BaseUrlString, UriKind.Absolute);

    /// <summary>What the UI shows: <c>192.168.1.20:3000</c> for plain HTTP, the full URL for HTTPS.</summary>
    public string DisplayName => Scheme == ServerScheme.Http ? $"{HostForUrl}:{EffectivePort}" : BaseUrlString;

    public bool IsLoopback => Host == "localhost" || Host == "::1" || Host.StartsWith("127.", StringComparison.Ordinal);

    /// <summary>True for bare IPv4/IPv6 literals, false for names like <c>tower.local</c>.</summary>
    public bool IsIPLiteral => IsIPv6Literal || IPv4.Parse(Host) != null;

    public override string ToString() => BaseUrlString;

    /// <summary>
    /// On this network rather than across the internet: loopback, a private
    /// (RFC 1918) or link-local address, an IPv6 unique-local or link-local
    /// one, a <c>.local</c> / <c>.lan</c> / <c>.home.arpa</c> name, or a
    /// single-label name like <c>tower</c>. Plain http is the norm there;
    /// anywhere else it's worth a "Not encrypted" note, and a bare host name
    /// tries https first. The same rule as <c>isLocalNetwork</c> on the Mac.
    /// </summary>
    public bool IsLocalNetwork
    {
        get
        {
            if (IsLoopback)
            {
                return true;
            }
            if (IsIPv6Literal)
            {
                // fe80::/10 link-local, fc00::/7 unique-local.
                return Host.StartsWith("fe8", StringComparison.Ordinal) || Host.StartsWith("fe9", StringComparison.Ordinal)
                    || Host.StartsWith("fea", StringComparison.Ordinal) || Host.StartsWith("feb", StringComparison.Ordinal)
                    || Host.StartsWith("fc", StringComparison.Ordinal) || Host.StartsWith("fd", StringComparison.Ordinal);
            }
            if (IPv4.Parse(Host) is { } ip)
            {
                var first = ip >> 24;
                var second = (ip >> 16) & 0xFF;
                return first == 10
                    || (first == 172 && second is >= 16 and <= 31)
                    || (first == 192 && second == 168)
                    || (first == 169 && second == 254)
                    || first == 127;
            }
            var name = Host.TrimEnd('.');
            if (!name.Contains('.'))
            {
                return true;
            }
            return LocalSuffixes.Any(suffix => name.EndsWith(suffix, StringComparison.Ordinal));
        }
    }

    private static readonly string[] LocalSuffixes = [".local", ".lan", ".home.arpa", ".internal", ".localhost"];

    /// <summary>
    /// Plain http to a server that isn't on the local network: what's sent,
    /// the password included, can be read along the way.
    /// </summary>
    public bool IsUnencryptedRemote => Scheme == ServerScheme.Http && !IsLocalNetwork;

    /// <summary>
    /// The addresses to try, in order, for what was typed. A host that isn't
    /// on the local network, typed without a scheme, tries https first (on
    /// the typed port, else 443) and then plain http as before; anything
    /// else is just <see cref="Parse"/>.
    /// </summary>
    /// <exception cref="ServerAddressParseException">With the message to show inline.</exception>
    public static IReadOnlyList<ServerAddress> Candidates(string input)
    {
        var address = Parse(input);
        var trimmed = input.Trim();
        if (trimmed.Contains("://", StringComparison.Ordinal) || address.IsLocalNetwork)
        {
            return [address];
        }
        var authorityEnd = trimmed.IndexOfAny(['/', '?', '#']);
        var authority = authorityEnd >= 0 ? trimmed[..authorityEnd] : trimmed;
        var typedPort = SplitHostAndPort(authority).Port != null;
        var secure = new ServerAddress(address.Host, typedPort ? address.Port : null, ServerScheme.Https);
        return [secure, address];
    }


    /// <summary>
    /// Parses user input. Any path, query or fragment is dropped, since Marquee
    /// always serves from the root, so a pasted <c>http://tower:3000/discover</c> works.
    /// </summary>
    /// <exception cref="ServerAddressParseException">With the message to show inline.</exception>
    public static ServerAddress Parse(string input)
    {
        var trimmed = input.Trim();
        if (trimmed.Length == 0)
        {
            throw new ServerAddressParseException(ServerAddressParseError.Empty);
        }
        if (trimmed.Any(char.IsWhiteSpace))
        {
            throw new ServerAddressParseException(ServerAddressParseError.Invalid);
        }

        ServerScheme scheme;
        string rest;
        var schemeEnd = trimmed.IndexOf("://", StringComparison.Ordinal);
        if (schemeEnd >= 0)
        {
            var typedScheme = trimmed[..schemeEnd].ToLowerInvariant();
            scheme = typedScheme switch
            {
                "http" => ServerScheme.Http,
                "https" => ServerScheme.Https,
                _ => throw new ServerAddressParseException(ServerAddressParseError.UnsupportedScheme, typedScheme),
            };
            rest = trimmed[(schemeEnd + 3)..];
        }
        else
        {
            scheme = ServerScheme.Http;
            rest = trimmed;
        }

        // The authority is everything up to the path, query or fragment.
        var authorityEnd = rest.IndexOfAny(['/', '?', '#']);
        var authority = authorityEnd >= 0 ? rest[..authorityEnd] : rest;
        if (authority.Contains('@'))
        {
            // Credentials in the address are never what a Marquee URL looks like.
            throw new ServerAddressParseException(ServerAddressParseError.Invalid);
        }

        var (hostText, portText) = SplitHostAndPort(authority);

        // A non-numeric or out-of-range port is checked before the host so the
        // message is about the port, not the whole address.
        int? port = null;
        if (portText != null)
        {
            if (!int.TryParse(portText, NumberStyles.None, CultureInfo.InvariantCulture, out var parsedPort) || parsedPort is < 1 or > 65_535)
            {
                throw new ServerAddressParseException(ServerAddressParseError.InvalidPort);
            }
            port = parsedPort;
        }

        if (hostText.Length == 0 || !IsValidHost(hostText))
        {
            throw new ServerAddressParseException(ServerAddressParseError.Invalid);
        }

        var address = new ServerAddress(hostText, port, scheme);
        if (!Uri.TryCreate(address.BaseUrlString, UriKind.Absolute, out _))
        {
            throw new ServerAddressParseException(ServerAddressParseError.Invalid);
        }
        return address;
    }

    public static bool TryParse(string input, [NotNullWhen(true)] out ServerAddress? address)
    {
        try
        {
            address = Parse(input);
            return true;
        }
        catch (ServerAddressParseException)
        {
            address = null;
            return false;
        }
    }

    /// <summary>Rebuilds a saved base URL without re-applying defaults; null when the saved text is unusable.</summary>
    public static ServerAddress? FromBaseUrl(string baseUrlString) =>
        TryParse(baseUrlString, out var address) ? address : null;

    /// <summary>
    /// The host and, when a colon follows it, the port text (possibly empty:
    /// <c>tower.local:</c> is an invalid port, not a missing one). A bracketed
    /// IPv6 literal comes back without its brackets.
    /// </summary>
    private static (string Host, string? Port) SplitHostAndPort(string authority)
    {
        if (authority.StartsWith('['))
        {
            var close = authority.IndexOf(']');
            if (close < 0)
            {
                return (authority, null);
            }
            var host = authority[1..close];
            var after = authority[(close + 1)..];
            if (after.Length == 0)
            {
                return (host, null);
            }
            return after.StartsWith(':') ? (host, after[1..]) : (authority, null);
        }
        var colon = authority.LastIndexOf(':');
        return colon < 0 ? (authority, null) : (authority[..colon], authority[(colon + 1)..]);
    }

    private static bool IsValidHost(string host)
    {
        if (host.Contains(':'))
        {
            // An IPv6 literal (it arrived in brackets, so a stray colon elsewhere never gets here).
            return host.All(character => Uri.IsHexDigit(character) || character is ':' or '.' or '%');
        }
        if (!host.All(character => char.IsLetterOrDigit(character) || character is '-' or '.' or '_'))
        {
            return false;
        }
        if (host.StartsWith('.') || host.StartsWith('-') || host.Contains("..", StringComparison.Ordinal))
        {
            return false;
        }
        // All-numeric dotted hosts must be a real IPv4 address ("192.168.1" isn't).
        if (host.All(character => char.IsAsciiDigit(character) || character == '.'))
        {
            return IPv4.Parse(host) != null;
        }
        return true;
    }
}

/// <summary>IPv4 addresses as host-byte-order integers, so subnet math is plain arithmetic.</summary>
public static class IPv4
{
    public static uint? Parse(string text)
    {
        var parts = text.Split('.');
        if (parts.Length != 4)
        {
            return null;
        }
        uint value = 0;
        foreach (var part in parts)
        {
            if (part.Length is 0 or > 3 || !part.All(char.IsAsciiDigit)
                || !byte.TryParse(part, NumberStyles.None, CultureInfo.InvariantCulture, out var octet))
            {
                return null;
            }
            value = (value << 8) | octet;
        }
        return value;
    }

    public static string ToString(uint address) =>
        $"{(address >> 24) & 0xFF}.{(address >> 16) & 0xFF}.{(address >> 8) & 0xFF}.{address & 0xFF}";
}
