using System.Globalization;
using Marquee.Core.Models;
using Marquee.Core.Updates;
using Microsoft.UI.Text;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Automation.Peers;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Documents;
using Microsoft.UI.Xaml.Media;

namespace Marquee.Windows.Controls;

/// <summary>
/// "What's new in Marquee 0.45.3" (<see cref="WhatsNewContent"/>): every
/// release since the one this PC last saw, as plain text. The caller sets
/// <c>XamlRoot</c> before showing it, as every ContentDialog needs.
/// </summary>
public sealed partial class WhatsNewDialog : ContentDialog
{
    private readonly Func<Task> seeAll;

    /// <param name="seeAll">Opens the full changelog (the server's Releases page).</param>
    public WhatsNewDialog(WhatsNewContent content, Func<Task> seeAll)
    {
        this.seeAll = seeAll;
        InitializeComponent();
        Title = content.Title;

        if (content.InstalledAppVersion is { } installed)
        {
            var installedPanel = new StackPanel { Spacing = 4 };
            installedPanel.Children.Add(new TextBlock
            {
                Text = $"Marquee for Windows {installed} is installed.",
                Style = (Style)Application.Current.Resources["BodyStrongTextBlockStyle"],
                TextWrapping = TextWrapping.Wrap,
            });
            if (content.ReleaseNotesUrl is { } notes)
            {
                installedPanel.Children.Add(new HyperlinkButton
                {
                    Content = "Read the release notes on GitHub",
                    NavigateUri = notes,
                    Padding = new Thickness(0),
                });
            }
            Releases.Children.Add(installedPanel);
        }

        foreach (var entry in content.Entries)
        {
            Releases.Children.Add(Release(entry));
        }

        if (content.HasMore)
        {
            Releases.Children.Add(new TextBlock
            {
                Text = "And more in earlier releases.",
                Style = (Style)Application.Current.Resources["CaptionTextBlockStyle"],
                Foreground = SecondaryText,
            });
        }
    }

    private static Brush SecondaryText => (Brush)Application.Current.Resources["TextFillColorSecondaryBrush"];

    private static StackPanel Release(ChangelogEntry entry)
    {
        var section = new StackPanel { Spacing = 6 };
        var heading = new TextBlock { TextWrapping = TextWrapping.Wrap, FontWeight = FontWeights.SemiBold };
        heading.Inlines.Add(new Run { Text = $"Marquee {entry.Version}" });
        heading.Inlines.Add(new Run
        {
            Text = "   " + entry.Date.ToString("MMM d, yyyy", CultureInfo.CurrentCulture),
            FontWeight = FontWeights.Normal,
            Foreground = SecondaryText,
        });
        AutomationProperties.SetHeadingLevel(heading, AutomationHeadingLevel.Level2);
        section.Children.Add(heading);

        foreach (var change in entry.Changes)
        {
            var row = new Grid { ColumnSpacing = 8 };
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            var bullet = new TextBlock { Text = "•", Foreground = SecondaryText };
            AutomationProperties.SetAccessibilityView(bullet, AccessibilityView.Raw);
            row.Children.Add(bullet);
            // Plain text: the changelog's quotes and ellipses are just text.
            var text = new TextBlock
            {
                Text = change,
                TextWrapping = TextWrapping.Wrap,
                IsTextSelectionEnabled = true,
                Foreground = SecondaryText,
            };
            Grid.SetColumn(text, 1);
            row.Children.Add(text);
            section.Children.Add(row);
        }
        return section;
    }

    private void OnSeeAllClick(object sender, RoutedEventArgs e)
    {
        Hide();
        _ = seeAll();
    }
}
