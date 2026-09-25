using Marquee.Core.Models;
using Marquee.Windows.Services;
using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;

namespace Marquee.Windows.Views;

/// <summary>
/// The Movies and Series sections, one page type for both: the navigation
/// parameter is the media type's wire value (<c>"movie"</c> or <c>"tv"</c>),
/// what <c>MainWindow.PageFor</c> sends. Not cached by the frame, so every
/// visit reads the section's filters afresh from the model.
/// </summary>
public sealed partial class BrowsePage : Page
{
    /// <summary>Scrolling within this many pixels of the bottom asks for the next page.</summary>
    private const double PagingThreshold = 600;

    public BrowseViewModel ViewModel { get; }

    public BrowsePage()
    {
        ViewModel = new BrowseViewModel(AppServices.Model);
        InitializeComponent();
    }

    protected override void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        var requested = e.Parameter is string value ? MediaType.FromValue(value) : MediaType.Movie;
        ViewModel.Activate(requested);
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
