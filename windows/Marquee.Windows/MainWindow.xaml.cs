using System.ComponentModel;
using System.Globalization;
using System.Runtime.InteropServices;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Windows.Services;
using Marquee.Windows.ViewModels;
using Marquee.Windows.Views;
using Microsoft.UI.Composition.SystemBackdrops;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Animation;
using Microsoft.UI.Xaml.Navigation;

namespace Marquee.Windows;

/// <summary>
/// The one window: the sign-in flow until the session is ready, then the
/// shell: a top bar (back, wordmark, search box, bell), the page frame, and
/// the website's Plex-style navigation (components/nav-menu.tsx): a frosted
/// rail floating at the left edge that opens into a frosted menu panel over
/// the page. Implements <see cref="INavigator"/> for the model, which is how
/// view models open titles and sections without knowing about frames.
///
/// To add a page: map its section in <see cref="PageFor(Section)"/> or its
/// route in <see cref="PageFor(Route)"/>; everything else (current-item
/// styling, back button, badges) already works. A new section also needs a
/// menu row in MainWindow.xaml whose <c>Tag</c> is <see cref="SectionExtensions.Tag"/>,
/// listed in <see cref="menuRows"/>.
/// </summary>
public sealed partial class MainWindow : Window, INavigator
{
    /// <summary>The website's type-ahead waits this long after the last keystroke (components/search-bar.tsx).</summary>
    private static readonly TimeSpan SuggestDelay = TimeSpan.FromMilliseconds(250);

    /// <summary>
    /// How long the pointer rests on the rail before it opens into the menu,
    /// so sweeping past the left edge doesn't throw a panel over the page.
    /// </summary>
    private static readonly TimeSpan MenuHoverOpenDelay = TimeSpan.FromMilliseconds(220);

    /// <summary>
    /// Grace period after the pointer leaves the open menu, so overshooting
    /// its edge by a few pixels doesn't snap it shut.
    /// </summary>
    private static readonly TimeSpan MenuHoverCloseDelay = TimeSpan.FromMilliseconds(260);

    /// <summary>The panel fades, slides and scales in (and the rail fades out) over this long, easing out.</summary>
    private static readonly TimeSpan MenuAnimationDuration = TimeSpan.FromMilliseconds(200);

    /// <summary>The closed panel sits this far left of its open position...</summary>
    private const double MenuClosedOffset = -12;

    /// <summary>...at this scale, growing from its left edge.</summary>
    private const double MenuClosedScale = 0.98;

    private readonly AppModel model;
    private readonly Style railStyle;
    private readonly Style railCurrentStyle;
    private readonly Style menuRowStyle;
    private readonly Style menuRowCurrentStyle;

    /// <summary>The menu's section rows; each one's <c>Tag</c> is its section's <see cref="SectionExtensions.Tag"/>.</summary>
    private readonly Button[] menuRows;

    private readonly CompositeTransform menuPanelTransform;
    private readonly Storyboard menuOpenStoryboard;
    private readonly Storyboard menuCloseStoryboard;
    private readonly DispatcherQueueTimer menuOpenTimer;
    private readonly DispatcherQueueTimer menuCloseTimer;

    private bool shellShown;
    private bool menuOpen;

    /// <summary>Whether the mouse is over the rail's rectangle, tracked through the open panel too (which covers it).</summary>
    private bool pointerOverRail;

    /// <summary>
    /// Set when the menu closes, or a rail item is clicked, with the mouse on
    /// the rail: the rail doesn't unfold again until the pointer has left it,
    /// so picking a row that happens to sit over the rail doesn't reopen the
    /// menu on the next nudge of the mouse.
    /// </summary>
    private bool hoverOpenSuppressed;

    /// <summary>The section whose page (or a page pushed on it) is showing.</summary>
    private Section currentSection = Section.Discover;

    private CancellationTokenSource? suggestCancellation;

