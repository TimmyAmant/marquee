using Marquee.Core.Models;
using Marquee.Windows.Controls;
using Marquee.Windows.Services;
using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;

namespace Marquee.Windows.Views;

/// <summary>
/// The Settings section, reached from the avatar on the rail and the menu's
/// profile row. The page owns the household member dialogs (Add member,
/// Edit, the Remove confirmation), because a ContentDialog needs its
/// XamlRoot, and lends them to the view model.
/// </summary>
public sealed partial class SettingsPage : Page
{
    public SettingsViewModel ViewModel { get; }

    public SettingsPage()
    {
        ViewModel = new SettingsViewModel(AppServices.Model);
        ViewModel.AddMemberPrompt = ShowAddMemberDialogAsync;
        ViewModel.EditMemberPrompt = ShowEditMemberDialogAsync;
        ViewModel.RemoveMemberPrompt = ConfirmRemoveMemberAsync;
        InitializeComponent();
    }

    protected override void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        ViewModel.Activate();
    }

    protected override void OnNavigatedFrom(NavigationEventArgs e)
    {
        base.OnNavigatedFrom(e);
        ViewModel.Deactivate();
    }

    /// <summary>"Add a household member": the new account, or null when the admin cancelled.</summary>
    private async Task<HouseholdMember?> ShowAddMemberDialogAsync()
    {
        var dialog = new AddMemberDialog(ViewModel.CreateMemberAsync) { XamlRoot = XamlRoot };
        var result = await dialog.ShowAsync();
        return result == ContentDialogResult.Primary ? dialog.Created : null;
    }

    /// <summary>The edit dialog for one account: what the server saved, or null when cancelled.</summary>
    private async Task<UpdateUserResult?> ShowEditMemberDialogAsync(HouseholdMember member)
    {
        var dialog = new EditMemberDialog(member, ViewModel.IsAdmin, ViewModel.UpdateMemberAsync) { XamlRoot = XamlRoot };
        var result = await dialog.ShowAsync();
        return result == ContentDialogResult.Primary ? dialog.Saved : null;
    }

    /// <summary>"Remove {username}?", defaulting to Cancel since it can't be undone.</summary>
    private async Task<bool> ConfirmRemoveMemberAsync(HouseholdMember member)
    {
        var confirm = new ContentDialog
        {
            XamlRoot = XamlRoot,
            Title = $"Remove {member.Username}?",
            Content = SettingsViewModel.RemoveMemberConsequence,
            PrimaryButtonText = "Remove",
            CloseButtonText = "Cancel",
            DefaultButton = ContentDialogButton.Close,
        };
        return await confirm.ShowAsync() == ContentDialogResult.Primary;
    }
}
