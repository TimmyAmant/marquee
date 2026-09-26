using Marquee.Core.Models;
using Marquee.Windows.Services;
using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml.Controls;

namespace Marquee.Windows.Views.Settings;

/// <summary>
/// Settings › Discover, the admin's (0.49+). The view owns the Rename dialog
/// and the Remove and Reset confirmations, because a ContentDialog needs its
/// XamlRoot, and lends them to the view model.
/// </summary>
public sealed partial class DiscoverSettingsView : UserControl, ISettingsTabView
{
    public DiscoverSettingsViewModel ViewModel { get; }

    public DiscoverSettingsView()
    {
        ViewModel = new DiscoverSettingsViewModel(AppServices.Model)
        {
            RenamePrompt = ShowRenameDialogAsync,
            RemovePrompt = ConfirmRemoveAsync,
            ResetPrompt = ConfirmResetAsync,
        };
        InitializeComponent();
    }

    public void Activate() => ViewModel.Activate();

    public void Deactivate() => ViewModel.Deactivate();

    /// <summary>"Rename row": the new name, or null when cancelled.</summary>
    private async Task<string?> ShowRenameDialogAsync(DiscoverRowItem row)
    {
        var box = new TextBox
        {
            Header = "Name",
            Text = row.Title,
            MaxLength = DiscoverLayoutEditing.MaxTitleLength,
        };
        box.SelectAll();
        var dialog = new ContentDialog
        {
            XamlRoot = XamlRoot,
            Title = "Rename row",
            Content = box,
            PrimaryButtonText = "Save",
            CloseButtonText = "Cancel",
            DefaultButton = ContentDialogButton.Primary,
        };
        return await dialog.TryShowAsync() == ContentDialogResult.Primary ? box.Text : null;
    }

    /// <summary>"Remove {name}?", defaulting to Cancel.</summary>
    private async Task<bool> ConfirmRemoveAsync(DiscoverRowItem row)
    {
        var confirm = new ContentDialog
        {
            XamlRoot = XamlRoot,
            Title = $"Remove {row.Title}?",
            Content = "It leaves Discover for everyone. You can add it again later.",
            PrimaryButtonText = "Remove",
            CloseButtonText = "Cancel",
            DefaultButton = ContentDialogButton.Close,
        };
        return await confirm.TryShowAsync() == ContentDialogResult.Primary;
    }

    /// <summary>"Reset Discover?", defaulting to Cancel.</summary>
    private async Task<bool> ConfirmResetAsync()
    {
        var confirm = new ContentDialog
        {
            XamlRoot = XamlRoot,
            Title = "Reset Discover?",
            Content = "The built-in rows go back to their usual order, all shown. Your own rows stay, after them.",
            PrimaryButtonText = "Reset",
            CloseButtonText = "Cancel",
            DefaultButton = ContentDialogButton.Close,
        };
        return await confirm.TryShowAsync() == ContentDialogResult.Primary;
    }
}
