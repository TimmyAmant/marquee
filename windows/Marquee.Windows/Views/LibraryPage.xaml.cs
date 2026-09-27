using Marquee.Core.Localization;
using Marquee.Windows.Services;
using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;

namespace Marquee.Windows.Views;

/// <summary>
/// The Library section's root page (app/library/page.tsx): the tabs, the
/// filter bar and the results are all in <see cref="LibraryViewModel"/>;
/// this only wires the tab buttons, the scroll-to-load and the two
/// confirmation dialogs.
/// </summary>
public sealed partial class LibraryPage : Page
{
    /// <summary>Scrolling within this many pixels of the bottom asks for the next page.</summary>
    private const double PagingThreshold = 600;

    public LibraryViewModel ViewModel { get; }

    public LibraryPage()
    {
        ViewModel = new LibraryViewModel(AppServices.Model);
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

    /// <summary>Each tab button's Tag is a <see cref="LibraryTab"/> name.</summary>
    private void OnTabClick(object sender, RoutedEventArgs e)
    {
        if (sender is FrameworkElement { Tag: string tag } && Enum.TryParse<LibraryTab>(tag, out var tab))
        {
            ViewModel.SelectTab(tab);
        }
    }

    /// <summary>infinite-results-grid.tsx's sentinel: near the bottom, fetch the next page.</summary>
    private void OnViewChanged(object? sender, ScrollViewerViewChangedEventArgs e)
    {
        if (Scroller.VerticalOffset + Scroller.ViewportHeight >= Scroller.ScrollableHeight - PagingThreshold)
        {
            ViewModel.LoadMoreIfScrolled();
        }
    }

    /// <summary>The admin's "Add all N missing" on a collection, behind the website's confirmation.</summary>
    private async void OnAddAllClick(object sender, RoutedEventArgs e)
    {
        if (sender is not FrameworkElement { DataContext: LibraryCollectionItem item })
        {
            return;
        }
        var confirm = new ContentDialog
        {
            XamlRoot = XamlRoot,
            Title = item.AddAllConfirmation,
            Content = Loc.Get("Title_AddAllBody"),
            PrimaryButtonText = Loc.Get("Title_AddAllConfirm"),
            CloseButtonText = Loc.Get("Title_Cancel"),
            DefaultButton = ContentDialogButton.Primary,
        };
        if (await confirm.TryShowAsync() == ContentDialogResult.Primary)
        {
            await item.AddAllMissingCommand.ExecuteAsync(null);
        }
    }

    /// <summary>A member's "Request all N missing", likewise.</summary>
    private async void OnRequestAllClick(object sender, RoutedEventArgs e)
    {
        if (sender is not FrameworkElement { DataContext: LibraryCollectionItem item })
        {
            return;
        }
        var confirm = new ContentDialog
        {
            XamlRoot = XamlRoot,
            Title = item.RequestAllConfirmation,
            Content = Loc.Get("Title_RequestAllBody"),
            PrimaryButtonText = Loc.Get("Title_RequestAllConfirm"),
            CloseButtonText = Loc.Get("Title_Cancel"),
            DefaultButton = ContentDialogButton.Primary,
        };
        if (await confirm.TryShowAsync() == ContentDialogResult.Primary)
        {
            await item.RequestAllMissingCommand.ExecuteAsync(null);
        }
    }
}
