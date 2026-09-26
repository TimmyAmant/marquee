using System.ComponentModel;
using System.Runtime.InteropServices;
using Marquee.Core.Api;
using Marquee.Core.Connection;
using Marquee.Core.Models;
using Marquee.Windows.Services;
using Marquee.Windows.ViewModels;
using Marquee.Windows.Views;
using Microsoft.UI.Composition.SystemBackdrops;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Navigation;

namespace Marquee.Windows;

/// <summary>
/// The one window: the sign-in flow until the session is ready, then the
/// shell: a top bar (back, wordmark), the page frame, the search panel, and
/// the website's Plex-style navigation (components/nav-menu.tsx): a frosted
/// rail floating at the left edge that is the whole menu (one icon per
/// destination, each one click away, nothing opening over the page), plus an
/// update button at its foot while a newer Marquee is out. Implements <see cref="INavigator"/> for
/// the model, which is how view models open titles and sections without
/// knowing about frames.
///
/// To add a page: map its section in <see cref="PageFor(Section)"/> or its
/// route in <see cref="PageFor(Route)"/>; everything else (current-item
/// styling, back button, badges) already works. A new section also needs a
/// rail button in MainWindow.xaml whose <c>Tag</c> is
/// <see cref="SectionExtensions.Tag"/>, listed in <see cref="railButtons"/>.
/// </summary>
public sealed partial class MainWindow : Window, INavigator
{
    /// <summary>The website's type-ahead waits this long after the last keystroke (components/search-bar.tsx).</summary>
    private static readonly TimeSpan SuggestDelay = TimeSpan.FromMilliseconds(250);

    /// <summary>
    /// The smallest the window may be, in effective pixels. WinUI's
    /// UniformGridLayout (the poster grids, the calendar) divides by its
    /// column count, and a window narrower than one column made that zero
    /// and crashed the app with a DivideByZeroException.
    /// </summary>
    private const double MinimumWidth = 760;
    private const double MinimumHeight = 520;

    private readonly AppModel model;
    private readonly Updater updater;
    private readonly Style railStyle;
    private readonly Style railCurrentStyle;

    /// <summary>The rail's section buttons; each one's <c>Tag</c> is its section's <see cref="SectionExtensions.Tag"/>.</summary>
    private readonly Button[] railButtons;

    private bool shellShown;

    private CancellationTokenSource? suggestCancellation;

    public MainWindow()
    {
        model = AppServices.Model;
        updater = AppServices.Updater;
        InitializeComponent();
        Title = "Marquee";
        // The title bar's and taskbar's icon; the .exe carries the same one
        // (ApplicationIcon in the project) for Explorer and the Start menu.
        AppWindow.SetIcon(Path.Combine(AppContext.BaseDirectory, "Assets", "Marquee.ico"));
        ExtendsContentIntoTitleBar = true;
        SetTitleBar(AppTitleBar);
        if (MicaController.IsSupported())
        {
            // Windows 11; on Windows 10 the plain window background stays.
            SystemBackdrop = new MicaBackdrop();
        }

        Root.Loaded += (_, _) =>
        {
            ApplyMinimumSize();
            // Moving to a screen with another scale changes what those pixels are.
            Root.XamlRoot.Changed += (_, _) => ApplyMinimumSize();
        };

        railStyle = (Style)Root.Resources["NavRailButtonStyle"];
        railCurrentStyle = (Style)Root.Resources["NavRailButtonCurrentStyle"];
        railButtons =
        [
            RailSearchButton,
            RailDiscoverButton,
            RailMoviesButton,
            RailSeriesButton,
            RailFavoritesButton,
            RailCalendarButton,
            RailRequestsButton,
        ];
        model.Navigator = this;
        model.Notifications.AskPermission = AskForNotificationsAsync;
        model.PropertyChanged += OnModelPropertyChanged;
        model.SessionChanged += OnSessionChanged;
        updater.PropertyChanged += OnUpdaterPropertyChanged;
        Activated += OnActivated;
        Closed += OnClosed;

        AuthFrame.Navigate(typeof(ConnectPage));
        ApplyPhase();
        UpdateAccount();
        UpdateBadges();
        UpdateUpdateButton();
        ApplyMenuPosition();
    }

    // MARK: INavigator

