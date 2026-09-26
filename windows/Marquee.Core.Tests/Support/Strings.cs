using System.Runtime.CompilerServices;
using System.Xml.Linq;
using Marquee.Core.Localization;

namespace Marquee.Core.Tests.Support;

/// <summary>Paths into the checked-out source, found from this file's own location.</summary>
public static class SourceTree
{
    /// <summary>The repository's <c>windows/</c> folder.</summary>
    public static string Windows { get; } = Path.GetFullPath(Path.Combine(Here(), "..", "..", ".."));

    /// <summary>The WinUI app's project folder.</summary>
    public static string App => Path.Combine(Windows, "Marquee.Windows");

    /// <summary>The Core library's project folder.</summary>
    public static string Core => Path.Combine(Windows, "Marquee.Core");

    /// <summary>The app's resource folders, one per language: <c>Strings/&lt;language&gt;/Resources.resw</c>.</summary>
    public static string StringsFolder => Path.Combine(App, "Strings");

    /// <summary>Every file under <paramref name="root"/> with the extension, build output left out.</summary>
    public static IEnumerable<string> SourceFiles(string root, string extension) =>
        Directory.EnumerateFiles(root, "*" + extension, SearchOption.AllDirectories)
            .Where(path =>
            {
                var relative = Path.GetRelativePath(root, path).Replace('\\', '/');
                return !relative.StartsWith("obj/", StringComparison.Ordinal)
                    && !relative.StartsWith("bin/", StringComparison.Ordinal)
                    && !relative.Contains("/obj/", StringComparison.Ordinal)
                    && !relative.Contains("/bin/", StringComparison.Ordinal);
            })
            .Order(StringComparer.Ordinal);

    private static string Here([CallerFilePath] string path = "") => path;
}

/// <summary>A <c>.resw</c> file read as key to value, in file order.</summary>
public static class Resw
{
    /// <summary>The folder names under Strings/, English first.</summary>
    public const string EnglishFolder = "en-US";

    /// <summary>The other shipped languages' folders, with the server code each stands for.</summary>
    public static IReadOnlyDictionary<string, string> Translations { get; } = new Dictionary<string, string>
    {
        ["es"] = "es",
        ["fr"] = "fr",
        ["de"] = "de",
        ["pt-BR"] = "pt-BR",
    };

    public static string PathFor(string folder) => System.IO.Path.Combine(SourceTree.StringsFolder, folder, "Resources.resw");

    public static IReadOnlyDictionary<string, string> Read(string folder)
    {
        var document = XDocument.Load(PathFor(folder));
        var values = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var data in document.Root!.Elements("data"))
        {
            var name = (string?)data.Attribute("name") ?? throw new InvalidDataException($"A <data> without a name in {folder}.");
            if (!values.TryAdd(name, (string?)data.Element("value") ?? ""))
            {
                throw new InvalidDataException($"{name} appears twice in {folder}.");
            }
        }
        return values;
    }

    private static readonly Lazy<IReadOnlyDictionary<string, string>> english = new(() => Read(EnglishFolder));

    /// <summary>The English strings, the source every other language translates.</summary>
    public static IReadOnlyDictionary<string, string> English => english.Value;
}

/// <summary>
/// Core builds some of its text (errors, labels) through <see cref="Loc"/>.
/// The app resolves it through its resource loader; here it's the English
/// resource file itself, so tests that check a message check the real one.
/// </summary>
internal static class EnglishStrings
{
#pragma warning disable CA2255 // A test assembly's own setup, not a library's.
    [ModuleInitializer]
#pragma warning restore CA2255
    internal static void Install() => Loc.Resolver = key => Resw.English.GetValueOrDefault(key);
}
