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
/// Settings › Blocklist › Block automatically (0.58+; the website's
/// AutoBlockForm, the Mac's form): a keyword or genre, an age rating in a
/// country, or TMDb's adult titles, with a preview of what it would catch
/// among the titles Marquee has looked up. Under the list itself.
/// </summary>
public sealed partial class AutoBlockView : UserControl, ISettingsTabView
{
    /// <summary>The countries TMDb lists ratings for, as the website offers them.</summary>
    private static readonly string[] Regions =
    [
        "AR", "AT", "AU", "BE", "BR", "CA", "CH", "CL", "CO", "CZ", "DE", "DK", "EE", "ES", "FI", "FR",
        "GB", "GR", "HK", "HU", "ID", "IE", "IL", "IN", "IT", "JP", "KR", "LT", "LV", "MX", "MY", "NL",
        "NO", "NZ", "PE", "PH", "PL", "PT", "RO", "RU", "SE", "SG", "TH", "TR", "TW", "US", "VE", "ZA",
    ];

    private static readonly string[] Kinds = ["keyword", "certification", "adult"];

    private readonly ComboBox kindBox = new();
    private readonly TextBox keyword = new();
    private readonly ComboBox regionBox = new();
    private readonly TextBox rating = new();
    private readonly TextBox reason = new();
    private readonly TextBlock adultNote;
    private readonly FrameworkElement keywordRow;
    private readonly FrameworkElement regionRow;
    private readonly FrameworkElement ratingRow;
    private readonly FrameworkElement adultRow;
    private readonly TextBlock preview;
    private readonly TextBlock done;
    private readonly TextBlock error = ErrorText();
    private readonly Button previewButton = new();
    private readonly Button blockButton = new();

    public AutoBlockView()
    {
        kindBox.Items.Add(Loc.Get("AutoBlock_KindKeyword"));
        kindBox.Items.Add(Loc.Get("AutoBlock_KindRating"));
        kindBox.Items.Add(Loc.Get("AutoBlock_KindAdult"));
        kindBox.SelectedIndex = 0;
        kindBox.HorizontalAlignment = HorizontalAlignment.Stretch;
        kindBox.SelectionChanged += (_, _) => UpdateKind();

        keyword.Header = Loc.Get("AutoBlock_Keyword");
        keyword.Description = Loc.Get("AutoBlock_KeywordHelp");
        keyword.PlaceholderText = Loc.Get("AutoBlock_KeywordPlaceholder");
        rating.Header = Loc.Get("AutoBlock_Rating");
        rating.Description = Loc.Get("AutoBlock_RatingHelp");
        rating.PlaceholderText = "NC-17";
        reason.Header = Loc.Get("AutoBlock_Reason");
        reason.MaxLength = 200;

        var home = RegionInfo.CurrentRegion.TwoLetterISORegionName;
        foreach (var code in Regions)
        {
            regionBox.Items.Add(BlocklistEntry.RegionName(code));
        }
        regionBox.SelectedIndex = Math.Max(0, Array.IndexOf(Regions, Regions.Contains(home) ? home : "US"));
        regionBox.HorizontalAlignment = HorizontalAlignment.Stretch;

        adultNote = Caption(Loc.Get("AutoBlock_AdultHelp"));
        preview = Caption("");
        preview.Margin = new Thickness(20, 0, 20, 8);
        preview.Visibility = Visibility.Collapsed;
        done = Caption(Loc.Get("AutoBlock_Added"));
        done.Visibility = Visibility.Collapsed;

        previewButton.Content = Loc.Get("AutoBlock_Preview");
        previewButton.Click += async (_, _) => await PreviewAsync();
        blockButton.Content = Loc.Get("AutoBlock_Block");
        blockButton.Style = Resource<Style>("AccentButtonStyle");
        blockButton.Click += async (_, _) => await BlockAsync();

        keywordRow = Row(keyword);
        regionRow = LabeledRow(Loc.Get("AutoBlock_Country"), null, regionBox);
        ratingRow = Row(rating);
        adultRow = new Border { Padding = new Thickness(20, 12, 20, 12), Child = adultNote };
        var buttons = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8, Padding = new Thickness(20, 12, 20, 14) };
        buttons.Children.Add(blockButton);
        buttons.Children.Add(previewButton);

