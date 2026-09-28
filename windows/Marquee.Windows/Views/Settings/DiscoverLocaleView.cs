using System.Globalization;
using Marquee.Core.Api;
using Marquee.Core.Localization;
using Marquee.Core.Models;
using Marquee.Windows.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using static Marquee.Windows.Views.Settings.AdminToolsUi;

namespace Marquee.Windows.Views.Settings;

/// <summary>
/// Settings › Discover › Region &amp; language (0.53+; the Mac's
/// DiscoverLocaleCard): which country streaming providers and release dates
/// are for, and where and in what language TMDb's Popular and Upcoming rows
/// are picked from. Each pick saves as it's made. Hidden on an older server
/// (404).
/// </summary>
public sealed partial class DiscoverLocaleView : UserControl, ISettingsTabView
{
    private readonly ComboBox streamingBox = Picker();
    private readonly ComboBox regionBox = Picker();
    private readonly ComboBox languageBox = Picker();
    private readonly TextBlock error = ErrorText();
    private DiscoverLocale? locale;
    private bool filling;

    public DiscoverLocaleView()
    {
        Visibility = Visibility.Collapsed;
        AutomationName(streamingBox, Loc.Get("DiscoverLocale_StreamingRegion"));
        AutomationName(regionBox, Loc.Get("DiscoverLocale_DiscoverRegion"));
        AutomationName(languageBox, Loc.Get("DiscoverLocale_DiscoverLanguage"));
        foreach (var box in new[] { streamingBox, regionBox, languageBox })
        {
            box.SelectionChanged += async (_, _) =>
            {
                if (!filling)
                {
                    await SaveAsync();
                }
            };
        }

        var stack = new StackPanel { Spacing = 12 };
        stack.Children.Add(Heading(Loc.Get("DiscoverLocale_Title"), Loc.Get("DiscoverLocale_Intro")));
        stack.Children.Add(Card(
            LabeledRow(Loc.Get("DiscoverLocale_StreamingRegion"), null, streamingBox),
            LabeledRow(Loc.Get("DiscoverLocale_DiscoverRegion"), null, regionBox),
            LabeledRow(Loc.Get("DiscoverLocale_DiscoverLanguage"), null, languageBox)));
        stack.Children.Add(error);
        Content = stack;
    }

    private static ComboBox Picker() => new() { HorizontalAlignment = HorizontalAlignment.Stretch, VerticalAlignment = VerticalAlignment.Center };

    private static void AutomationName(ComboBox box, string name) =>
        Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(box, name);

    public void Activate() => _ = LoadAsync();

    public void Deactivate()
    {
    }

    private async Task LoadAsync()
    {
        try
        {
            // An older server answers 404: no card.
            var fresh = await AppServices.Model.Api.DiscoverSettings.GetLocaleAsync();
            if (fresh == null)
            {
                Visibility = Visibility.Collapsed;
                return;
            }
            Fill(fresh);
            Show(error, null);
            Visibility = Visibility.Visible;
        }
        catch (ApiException failure)
        {
            if (!failure.IsCancellation && locale != null)
            {
                Show(error, failure.Message);
            }
        }
    }

    private void Fill(DiscoverLocale value)
    {
        locale = value;
        filling = true;
        try
        {
            FillBox(
                streamingBox,
                [("", Loc.Format("DiscoverLocale_Automatic", RegionName(value.Effective.StreamingRegion))), .. value.Regions.Select(code => (code, RegionName(code)))],
                value.StreamingRegion ?? "");
            FillBox(
                regionBox,
                [("", Loc.Get("DiscoverLocale_Worldwide")), .. value.Regions.Select(code => (code, RegionName(code)))],
                value.DiscoverRegion ?? "");
            FillBox(languageBox, value.Languages.Select(code => (code, LanguageName(code))), value.DiscoverLanguage ?? "en");
        }
        finally
        {
            filling = false;
        }
    }

    private static void FillBox(ComboBox box, IEnumerable<(string Code, string Label)> items, string selected)
    {
        box.Items.Clear();
        foreach (var (code, label) in items)
        {
            var item = new ComboBoxItem { Content = label, Tag = code };
            box.Items.Add(item);
            if (code == selected)
            {
                box.SelectedItem = item;
            }
        }
    }

    private static string Selected(ComboBox box) => (box.SelectedItem as ComboBoxItem)?.Tag as string ?? "";

    /// <summary>Saves all three picks; a failure puts the card back as it was.</summary>
    private async Task SaveAsync()
    {
        if (locale is not { } previous)
        {
            return;
        }
        var language = Selected(languageBox);
        // English is the default, sent as "" (null).
        var request = DiscoverLocaleRequest.From(Selected(streamingBox), Selected(regionBox), language == "en" ? "" : language);
        Show(error, null);
        SetEnabled(false);
        try
        {
            Fill(await AppServices.Model.Api.DiscoverSettings.SaveLocaleAsync(request));
        }
        catch (ApiException failure)
        {
            Fill(previous);
            if (!failure.IsCancellation)
            {
                Show(error, failure.Message);
            }
        }
        finally
        {
            SetEnabled(true);
        }
    }

    private void SetEnabled(bool enabled)
    {
        streamingBox.IsEnabled = enabled;
        regionBox.IsEnabled = enabled;
        languageBox.IsEnabled = enabled;
    }

    /// <summary>"United Kingdom (GB)".</summary>
    private static string RegionName(string code)
    {
        try
        {
            return $"{new RegionInfo(code).DisplayName} ({code})";
        }
        catch (ArgumentException)
        {
            return code;
        }
    }

    private static string LanguageName(string code)
    {
        if (code == "any")
        {
            return Loc.Get("DiscoverLocale_AnyLanguage");
        }
        try
        {
            var name = new CultureInfo(code).DisplayName;
            return name.Length > 0 ? char.ToUpper(name[0], CultureInfo.CurrentCulture) + name[1..] : code;
        }
        catch (CultureNotFoundException)
        {
            return code;
        }
    }
}
