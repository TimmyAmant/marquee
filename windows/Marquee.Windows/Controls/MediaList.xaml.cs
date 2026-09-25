using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Marquee.Windows.Controls;

/// <summary>
/// The filterable poster grid of a person or studio page. Set
/// <see cref="List"/> once the page has its cards; the pickers then read
/// their starting values from it and write every change back.
/// </summary>
public sealed partial class MediaList : UserControl
{
    public static readonly DependencyProperty ListProperty = DependencyProperty.Register(
        nameof(List),
        typeof(MediaListViewModel),
        typeof(MediaList),
        new PropertyMetadata(null, OnListChanged));

    public MediaList()
    {
        InitializeComponent();
        TypeBox.ItemsSource = MediaListViewModel.TypeOptions;
        OrderBox.ItemsSource = MediaListViewModel.OrderOptions;
        TypeBox.SelectedIndex = 0;
        OrderBox.SelectedIndex = 0;
    }

    public MediaListViewModel? List
    {
        get => (MediaListViewModel?)GetValue(ListProperty);
        set => SetValue(ListProperty, value);
    }

    private static void OnListChanged(DependencyObject sender, DependencyPropertyChangedEventArgs args)
    {
        var control = (MediaList)sender;
        if (args.NewValue is MediaListViewModel list)
        {
            // Setting a picker fires its change event, which writes the same
            // value straight back: harmless.
            control.SearchBox.Text = list.Query;
            control.TypeBox.SelectedIndex = list.TypeIndex;
            control.OrderBox.SelectedIndex = list.OrderIndex;
        }
    }

    private void OnSearchTextChanged(object sender, TextChangedEventArgs e)
    {
        if (List is { } list)
        {
            list.Query = SearchBox.Text;
        }
    }

    private void OnTypeChanged(object sender, SelectionChangedEventArgs e)
    {
        if (List is { } list && TypeBox.SelectedIndex >= 0)
        {
            list.TypeIndex = TypeBox.SelectedIndex;
        }
    }

    private void OnOrderChanged(object sender, SelectionChangedEventArgs e)
    {
        if (List is { } list && OrderBox.SelectedIndex >= 0)
        {
            list.OrderIndex = OrderBox.SelectedIndex;
        }
    }
}
