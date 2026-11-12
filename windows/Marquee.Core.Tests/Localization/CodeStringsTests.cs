using System.Text;
using System.Text.RegularExpressions;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests.Localization;

/// <summary>
/// The C# side of the strings: text people read goes through
/// <c>Loc.Get("Key")</c>, <c>Loc.Format("Key", …)</c> or
/// <c>Loc.Plural("Key", count, …)</c>, and every key those name exists in
/// English. A string literal that reads like prose anywhere in the app or
/// Core is flagged unless it's a key, a developer-facing exception, or on
/// <see cref="Allowed"/>.
/// </summary>
public sealed partial class CodeStringsTests
{
    /// <summary>
    /// Literals that read like prose but aren't shown to anyone, or are
    /// never translated: "file name: literal".
    /// </summary>
    internal static readonly HashSet<string> Allowed =
    [
        "ApiClient.cs: Accept",
        "ApiClient.cs: Bearer",
        "ApiClient.cs: Couldn't encode the request: {…}",
        "ApiClient.cs: Invalid content type: {…}",
        "ApiClient.cs: Invalid request path: {…}",
        "ApiClient.cs: Invalid server path: {…}",
        "ApiClient.cs: image/*, application/json",
        "ApiClient.cs: the proxy answered {…}",
        "ApiException.cs: Couldn't resolve this show for Sonarr.",
        "App.xaml.cs: Loading App.xaml",
        "App.xaml.cs: Starting up",
        "App.xaml.cs: Windows PC",
        "AppLanguage.cs: Deutsch",
        "AppLanguage.cs: English",
        "AppLanguage.cs: Español",
        "AppLanguage.cs: Français",
        "AppLanguage.cs: Português (Brasil)",
        "AppLocalization.cs: Language",
        "AppLocalization.cs: Resources",
        "CrashReporter.cs: Marquee ran into a problem and has to close.",
        "CrashReporter.cs: The details are saved in:",
        "CrashReporter.cs: UI thread",
        "CrashReporter.cs: Unobserved task",
        "ErrorReferencePage.cs: Consolas",
        "LibraryModels.cs: Dolby Vision",
        "LibraryModels.cs: {…} Mbps",
        "LogsSettingsView.cs: Consolas",
        "MainWindow.xaml.cs: Assets",
        "MarqueeApi.Discover.cs: TMDb isn't configured on this server. An admin needs to add a TMDb access token in Settings → Integrations.",
        "PasswordVaultTokenStore.cs: Marquee server session",
        "RailScroll.cs: Pan",
        "ServerSession.cs: Windows PC",
        "SsoModels.cs: openid profile email",
        "TrailerDialog.xaml.cs: Content-Type: text/html; charset=utf-8",
        "UpdateService.cs: Accept",
        "Updater.cs: /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /CLOSEAPPLICATIONS /NORESTARTAPPLICATIONS /relaunch=1",
        "WhatsNew.cs: export const CHANGELOG",
    ];

    /// <summary>Developer-facing: exceptions no one outside a debugger or a crash log sees.</summary>
    private static readonly string[] DeveloperContexts =
    [
        "new InvalidOperationException(", "new ArgumentException(", "new ArgumentOutOfRangeException(",
        "new ArgumentNullException(", "new NotSupportedException(", "new NotImplementedException(",
        "new JsonException(", "new FormatException(", "new InvalidDataException(", "new UnreachableException(",
        "Debug.WriteLine(", "Debug.Fail(", "Debug.Assert(", "Trace.WriteLine(",
    ];

    /// <summary>Brand names and other words that are the same in every language.</summary>
    private static readonly HashSet<string> Untranslated = new(XamlStringsTests.Allowed, StringComparer.Ordinal);

    public static IEnumerable<string> CodeFiles =>
        SourceTree.SourceFiles(SourceTree.App, ".cs").Concat(SourceTree.SourceFiles(SourceTree.Core, ".cs"));

    private static string Name(string path) => Path.GetRelativePath(SourceTree.Windows, path).Replace('\\', '/');

    [Fact]
    public void NoLiteralProse()
    {
        var problems = new List<string>();
        foreach (var file in CodeFiles)
        {
            var name = Path.GetFileName(file);
            foreach (var literal in Literals(File.ReadAllText(file)))
            {
                if (literal.IsKey || literal.IsRaw || !IsProse(literal.Text))
                {
                    continue;
                }
                if (DeveloperContexts.Any(context => literal.Before.Contains(context, StringComparison.Ordinal)))
                {
                    continue;
                }
                if (literal.Before.TrimStart().StartsWith('['))
                {
                    continue; // an attribute
                }
                if (Allowed.Contains($"{name}: {literal.Text}"))
                {
                    continue;
                }
                problems.Add($"{Name(file)}:{literal.Line} \"{literal.Text}\"");
            }
        }
        Assert.True(problems.Count == 0,
            "Text in code that isn't looked up (use Loc.Get/Format/Plural with a key in Strings/*/Resources.resw, or add it to CodeStringsTests.Allowed if no one reads it):\n"
            + string.Join("\n", problems));
    }

