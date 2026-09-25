using System.ComponentModel;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Windows.Services;
using Marquee.Windows.ViewModels;
using Marquee.Windows.Views;
using Microsoft.UI.Composition.SystemBackdrops;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Navigation;

namespace Marquee.Windows;

/// <summary>
/// The one window: the sign-in flow until the session is ready, then the
/// NavigationView shell with the search box and the bell. Implements
/// <see cref="INavigator"/> for the model, which is how view models open
/// titles and sections without knowing about frames.
///
/// To add a page: map its section in <see cref="PageFor(Section)"/> or its
/// route in <see cref="PageFor(Route)"/>; everything else (selection sync,
/// back button, badges) already works.
/// </summary>
public sealed partial class MainWindow : Window, INavigator
{
    private const string SignOutTag = "signout";
    private const string NotificationsTag = "notifications";

    /// <summary>The website's type-ahead waits this long after the last keystroke (components/search-bar.tsx).</summary>
    private static readonly TimeSpan SuggestDelay = TimeSpan.FromMilliseconds(250);

    private readonly AppModel model;
    private bool shellShown;
    private CancellationTokenSource? suggestCancellation;

    public MainWindow()
    {
        model = AppServices.Model;
        InitializeComponent();
        Title = "Marquee";
        ExtendsContentIntoTitleBar = true;
        SetTitleBar(AppTitleBar);
        if (MicaController.IsSupported())
        {
            // Windows 11; on Windows 10 the plain window background stays.
            SystemBackdrop = new MicaBackdrop();
        }

        model.Navigator = this;
        model.PropertyChanged += OnModelPropertyChanged;
        model.SessionChanged += OnSessionChanged;
        Activated += OnActivated;
        Closed += OnClosed;

        AuthFrame.Navigate(typeof(ConnectPage));
        ApplyPhase();
        UpdateAccount();
        UpdateBadges();
    }

    // MARK: INavigator

    public void ShowSection(Section section)
    {
        var (page, parameter) = PageFor(section);
        ContentFrame.Navigate(page, parameter);
        // A section is a fresh start, like clicking the web sidebar.
        ContentFrame.BackStack.Clear();
        NavigationPane.IsBackEnabled = false;
        SyncSelection(section);
    }

    public void Open(Route route)
    {
        var (page, parameter) = PageFor(route);
        ContentFrame.Navigate(page, parameter);
    }

    public bool CanGoBack => ContentFrame.CanGoBack;

    public void GoBack()
    {
        if (ContentFrame.CanGoBack)
        {
            ContentFrame.GoBack();
        }
    }

    /// <summary>
    /// The root page of each section and its navigation parameter. Movies
    /// and Series share one page type and get the media type's wire value;
    /// Search gets no query (the page then only offers its search box).
    /// </summary>
    private static (Type Page, object? Parameter) PageFor(Section section) => section switch
    {
        Section.Discover => (typeof(DiscoverPage), null),
        Section.Movies => (typeof(BrowsePage), MediaType.Movie.Value),
        Section.Series => (typeof(BrowsePage), MediaType.Tv.Value),
        Section.Search => (typeof(SearchPage), null),
        Section.Requests => (typeof(RequestsPage), null),
        Section.Favorites => (typeof(FavoritesPage), null),
        Section.Calendar => (typeof(CalendarPage), null),
        Section.Settings => (typeof(SettingsPage), null),
        _ => (typeof(PlaceholderPage), section.Title()),
    };

    /// <summary>The page and navigation parameter for a route; each page accepts its own record.</summary>
    private static (Type Page, object Parameter) PageFor(Route route) => route switch
    {
        Route.Title => (typeof(TitlePage), route),
        Route.Person => (typeof(PersonPage), route),
        Route.Company => (typeof(CompanyPage), route),
        Route.Search => (typeof(SearchPage), route),
        _ => (typeof(PlaceholderPage), route.Description),
    };

    /// <summary>Keeps the pane's highlight on the section that is showing, including after Discover jumps into a grid.</summary>
    private void SyncSelection(Section section)
    {
        if (section == Section.Settings)
        {
            NavigationPane.SelectedItem = NavigationPane.SettingsItem;
            return;
        }
        var tag = section.Tag();
        foreach (var entry in NavigationPane.MenuItems)
        {
            if (entry is NavigationViewItem item && item.Tag as string == tag)
            {
                NavigationPane.SelectedItem = item;
                return;
            }
        }
    }

    // MARK: Shell state

    /// <summary>Swaps between the auth frame and the shell as the model's phase moves.</summary>
    private void ApplyPhase()
    {
        var ready = model.Phase == AppPhase.Ready;
        NavigationPane.Visibility = ready ? Visibility.Visible : Visibility.Collapsed;
        AuthFrame.Visibility = ready ? Visibility.Collapsed : Visibility.Visible;

        if (ready && !shellShown)
        {
            shellShown = true;
            ShowSection(Section.Discover);
        }
        else if (!ready && shellShown)
        {
            shellShown = false;
            // Leave nothing of the previous account behind: a blank page, no
            // back stack, no half-typed search, so the next sign-in starts at Discover.
            NotificationsFlyoutHost.Hide();
            ClearSearch();
            ContentFrame.Navigate(typeof(PlaceholderPage));
            ContentFrame.BackStack.Clear();
            NavigationPane.IsBackEnabled = false;
        }
    }

