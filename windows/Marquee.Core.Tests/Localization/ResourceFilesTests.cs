using System.Text.RegularExpressions;
using Marquee.Core.Localization;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests.Localization;

/// <summary>
/// The app's strings: English (Strings/en-US/Resources.resw) is the source,
/// and every other language has every key, translated (non-empty), with the
/// same <c>{0}</c>, <c>{1}</c>… placeholders, and nothing English lacks.
/// </summary>
public sealed partial class ResourceFilesTests
{
    public static TheoryData<string> Languages
    {
        get
        {
            var data = new TheoryData<string>();
            foreach (var folder in Resw.Translations.Keys)
            {
                data.Add(folder);
            }
            return data;
        }
    }

    [Fact]
    public void EnglishHasStringsAndNoneIsEmpty()
    {
        Assert.NotEmpty(Resw.English);
        var empty = Resw.English.Where(pair => string.IsNullOrWhiteSpace(pair.Value)).Select(pair => pair.Key).ToList();
        Assert.True(empty.Count == 0, "Empty English strings: " + string.Join(", ", empty));
    }

    [Theory]
    [MemberData(nameof(Languages))]
    public void EveryLanguageHasEveryKeyAndNoOthers(string folder)
    {
        var translated = Resw.Read(folder);
        var missing = Resw.English.Keys.Where(key => !translated.ContainsKey(key)).ToList();
        var extra = translated.Keys.Where(key => !Resw.English.ContainsKey(key)).ToList();
        Assert.True(missing.Count == 0, $"{folder} is missing: " + string.Join(", ", missing));
        Assert.True(extra.Count == 0, $"{folder} has keys English doesn't: " + string.Join(", ", extra));
    }

    [Theory]
    [MemberData(nameof(Languages))]
    public void EveryTranslationIsNonEmptyWithTheSamePlaceholders(string folder)
    {
        var translated = Resw.Read(folder);
        var problems = new List<string>();
        foreach (var (key, english) in Resw.English)
        {
            if (!translated.TryGetValue(key, out var text))
            {
                continue;
            }
            if (string.IsNullOrWhiteSpace(text))
            {
                problems.Add($"{key}: empty");
                continue;
            }
            var expected = Placeholders(english);
            var actual = Placeholders(text);
            if (!expected.SetEquals(actual))
            {
                problems.Add($"{key}: English has {{{string.Join("}, {", expected)}}}, {folder} has {{{string.Join("}, {", actual)}}}");
            }
            if (!BalancedBraces(text))
            {
                problems.Add($"{key}: a brace that string.Format would reject");
            }
        }
        Assert.True(problems.Count == 0, string.Join("\n", problems));
    }

    [Fact]
    public void EnglishBracesAreValidFormatStrings()
    {
        var bad = Resw.English.Where(pair => !BalancedBraces(pair.Value)).Select(pair => pair.Key).ToList();
        Assert.True(bad.Count == 0, "Unbalanced braces: " + string.Join(", ", bad));
    }

    [Fact]
    public void PluralsComeInPairs()
    {
        var problems = new List<string>();
        foreach (var key in Resw.English.Keys)
        {
            if (key.EndsWith("_One", StringComparison.Ordinal) && !Resw.English.ContainsKey(key[..^4] + "_Other"))
            {
                problems.Add($"{key} has no _Other");
            }
            if (key.EndsWith("_Other", StringComparison.Ordinal) && !Resw.English.ContainsKey(key[..^6] + "_One"))
            {
                problems.Add($"{key} has no _One");
            }
        }
        Assert.True(problems.Count == 0, string.Join("\n", problems));
    }

    [Fact]
    public void KeysAreResourceNames()
    {
        // x:Uid keys are "Uid.Property" (or "Uid.[using:…]Owner.Property");
        // the code's own keys are plain identifiers.
        var bad = Resw.English.Keys.Where(key => !KeyShape().IsMatch(key)).ToList();
        Assert.True(bad.Count == 0, "Oddly shaped keys: " + string.Join(", ", bad));
    }

    [Fact]
    public void TheSettingsFolderNamesMatchTheShippedLanguages()
    {
        Assert.Equal(AppLanguage.Supported.Where(code => code != AppLanguage.English).Order(), Resw.Translations.Values.Order());
        foreach (var folder in Resw.Translations.Keys.Append(Resw.EnglishFolder))
        {
            Assert.True(File.Exists(Resw.PathFor(folder)), $"No {Resw.PathFor(folder)}");
        }
    }

    /// <summary>The placeholder indexes a format string uses: "{0} of {1:N0}" is {0, 1}.</summary>
    internal static HashSet<int> Placeholders(string text) =>
        Placeholder().Matches(text.Replace("{{", "", StringComparison.Ordinal).Replace("}}", "", StringComparison.Ordinal))
            .Select(match => int.Parse(match.Groups[1].Value, System.Globalization.CultureInfo.InvariantCulture))
            .ToHashSet();

    internal static bool BalancedBraces(string text)
    {
        var stripped = Placeholder().Replace(text.Replace("{{", "", StringComparison.Ordinal).Replace("}}", "", StringComparison.Ordinal), "");
        return !stripped.Contains('{') && !stripped.Contains('}');
    }

    [GeneratedRegex(@"\{(\d+)(?:,-?\d+)?(?::[^{}]*)?\}")]
    private static partial Regex Placeholder();

    [GeneratedRegex(@"^[A-Za-z][A-Za-z0-9_]*(\.(\[using:[A-Za-z.]+\])?[A-Za-z]+(\.[A-Za-z]+)?)?$")]
    private static partial Regex KeyShape();
}