    [Fact]
    public void EveryKeyTheCodeNamesExists()
    {
        var problems = new List<string>();
        var count = 0;
        foreach (var file in CodeFiles)
        {
            foreach (var literal in Literals(File.ReadAllText(file)).Where(literal => literal.IsKey))
            {
                count++;
                var keys = literal.IsPluralKey ? [literal.Text + "_One", literal.Text + "_Other"] : new[] { literal.Text };
                foreach (var key in keys)
                {
                    if (!Resw.English.ContainsKey(key))
                    {
                        problems.Add($"{Name(file)}:{literal.Line} {key}");
                    }
                    else if (key.Contains('.'))
                    {
                        problems.Add($"{Name(file)}:{literal.Line} {key}: an x:Uid property key, looked up from code (give the code its own key)");
                    }
                }
            }
        }
        Assert.True(count > 0, "No Loc calls found; the scanner is broken.");
        Assert.True(problems.Count == 0, "Keys missing from en-US/Resources.resw:\n" + string.Join("\n", problems));
    }

    [Fact]
    public void KeysAreNamedLiterally()
    {
        // A key built at run time can't be checked above; list the choices in a switch instead.
        var problems = new List<string>();
        foreach (var file in CodeFiles)
        {
            if (file.EndsWith("Loc.cs", StringComparison.Ordinal))
            {
                continue;
            }
            var lines = File.ReadAllLines(file);
            for (var index = 0; index < lines.Length; index++)
            {
                if (NonLiteralKey().IsMatch(lines[index]))
                {
                    problems.Add($"{Name(file)}:{index + 1} {lines[index].Trim()}");
                }
            }
        }
        Assert.True(problems.Count == 0, "Loc called with a computed key:\n" + string.Join("\n", problems));
    }

    [Theory]
    [InlineData("Movies", true)]
    [InlineData("Loading…", true)]
    [InlineData("Couldn't save.", true)]
    [InlineData("not responding", true)]
    [InlineData("{0} of {1}", false)]
    [InlineData("IsBusy", false)]
    [InlineData("application/json", false)]
    [InlineData("/api/v1/me", false)]
    [InlineData("Plex", false)]
    [InlineData("User-Agent", false)]
    [InlineData("yyyy-MM-dd", false)]
    [InlineData("", false)]
    public void ProseDetection(string text, bool prose) => Assert.Equal(prose, IsProse(text));

    [Fact]
    public void TheScannerFindsLiteralsAndKeys()
    {
        const string source = """
            // "Not this"
            var a = "Show me";
            var b = Loc.Get("Some_Key");
            var c = Loc.Plural("Count_Key", 3, x);
            var d = $"Hello {name}, welcome";
            var e = @"Verbatim ""quoted"" text";
            /* "Nor this" */ var f = 'x';
            """;
        var literals = Literals(source).ToList();
        Assert.Equal(["Show me", "Some_Key", "Count_Key", "Hello {…}, welcome", "Verbatim \"quoted\" text"], literals.Select(literal => literal.Text));
        Assert.True(literals[1].IsKey);
        Assert.True(literals[2].IsPluralKey);
        Assert.Equal(2, literals[0].Line);
    }

    internal sealed record Literal(string Text, int Line, string Before, bool IsKey, bool IsPluralKey, bool IsRaw);

    /// <summary>
    /// Reads like prose: a sentence or phrase (two words or more with a
    /// letter), or one plain capitalized word ("Movies", "Save…"). Leaves
    /// out identifiers, paths, media types, format patterns and brand names.
    /// </summary>
    internal static bool IsProse(string text)
    {
        var bare = Hole().Replace(text, "").Trim();
        if (bare.Length == 0 || Untranslated.Contains(bare))
        {
            return false;
        }
        if (!bare.Any(char.IsWhiteSpace))
        {
            return SingleWord().IsMatch(bare) && !Untranslated.Contains(bare.TrimEnd('.', '…', '!', '?', ':'));
        }
        var words = Word().Matches(bare).Select(match => match.Value).Where(word => !Untranslated.Contains(word)).ToList();
        if (words.Count == 0)
        {
            return false;
        }
        // "yyyy-MM-dd HH:mm" and the like.
        return !FormatPattern().IsMatch(bare);
    }