        var stack = new StackPanel { Spacing = 12 };
        stack.Children.Add(Heading(Loc.Get("AutoBlock_Title"), Loc.Get("AutoBlock_Intro"), subtitle: false));
        stack.Children.Add(Card(
            LabeledRow(Loc.Get("AutoBlock_Kind"), null, kindBox),
            keywordRow,
            regionRow,
            ratingRow,
            adultRow,
            Row(reason),
            preview,
            buttons));
        stack.Children.Add(done);
        stack.Children.Add(error);
        Content = stack;
        UpdateKind();
    }

    public void Activate()
    {
    }

    public void Deactivate()
    {
    }

    private string Kind => Kinds[Math.Clamp(kindBox.SelectedIndex, 0, Kinds.Length - 1)];

    private void UpdateKind()
    {
        keywordRow.Visibility = Kind == "keyword" ? Visibility.Visible : Visibility.Collapsed;
        regionRow.Visibility = Kind == "certification" ? Visibility.Visible : Visibility.Collapsed;
        ratingRow.Visibility = Kind == "certification" ? Visibility.Visible : Visibility.Collapsed;
        adultRow.Visibility = Kind == "adult" ? Visibility.Visible : Visibility.Collapsed;
        preview.Visibility = Visibility.Collapsed;
    }

    private BlockRuleBody Rule() => new()
    {
        Kind = Kind,
        Keyword = Kind == "keyword" ? keyword.Text.Trim() : null,
        Region = Kind == "certification" ? Regions[Math.Clamp(regionBox.SelectedIndex, 0, Regions.Length - 1)] : null,
        Certification = Kind == "certification" ? rating.Text.Trim() : null,
        Reason = reason.Text.Trim().NonBlank(),
    };

    private async Task PreviewAsync()
    {
        previewButton.IsEnabled = false;
        Show(error, null);
        try
        {
            var result = await AppServices.Model.Api.AdminTools.PreviewBlockAsync(Rule());
            var lines = new List<string>
            {
                result.Matched == 0
                    ? Loc.Format("AutoBlock_PreviewNothing", result.Scanned)
                    : Loc.Format("AutoBlock_PreviewSome", result.Matched, result.Scanned),
            };
            if (result.Titles.Count > 0)
            {
                lines.Add(string.Join(", ", result.Titles.Select(title => title.Label)));
            }
            if (result.PendingRequests.Count > 0)
            {
                lines.Add(Loc.Plural("AutoBlock_PreviewPending", result.PendingRequests.Count));
            }
            preview.Text = string.Join("\n", lines);
            preview.Visibility = Visibility.Visible;
        }
        catch (ApiException failure) when (failure.Kind == ApiErrorKind.NotFound)
        {
            Show(error, Loc.Get("AutoBlock_Unsupported"));
        }
        catch (ApiException failure)
        {
            Show(error, failure.Message);
        }
        finally
        {
            previewButton.IsEnabled = true;
        }
    }

    private async Task BlockAsync()
    {
        blockButton.IsEnabled = false;
        Show(error, null);
        done.Visibility = Visibility.Collapsed;
        try
        {
            await AppServices.Model.Api.AdminTools.BlockAsync(Rule());
            keyword.Text = "";
            rating.Text = "";
            reason.Text = "";
            preview.Visibility = Visibility.Collapsed;
            done.Visibility = Visibility.Visible;
        }
        catch (ApiException failure)
        {
            Show(error, failure.Message);
        }
        finally
        {
            blockButton.IsEnabled = true;
        }
    }
}