    public void ShowSection(Section section)
    {
        var (page, parameter) = PageFor(section);
        ContentFrame.Navigate(page, parameter);
        // A section is a fresh start, like picking it from the web's menu.
        ContentFrame.BackStack.Clear();
        BackButton.IsEnabled = false;
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

    /// <summary>A click on a Windows notification: out of the taskbar and to the front.</summary>
    public void BringToFront()
    {
        if (AppWindow.Presenter is OverlappedPresenter { State: OverlappedPresenterState.Minimized } presenter)
        {
            presenter.Restore();
        }
        Activate();
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
        Route.DiscoverList => (typeof(DiscoverListPage), route),
        _ => (typeof(PlaceholderPage), route.Description),
    };

    /// <summary>
    /// Marks the section that is showing as the current item, including
    /// after Discover jumps into a grid: a solid pill on its rail button.
    /// Settings is the avatar, which has no pill.
    /// </summary>
    private void SyncSelection(Section section)
    {
        var tag = section.Tag();
        foreach (var button in railButtons)
        {
            button.Style = button.Tag as string == tag ? railCurrentStyle : railStyle;
        }
    }

    // MARK: Menu position

    /// <summary>The rail's distance from its edge, and how thick it is (40 buttons, 7 padding, 1 border).</summary>
    private const double RailInset = 16;
    private const double RailClearance = 72;

    /// <summary>
    /// Puts the rail on this PC's edge (Settings › Account › Menu position):
    /// a column at the left or right, a row along the top or bottom (under
    /// the top bar, which stays the drag region), with the page frame moved
    /// clear of it, tooltips and the notifications list opening toward the
    /// page.
    /// </summary>
    private void ApplyMenuPosition()
    {
        var position = model.MenuPosition;
        var horizontal = position.IsHorizontal();

        Rail.HorizontalAlignment = position switch
        {
            MenuPosition.Right => HorizontalAlignment.Right,
            MenuPosition.Top or MenuPosition.Bottom => HorizontalAlignment.Center,
            _ => HorizontalAlignment.Left,
        };
        Rail.VerticalAlignment = position switch
        {
            MenuPosition.Top => VerticalAlignment.Top,
            MenuPosition.Bottom => VerticalAlignment.Bottom,
            _ => VerticalAlignment.Center,
        };
        Rail.Margin = position switch
        {
            MenuPosition.Right => new Thickness(0, 0, RailInset, 0),
            // Right under the top bar, which already sets it off the edge.
            MenuPosition.Top => new Thickness(0, 0, 0, 0),
            MenuPosition.Bottom => new Thickness(0, 0, 0, RailInset),
            _ => new Thickness(RailInset, 0, 0, 0),
        };
        ContentFrame.Margin = position switch
        {
            MenuPosition.Right => new Thickness(0, 0, RailClearance, 0),
            MenuPosition.Top => new Thickness(0, RailClearance - RailInset, 0, 0),
            MenuPosition.Bottom => new Thickness(0, 0, 0, RailClearance),
            _ => new Thickness(RailClearance, 0, 0, 0),
        };

        var orientation = horizontal ? Orientation.Horizontal : Orientation.Vertical;
        RailItems.Orientation = orientation;
        RailUpdateGroup.Orientation = orientation;
        foreach (var separator in RailItems.Children.Concat(RailUpdateGroup.Children).OfType<Microsoft.UI.Xaml.Shapes.Rectangle>())
        {
            separator.Width = horizontal ? 1 : 24;
            separator.Height = horizontal ? 24 : 1;
            separator.Margin = horizontal ? new Thickness(4, 0, 4, 0) : new Thickness(0, 4, 0, 4);
            separator.HorizontalAlignment = HorizontalAlignment.Center;
            separator.VerticalAlignment = VerticalAlignment.Center;
        }
        RailProfileButton.Margin = horizontal ? new Thickness(0, 0, 4, 0) : new Thickness(0, 0, 0, 4);

        // Names show on the page's side of the rail.
        var tooltip = position switch
        {
            MenuPosition.Right => Microsoft.UI.Xaml.Controls.Primitives.PlacementMode.Left,
            MenuPosition.Top => Microsoft.UI.Xaml.Controls.Primitives.PlacementMode.Bottom,
            MenuPosition.Bottom => Microsoft.UI.Xaml.Controls.Primitives.PlacementMode.Top,
            _ => Microsoft.UI.Xaml.Controls.Primitives.PlacementMode.Right,
        };
        foreach (var button in railButtons.Append(RailProfileButton).Append(NotificationsButton).Append(RailUpdateButton))
        {
            ToolTipService.SetPlacement(button, tooltip);
        }
        NotificationsFlyoutHost.Placement = position switch
        {
            MenuPosition.Right => Microsoft.UI.Xaml.Controls.Primitives.FlyoutPlacementMode.LeftEdgeAlignedTop,
            MenuPosition.Top => Microsoft.UI.Xaml.Controls.Primitives.FlyoutPlacementMode.BottomEdgeAlignedLeft,
            MenuPosition.Bottom => Microsoft.UI.Xaml.Controls.Primitives.FlyoutPlacementMode.TopEdgeAlignedLeft,
            _ => Microsoft.UI.Xaml.Controls.Primitives.FlyoutPlacementMode.RightEdgeAlignedTop,
        };
    }

    // MARK: Shell state

    /// <summary>Swaps between the auth frame and the shell as the model's phase moves.</summary>
    private void ApplyPhase()
    {
        var ready = model.Phase == AppPhase.Ready;
        var shell = ready ? Visibility.Visible : Visibility.Collapsed;
        ShellContent.Visibility = shell;
        BackButton.Visibility = shell;
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
            NotificationsPanel.ViewModel.Reset();
            CloseSearch();
            ContentFrame.Navigate(typeof(PlaceholderPage));
            ContentFrame.BackStack.Clear();
            BackButton.IsEnabled = false;
        }
        // The sign-in banner follows the phase.
        UpdateUpdateButton();
    }

