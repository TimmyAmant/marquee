using Marquee.Windows.Controls;
using Marquee.Windows.Services;
using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;

namespace Marquee.Windows.Views;

/// <summary>
/// The Requests section. The page owns the "Decline request" dialog (a
/// ContentDialog needs its XamlRoot) and lends it to the view model as the
/// reason chooser.
/// </summary>
public sealed partial class RequestsPage : Page
{
    public RequestsViewModel ViewModel { get; }

    public RequestsPage()
    {
        ViewModel = new RequestsViewModel(AppServices.Model);
        ViewModel.ReasonChooser = ChooseReasonAsync;
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

    /// <summary>The chooser: the server's presets (or the built-in list) plus "Other". Null means the admin cancelled.</summary>
    private async Task<string?> ChooseReasonAsync(PendingRow row)
    {
        var dialog = new DeclineRequestDialog(row.Title, row.RequesterLabel, ViewModel.RejectionReasons) { XamlRoot = XamlRoot };
        var result = await dialog.ShowAsync();
        return result == ContentDialogResult.Primary ? dialog.Reason : null;
    }
}
