using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Marquee.Windows.Controls;

/// <summary>
/// A small status pill. Set <see cref="Text"/> and <see cref="Tone"/>
/// (both bindable in a DataTemplate) and it draws itself in that palette; an
/// empty text collapses the whole pill, so a row can bind an optional label
/// without a visibility converter.
/// </summary>
public sealed partial class TonePill : UserControl
{
    public static readonly DependencyProperty TextProperty = DependencyProperty.Register(
        nameof(Text),
        typeof(string),
        typeof(TonePill),
        new PropertyMetadata("", OnAppearanceChanged));

    public static readonly DependencyProperty ToneProperty = DependencyProperty.Register(
        nameof(Tone),
        typeof(BadgeTone),
        typeof(TonePill),
        new PropertyMetadata(BadgeTone.Neutral, OnAppearanceChanged));

    public TonePill()
    {
        InitializeComponent();
        Apply();
    }

    public string Text
    {
        get => (string)GetValue(TextProperty);
        set => SetValue(TextProperty, value);
    }

    public BadgeTone Tone
    {
        get => (BadgeTone)GetValue(ToneProperty);
        set => SetValue(ToneProperty, value);
    }

    private static void OnAppearanceChanged(DependencyObject sender, DependencyPropertyChangedEventArgs args) =>
        ((TonePill)sender).Apply();

    private void Apply()
    {
        var text = Text ?? "";
        OwnedText.Text = text;
        TrackedText.Text = text;
        NeutralText.Text = text;

        var tone = Tone;
        var shown = text.Length > 0;
        OwnedBorder.Visibility = shown && tone == BadgeTone.Owned ? Visibility.Visible : Visibility.Collapsed;
        TrackedBorder.Visibility = shown && tone == BadgeTone.Tracked ? Visibility.Visible : Visibility.Collapsed;
        NeutralBorder.Visibility = shown && tone == BadgeTone.Neutral ? Visibility.Visible : Visibility.Collapsed;
    }
}
