using System.Runtime.InteropServices;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Windows.Services;
using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Windows.Storage;
using Windows.Storage.Pickers;

namespace Marquee.Windows.Controls;

/// <summary>
/// "Edit {username}". Save sends <c>PATCH /users/{id}</c> through the
/// function it was given, the way the website's form sends it: the username
/// always, an empty name or password left out (unchanged), the current
/// password only for your own account, the auto-approve flags only when
/// the boxes show, and (0.39+) the role and request limits only when the
/// admin edits another non-admin account (a blank limit is sent as null:
/// no limit). A refusal shows the server's message and keeps the
/// dialog open. After <c>ShowAsync</c> returns
/// <c>ContentDialogResult.Primary</c>, <see cref="Saved"/> is the server's
/// answer; the caller signs out when it revoked this PC's token. The
/// caller sets <c>XamlRoot</c> before showing it.
///
/// The photo is saved on its own, as soon as one is picked or removed
/// (<c>PUT</c>/<c>DELETE /users/{id}/avatar</c>), whether or not Save
/// follows: picked photos are decoded, turned upright and scaled down here
/// first (<see cref="PhotoPreparation"/>).
/// </summary>
public sealed partial class EditMemberDialog : ContentDialog
{
    private const string SaveLabel = "Save";
    private const string SavingLabel = "Saving…";

    private readonly HouseholdMember member;
    private readonly bool showsAutoApproval;
    private readonly bool showsAccess;
    private readonly Func<Guid, UpdateUserRequest, Task<UpdateUserResult>> update;
    private readonly Func<Guid, byte[], string, Task<string?>> setPhoto;
    private readonly Func<Guid, Task> removePhoto;
    private bool isSaving;
    private bool isChangingPhoto;

    /// <summary>The account's photo path as of the last answer; empty for none.</summary>
    private string avatarUrl;

    /// <param name="member">The account to edit.</param>
    /// <param name="viewerIsAdmin">Auto-approval is the admin's setting, and only for non-admin accounts.</param>
    /// <param name="update">Sends the request; throws <see cref="ApiException"/> with the server's message.</param>
    /// <param name="setPhoto">Uploads a photo (bytes, content type) and answers its new path; throws <see cref="ApiException"/>.</param>
    /// <param name="removePhoto">Removes the photo; throws <see cref="ApiException"/>.</param>
    public EditMemberDialog(
        HouseholdMember member,
        bool viewerIsAdmin,
        Func<Guid, UpdateUserRequest, Task<UpdateUserResult>> update,
        Func<Guid, byte[], string, Task<string?>> setPhoto,
        Func<Guid, Task> removePhoto)
    {
        this.member = member;
        this.update = update;
        this.setPhoto = setPhoto;
        this.removePhoto = removePhoto;
        avatarUrl = member.AvatarUrl ?? "";
        showsAutoApproval = viewerIsAdmin && !member.IsAdmin;
        // Role and limits are the admin's, for another non-admin account on a 0.39+ server.
        showsAccess = showsAutoApproval && !member.IsCurrentUser && member.SupportsRequestLimits;
        InitializeComponent();

        PhotoAvatar.Label = member.Label;
        ShowPhotoState();

        Title = $"Edit {member.Username}";
        DisplayNameBox.Text = member.DisplayName ?? "";
        UsernameBox.Text = member.Username;
        CurrentPasswordInput.Visibility = NeedsCurrentPassword ? Visibility.Visible : Visibility.Collapsed;
        AutoApprovePanel.Visibility = showsAutoApproval ? Visibility.Visible : Visibility.Collapsed;
        AutoApproveMoviesBox.IsChecked = member.AutoApproveMovies;
        AutoApproveTvBox.IsChecked = member.AutoApproveTv;
        AccessPanel.Visibility = showsAccess ? Visibility.Visible : Visibility.Collapsed;
        RoleBox.ItemsSource = new[] { MemberAccessForm.MemberChoice, MemberAccessForm.TrustedChoice };
        RoleBox.SelectedIndex = MemberAccessForm.InitialRole(member) == UserRole.Trusted ? 1 : 0;
        LimitsHeaderText.Text = MemberAccessForm.LimitsHeader;
        MovieLimitBox.Text = MemberAccessForm.LimitText(member.MovieQuotaLimit);
        MovieDaysBox.Text = MemberAccessForm.DaysText(member.MovieQuotaDays);
        TvLimitBox.Text = MemberAccessForm.LimitText(member.TvQuotaLimit);
        TvDaysBox.Text = MemberAccessForm.DaysText(member.TvQuotaDays);
        PasswordNoteText.Text = member.IsCurrentUser
            ? SettingsViewModel.PasswordWarning
            : $"Setting a new password signs {member.Label} out of every device.";
    }

    /// <summary>What the server saved; null until Save succeeds.</summary>
    // Internal: see HouseholdMemberRow.Member.
    internal UpdateUserResult? Saved { get; private set; }

