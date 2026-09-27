using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;

namespace Marquee.Windows.Controls;

/// <summary>
/// A search type-ahead row. Its DataContext is the <see cref="SuggestionItem"/>
/// the AutoSuggestBox hands its item template; the row reads it directly so
/// the template needs no binding.
/// </summary>
public sealed partial class SuggestionRow : UserControl
{
    /// <summary>The poster frame's own (theme) background, for rows that aren't logos.</summary>
    private readonly Brush posterBackground;

    public SuggestionRow()
    {
        InitializeComponent();
        posterBackground = PosterFrame.Background;
        DataContextChanged += OnDataContextChanged;
    }

    private void OnDataContextChanged(FrameworkElement sender, DataContextChangedEventArgs args)
    {
        if (args.NewValue is not SuggestionItem item)
        {
            return;
        }
        GroupText.Text = item.GroupLabel?.ToUpper(System.Globalization.CultureInfo.CurrentCulture) ?? "";
        GroupText.Visibility = item.GroupLabel == null ? Visibility.Collapsed : Visibility.Visible;
        if (item.IsPerson)
        {
            PosterFrame.Width = 40;
            PosterFrame.Height = 40;
            PosterFrame.CornerRadius = new CornerRadius(20);
            PosterFrame.Padding = new Thickness(0);
            PosterFrame.Background = posterBackground;
            Poster.Stretch = Stretch.UniformToFill;
        }
        else if (item.IsLogo)
        {
            PosterFrame.Width = 44;
            PosterFrame.Height = 30;
            PosterFrame.CornerRadius = new CornerRadius(5);
            PosterFrame.Padding = new Thickness(4);
            PosterFrame.Background = new SolidColorBrush(Microsoft.UI.Colors.White);
            Poster.Stretch = Stretch.Uniform;
        }
        else
        {
            PosterFrame.Width = 30;
            PosterFrame.Height = 44;
            PosterFrame.CornerRadius = new CornerRadius(4);
            PosterFrame.Padding = new Thickness(0);
            PosterFrame.Background = posterBackground;
            Poster.Stretch = Stretch.UniformToFill;
        }
        NameText.Text = item.Name;
        SubtitleText.Text = item.Subtitle ?? "";
        SubtitleText.Visibility = item.Subtitle == null ? Visibility.Collapsed : Visibility.Visible;
        Poster.Source = item.Image;
        KindPill.Text = item.KindLabel;
        KindPill.Tone = item.KindTone;
        ToolTipService.SetToolTip(KindPill, item.KindAccessibleLabel);
        AutomationProperties.SetName(KindPill, item.KindAccessibleLabel);
        AutomationProperties.SetName(this, item.AccessibleName);
    }
}
