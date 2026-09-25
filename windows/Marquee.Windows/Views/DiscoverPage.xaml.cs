using Marquee.Windows.Services;
using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;

namespace Marquee.Windows.Views;

/// <summary>
/// The Discover section's root page. Cached by the frame, so coming back
/// from a title keeps the shelves and the scroll position; the view model
/// only fetches again when it has nothing or something changed.
/// </summary>
public sealed partial class DiscoverPage : Page
{
    public DiscoverViewModel ViewModel { get; }

    public DiscoverPage()
    {
        ViewModel = new DiscoverViewModel(AppServices.Model);
        InitializeComponent();
    }

    protected override void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        ViewModel.Activate(refresh: e.NavigationMode != NavigationMode.Back);
    }

    protected override void OnNavigatedFrom(NavigationEventArgs e)
    {
        base.OnNavigatedFrom(e);
        ViewModel.Deactivate();
    }
}
