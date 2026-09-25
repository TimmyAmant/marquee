using Marquee.Core.Models;
using Marquee.Windows.Controls;
using Marquee.Windows.Services;
using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;

namespace Marquee.Windows.Views;

/// <summary>
/// The Settings section, reached from the avatar on the rail (and its update
/// button, while a newer Marquee is out). The page owns the household member dialogs (Add member,
/// Edit, the Remove confirmation), because a ContentDialog needs its
/// XamlRoot, and lends them to the view model.
/// </summary>
public sealed partial class SettingsPage : Page
{
    public SettingsViewModel ViewModel { get; }

    /// <summary>About's update row.</summary>
    public Updater Updater { get; } = AppServices.Updater;

    public SettingsPage()
    {
        ViewModel = new SettingsViewModel(AppServices.Model);
        ViewModel.AddMemberPrompt = ShowAddMemberDialogAsync;
        ViewModel.EditMemberPrompt = ShowEditMemberDialogAsync;
        ViewModel.RemoveMemberPrompt = ConfirmRemoveMemberAsync;
        ViewModel.LinkJellyfinPrompt = ShowLinkJellyfinDialogAsync;
        ViewModel.ImportMembersPrompt = ShowImportMembersDialogAsync;
        InitializeComponent();
    }

    protected override void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        ViewModel.Activate();
        if (stoppedTracking)
        {
            // Back to a page kept in the frame's cache: listen again.
            stoppedTracking = false;
            Bindings.Update();
        }
    }

    protected override void OnNavigatedFrom(NavigationEventArgs e)
    {
        base.OnNavigatedFrom(e);
        ViewModel.Deactivate();
        // The OneWay bindings to the app-long Updater subscribe to it; let
        // them go with the page rather than pile up on it visit after visit.
        Bindings.StopTracking();
        stoppedTracking = true;
    }

    private bool stoppedTracking;

    // MARK: Updates

    private void OnCheckForUpdatesClick(object sender, RoutedEventArgs e) => _ = Updater.CheckAsync();

    private void OnInstallUpdateClick(object sender, RoutedEventArgs e) => _ = Updater.InstallAsync();

    /// <summary>"What's new" and "Download manually": the release's page on GitHub.</summary>
    private void OnReleaseNotesClick(object sender, RoutedEventArgs e) => _ = ExternalLinks.OpenAsync(Updater.ReleasePage);

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
        var dialog = new JellyfinLinkDialog(ViewModel.LinkJellyfinAccountAsync) { XamlRoot = XamlRoot };
        return await dialog.TryShowAsync() == ContentDialogResult.Primary;
    }

    /// <summary>"Import from Plex/Jellyfin": what was imported, or null when cancelled.</summary>
    private async Task<ImportUsersResult?> ShowImportMembersDialogAsync(MediaServerKind server)
    {
        var dialog = new ImportMembersDialog(server, ViewModel.LoadImportCandidatesAsync, ViewModel.RunImportAsync) { XamlRoot = XamlRoot };
        var result = await dialog.TryShowAsync();
        return result == ContentDialogResult.Primary ? dialog.Result : null;
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
        return await confirm.TryShowAsync() == ContentDialogResult.Primary;
    }
}