    /// <summary>The photo (or initials) on the rail's avatar, and its name.</summary>
    private void UpdateAccount()
    {
        var name = model.Viewer?.Label ?? "";
        RailAvatar.Label = name;
        RailAvatar.AvatarUrl = model.Viewer?.AvatarUrl ?? "";

        var accountLabel = name.Length > 0 ? $"{name}: account and settings" : "Account and settings";
        AutomationProperties.SetName(RailProfileButton, accountLabel);
        ToolTipService.SetToolTip(RailProfileButton, name.Length > 0 ? name : "Settings");
    }

    /// <summary>
    /// The bell's unread count; for the admin and trusted members, the accent dot on the rail's
    /// Requests button: pending requests plus open problem reports, since
    /// both wait on that page (members' counts are always 0).
    /// </summary>
    private void UpdateBadges()
    {
        var pending = model.Viewer?.ReviewsRequests == true ? model.Badges.RequestsBadge : 0;
        AutomationProperties.SetName(RailRequestsButton, pending > 0 ? $"Requests, {pending} waiting" : "Requests");
        RailRequestsDot.Visibility = pending > 0 ? Visibility.Visible : Visibility.Collapsed;

        var unread = model.Badges.UnreadNotifications;
        NotificationsBadge.Value = unread;
        NotificationsBadge.Visibility = unread > 0 ? Visibility.Visible : Visibility.Collapsed;
        AutomationProperties.SetName(NotificationsButton, unread > 0 ? $"Notifications, {unread} unread" : "Notifications");
    }

    // MARK: Notifications on this PC

    /// <summary>
    /// "Get notifications on this PC?", asked once the shell is up after
    /// signing in (<see cref="NotificationCenter"/> decides when). True for
    /// Turn on, false for Not now; null when a dialog was already open, so
    /// it's asked another time instead.
    /// </summary>
    private async Task<bool?> AskForNotificationsAsync()
    {
        if (Root.XamlRoot is not { } xamlRoot)
        {
            return null;
        }
        var dialog = new ContentDialog
        {
            XamlRoot = xamlRoot,
            Title = "Get notifications on this PC?",
            Content = "Marquee can tell you when something starts downloading, when it's ready to watch, and when a request is approved or declined. They come straight from your Marquee server while the app is open; nothing goes through an outside service. You can change this in Settings.",
            PrimaryButtonText = "Turn on",
            CloseButtonText = "Not now",
            DefaultButton = ContentDialogButton.Primary,
        };
        try
        {
            return await dialog.ShowAsync() == ContentDialogResult.Primary;
        }
        catch (COMException)
        {
            // "Only a single ContentDialog can be open at any time."
            return null;
        }
    }

    // MARK: Rail (components/nav-menu.tsx)

    /// <summary>
    /// The rail's update button, only while a newer Marquee is known; and
    /// before sign-in, where the rail and Settings aren't, the banner offering it.
    /// </summary>
    private void UpdateUpdateButton()
    {
        RailUpdateGroup.Visibility = updater.ShowsUpdate ? Visibility.Visible : Visibility.Collapsed;
        var label = updater.IsInstalling ? "Updating Marquee…" : updater.UpdateLabel;
        AutomationProperties.SetName(RailUpdateButton, label);
        ToolTipService.SetToolTip(RailUpdateButton, label);

        AuthUpdateBar.IsOpen = updater.ShowsUpdate && !shellShown && !authUpdateBarDismissed;
        AuthUpdateBar.Title = updater.UpdateLabel;
        AuthUpdateBar.Message = updater.StatusText;
        AuthUpdateButton.Content = updater.IsInstalledCopy ? "Update" : "Download";
        AuthUpdateButton.IsEnabled = !updater.IsBusy;
    }

    /// <summary>Closed by hand: stays closed for this run of the app.</summary>
    private bool authUpdateBarDismissed;

    private void OnAuthUpdateBarClosed(InfoBar sender, object args)
    {
        authUpdateBarDismissed = true;
    }