    private bool CanSave => UsernameBox.Text.Trim().Length > 0;

    /// <summary>
    /// Your own account asks for its current password with a new one,
    /// unless it has none yet (made by Plex/Jellyfin sign-in or import).
    /// </summary>
    private bool NeedsCurrentPassword => member.IsCurrentUser && member.HasPassword != false;

    private void OnUsernameChanged(object sender, TextChangedEventArgs e) => Validate();

    private void Validate() => IsPrimaryButtonEnabled = !isSaving && !isChangingPhoto && CanSave;

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
        var currentPassword = NeedsCurrentPassword ? CurrentPasswordInput.Password.NonBlank() : null;
        // The server checks it too; asking here saves a round trip.
        if (password != null && NeedsCurrentPassword && currentPassword == null)
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
        if (showsAccess)
        {
            var (withAccess, accessError) = MemberAccessForm.Apply(
                request,
                trusted: RoleBox.SelectedIndex == 1,
                MovieLimitBox.Text,
                MovieDaysBox.Text,
                TvLimitBox.Text,
                TvDaysBox.Text);
            if (withAccess == null)
            {
                ShowError(accessError ?? "Check the request limits.");
                args.Cancel = true;
                return;
            }
            request = withAccess;
        }

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

    /// <summary>Cancel and Esc wait for a request in flight, so a password or photo change is never lost unseen.</summary>
    private void OnDialogClosing(ContentDialog sender, ContentDialogClosingEventArgs args)
    {
        if (isSaving || isChangingPhoto)
        {
            args.Cancel = true;
        }
    }

    // MARK: Photo

    /// <summary>
    /// "Add photo" / "Change photo": pick an image, get it ready and upload
    /// it straight away. A file Windows can't decode goes up as it is, and
    /// the server's answer (HEIC, say) shows here.
    /// </summary>
    private async void OnChoosePhotoClick(object sender, RoutedEventArgs e)
    {
        if (isChangingPhoto)
        {
            return;
        }
        PhotoErrorBar.IsOpen = false;

        StorageFile? file;
        try
        {
            var picker = new FileOpenPicker
            {
                ViewMode = PickerViewMode.Thumbnail,
                SuggestedStartLocation = PickerLocationId.PicturesLibrary,
            };
            foreach (var extension in PhotoPreparation.PickerExtensions)
            {
                picker.FileTypeFilter.Add(extension);
            }
            // Unpackaged: the picker needs to know which window it belongs to.
            WinRT.Interop.InitializeWithWindow.Initialize(picker, AppServices.WindowHandle);
            file = await picker.PickSingleFileAsync();
        }
        catch (COMException error)
        {
            ShowPhotoError($"Couldn't open the file picker: {error.Message}");
            return;
        }
        if (file == null)
        {
            return;
        }

        SetChangingPhoto(true);
        try
        {
            var photo = await PhotoPreparation.PrepareAsync(file);
            avatarUrl = await setPhoto(member.Id, photo.Bytes, photo.ContentType) ?? "";
        }
        catch (ApiException error)
        {
            ShowPhotoError(error.Message);
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or COMException)
        {
            ShowPhotoError($"Couldn't read {file.Name}: {error.Message}");
        }
        finally
        {
            SetChangingPhoto(false);
        }
    }

    /// <summary>"Remove": back to initials, straight away.</summary>
    private async void OnRemovePhotoClick(object sender, RoutedEventArgs e)
    {
        if (isChangingPhoto)
        {
            return;
        }
        PhotoErrorBar.IsOpen = false;
        SetChangingPhoto(true);
        try
        {
            await removePhoto(member.Id);
            avatarUrl = "";
        }
        catch (ApiException error)
        {
            ShowPhotoError(error.Message);
        }
        finally
        {
            SetChangingPhoto(false);
        }
    }

    private void SetChangingPhoto(bool changing)
    {
        isChangingPhoto = changing;
        ShowPhotoState();
        Validate();
    }

    private void ShowPhotoState()
    {
        var hasPhoto = avatarUrl.Length > 0;
        PhotoAvatar.AvatarUrl = avatarUrl;
        ChoosePhotoButton.Content = hasPhoto ? "Change photo" : "Add photo";
        RemovePhotoButton.Visibility = hasPhoto ? Visibility.Visible : Visibility.Collapsed;
        ChoosePhotoButton.IsEnabled = !isChangingPhoto;
        RemovePhotoButton.IsEnabled = !isChangingPhoto;
        PhotoProgress.IsActive = isChangingPhoto;
        PhotoProgress.Visibility = isChangingPhoto ? Visibility.Visible : Visibility.Collapsed;
    }

    private void ShowPhotoError(string message)
    {
        PhotoErrorBar.Message = message;
        PhotoErrorBar.IsOpen = true;
    }

    private void ShowError(string message)
    {
        ErrorBar.Message = message;
        ErrorBar.IsOpen = true;
    }
}
