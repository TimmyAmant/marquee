using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Marquee.Windows.Controls;

/// <summary>
/// A request's or problem report's conversation (0.46+). Set
/// <see cref="Thread"/> (bindable in a DataTemplate); without one (a server
/// older than conversations) the control collapses.
/// </summary>
public sealed partial class CommentThreadView : UserControl
{
    public static readonly DependencyProperty ThreadProperty = DependencyProperty.Register(
        nameof(Thread),
        typeof(CommentThreadViewModel),
        typeof(CommentThreadView),
        new PropertyMetadata(null, OnThreadChanged));

    public CommentThreadView()
    {
        InitializeComponent();
        Visibility = Visibility.Collapsed;
    }

    public CommentThreadViewModel? Thread
    {
        get => (CommentThreadViewModel?)GetValue(ThreadProperty);
        set => SetValue(ThreadProperty, value);
    }

    private static void OnThreadChanged(DependencyObject sender, DependencyPropertyChangedEventArgs args)
    {
        var view = (CommentThreadView)sender;
        // The OneWay x:Binds follow the property themselves.
        view.Visibility = args.NewValue == null ? Visibility.Collapsed : Visibility.Visible;
    }
}