    /// <summary>Every string literal in C# source, with comments and character literals skipped.</summary>
    internal static IEnumerable<Literal> Literals(string source)
    {
        var line = 1;
        var lineStart = 0;
        var index = 0;
        while (index < source.Length)
        {
            var character = source[index];
            if (character == '\n')
            {
                line++;
                index++;
                lineStart = index;
                continue;
            }
            if (character == '/' && Peek(source, index + 1) == '/')
            {
                while (index < source.Length && source[index] != '\n')
                {
                    index++;
                }
                continue;
            }
            if (character == '/' && Peek(source, index + 1) == '*')
            {
                index += 2;
                while (index < source.Length && !(source[index] == '*' && Peek(source, index + 1) == '/'))
                {
                    if (source[index] == '\n')
                    {
                        line++;
                        lineStart = index + 1;
                    }
                    index++;
                }
                index += 2;
                continue;
            }
            if (character == '\'')
            {
                // A character literal: '"' must not start a string.
                index++;
                while (index < source.Length && source[index] != '\'')
                {
                    index += source[index] == '\\' ? 2 : 1;
                }
                index++;
                continue;
            }
            // Prefixes: $, @, $@, @$, $$ before a quote.
            var start = index;
            var interpolated = false;
            var verbatim = false;
            var dollars = 0;
            while (index < source.Length && (source[index] == '$' || source[index] == '@'))
            {
                if (source[index] == '$')
                {
                    interpolated = true;
                    dollars++;
                }
                else
                {
                    verbatim = true;
                }
                index++;
            }
            if (index >= source.Length || source[index] != '"')
            {
                index = start + 1;
                continue;
            }
            var before = source[lineStart..start];
            var literalLine = line;
            if (source.AsSpan(index).StartsWith("\"\"\""))
            {
                // Raw string: skipped as a whole (JSON and the like).
                var quotes = 0;
                while (index < source.Length && source[index] == '"')
                {
                    quotes++;
                    index++;
                }
                var close = new string('"', quotes);
                var end = source.IndexOf(close, index, StringComparison.Ordinal);
                var body = end < 0 ? source[index..] : source[index..end];
                line += body.Count(c => c == '\n');
                index = end < 0 ? source.Length : end + quotes;
                lineStart = source.LastIndexOf('\n', Math.Max(0, index - 1)) + 1;
                yield return new Literal(body, literalLine, before, false, false, true);
                continue;
            }
            index++; // opening quote
            var text = new StringBuilder();
            while (index < source.Length)
            {
                var current = source[index];
                if (verbatim)
                {
                    if (current == '"')
                    {
                        if (Peek(source, index + 1) == '"')
                        {
                            text.Append('"');
                            index += 2;
                            continue;
                        }
                        index++;
                        break;
                    }
                }
                else
                {
                    if (current == '\\')
                    {
                        text.Append(Peek(source, index + 1) switch
                        {
                            'n' => '\n',
                            't' => '\t',
                            '"' => '"',
                            '\\' => '\\',
                            '\'' => '\'',
                            var other => other,
                        });
                        index += 2;
                        continue;
                    }
                    if (current == '"')
                    {
                        index++;
                        break;
                    }
                    if (current == '\n')
                    {
                        break; // malformed; stop at the line's end
                    }
                }
                if (interpolated && current == '{')
                {
                    if (Peek(source, index + 1) == '{' && dollars == 1)
                    {
                        text.Append('{');
                        index += 2;
                        continue;
                    }
                    // A hole: skip to its matching brace, stepping over strings inside it.
                    var depth = 0;
                    while (index < source.Length)
                    {
                        var inner = source[index];
                        if (inner == '{')
                        {
                            depth++;
                        }
                        else if (inner == '}')
                        {
                            depth--;
                            if (depth == 0)
                            {
                                index++;
                                break;
                            }
                        }
                        else if (inner == '"')
                        {
                            index++;
                            while (index < source.Length && source[index] != '"')
                            {
                                index += source[index] == '\\' ? 2 : 1;
                            }
                        }
                        index++;
                    }
                    text.Append("{…}");
                    continue;
                }
                if (interpolated && current == '}' && Peek(source, index + 1) == '}')
                {
                    text.Append('}');
                    index += 2;
                    continue;
                }
                if (current == '\n')
                {
                    line++;
                    lineStart = index + 1;
                }
                text.Append(current);
                index++;
            }
            var call = LocCall().Match(before);
            var isKey = call.Success && !interpolated;
            yield return new Literal(text.ToString(), literalLine, before, isKey, isKey && call.Groups[1].Value is "Plural" or "PluralKey", false);
        }
    }

    private static char Peek(string source, int index) => index < source.Length ? source[index] : '\0';

    /// <summary>The literal is the first argument of a Loc lookup.</summary>
    [GeneratedRegex(@"\bLoc\.(Get|Format|Plural|PluralKey)\(\s*$")]
    private static partial Regex LocCall();

    [GeneratedRegex(@"\bLoc\.(Get|Format|Plural|PluralKey)\(\s*[^""\s)]")]
    private static partial Regex NonLiteralKey();

    [GeneratedRegex(@"\{[^{}]*\}")]
    private static partial Regex Hole();

    [GeneratedRegex(@"^\p{Lu}\p{Ll}+[.…!?:]?$")]
    private static partial Regex SingleWord();

    [GeneratedRegex(@"\p{L}{2,}")]
    private static partial Regex Word();

    [GeneratedRegex(@"^[yMdHhmsftzK.:/\- ,']+$")]
    private static partial Regex FormatPattern();
}
