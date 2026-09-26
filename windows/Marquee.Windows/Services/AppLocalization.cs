using System.Globalization;
using Marquee.Core.Connection;
using Marquee.Core.Localization;
using Microsoft.Windows.ApplicationModel.Resources;

namespace Marquee.Windows.Services;

/// <summary>
/// Which language this run of the app shows, decided once at startup before
/// any XAML loads: the account's choice (<c>GET /me</c>'s <c>language</c>,
/// remembered in the settings file under <see cref="AppLanguage.SettingKey"/>)
/// when there is one, else the first of Windows' display languages Marquee
/// has, else English.
///
/// The decision is applied three ways, so every string agrees:
/// <list type="bullet">
/// <item><c>ApplicationLanguages.PrimaryLanguageOverride</c>, which the XAML
/// <c>x:Uid</c> lookups follow. Always set, even when following Windows, so
/// XAML and code can't choose differently.</item>
/// <item><see cref="Loc.Resolver"/> over a resource context pinned to the same
/// language, for the text view models build.</item>
/// <item>The thread cultures, so dates and numbers read like the language
/// (kept as Windows has them when it's the same language, en-GB dates stay
/// British).</item>
/// </list>
/// Switching language while running would leave every page already built in
/// the old one, so a change asks for a restart instead.
/// </summary>
public static class AppLocalization
{
    /// <summary>The language this run shows: one of <see cref="AppLanguage.Supported"/>.</summary>
    public static string Applied { get; private set; } = AppLanguage.English;

    /// <summary>Called from the App constructor, before <c>InitializeComponent</c>.</summary>
    public static void Apply(ISettingsStore settings)
    {
        var language = AppLanguage.Resolve(AppLanguage.ReadChoice(settings), SystemLanguages());
        Applied = language;
        AppLanguage.Current = language;
        var tag = ResourceTag(language);

        try
        {
            Microsoft.Windows.Globalization.ApplicationLanguages.PrimaryLanguageOverride = tag;
        }
        catch (Exception error) when (error is ArgumentException or InvalidOperationException or System.Runtime.InteropServices.COMException)
        {
            // Resources then follow Windows' own list; the strings from code
            // below still use the chosen language.
        }

        InstallResolver(tag);
        ApplyCulture(language);
    }

    /// <summary>
    /// True when the language saved for the next launch isn't the one on
    /// screen: the account's choice changed (here, on another device, or a
    /// first sign-in on this PC).
    /// </summary>
    public static bool NeedsRestart(ISettingsStore settings) =>
        AppLanguage.Resolve(AppLanguage.ReadChoice(settings), SystemLanguages()) != Applied;

    /// <summary>
    /// Starts Marquee again (in the saved language). False when Windows
    /// wouldn't, in which case the language changes the next time it starts.
    /// </summary>
    public static bool Restart()
    {
        try
        {
            // On success this never returns: Windows starts a new copy once
            // this one has quit. Coming back at all means it refused.
            _ = Microsoft.Windows.AppLifecycle.AppInstance.Restart("");
            return false;
        }
        catch (Exception error) when (error is InvalidOperationException or System.Runtime.InteropServices.COMException or UnauthorizedAccessException)
        {
            return false;
        }
    }

    /// <summary>The Strings/ folder a code lives in: English is en-US, the others their own code.</summary>
    public static string ResourceTag(string language) => language == AppLanguage.English ? "en-US" : language;

    /// <summary>Windows' display languages, most preferred first.</summary>
    private static IReadOnlyList<string> SystemLanguages()
    {
        try
        {
            var languages = global::Windows.System.UserProfile.GlobalizationPreferences.Languages;
            if (languages.Count > 0)
            {
                return [.. languages];
            }
        }
        catch (Exception error) when (error is InvalidOperationException or System.Runtime.InteropServices.COMException or UnauthorizedAccessException)
        {
            // Fall back to the process's own UI culture below.
        }
        return [CultureInfo.CurrentUICulture.Name];
    }

    private static void InstallResolver(string tag)
    {
        try
        {
            var manager = new ResourceManager();
            var context = manager.CreateResourceContext();
            context.QualifierValues["Language"] = tag;
            var map = manager.MainResourceMap.GetSubtree("Resources");
            Loc.Resolver = key =>
            {
                try
                {
                    return map.TryGetValue(key, context)?.ValueAsString;
                }
                catch (Exception error) when (error is ArgumentException or System.Runtime.InteropServices.COMException)
                {
                    return null;
                }
            };
        }
        catch (Exception error) when (error is System.Runtime.InteropServices.COMException or InvalidOperationException or FileNotFoundException)
        {
            // No resource index next to the .exe: nothing would load anyway
            // (the XAML lives in it too); keys show as themselves meanwhile.
        }
    }

    private static void ApplyCulture(string language)
    {
        var ui = CultureInfo.GetCultureInfo(language == AppLanguage.English ? "en-US" : language);
        var current = CultureInfo.CurrentCulture;
        var formatting = Primary(current.Name) == Primary(ui.Name) ? current : SpecificCulture(language);
        CultureInfo.DefaultThreadCurrentUICulture = ui;
        CultureInfo.DefaultThreadCurrentCulture = formatting;
        CultureInfo.CurrentUICulture = ui;
        CultureInfo.CurrentCulture = formatting;
    }

    private static string Primary(string name) => name.Split('-')[0].ToLowerInvariant();

    private static CultureInfo SpecificCulture(string language) => CultureInfo.GetCultureInfo(language switch
    {
        "es" => "es-ES",
        "fr" => "fr-FR",
        "de" => "de-DE",
        "pt-BR" => "pt-BR",
        _ => "en-US",
    });
}
