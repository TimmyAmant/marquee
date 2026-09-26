using System.ComponentModel;
using Marquee.Windows.Services;
using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml.Controls;

namespace Marquee.Windows.Views.Settings;

/// <summary>
/// Settings › Integrations, the admin's. The view owns the API key Revoke
/// confirmation, because a ContentDialog needs its XamlRoot.
/// </summary>
public sealed partial class IntegrationsSettingsView : UserControl, ISettingsTabView
{
    public IntegrationsSettingsViewModel ViewModel { get; }

    public IntegrationsSettingsView()
    {
        ViewModel = new IntegrationsSettingsViewModel(AppServices.Model);
        ViewModel.ApiKeys.RevokePrompt = ConfirmRevokeKeyAsync;
        InitializeComponent();
        ViewModel.ArrServers.Editor.PropertyChanged += OnArrServerEditorChanged;
    }

    public void Activate() => ViewModel.Activate();

    public void Deactivate() => ViewModel.Deactivate();

    /// <summary>"Revoke {name}?" for an API key, defaulting to Cancel since it can't be undone.</summary>
    private async Task<bool> ConfirmRevokeKeyAsync(ApiKeyRow row)
    {
        var confirm = new ContentDialog
        {
            XamlRoot = XamlRoot,
            Title = $"Revoke {row.Name}?",
            Content = "Anything using this key stops working right away. This can't be undone.",
            PrimaryButtonText = "Revoke",
            CloseButtonText = "Cancel",
            DefaultButton = ContentDialogButton.Close,
        };
        return await confirm.TryShowAsync() == ContentDialogResult.Primary;
    }

    /// <summary>The Add/Edit server form sits under the lists: scroll to it when Edit or Add opens it.</summary>
    private void OnArrServerEditorChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName is nameof(ArrServerEditorViewModel.IsOpen) or nameof(ArrServerEditorViewModel.Title)
            && ViewModel.ArrServers.Editor.IsOpen)
        {
            // After the layout pass that makes it visible.
            DispatcherQueue.TryEnqueue(() => ArrServerEditorCard.StartBringIntoView());
        }
    }
}
