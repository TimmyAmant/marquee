using System.Globalization;

namespace Marquee.Core.Localization;

/// <summary>
/// Every piece of text the app writes for people, looked up by key. The
/// strings themselves live in the app's resource files
/// (windows/Marquee.Windows/Strings/&lt;language&gt;/Resources.resw, English
/// first), so Core stays free of WinUI: the app installs a
/// <see cref="Resolver"/> over its resource loader at startup, and the tests
/// install one that reads the English file straight from the source tree.
///
/// A key the resolver doesn't know comes back as the key itself, so a
/// missing string is visible on screen rather than blank (the tests make
/// sure that never ships).
/// </summary>
public static class Loc
{
    private static Func<string, string?> resolver = _ => null;

    /// <summary>
    /// Key to text in the language the app shows, null for an unknown key.
    /// Set once at startup, before any string is read.
    /// </summary>
    public static Func<string, string?> Resolver
    {
        get => resolver;
        set => resolver = value ?? throw new ArgumentNullException(nameof(value));
    }

    /// <summary>The text for <paramref name="key"/>.</summary>
    public static string Get(string key) => Resolver(key) is { Length: > 0 } text ? text : key;

    /// <summary>
    /// The text for <paramref name="key"/> with its <c>{0}</c>, <c>{1}</c>…
    /// filled in (numbers and dates in the app's culture). Translations may
    /// reorder the placeholders.
    /// </summary>
    public static string Format(string key, params object?[] args) =>
        string.Format(CultureInfo.CurrentCulture, Get(key), args);

    /// <summary>
    /// A count with its words: <c>key_One</c> or <c>key_Other</c> by the
    /// language's plural rule, with <c>{0}</c> the count (formatted for the
    /// culture) and <c>{1}</c>, <c>{2}</c>… the <paramref name="args"/>.
    /// Every language Marquee ships has just these two forms; French and
    /// Portuguese count 0 as singular ("0 film", "0 filme").
    /// </summary>
    public static string Plural(string key, long count, params object?[] args)
    {
        var all = new object?[args.Length + 1];
        all[0] = count;
        Array.Copy(args, 0, all, 1, args.Length);
        return string.Format(CultureInfo.CurrentCulture, Get(PluralKey(key, count)), all);
    }

    /// <summary><c>key_One</c> or <c>key_Other</c> for <paramref name="count"/> in the current language.</summary>
    public static string PluralKey(string key, long count) =>
        key + (IsSingular(count, AppLanguage.Current) ? "_One" : "_Other");

    /// <summary>The CLDR "one" category for the shipped languages (integers only).</summary>
    public static bool IsSingular(long count, string language) => language switch
    {
        "fr" or "pt-BR" => count is 0 or 1,
        _ => count == 1,
    };
}