    public MainWindow()
    {
        model = AppServices.Model;
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

        railStyle = (Style)Root.Resources["NavRailButtonStyle"];
        railCurrentStyle = (Style)Root.Resources["NavRailButtonCurrentStyle"];
        menuRowStyle = (Style)Root.Resources["NavMenuRowStyle"];
        menuRowCurrentStyle = (Style)Root.Resources["NavMenuRowCurrentStyle"];
        menuRows =
        [
            MenuSearchButton,
            MenuDiscoverButton,
            MenuMoviesButton,
            MenuSeriesButton,
            MenuFavoritesButton,
            MenuCalendarButton,
            MenuRequestsButton,
        ];

        menuPanelTransform = new CompositeTransform
        {
            TranslateX = MenuClosedOffset,
            ScaleX = MenuClosedScale,
            ScaleY = MenuClosedScale,
        };
        MenuPanel.RenderTransform = menuPanelTransform;
        menuOpenStoryboard = MenuStoryboard(opening: true);
        menuCloseStoryboard = MenuStoryboard(opening: false);
        menuCloseStoryboard.Completed += OnMenuCloseCompleted;

        menuOpenTimer = OneShotTimer(MenuHoverOpenDelay);
        menuOpenTimer.Tick += OnMenuOpenTimerTick;
        menuCloseTimer = OneShotTimer(MenuHoverCloseDelay);
        menuCloseTimer.Tick += OnMenuCloseTimerTick;

        model.Navigator = this;
        model.Notifications.AskPermission = AskForNotificationsAsync;
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
        _ => (typeof(PlaceholderPage), route.Description),
    };

    /// <summary>The rail's icon for a section it only shows while you're in it; null for the rest.</summary>
    private static string? RailGlyph(Section section) => section switch
    {
        Section.Movies => "",
        Section.Series => "",
        Section.Favorites => "",
        Section.Calendar => "",
        Section.Requests => "",
        _ => null,
    };

    /// <summary>
    /// Marks the section that is showing as the current item, including
    /// after Discover jumps into a grid: a solid pill on its menu row and on
    /// the rail. The rail always has Search and Discover; any other section
    /// gets its own rail button while you're in it, so the rail always shows
    /// where you are. Settings is the avatar, which has no pill.
    /// </summary>
    private void SyncSelection(Section section)
    {
        currentSection = section;
        var tag = section.Tag();
        foreach (var row in menuRows)
        {
            row.Style = row.Tag as string == tag ? menuRowCurrentStyle : menuRowStyle;
        }
        RailSearchButton.Style = section == Section.Search ? railCurrentStyle : railStyle;
        RailDiscoverButton.Style = section == Section.Discover ? railCurrentStyle : railStyle;

        if (RailGlyph(section) is { } glyph)
        {
            var title = section.Title();
            RailSectionIcon.Glyph = glyph;
            AutomationProperties.SetName(RailSectionButton, title);
            ToolTipService.SetToolTip(RailSectionButton, title);
            RailSectionButton.Visibility = Visibility.Visible;
        }
        else
        {
            RailSectionButton.Visibility = Visibility.Collapsed;
        }
        UpdateBadges();
    }

    // MARK: Shell state

