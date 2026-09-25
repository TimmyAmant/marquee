using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Marquee.Windows.Controls;

/// <summary>
/// "Edit {username}". Save sends <c>PATCH /users/{id}</c> through the
/// function it was given, the way the website's form sends it: the username
/// always, an empty name or password left out (unchanged), the current
/// password only for your own account, the auto-approve flags only when
/// the boxes show. A refusal shows the server's message and keeps the
/// dialog open. After <c>ShowAsync</c> returns
/// <c>ContentDialogResult.Primary</c>, <see cref="Saved"/> is the server's
/// answer; the caller signs out when it revoked this PC's token. The
/// caller sets <c>XamlRoot</c> before showing it.
/// </summary>
public sealed partial class EditMemberDialog : ContentDialog
{
    private const string SaveLabel = "Save";
    private const string SavingLabel = "Saving…";

    private readonly HouseholdMember member;
    private readonly bool showsAutoApproval;
    private readonly Func<Guid, UpdateUserRequest, Task<UpdateUserResult>> update;
    private bool isSaving;

    /// <param name="member">The account to edit.</param>
    /// <param name="viewerIsAdmin">Auto-approval is the admin's setting, and only for non-admin accounts.</param>
    /// <param name="update">Sends the request; throws <see cref="ApiException"/> with the server's message.</param>
    public EditMemberDialog(HouseholdMember member, bool viewerIsAdmin, Func<Guid, UpdateUserRequest, Task<UpdateUserResult>> update)
    {
        this.member = member;
        this.update = update;
        showsAutoApproval = viewerIsAdmin && !member.IsAdmin;
        InitializeComponent();

        Title = $"Edit {member.Username}";
        DisplayNameBox.Text = member.DisplayName ?? "";
        UsernameBox.Text = member.Username;
        CurrentPasswordInput.Visibility = member.IsCurrentUser ? Visibility.Visible : Visibility.Collapsed;
        AutoApprovePanel.Visibility = showsAutoApproval ? Visibility.Visible : Visibility.Collapsed;
        AutoApproveMoviesBox.IsChecked = member.AutoApproveMovies;
        AutoApproveTvBox.IsChecked = member.AutoApproveTv;
        PasswordNoteText.Text = member.IsCurrentUser
            ? SettingsViewModel.PasswordWarning
            : $"Setting a new password signs {member.Label} out of every device.";
    }

    /// <summary>What the server saved; null until Save succeeds.</summary>
    public UpdateUserResult? Saved { get; private set; }

    private bool CanSave => UsernameBox.Text.Trim().Length > 0;

    private void OnUsernameChanged(object sender, TextChangedEventArgs e) => Validate();

    private void Validate() => IsPrimaryButtonEnabled = !isSaving && CanSave;

    /// <summary>Holds the dialog open (a deferral) while the request runs, and keeps it open on failure.</summary>
    private async void OnSaveClick(ContentDialog sender, ContentDialogButtonClickEventArgs args)
    {
        if (isSaving || !CanSave)
        {
            args.Cancel = true;
            return;
        }
        ErrorBar.IsOpen = false;
        var password = NewPasswordInput.Password.NonBlank();
        var currentPassword = member.IsCurrentUser ? CurrentPasswordInput.Password.NonBlank() : null;
        // The server checks it too; asking here saves a round trip.
        if (password != null && member.IsCurrentUser && currentPassword == null)
        {
            ShowError(SettingsViewModel.CurrentPasswordMissingMessage);
            args.Cancel = true;
            return;
        }
        var request = new UpdateUserRequest(
            UsernameBox.Text.Trim(),
            DisplayNameBox.Text.Trim().NonBlank(),
            password,
            AutoApproveMovies: showsAutoApproval ? AutoApproveMoviesBox.IsChecked == true : (bool?)null,
            AutoApproveTv: showsAutoApproval ? AutoApproveTvBox.IsChecked == true : (bool?)null,
            CurrentPassword: currentPassword);

        var deferral = args.GetDeferral();
        isSaving = true;
        IsPrimaryButtonEnabled = false;
        PrimaryButtonText = SavingLabel;
        try
        {
            Saved = await update(member.Id, request);
        }
        catch (ApiException error)
        {
            ShowError(error.Message);
            args.Cancel = true;
        }
        finally
        {
            isSaving = false;
            PrimaryButtonText = SaveLabel;
            Validate();
            deferral.Complete();
        }
    }

    /// <summary>Cancel and Esc wait for a request in flight, so a password change is never lost unseen.</summary>
    private void OnDialogClosing(ContentDialog sender, ContentDialogClosingEventArgs args)
    {
        if (isSaving)
        {
            args.Cancel = true;
        }
    }

    private void ShowError(string message)
    {
        ErrorBar.Message = message;
        ErrorBar.IsOpen = true;
    }
}
