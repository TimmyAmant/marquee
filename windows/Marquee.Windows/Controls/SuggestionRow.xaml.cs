using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;

namespace Marquee.Windows.Controls;

/// <summary>
/// A search type-ahead row. Its DataContext is the <see cref="SuggestionItem"/>
/// the AutoSuggestBox hands its item template; the row reads it directly so
/// the template needs no binding.
/// </summary>
public sealed partial class SuggestionRow : UserControl
{
    public SuggestionRow()
    {
        InitializeComponent();
        DataContextChanged += OnDataContextChanged;
    }

    private void OnDataContextChanged(FrameworkElement sender, DataContextChangedEventArgs args)
    {
        if (args.NewValue is not SuggestionItem item)
        {
            return;
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
