using Marquee.Windows.Services;
using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Marquee.Windows.Controls;

/// <summary>
/// Edit, Cancel and the conversation under a request (0.46+). Set
/// <see cref="Actions"/> (bindable in a DataTemplate); without one the
/// control collapses. "Edit" reads the request's edit options and shows the
/// season picker in its edit form here, where the XamlRoot is.
/// </summary>
public sealed partial class RequestActionsView : UserControl
{
    public static readonly DependencyProperty ActionsProperty = DependencyProperty.Register(
        nameof(Actions),
        typeof(RequestActionsViewModel),
        typeof(RequestActionsView),
        new PropertyMetadata(null, OnActionsChanged));

    public RequestActionsView()
    {
        InitializeComponent();
        Visibility = Visibility.Collapsed;
    }

    public RequestActionsViewModel? Actions
    {
        get => (RequestActionsViewModel?)GetValue(ActionsProperty);
        set => SetValue(ActionsProperty, value);
    }

    private static void OnActionsChanged(DependencyObject sender, DependencyPropertyChangedEventArgs args) =>
        ((RequestActionsView)sender).Visibility = args.NewValue == null ? Visibility.Collapsed : Visibility.Visible;

    /// <summary>
    /// "Edit": the options first (a refusal shows under the buttons), then the
    /// picker, which saves the change itself and keeps a refusal inline.
    /// </summary>
    private async void OnEditClick(object sender, RoutedEventArgs e)
    {
        if (Actions is not { } actions || XamlRoot == null)
        {
            return;
        }
        if (await actions.LoadEditOptionsAsync() is not { } options || XamlRoot == null)
        {
            return;
        }
        var dialog = new SeasonRequestDialog(options, actions.SaveEditAsync) { XamlRoot = XamlRoot };
        await dialog.TryShowAsync();
    }
}
