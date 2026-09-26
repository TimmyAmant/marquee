using System.ComponentModel;
using Marquee.Windows.Services;
using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml.Controls;

namespace Marquee.Windows.Views.Settings;

/// <summary>Settings › Integrations, the admin's.</summary>
public sealed partial class IntegrationsSettingsView : UserControl, ISettingsTabView
{
    public IntegrationsSettingsViewModel ViewModel { get; }

    public IntegrationsSettingsView()
    {
        ViewModel = new IntegrationsSettingsViewModel(AppServices.Model);
        InitializeComponent();
        ViewModel.ArrServers.Editor.PropertyChanged += OnArrServerEditorChanged;
    }

    public void Activate() => ViewModel.Activate();

    public void Deactivate() => ViewModel.Deactivate();

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