    /// <summary>Swaps between the auth frame and the shell as the model's phase moves.</summary>
    private void ApplyPhase()
    {
        var ready = model.Phase == AppPhase.Ready;
        var shell = ready ? Visibility.Visible : Visibility.Collapsed;
        ShellContent.Visibility = shell;
        BackButton.Visibility = shell;
        SearchBox.Visibility = shell;
        NotificationsHost.Visibility = shell;
        AuthFrame.Visibility = ready ? Visibility.Collapsed : Visibility.Visible;
        if (!ready)
        {
            CloseMenu();
        }

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
            BackButton.IsEnabled = false;
        }
    }

    /// <summary>The account on the menu's profile row, and the photo (or initials) on both avatars.</summary>
    private void UpdateAccount()
    {
        var name = model.Viewer?.Label ?? "";
        ViewerNameText.Text = name;
        ServerText.Text = model.Session.Server?.DisplayName ?? "";

        var photo = model.Viewer?.AvatarUrl ?? "";
        RailAvatar.Label = name;
        RailAvatar.AvatarUrl = photo;
        MenuAvatar.Label = name;
        MenuAvatar.AvatarUrl = photo;

        var accountLabel = name.Length > 0 ? $"{name}: account and settings" : "Account and settings";
        AutomationProperties.SetName(RailProfileButton, accountLabel);
        AutomationProperties.SetName(MenuProfileButton, accountLabel);
        ToolTipService.SetToolTip(RailProfileButton, name.Length > 0 ? name : "Settings");
    }

    /// <summary>
    /// The bell's unread count; for an admin, the pending-requests count on
    /// the menu's Requests row and the accent dot on the rail's Requests
    /// button (members' pending count is always 0).
    /// </summary>
    private void UpdateBadges()
    {
        var pending = model.Viewer?.IsAdmin == true ? model.Badges.PendingRequests : 0;
        MenuRequestsBadge.Visibility = pending > 0 ? Visibility.Visible : Visibility.Collapsed;
        MenuRequestsBadgeText.Text = pending > 9 ? "9+" : pending.ToString(CultureInfo.CurrentCulture);
        AutomationProperties.SetName(MenuRequestsButton, pending > 0 ? $"Requests, {pending} pending" : "Requests");
        RailRequestsDot.Visibility = pending > 0 && currentSection == Section.Requests ? Visibility.Visible : Visibility.Collapsed;

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

    // MARK: Menu (components/nav-menu.tsx)

    /// <summary>
    /// Opens the panel over the page. Opening with a click or the keyboard
    /// moves focus to the current item; opening on hover leaves focus where
    /// it was.
    /// </summary>
    private void OpenMenu(bool moveFocus)
    {
        menuOpenTimer.Stop();
        menuCloseTimer.Stop();
        if (!shellShown)
        {
            return;
        }
        if (!menuOpen)
        {
            menuOpen = true;
            MenuLayer.Visibility = Visibility.Visible;
            MenuLayer.IsHitTestVisible = true;
            Rail.IsHitTestVisible = false;
            SetMenuPassthrough(true);
            menuCloseStoryboard.Stop();
            menuOpenStoryboard.Begin();
        }
        if (moveFocus)
        {
            FocusCurrentMenuItem();
        }
    }

    /// <summary>
    /// Fades the panel out and the rail back in. Focus inside the panel
    /// moves to the rail's menu button rather than disappearing with it.
    /// </summary>
    private void CloseMenu()
    {
        menuOpenTimer.Stop();
        menuCloseTimer.Stop();
        if (!menuOpen)
        {
            return;
        }
        menuOpen = false;
        hoverOpenSuppressed = pointerOverRail;
        var focusWasInMenu = IsFocusInMenu();
        SetMenuPassthrough(false);
        // Clicks during the fade reach the page instead of the closing panel.
        MenuLayer.IsHitTestVisible = false;
        Rail.IsHitTestVisible = true;
        menuOpenStoryboard.Stop();
        menuCloseStoryboard.Begin();
        if (focusWasInMenu)
        {
            RailMenuButton.Focus(FocusState.Programmatic);
        }
    }

    private void FocusCurrentMenuItem()
    {
        var tag = currentSection.Tag();
        var target = menuRows.FirstOrDefault(row => row.Tag as string == tag) ?? MenuProfileButton;
        // The panel was collapsed a moment ago; focus once it's in the layout.
        model.Dispatcher.TryEnqueue(() =>
        {
            if (menuOpen)
            {
                target.Focus(FocusState.Programmatic);
            }
        });
    }

    private bool IsFocusInMenu()
    {
        if (Root.XamlRoot is not { } xamlRoot)
        {
            return false;
        }
        for (var element = FocusManager.GetFocusedElement(xamlRoot) as DependencyObject; element != null; element = VisualTreeHelper.GetParent(element))
        {
            if (ReferenceEquals(element, MenuPanel))
            {
                return true;
            }
        }
        return false;
    }

    /// <summary>
    /// The open panel covers the left end of the top bar, and Window.SetTitleBar
    /// makes all of AppTitleBar's rectangle non-client, so without this the
    /// top of the profile row would drag the window instead of taking the
    /// click. While the menu is open, the strip of the top bar under the
    /// panel passes pointer input through to it.
    /// </summary>
    private void SetMenuPassthrough(bool enabled)
    {
        if (!ExtendsContentIntoTitleBar || Root.XamlRoot is not { } xamlRoot)
        {
            return;
        }
        try
        {
            var source = Microsoft.UI.Input.InputNonClientPointerSource.GetForWindowId(AppWindow.Id);
            if (!enabled)
            {
                source.ClearRegionRects(Microsoft.UI.Input.NonClientRegionKind.Passthrough);
                return;
            }
            var scale = xamlRoot.RasterizationScale;
            var width = (int)Math.Ceiling((MenuPanel.Margin.Left + MenuPanel.Width) * scale);
            var height = (int)Math.Ceiling(TopBar.ActualHeight * scale);
            source.SetRegionRects(
                Microsoft.UI.Input.NonClientRegionKind.Passthrough,
                [new global::Windows.Graphics.RectInt32(0, 0, width, height)]);
        }
        catch (Exception error) when (error is COMException or ArgumentException or NotImplementedException)
        {
            // The drag region stays as it was; the panel still works below the top bar.
        }
    }

    /// <summary>The panel's fade, slide from the left and scale from 0.98, with the rail fading the other way.</summary>
    private Storyboard MenuStoryboard(bool opening)
    {
        var storyboard = new Storyboard();
        AddAnimation(storyboard, MenuPanel, "Opacity", opening ? 0 : 1, opening ? 1 : 0);
        AddAnimation(storyboard, menuPanelTransform, "TranslateX", opening ? MenuClosedOffset : 0, opening ? 0 : MenuClosedOffset);
        AddAnimation(storyboard, menuPanelTransform, "ScaleX", opening ? MenuClosedScale : 1, opening ? 1 : MenuClosedScale);
        AddAnimation(storyboard, menuPanelTransform, "ScaleY", opening ? MenuClosedScale : 1, opening ? 1 : MenuClosedScale);
        AddAnimation(storyboard, Rail, "Opacity", opening ? 1 : 0, opening ? 0 : 1);
        return storyboard;
    }

    private static void AddAnimation(Storyboard storyboard, DependencyObject target, string property, double from, double to)
    {
        var animation = new DoubleAnimation
        {
            From = from,
            To = to,
            Duration = new Duration(MenuAnimationDuration),
            EasingFunction = new CubicEase { EasingMode = EasingMode.EaseOut },
        };
        Storyboard.SetTarget(animation, target);
        Storyboard.SetTargetProperty(animation, property);
        storyboard.Children.Add(animation);
    }

    private DispatcherQueueTimer OneShotTimer(TimeSpan interval)
    {
        var timer = model.Dispatcher.CreateTimer();
        timer.Interval = interval;
        timer.IsRepeating = false;
        return timer;
    }

    /// <summary>
    /// Pointer enter and exit events bubble up from the buttons inside the
    /// rail and the panel, so an exit only counts once the pointer has
    /// actually left the element.
    /// </summary>
    private static bool IsPointerOutside(PointerRoutedEventArgs e, FrameworkElement element)
    {
        var position = e.GetCurrentPoint(element).Position;
        return position.X < 0 || position.Y < 0 || position.X >= element.ActualWidth || position.Y >= element.ActualHeight;
    }

    private static bool IsMouse(PointerRoutedEventArgs e) =>
        e.Pointer.PointerDeviceType == Microsoft.UI.Input.PointerDeviceType.Mouse;

    /// <summary>Resting the mouse on the rail opens the menu (touch and pen use the menu button).</summary>
    private void OnRailPointerEntered(object sender, PointerRoutedEventArgs e)
    {
        if (!IsMouse(e))
        {
            return;
        }
        pointerOverRail = true;
        if (menuOpen || hoverOpenSuppressed || menuOpenTimer.IsRunning)
        {
            return;
        }
        menuOpenTimer.Start();
    }

    private void OnRailPointerExited(object sender, PointerRoutedEventArgs e)
    {
        if (!IsPointerOutside(e, Rail))
        {
            return;
        }
        pointerOverRail = false;
        hoverOpenSuppressed = false;
        menuOpenTimer.Stop();
    }

    private void OnMenuPointerEntered(object sender, PointerRoutedEventArgs e) => menuCloseTimer.Stop();

    /// <summary>The open panel covers the rail, so it keeps track of whether the mouse is over the rail's spot.</summary>
    private void OnMenuPointerMoved(object sender, PointerRoutedEventArgs e)
    {
        if (IsMouse(e))
        {
            pointerOverRail = !IsPointerOutside(e, Rail);
        }
    }

    /// <summary>Leaving the open panel with the mouse closes it after a short grace period.</summary>
    private void OnMenuPointerExited(object sender, PointerRoutedEventArgs e)
    {
        if (!menuOpen || !IsMouse(e) || !IsPointerOutside(e, MenuPanel))
        {
            return;
        }
        pointerOverRail = false;
        menuCloseTimer.Stop();
        menuCloseTimer.Start();
    }

    private void OnMenuOpenTimerTick(DispatcherQueueTimer sender, object args) => OpenMenu(moveFocus: false);

    private void OnMenuCloseTimerTick(DispatcherQueueTimer sender, object args) => CloseMenu();

    private void OnMenuCloseCompleted(object? sender, object e)
    {
        if (!menuOpen)
        {
            MenuLayer.Visibility = Visibility.Collapsed;
        }
    }

    /// <summary>A click anywhere outside the panel closes it.</summary>
    private void OnMenuDismissPressed(object sender, PointerRoutedEventArgs e)
    {
        CloseMenu();
        e.Handled = true;
    }

    /// <summary>Escape closes the menu and puts focus back on the rail's menu button.</summary>
    private void OnRootKeyDown(object sender, KeyRoutedEventArgs e)
    {
        if (!menuOpen || e.Key != global::Windows.System.VirtualKey.Escape)
        {
            return;
        }
        CloseMenu();
        RailMenuButton.Focus(FocusState.Keyboard);
        e.Handled = true;
    }

    private void OnRailMenuClick(object sender, RoutedEventArgs e) => OpenMenu(moveFocus: true);

    /// <summary>The rail's Discover and every section row in the menu: the row's <c>Tag</c> names the section.</summary>
    private void OnSectionNavClick(object sender, RoutedEventArgs e)
    {
        if (sender is FrameworkElement { Tag: string tag } && SectionExtensions.FromTag(tag) is { } section)
        {
            SelectSection(section);
        }
    }

    /// <summary>The rail's button for the section you're in: back to that section's root.</summary>
    private void OnRailSectionClick(object sender, RoutedEventArgs e) => SelectSection(currentSection);

    /// <summary>The avatar and the menu's profile row: the account, i.e. Settings.</summary>
    private void OnProfileClick(object sender, RoutedEventArgs e) => SelectSection(Section.Settings);

    /// <summary>Search on the rail and in the menu goes to the top bar's search box.</summary>
    private void OnSearchNavClick(object sender, RoutedEventArgs e)
    {
        CancelHoverOpen();
        CloseMenu();
        SearchBox.Focus(FocusState.Programmatic);
    }

    /// <summary>Navigates, which closes the menu (see <see cref="OnContentNavigated"/>).</summary>
    private void SelectSection(Section section)
    {
        CancelHoverOpen();
        model.Select(section);
    }

    /// <summary>
    /// A click on the rail cancels a pending hover-open, so the menu doesn't
    /// unfold over the page that was just picked while the mouse rests there.
    /// </summary>
    private void CancelHoverOpen()
    {
        menuOpenTimer.Stop();
        hoverOpenSuppressed = pointerOverRail;
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
                UpdateBadges();
                break;
            case nameof(AppModel.Badges):
                UpdateBadges();
                break;
        }
    }

    private void OnSessionChanged(object? sender, EventArgs e) => UpdateAccount();

    private void OnBackClick(object sender, RoutedEventArgs e) => GoBack();

    private void OnBackInvoked(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs args)
    {
        if (shellShown)
        {
            GoBack();
        }
        args.Handled = true;
    }

    /// <summary>Any navigation closes the menu, however it happened: a menu row, a search result, a notification, Back.</summary>
    private void OnContentNavigated(object sender, NavigationEventArgs e)
    {
        BackButton.IsEnabled = ContentFrame.CanGoBack;
        CloseMenu();
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
        menuOpenTimer.Stop();
        menuCloseTimer.Stop();
        menuOpenTimer.Tick -= OnMenuOpenTimerTick;
        menuCloseTimer.Tick -= OnMenuCloseTimerTick;
        model.PropertyChanged -= OnModelPropertyChanged;
        model.SessionChanged -= OnSessionChanged;
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
}
