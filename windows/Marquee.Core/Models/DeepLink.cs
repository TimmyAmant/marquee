using System.Globalization;

namespace Marquee.Core.Models;

/// <summary>
/// A <c>marquee://</c> link (<c>marquee://title/movie/603</c>), the same
/// ones the Mac and iPhone apps open (<c>AppModel.handle(url:)</c>). A link
/// only ever says where to go: it never performs an action, so a web page
/// or another app can open a screen in Marquee and nothing more.
/// </summary>
public abstract record DeepLink
{
    public const string Scheme = "marquee";

    private DeepLink()
    {
    }

    public sealed record Title(TitleId Id) : DeepLink;

    public sealed record Person(int TmdbId) : DeepLink;

    public sealed record Company(int TmdbId) : DeepLink;

    /// <summary>A Discover list: a built-in one, or (0.49+) a custom row's id.</summary>
    public sealed record DiscoverList(DiscoverListKind List) : DeepLink;

    public sealed record Settings : DeepLink;

    public sealed record Search(string Query) : DeepLink;

    /// <summary>What the link points at; null for anything that isn't a <c>marquee://</c> link this app knows.</summary>
    public static DeepLink? Parse(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)
            || !Uri.TryCreate(text.Trim(), UriKind.Absolute, out var uri)
            || !string.Equals(uri.Scheme, Scheme, StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }
        var parts = new[] { uri.Host }
            .Concat(uri.AbsolutePath.Split('/', StringSplitOptions.RemoveEmptyEntries).Select(Uri.UnescapeDataString))
            .Where(part => part.Length > 0)
            .ToList();
        if (parts.Count == 0)
        {
            return null;
        }
        switch (parts[0].ToLowerInvariant())
        {
            case "title" when parts.Count >= 3 && TryId(parts[2], out var id):
                var type = MediaType.FromValue(parts[1]);
                return type.IsKnown ? new Title(new TitleId(type, id)) : null;
            case "person" when parts.Count >= 2 && TryId(parts[1], out var person):
                return new Person(person);
            case "company" when parts.Count >= 2 && TryId(parts[1], out var company):
                return new Company(company);
            case "discover" when parts.Count >= 2:
                var list = DiscoverListKind.FromValue(parts[1]);
                return list.IsKnown || list.IsCustomRow ? new DiscoverList(list) : null;
            case "settings":
                return new Settings();
            case "search":
                var query = QueryValue(uri.Query, "q")?.Trim();
                return string.IsNullOrEmpty(query) ? null : new Search(query);
            default:
                return null;
        }
    }

    /// <summary>
    /// The link in a launch's command line: the installer registers
    /// <c>"Marquee.Windows.exe" "%1"</c> for <c>marquee:</c>, so a click on a
    /// link starts the app (or hands over to the running one) with the link
    /// as its argument.
    /// </summary>
    public static DeepLink? FromCommandLine(string? commandLine)
    {
        if (string.IsNullOrWhiteSpace(commandLine))
        {
            return null;
        }
        var start = commandLine.IndexOf(Scheme + ":", StringComparison.OrdinalIgnoreCase);
        if (start < 0)
        {
            return null;
        }
        var rest = commandLine[start..];
        var end = rest.IndexOfAny(['"', ' ']);
        return Parse(end < 0 ? rest : rest[..end]);
    }

    private static bool TryId(string text, out int id) =>
        int.TryParse(text, NumberStyles.None, CultureInfo.InvariantCulture, out id) && id > 0;

    private static string? QueryValue(string query, string name)
    {
        foreach (var pair in query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var equals = pair.IndexOf('=');
            var key = equals < 0 ? pair : pair[..equals];
            if (Uri.UnescapeDataString(key) == name)
            {
                return equals < 0 ? "" : Uri.UnescapeDataString(pair[(equals + 1)..]);
            }
        }
        return null;
    }
}
