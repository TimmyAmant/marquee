using Marquee.Core.Models;
using Marquee.Windows.Controls;
using Marquee.Windows.Services;
using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml.Controls;

namespace Marquee.Windows.Views.Settings;

/// <summary>
/// Settings › Account. The view owns the household member dialogs (Add
/// member, Edit, the Remove confirmation, Link Jellyfin, Import), because a
/// ContentDialog needs its XamlRoot, and lends them to the view model.
/// </summary>
public sealed partial class AccountSettingsView : UserControl, ISettingsTabView
{
    public AccountSettingsViewModel ViewModel { get; }

    public AccountSettingsView()
    {
        ViewModel = new AccountSettingsViewModel(AppServices.Model);
        ViewModel.AddMemberPrompt = ShowAddMemberDialogAsync;
        ViewModel.EditMemberPrompt = ShowEditMemberDialogAsync;
        ViewModel.RemoveMemberPrompt = ConfirmRemoveMemberAsync;
        ViewModel.LinkJellyfinPrompt = ShowLinkJellyfinDialogAsync;
        ViewModel.ImportMembersPrompt = ShowImportMembersDialogAsync;
        ViewModel.Personal.RemoveChannelPrompt = ConfirmRemoveChannelAsync;
        InitializeComponent();
    }

    public void Activate() => ViewModel.Activate();

    public void Deactivate() => ViewModel.Deactivate();

    /// <summary>"Add a household member": the new account, or null when the admin cancelled.</summary>
    private async Task<HouseholdMember?> ShowAddMemberDialogAsync()
    {
        var dialog = new AddMemberDialog(ViewModel.CreateMemberAsync) { XamlRoot = XamlRoot };
        var result = await dialog.TryShowAsync();
        return result == ContentDialogResult.Primary ? dialog.Created : null;
    }

    /// <summary>The edit dialog for one account: what the server saved, or null when cancelled.</summary>
    private async Task<UpdateUserResult?> ShowEditMemberDialogAsync(HouseholdMember member)
    {
        var dialog = new EditMemberDialog(
            member,
            ViewModel.IsAdmin,
            ViewModel.UpdateMemberAsync,
            ViewModel.SetMemberPhotoAsync,
            ViewModel.RemoveMemberPhotoAsync)
        {
            XamlRoot = XamlRoot,
        };
        var result = await dialog.TryShowAsync();
        return result == ContentDialogResult.Primary ? dialog.Saved : null;
    }

    /// <summary>"Link Jellyfin": true once the dialog linked the account.</summary>
    private async Task<bool> ShowLinkJellyfinDialogAsync()
    {
        var dialog = new JellyfinLinkDialog(ViewModel.JellyfinName, ViewModel.LinkJellyfinAccountAsync) { XamlRoot = XamlRoot };
        return await dialog.TryShowAsync() == ContentDialogResult.Primary;
    }

    /// <summary>"Import from Plex/Jellyfin": what was imported, or null when cancelled.</summary>
    private async Task<ImportUsersResult?> ShowImportMembersDialogAsync(MediaServerKind server)
    {
        var dialog = new ImportMembersDialog(server, ViewModel.ServerName(server), ViewModel.LoadImportCandidatesAsync, ViewModel.RunImportAsync) { XamlRoot = XamlRoot };
        var result = await dialog.TryShowAsync();
        return result == ContentDialogResult.Primary ? dialog.Result : null;
    }

    /// <summary>"Remove {name}?" for one of your own notification channels, defaulting to Cancel.</summary>
    private async Task<bool> ConfirmRemoveChannelAsync(string name)
    {
        var confirm = new ContentDialog
        {
            XamlRoot = XamlRoot,
            Title = $"Remove {name}?",
            Content = "It stops getting your notifications. You can add it again later.",
            PrimaryButtonText = "Remove",
            CloseButtonText = "Cancel",
            DefaultButton = ContentDialogButton.Close,
        };
        return await confirm.TryShowAsync() == ContentDialogResult.Primary;
    }

    /// <summary>"Remove {username}?", defaulting to Cancel since it can't be undone.</summary>
    private async Task<bool> ConfirmRemoveMemberAsync(HouseholdMember member)
    {
        var confirm = new ContentDialog
        {
            XamlRoot = XamlRoot,
            Title = $"Remove {member.Username}?",
            Content = AccountSettingsViewModel.RemoveMemberConsequence,
            PrimaryButtonText = "Remove",
            CloseButtonText = "Cancel",
            DefaultButton = ContentDialogButton.Close,
        };
        return await confirm.TryShowAsync() == ContentDialogResult.Primary;
    }
}
