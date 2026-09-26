using Marquee.Core.Api;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Marquee.Windows.Controls;

/// <summary>
/// The admin's "Block requests" on a title (0.41+). Sends the block itself
/// (through <c>submit</c>) before closing, so the server's refusal shows
/// inline. The caller sets <c>XamlRoot</c> before showing it, as every
/// ContentDialog needs.
/// </summary>
public sealed partial class BlockRequestsDialog : ContentDialog
{
    private readonly Func<string?, Task> submit;
    private bool pending;

    /// <param name="submit">Sends <c>POST …/block</c> with the reason (blank for none); throws <see cref="ApiException"/> on a refusal.</param>
    public BlockRequestsDialog(Func<string?, Task> submit)
    {
        this.submit = submit;
        InitializeComponent();
    }

    private void Update()
    {
        PrimaryButtonText = pending ? "Blocking…" : "Block";
        IsPrimaryButtonEnabled = !pending;
        ReasonBox.IsEnabled = !pending;
    }

    private async void OnPrimaryButtonClick(ContentDialog sender, ContentDialogButtonClickEventArgs args)
    {
        if (pending)
        {
            args.Cancel = true;
            return;
        }
        var deferral = args.GetDeferral();
        pending = true;
        ErrorText.Visibility = Visibility.Collapsed;
        Update();
        try
        {
            await submit(ReasonBox.Text);
        }
        catch (ApiException failure)
        {
            args.Cancel = true;
            ErrorText.Text = failure.Message;
            ErrorText.Visibility = Visibility.Visible;
        }
        finally
        {
            pending = false;
            Update();
            deferral.Complete();
        }
    }

    /// <summary>Escape or Cancel waits for a block already on its way, so its outcome isn't lost.</summary>
    private void OnClosing(ContentDialog sender, ContentDialogClosingEventArgs args)
    {
        if (pending && args.Result != ContentDialogResult.Primary)
        {
            args.Cancel = true;
        }
    }
}
