using Marquee.Core.Models;

namespace Marquee.Core.Tests.Support;

/// <summary>
/// The doc's example responses, linked from mac/MarqueeTests/Fixtures/api by
/// the test project file and copied next to the test assembly.
/// </summary>
public static class Fixtures
{
    public static string Root { get; } = Path.Combine(AppContext.BaseDirectory, "Fixtures", "api");

    /// <summary>The raw JSON of <c>&lt;name&gt;.json</c>.</summary>
    public static string Read(string name) => File.ReadAllText(Path.Combine(Root, name + ".json"));

    /// <summary>The fixture decoded with the shared <see cref="Json.Options"/>, as the transport would.</summary>
    public static T Decode<T>(string name) => Json.Decode<T>(Read(name));

    /// <summary>Every fixture name, sorted.</summary>
    public static IReadOnlyList<string> Names =>
        Directory.GetFiles(Root, "*.json")
            .Select(Path.GetFileNameWithoutExtension)
            .OfType<string>()
            .Order(StringComparer.Ordinal)
            .ToList();
}