    private void UpdateAccount()
    {
        ViewerNameText.Text = model.Viewer?.Label ?? "";
        ServerText.Text = model.Session.Server?.DisplayName ?? "";
    }

    private void UpdateBadges()
    {
        var pending = model.Badges.PendingRequests;
        RequestsBadge.Value = pending;
        RequestsBadge.Visibility = pending > 0 ? Visibility.Visible : Visibility.Collapsed;

        var unread = model.Badges.UnreadNotifications;
        NotificationsBadge.Value = unread;
        NotificationsBadge.Visibility = unread > 0 ? Visibility.Visible : Visibility.Collapsed;
    }

    // MARK: Search (components/search-bar.tsx)

    /// <summary>
    /// Type-ahead: after a short pause, <c>GET /search/suggest</c>. A failed
    /// suggest call just leaves the list as it was; the Search page reports
    /// real errors. Under two characters the server would answer nothing,
    /// so the list is cleared without a request.
    /// </summary>
    private async void OnSearchTextChanged(AutoSuggestBox sender, AutoSuggestBoxTextChangedEventArgs args)
    {
        if (args.Reason != AutoSuggestionBoxTextChangeReason.UserInput)
        {
            return;
        }
        suggestCancellation?.Cancel();
        var query = sender.Text.Trim();
        if (query.Length < 2 || model.Phase != AppPhase.Ready)
        {
            sender.ItemsSource = null;
            return;
        }
        var cancellation = new CancellationTokenSource();
        suggestCancellation = cancellation;
        var token = cancellation.Token;
        try
        {
            await Task.Delay(SuggestDelay, token);
            var suggestions = await model.Api.Search.SuggestionsAsync(query, token);
            if (!token.IsCancellationRequested)
            {
                sender.ItemsSource = suggestions.Select(suggestion => new SuggestionItem(suggestion)).ToList();
            }
        }
        catch (OperationCanceledException)
        {
            // Superseded by newer text.
        }
        catch (ApiException)
        {
            // Left as it was.
        }
    }

    /// <summary>Enter searches the typed text; picking a suggestion opens it directly.</summary>
    private void OnSearchQuerySubmitted(AutoSuggestBox sender, AutoSuggestBoxQuerySubmittedEventArgs args)
    {
        if (args.ChosenSuggestion is SuggestionItem picked)
        {
            picked.Open(model);
        }
        else if (!string.IsNullOrWhiteSpace(args.QueryText))
        {
            model.Search(args.QueryText);
        }
        ClearSearch();
    }

    private void ClearSearch()
    {
        suggestCancellation?.Cancel();
        SearchBox.Text = "";
        SearchBox.ItemsSource = null;
    }

    // MARK: Notifications (components/notifications-bell.tsx)

    private void OnNotificationsOpened(object? sender, object e) => NotificationsPanel.Opened();

    private void OnNotificationsClosed(object? sender, object e) => NotificationsPanel.Closed();

    /// <summary>A notification was clicked: its title is opening, so the flyout gets out of the way.</summary>
    private void OnNotificationsCloseRequested(object? sender, EventArgs e) => NotificationsFlyoutHost.Hide();

    // MARK: Events

    private void OnModelPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        switch (e.PropertyName)
        {
            case nameof(AppModel.Phase):
                ApplyPhase();
                UpdateAccount();
                break;
            case nameof(AppModel.Viewer):
                UpdateAccount();
                break;
            case nameof(AppModel.Badges):
                UpdateBadges();
                break;
        }
    }

    private void OnSessionChanged(object? sender, EventArgs e) => UpdateAccount();

    private void OnNavigationItemInvoked(NavigationView sender, NavigationViewItemInvokedEventArgs args)
    {
        if (args.IsSettingsInvoked)
        {
            model.Select(Section.Settings);
            return;
        }
        var tag = args.InvokedItemContainer?.Tag as string;
        if (tag == SignOutTag)
        {
            _ = model.SignOutAsync();
            return;
        }
        if (tag == NotificationsTag)
        {
            FlyoutBase.ShowAttachedFlyout(NotificationsItem);
            return;
        }
        if (SectionExtensions.FromTag(tag) is { } section)
        {
            model.Select(section);
        }
    }

    private void OnNavigationBackRequested(NavigationView sender, NavigationViewBackRequestedEventArgs args) => GoBack();

    private void OnContentNavigated(object sender, NavigationEventArgs e) =>
        NavigationPane.IsBackEnabled = ContentFrame.CanGoBack;

    private void OnReloadInvoked(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs args)
    {
        model.Reload();
        args.Handled = true;
    }

    /// <summary>The window came to the front: catch up on the badge counts right away.</summary>
    private void OnActivated(object sender, WindowActivatedEventArgs args)
    {
        if (args.WindowActivationState != WindowActivationState.Deactivated)
        {
            model.RefreshCounts();
        }
    }

    private void OnClosed(object sender, WindowEventArgs args)
    {
        suggestCancellation?.Cancel();
        model.PropertyChanged -= OnModelPropertyChanged;
        model.SessionChanged -= OnSessionChanged;
        Activated -= OnActivated;
        if (ReferenceEquals(model.Navigator, this))
        {
            model.Navigator = null;
        }
    }
}
