using Marquee.Windows.Controls;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;

namespace Marquee.Windows.Views.Settings;

/// <summary>
/// The pieces the 0.58 admin-tool views (Logs, Override rules, Block
/// automatically, Gotify / Slack / Pushbullet) are built from in code: the
/// same text styles, cards and rows as the XAML settings views.
/// </summary>
internal static class AdminToolsUi
{
    public static T Resource<T>(string key) => (T)Application.Current.Resources[key];

    /// <summary>A tab's or section's title with the line under it.</summary>
    public static StackPanel Heading(string title, string? intro, bool subtitle = true)
    {
        var heading = new StackPanel { Spacing = 4 };
        heading.Children.Add(new TextBlock
        {
            Text = title,
            Style = Resource<Style>(subtitle ? "SubtitleTextBlockStyle" : "BodyStrongTextBlockStyle"),
            TextWrapping = TextWrapping.Wrap,
        });
        if (intro != null)
        {
            heading.Children.Add(Caption(intro));
        }
        return heading;
    }

    public static TextBlock Caption(string text, bool secondary = true) => new()
    {
        Text = text,
        Style = Resource<Style>("CaptionTextBlockStyle"),
        TextWrapping = TextWrapping.Wrap,
        Foreground = Resource<Brush>(secondary ? "TextFillColorSecondaryBrush" : "TextFillColorTertiaryBrush"),
    };

    public static TextBlock ErrorText() => new()
    {
        Style = Resource<Style>("CaptionTextBlockStyle"),
        TextWrapping = TextWrapping.Wrap,
        Foreground = Resource<Brush>("SystemFillColorCriticalBrush"),
        Visibility = Visibility.Collapsed,
    };

    public static void Show(TextBlock block, string? text)
    {
        block.Text = text ?? "";
        block.Visibility = string.IsNullOrEmpty(text) ? Visibility.Collapsed : Visibility.Visible;
    }

    /// <summary>A card around rows, a hairline between each (the SettingsCard style).</summary>
    public static Border Card(params UIElement[] rows)
    {
        var stack = new StackPanel();
        for (var index = 0; index < rows.Length; index++)
        {
            if (index > 0)
            {
                stack.Children.Add(Divider());
            }
            stack.Children.Add(rows[index]);
        }
        return new Border { Style = Resource<Style>("SettingsCard"), Padding = new Thickness(0), Child = stack };
    }

    public static Border Divider() => new()
    {
        Height = 1,
        Background = Resource<Brush>("DividerStrokeColorDefaultBrush"),
    };

    /// <summary>A field as a settings row: its Header is the label, its Description the help.</summary>
    public static SettingsRow Row(UIElement field) => new() { Field = field, Padding = new Thickness(20, 12, 20, 12) };

    /// <summary>A row with a label and help of its own, for a control that has no Header.</summary>
    public static Grid LabeledRow(string label, string? help, UIElement control)
    {
        var grid = new Grid { Padding = new Thickness(20, 12, 20, 12), ColumnSpacing = 24 };
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(320) });
        var caption = new StackPanel { Spacing = 2, VerticalAlignment = VerticalAlignment.Center };
        caption.Children.Add(new TextBlock { Text = label, Style = Resource<Style>("BodyStrongTextBlockStyle"), TextWrapping = TextWrapping.Wrap });
        if (help != null)
        {
            caption.Children.Add(Caption(help));
        }
        grid.Children.Add(caption);
        Grid.SetColumn((FrameworkElement)control, 1);
        grid.Children.Add(control);
        return grid;
    }

    /// <summary>Checkboxes that wrap, for picking several (genres, languages, members, tags).</summary>
    public static ScrollViewer Choices(Panel panel) => new()
    {
        Content = panel,
        MaxHeight = 150,
        VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
    };
}
