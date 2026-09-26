using Marquee.Core.Connection;

namespace Marquee.Core.Localization;

/// <summary>
/// The languages Marquee ships in, and which one the app shows: the
/// account's choice (<c>GET /me</c>'s <c>language</c>, remembered on this PC
/// so the next launch starts in it) when it's one of these, else the first
/// of Windows' preferred languages that is, else English.
/// </summary>
public static class AppLanguage
{
    public const string English = "en";

    /// <summary>The server's codes, in the picker's order.</summary>
    public static IReadOnlyList<string> Supported { get; } = ["en", "es", "fr", "de", "pt-BR"];

    /// <summary>
    /// The language the app is showing right now, set once at startup. It is
    /// what the plural rule follows and what every API request sends as
    /// <c>Accept-Language</c>, so the server's own texts match the app's.
    /// </summary>
    public static string Current { get; set; } = English;

    /// <summary>The key in <see cref="ISettingsStore"/>: the account's language, absent to follow Windows.</summary>
    public const string SettingKey = "language";

    /// <summary>Each language written in itself, as the picker lists it.</summary>
    public static string NativeName(string code) => code switch
    {
        "es" => "Español",
        "fr" => "Français",
        "de" => "Deutsch",
        "pt-BR" => "Português (Brasil)",
        _ => "English",
    };

    /// <summary>
    /// One of <see cref="Supported"/> for a language tag, or null. The
    /// server's codes in any case; "es-MX" is Spanish, and any Portuguese is
    /// Brazilian Portuguese, the only one Marquee has.
    /// </summary>
    public static string? Normalize(string? tag)
    {
        var trimmed = tag?.Trim();
        if (string.IsNullOrEmpty(trimmed))
        {
            return null;
        }
        var primary = trimmed.Split('-', '_')[0].ToLowerInvariant();
        return primary switch
        {
            "en" => "en",
            "es" => "es",
            "fr" => "fr",
            "de" => "de",
            "pt" => "pt-BR",
            _ => null,
        };
    }

    /// <summary>
    /// What the app shows: <paramref name="chosen"/> when it's one of ours,
    /// else the first of <paramref name="systemLanguages"/> (most preferred
    /// first) that is, else English.
    /// </summary>
    public static string Resolve(string? chosen, IEnumerable<string> systemLanguages)
    {
        if (Normalize(chosen) is { } account)
        {
            return account;
        }
        foreach (var tag in systemLanguages)
        {
            if (Normalize(tag) is { } system)
            {
                return system;
            }
        }
        return English;
    }

    /// <summary>The saved choice (a supported code), or null to follow Windows.</summary>
    public static string? ReadChoice(ISettingsStore store) => Normalize(store.GetString(SettingKey));

    /// <summary>Remembers the account's choice for the next launch; null follows Windows.</summary>
    public static void WriteChoice(ISettingsStore store, string? code) => store.SetString(SettingKey, Normalize(code));
}
