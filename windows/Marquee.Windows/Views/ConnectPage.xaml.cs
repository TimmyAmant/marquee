using System.Windows.Input;
using Marquee.Windows.Services;
using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Windows.System;

namespace Marquee.Windows.Views;

/// <summary>
/// Hosted in the window's auth frame for the app's lifetime and shown
/// whenever the session isn't ready; see <see cref="ConnectViewModel"/>.
/// Enter in any field submits its card, the way the web forms do.
/// </summary>
public sealed partial class ConnectPage : Page
{
    public ConnectViewModel ViewModel { get; }

    public ConnectPage()
    {
        ViewModel = new ConnectViewModel(AppServices.Model);
        InitializeComponent();
    }

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        if (ViewModel.IsConnectStep)
        {
            AddressBox.Focus(FocusState.Programmatic);
        }
    }

    private void OnAddressKeyDown(object sender, KeyRoutedEventArgs e) => SubmitOnEnter(e, ViewModel.CheckCommand);

    private void OnSignInKeyDown(object sender, KeyRoutedEventArgs e) => SubmitOnEnter(e, ViewModel.SignInCommand);

    private void OnSetupKeyDown(object sender, KeyRoutedEventArgs e) => SubmitOnEnter(e, ViewModel.SetupCommand);

    private static void SubmitOnEnter(KeyRoutedEventArgs e, ICommand command)
    {
        if (e.Key != VirtualKey.Enter)
        {
            return;
        }
        if (command.CanExecute(null))
        {
            command.Execute(null);
        }
        e.Handled = true;
    }
}
