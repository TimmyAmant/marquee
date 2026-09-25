using Marquee.Windows.Services;
using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml.Controls;

namespace Marquee.Windows.Controls;

/// <summary>
/// The content of the bell's Flyout. The window calls <see cref="Opened"/>
/// and <see cref="Closed"/> from the Flyout's events, and closes the Flyout
/// when <see cref="CloseRequested"/> fires (a row was clicked).
/// </summary>
public sealed partial class NotificationsFlyout : UserControl
{
    public NotificationsViewModel ViewModel { get; }

    public NotificationsFlyout()
    {
        ViewModel = new NotificationsViewModel(AppServices.Model);
        ViewModel.Dismissed += OnDismissed;
        InitializeComponent();
    }

    /// <summary>A row was clicked and its title is opening: hide the flyout.</summary>
    public event EventHandler? CloseRequested;

    public void Opened() => ViewModel.Activate();

    public void Closed() => ViewModel.Deactivate();

    private void OnDismissed(object? sender, EventArgs e) => CloseRequested?.Invoke(this, EventArgs.Empty);
}
