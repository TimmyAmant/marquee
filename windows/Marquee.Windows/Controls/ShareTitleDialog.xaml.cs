using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml.Controls;

namespace Marquee.Windows.Controls;

/// <summary>
/// "Share" on a title: send it to people in the household, or share a link
/// outside Marquee. Sending happens inside the dialog (it stays open and
/// says "Sent to Kid."), so the only button is Done. The state and actions
/// are <see cref="ShareTitleViewModel"/>'s. The caller sets <c>XamlRoot</c>
/// before showing it, as every ContentDialog needs.
/// </summary>
public sealed partial class ShareTitleDialog : ContentDialog
{
    public ShareTitleDialog(ShareTitleViewModel viewModel)
    {
        ViewModel = viewModel;
        InitializeComponent();
        Title = viewModel.Heading;
    }

    public ShareTitleViewModel ViewModel { get; }

    private async void OnOpened(ContentDialog sender, ContentDialogOpenedEventArgs args) =>
        await ViewModel.LoadAsync();

    /// <summary>Escape or Done waits for a share already on its way, so its outcome isn't lost.</summary>
    private void OnClosing(ContentDialog sender, ContentDialogClosingEventArgs args)
    {
        if (ViewModel.IsSending)
        {
            args.Cancel = true;
        }
    }
}
