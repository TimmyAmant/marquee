using Marquee.Core.Api;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Marquee.Windows.Controls;

/// <summary>
/// "Link Jellyfin" ("Link Emby" on an Emby server). Link sends <c>POST /me/links/jellyfin</c> through the
/// function it was given and, when the server refuses (wrong password, an
/// account linked to someone else), shows the server's message and stays
/// open. <c>ShowAsync</c> returning <c>ContentDialogResult.Primary</c> means
/// the account is linked. The caller sets <c>XamlRoot</c> before showing it.
/// </summary>
public sealed partial class JellyfinLinkDialog : ContentDialog
{
    private const string LinkLabel = "Link";
    private const string LinkingLabel = "Linking…";

    private readonly Func<string, string, Task> link;
    private bool isSaving;

    /// <param name="serverName">"Jellyfin", or "Emby" when that's the server connected.</param>
    public JellyfinLinkDialog(string serverName, Func<string, string, Task> link)
    {
        this.link = link;
        InitializeComponent();
        Title = $"Link {serverName}";
        IntroText.Text = $"Sign in with your {serverName} account to use it for Marquee too.";
        UsernameBox.Header = $"{serverName} username";
        PasswordInput.Header = $"{serverName} password";
    }

    private bool CanLink => UsernameBox.Text.Trim().Length > 0 && PasswordInput.Password.Length > 0;

    private void OnUsernameChanged(object sender, TextChangedEventArgs e) => Validate();

    private void OnPasswordChanged(object sender, RoutedEventArgs e) => Validate();

    private void Validate() => IsPrimaryButtonEnabled = !isSaving && CanLink;

    /// <summary>Holds the dialog open (a deferral) while the request runs, and keeps it open on failure.</summary>
    private async void OnLinkClick(ContentDialog sender, ContentDialogButtonClickEventArgs args)
    {
        if (isSaving || !CanLink)
        {
            args.Cancel = true;
            return;
        }
        var username = UsernameBox.Text.Trim();
        var password = PasswordInput.Password;

        var deferral = args.GetDeferral();
        isSaving = true;
        IsPrimaryButtonEnabled = false;
        PrimaryButtonText = LinkingLabel;
        ErrorBar.IsOpen = false;
        try
        {
            await link(username, password);
        }
        catch (ApiException error)
        {
            PasswordInput.Password = "";
            ErrorBar.Message = error.Message;
            ErrorBar.IsOpen = true;
            args.Cancel = true;
        }
        finally
        {
            isSaving = false;
            PrimaryButtonText = LinkLabel;
            Validate();
            deferral.Complete();
        }
    }

    /// <summary>Cancel and Esc wait for a request in flight, so its outcome is never lost.</summary>
    private void OnDialogClosing(ContentDialog sender, ContentDialogClosingEventArgs args)
    {
        if (isSaving)
        {
            args.Cancel = true;
        }
    }
}