    private void OnAuthUpdateClick(object sender, RoutedEventArgs e)
    {
        if (updater.IsInstalledCopy)
        {
            _ = updater.InstallAsync();
        }
        else
        {
            _ = ExternalLinks.OpenAsync(updater.ReleasePage);
        }
    }

    /// <summary>Settings › About, where "Update", its progress and "What's new" are.</summary>
    private void OnRailUpdateClick(object sender, RoutedEventArgs e) => model.OpenSettings(SettingsTab.About);

    /// <summary>Every section button on the rail (Search aside): its <c>Tag</c> names the section.</summary>
    private void OnSectionNavClick(object sender, RoutedEventArgs e)
    {
        if (sender is FrameworkElement { Tag: string tag } && SectionExtensions.FromTag(tag) is { } section)
        {
            SelectSection(section);
        }
    }

    /// <summary>The avatar: the account, i.e. Settings, on the tab it was left on.</summary>
    private void OnProfileClick(object sender, RoutedEventArgs e) => SelectSection(Section.Settings);

    /// <summary>Search on the rail opens the search panel over the page.</summary>
    private void OnSearchNavClick(object sender, RoutedEventArgs e) => OpenSearch();

    private void SelectSection(Section section) => model.Select(section);

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
        else
        {
            return;
        }
        CloseSearch();
    }

    /// <summary>The search panel over the page, with the cursor in its box.</summary>
    private void OpenSearch()
    {
        if (!shellShown)
        {
            return;
        }
        SearchLayer.Visibility = Visibility.Visible;
        // Collapsed a moment ago: focus once it's in the layout.
        model.Dispatcher.TryEnqueue(() => SearchBox.Focus(FocusState.Programmatic));
    }

    /// <summary>Hides the panel and forgets what was typed.</summary>
    private void CloseSearch()
    {
        suggestCancellation?.Cancel();
        SearchBox.Text = "";
        SearchBox.ItemsSource = null;
        SearchLayer.Visibility = Visibility.Collapsed;
    }

    private void OnFindInvoked(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs args)
    {
        OpenSearch();
        args.Handled = true;
    }

    private void OnSearchLayerKeyDown(object sender, KeyRoutedEventArgs e)
    {
        if (e.Key == global::Windows.System.VirtualKey.Escape)
        {
            CloseSearch();
            e.Handled = true;
        }
    }

    /// <summary>A click outside the panel closes it.</summary>
    private void OnSearchDismissPressed(object sender, PointerRoutedEventArgs e)
    {
        CloseSearch();
        e.Handled = true;
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
                UpdateBadges();
                break;
            case nameof(AppModel.Badges):
                UpdateBadges();
                break;
            case nameof(AppModel.MenuPosition):
                ApplyMenuPosition();
                break;
        }
    }

    private void OnSessionChanged(object? sender, EventArgs e) => UpdateAccount();

    private void OnUpdaterPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName is nameof(Updater.Update) or nameof(Updater.Phase) or nameof(Updater.StatusText))
        {
            UpdateUpdateButton();
        }
    }

    private void OnBackClick(object sender, RoutedEventArgs e) => GoBack();

    private void OnBackInvoked(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs args)
    {
        if (shellShown)
        {
            GoBack();
        }
        args.Handled = true;
    }

    /// <summary>Any navigation closes the search panel, however it happened.</summary>
    private void OnContentNavigated(object sender, NavigationEventArgs e)
    {
        BackButton.IsEnabled = ContentFrame.CanGoBack;
        if (SearchLayer.Visibility == Visibility.Visible)
        {
            CloseSearch();
        }
    }

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
        // Quitting ends a Plex sign-in that's still polling.
        (AuthFrame.Content as ConnectPage)?.ViewModel.CancelPlexSignIn();
        model.PropertyChanged -= OnModelPropertyChanged;
        model.SessionChanged -= OnSessionChanged;
        updater.PropertyChanged -= OnUpdaterPropertyChanged;
        Activated -= OnActivated;
        // The app ends with its only window: close the stream, and let a
        // later click on a notification launch the app afresh.
        model.Notifications.AskPermission = null;
        model.Notifications.Shutdown();
        if (ReferenceEquals(model.Navigator, this))
        {
            model.Navigator = null;
        }
    }

    /// <summary>Sets <see cref="MinimumWidth"/> × <see cref="MinimumHeight"/>, which the presenter takes in physical pixels.</summary>
    private void ApplyMinimumSize()
    {
        if (AppWindow.Presenter is not OverlappedPresenter overlapped || Root.XamlRoot is not { } root)
        {
            return;
        }
        overlapped.PreferredMinimumWidth = (int)Math.Ceiling(MinimumWidth * root.RasterizationScale);
        overlapped.PreferredMinimumHeight = (int)Math.Ceiling(MinimumHeight * root.RasterizationScale);
    }
}
