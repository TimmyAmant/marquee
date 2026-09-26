using Marquee.Core.Models;
using Marquee.Windows.Services;
using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;

namespace Marquee.Windows.Views;

/// <summary>
/// A Discover shelf's full list, navigated to with a
/// <see cref="Route.DiscoverList"/> (what <c>AppModel.OpenSeeAll</c> sends)
/// or a list's wire value. Not cached by the frame, like BrowsePage: every
/// visit starts from page 1.
/// </summary>
public sealed partial class DiscoverListPage : Page
{
    /// <summary>Scrolling within this many pixels of the bottom asks for the next page.</summary>
    private const double PagingThreshold = 600;

    public DiscoverListViewModel ViewModel { get; }

    public DiscoverListPage()
    {
        ViewModel = new DiscoverListViewModel(AppServices.Model);
        InitializeComponent();
    }

    protected override void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        var list = e.Parameter switch
        {
            Route.DiscoverList route => route.List,
            string value => DiscoverListKind.FromValue(value),
            _ => DiscoverListKind.Trending,
        };
        ViewModel.Activate(list);
    }

    protected override void OnNavigatedFrom(NavigationEventArgs e)
    {
        base.OnNavigatedFrom(e);
        ViewModel.Deactivate();
    }

    /// <summary>infinite-results-grid.tsx's sentinel: near the bottom, fetch the next page.</summary>
    private void OnViewChanged(object? sender, ScrollViewerViewChangedEventArgs e)
    {
        if (Scroller.VerticalOffset + Scroller.ViewportHeight >= Scroller.ScrollableHeight - PagingThreshold)
        {
            ViewModel.LoadMoreIfScrolled();
        }
    }
}
