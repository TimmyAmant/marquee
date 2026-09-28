using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Messaging;
using Marquee.Core.Api;
using Marquee.Core.Connection;
using Marquee.Core.Localization;
using Marquee.Core.Models;
using Marquee.Core.Updates;
using Microsoft.UI.Dispatching;

namespace Marquee.Windows.Services;

public enum AppPhase
{
    /// <summary>Restoring the saved server session.</summary>
    Launching,

    /// <summary>No server chosen yet: the connect screen.</summary>
    Connect,

    /// <summary>A server is chosen; sign in (or create its first account).</summary>
    SignIn,

    /// <summary>
    /// The saved server, which worked before, isn't answering: most likely
    /// restarting or updating. Retried on <see cref="ReconnectSchedule.Standard"/>
    /// (the token is kept); <see cref="AppModel.ConnectionProblem"/> says what was seen.
    /// </summary>
    Waiting,

    /// <summary>The saved server couldn't be used; <see cref="AppModel.ConnectionProblem"/> says why.</summary>
    Unreachable,

    Ready,
}

/// <summary>Which card the sign-in phase shows.</summary>
public enum AuthForm
{
    SignIn,
    Setup,
}

/// <summary>Why the badge counts are being re-read.</summary>
public enum BadgeRefreshReason
{
    /// <summary>The minute timer.</summary>
    Poll,

    /// <summary>The window came to the front, or the user reloaded.</summary>
    Activation,

    /// <summary>This app just changed notifications or requests: the mutation already bumped <see cref="ServerEvents"/>.</summary>
    LocalChange,
}

/// <summary>
/// App-level state shared by every page: the server session, the signed-in
/// account, which phase the window shows, navigation, and the badge counts.
/// The counterpart of the Mac app's <c>AppModel</c>.
///
/// Lives on the UI thread: every property is set there, so pages can bind
/// without dispatching. The session and the change signal raise their
/// events on whatever thread completed a request; this class hops those
/// back onto the <see cref="Dispatcher"/> before touching state.
/// </summary>
public sealed partial class AppModel : ObservableObject
{
    public static string SessionEndedNotice => Loc.Get("App_SessionEnded");

    /// <summary>Shown when the credential store refused to answer, so the saved sign-in is probably still there.</summary>
    public static string CredentialStoreUnreadableNotice => Loc.Get("App_CredentialStoreUnreadable");

    /// <summary>The server has no push; <c>GET /badges</c> is cheap enough to ask every minute.</summary>
    public static readonly TimeSpan BadgePollInterval = TimeSpan.FromSeconds(60);

    /// <summary>The Marquee server this PC is a client of.</summary>
    public ServerSession Session { get; }

    /// <summary>Bumped by API mutations and by polling; pages key their reloads off it.</summary>
    public ServerEvents Events { get; } = new();

    /// <summary>
    /// What this PC changed about titles since the lists showing them were
    /// fetched (a poster's quick add or request, a title page action), so
    /// cards drawn later, and the same title in other rows, agree without a
    /// refetch. Each change is also sent on the UI thread through
    /// <see cref="WeakReferenceMessenger.Default"/> as a
    /// <see cref="TitleStateChangedEventArgs"/> for the cards already on screen.
    /// </summary>
    public TitleStateStore TitleState { get; } = new();

    public DispatcherQueue Dispatcher { get; }

    /// <summary>The app's preferences file (the saved server, and each account's notification choice).</summary>
    public ISettingsStore Settings { get; }

    /// <summary>Windows notifications from the server's live stream, and the question that turns them on.</summary>
    public NotificationCenter Notifications { get; }

    /// <summary>The main window, once it exists. Navigation helpers are no-ops without one.</summary>
    public INavigator? Navigator { get; set; }

    /// <summary>The typed API with the current token. Mutations made through it bump <see cref="Events"/>.</summary>
    public MarqueeApi Api => Session.CreateApi(Events);

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsSignedIn))]
    private AppPhase phase = AppPhase.Launching;

    /// <summary>Leaving the waiting and can't-reach cards (signed in, another server, sign-in) ends the outage.</summary>
    partial void OnPhaseChanged(AppPhase oldValue, AppPhase newValue)
    {
        if (newValue is not (AppPhase.Waiting or AppPhase.Unreachable))
        {
            reconnect.Reset();
            StopReconnectTimer();
        }
        if (newValue == AppPhase.Unreachable && oldValue != AppPhase.Unreachable)
        {
            StartQuietRetries();
        }
        else if (newValue != AppPhase.Unreachable)
        {
            StopQuietRetries();
        }
    }

    /// <summary>The signed-in account, exactly as the server reports it.</summary>
    [ObservableProperty]
    private User? viewer;

    /// <summary>
    /// The account's language (<c>/me</c>'s <c>language</c>, 0.50+) is
    /// remembered for the next launch, which is when the app switches to it;
    /// a <c>/me</c> without the key (an older server, the login answer)
    /// changes nothing.
    /// </summary>
    partial void OnViewerChanged(User? value)
    {
        if (value?.Language is { } language)
        {
            AppLanguage.WriteChoice(Settings, language.Code);
            LanguageRestartPending = AppLocalization.NeedsRestart(Settings);
        }
    }

    /// <summary>
    /// The account's language isn't the one on screen (just changed, here or
    /// on another device): Settings › Account offers to restart.
    /// </summary>
    [ObservableProperty]
    private bool languageRestartPending;

    /// <summary>
    /// <c>PATCH /me</c>: the account's language, a code or null for
    /// "Automatic (system language)". Throws <see cref="ApiException"/>.
    /// </summary>
    public async Task SetLanguageAsync(string? code)
    {
        var me = await Api.SetLanguageAsync(code);
        if (Phase == AppPhase.Ready)
        {
            Viewer = me.User;
        }
    }

    [ObservableProperty]
    private AuthForm authForm = AuthForm.SignIn;

    /// <summary>A note on the sign-in card, e.g. after the server ended the session.</summary>
    [ObservableProperty]
    private string? authNotice;

    /// <summary>Why <see cref="AppPhase.Waiting"/> / <see cref="AppPhase.Unreachable"/> couldn't use the saved server.</summary>
    [ObservableProperty]
    private ProbeOutcome? connectionProblem;

    [ObservableProperty]
    private bool isRetryingConnection;

    /// <summary>
    /// Signed in, and the server stopped answering (a check after a failed
    /// call couldn't reach it either): the window shows a slim "Reconnecting
    /// to your server…" strip, and the page reloads once it answers.
    /// </summary>
    [ObservableProperty]
    private bool isReconnecting;

    /// <summary>Unread notifications and pending requests from <c>/badges</c>.</summary>
    [ObservableProperty]
    private Badges badges = Badges.Zero;

    /// <summary>Bumped by Reload (F5) to make the visible page refetch.</summary>
    [ObservableProperty]
    private int reloadToken;

    /// <summary>Seeds the connect screen's address field (the previous server after "Change server").</summary>
    [ObservableProperty]
    private string? addressPrefill;

    /// <summary>The Movies grid's filters; genre tiles on Discover set them before opening the section.</summary>
    [ObservableProperty]
    private BrowseQuery movieFilters = BrowseQuery.Default;

    [ObservableProperty]
    private BrowseQuery seriesFilters = BrowseQuery.Default;

    /// <summary>Settings' tab, remembered while the app runs; the avatar reopens Settings where it was left.</summary>
    [ObservableProperty]
    private SettingsTab settingsTab = SettingsTab.Account;

    /// <summary>
    /// Which edge the navigation bar sits on (Settings › Account › This PC):
    /// this PC's choice, kept in <see cref="Settings"/>; the window follows
    /// it as soon as it changes.
    /// </summary>
    [ObservableProperty]
    private MenuPosition menuPosition;

    partial void OnMenuPositionChanged(MenuPosition value) => MenuPositionSetting.Write(Settings, value);

    /// <summary>"Show menu labels" (Settings › Account › This PC), kept like the position.</summary>
    [ObservableProperty]
    private bool showMenuLabels;

    partial void OnShowMenuLabelsChanged(bool value) => MenuLabelsSetting.Write(Settings, value);

    /// <summary>The session's server, token or user changed (already on the UI thread).</summary>
    public event EventHandler? SessionChanged;

    private bool bootstrapped;
    private DispatcherQueueTimer? badgeTimer;

    /// <summary>The "Waiting for your server…" card's retries.</summary>
    private readonly ReconnectTracker reconnect = new(ReconnectSchedule.Standard);

    /// <summary>The next automatic attempt while <see cref="AppPhase.Waiting"/>.</summary>
    private DispatcherQueueTimer? reconnectTimer;

    /// <summary>The can't-reach card's quiet attempts, every <see cref="ReconnectSchedule.QuietRetryInterval"/>.</summary>
    private DispatcherQueueTimer? quietRetryTimer;

    /// <summary>The checks while the server is down and this PC is signed in.</summary>
    private readonly SignedInOutage outage = new();

    /// <summary>The next outage check.</summary>
    private DispatcherQueueTimer? outageTimer;

    /// <summary>Debounces network changes: several in a row (Wi-Fi rejoining) make one attempt after things settle.</summary>
    private DispatcherQueueTimer? networkTimer;

    /// <summary>How long a network change settles before the automatic retry.</summary>
    private static readonly TimeSpan NetworkSettleDelay = TimeSpan.FromSeconds(2);
    private int badgeGeneration;
    private Badges? lastBadges;
    private bool refreshingBadges;
    private bool badgeRefreshQueued;

    /// <summary>A notification clicked before its account was signed in (it launched the app): opened once it is.</summary>
    private NotificationTarget? pendingNotification;

    /// <param name="settings">The same store the session keeps the server in.</param>
    public AppModel(ServerSession session, DispatcherQueue dispatcher, ISettingsStore settings)
    {
        Session = session;
        Dispatcher = dispatcher;
        Settings = settings;
        Notifications = new NotificationCenter(this);
        MenuPosition = MenuPositionSetting.Read(settings);
        ShowMenuLabels = MenuLabelsSetting.Read(settings);
        session.StateChanged += OnSessionStateChanged;
        session.Unauthorized += OnSessionUnauthorized;
        session.ServerUnreachable += OnSessionServerUnreachable;
        Events.Changed += OnServerChanged;
        TitleState.Changed += OnTitleStateChanged;
    }

    public bool IsSignedIn => Phase == AppPhase.Ready;

    // MARK: Session

    /// <summary>Called once from <c>App.OnLaunched</c>; connects to the saved server, if any.</summary>
    public async Task BootstrapAsync()
    {
        if (bootstrapped)
        {
            return;
        }
        bootstrapped = true;
        global::Windows.Networking.Connectivity.NetworkInformation.NetworkStatusChanged += OnNetworkStatusChanged;
        await ConnectToSavedServerAsync();
    }

    /// <summary>
    /// No saved server: the connect screen. A saved token: <c>/me</c>,
    /// landing signed in, at sign-in on a 401, or on the can't-reach card.
    /// No token: sign-in, after a server-info probe so the card knows
    /// whether setup is done.
    /// </summary>
    private async Task ConnectToSavedServerAsync()
    {
        if (Session.Server == null)
        {
            Phase = AppPhase.Connect;
            return;
        }
        if (Session.HasToken)
        {
            switch (await Session.RestoreAsync())
            {
                case RestoreResult.SignedIn signedIn:
                    CompleteSignIn(signedIn.User);
                    break;
                case RestoreResult.TokenUnavailable:
                    await ShowSignInAsync(CredentialStoreUnreadableNotice);
                    break;
                case RestoreResult.Unreachable unreachable:
                    ShowUnreachable(unreachable.Outcome);
                    break;
                default:
                    await ShowSignInAsync();
                    break;
            }
        }
        else if (Session.TokenUnavailable)
        {
            // The credential store wouldn't answer. The saved session is
            // probably still there, so say so instead of silently asking for
            // a password; Retry re-reads it.
            await ShowSignInAsync(CredentialStoreUnreadableNotice);
        }
        else
        {
            await ShowSignInAsync();
        }
    }

    private async Task ShowSignInAsync(string? notice = null)
    {
        var outcome = await Session.RefreshInfoAsync();
        if (outcome is not ProbeOutcome.Marquee marquee)
        {
            ShowUnreachable(outcome);
            return;
        }
        ConnectionProblem = null;
        AuthNotice = notice;
        AuthForm = marquee.Info.SetupComplete == false ? AuthForm.Setup : AuthForm.SignIn;
        Phase = AppPhase.SignIn;
    }

    /// <summary>
    /// A saved server that's restarting or updating (refused, no answer, a
    /// 5xx or a proxy's 502-504) gets the waiting card and retries by itself
    /// for a couple of minutes, keeping the token; anything else, or an
    /// outage that outlasts the wait, gets the can't-reach card.
    /// </summary>
    private void ShowUnreachable(ProbeOutcome outcome)
    {
        ConnectionProblem = outcome;
        if (reconnect.Next(outcome, waiting: Phase == AppPhase.Waiting) is { } delay)
        {
            Phase = AppPhase.Waiting;
            ScheduleReconnect(delay);
        }
        else
        {
            StopReconnectTimer();
            Phase = AppPhase.Unreachable;
        }
    }

    private void ScheduleReconnect(TimeSpan delay)
    {
        StopReconnectTimer();
        var timer = Dispatcher.CreateTimer();
        timer.Interval = delay;
        timer.IsRepeating = false;
        timer.Tick += OnReconnectTick;
        timer.Start();
        reconnectTimer = timer;
    }

    private void StopReconnectTimer()
    {
        if (reconnectTimer != null)
        {
            reconnectTimer.Stop();
            reconnectTimer.Tick -= OnReconnectTick;
            reconnectTimer = null;
        }
    }

    private void OnReconnectTick(DispatcherQueueTimer sender, object args)
    {
        StopReconnectTimer();
        if (Phase == AppPhase.Waiting)
        {
            _ = RetryConnectionAsync();
        }
    }

    /// <summary>
    /// Behind the can't-reach card, a try every
    /// <see cref="ReconnectSchedule.QuietRetryInterval"/> without the Retry
    /// button's spinner, so a server that comes back later (after a longer
    /// update, or a reboot) is picked up without a click.
    /// </summary>
    private void StartQuietRetries()
    {
        StopQuietRetries();
        var timer = Dispatcher.CreateTimer();
        timer.Interval = ReconnectSchedule.QuietRetryInterval;
        timer.IsRepeating = true;
        timer.Tick += OnQuietRetryTick;
        timer.Start();
        quietRetryTimer = timer;
    }

    private void StopQuietRetries()
    {
        if (quietRetryTimer != null)
        {
            quietRetryTimer.Stop();
            quietRetryTimer.Tick -= OnQuietRetryTick;
            quietRetryTimer = null;
        }
    }

    private async void OnQuietRetryTick(DispatcherQueueTimer sender, object args)
    {
        if (Phase != AppPhase.Unreachable || IsRetryingConnection)
        {
            return;
        }
        try
        {
            await ConnectToSavedServerAsync();
        }
        catch (Exception)
        {
            // Stays on the card; the next tick tries again.
        }
    }

    /// <summary>
    /// The window came to the front, or the network came back: a server that
    /// was down may be back, so try it now rather than on the next tick.
    /// </summary>
    public void RetryIfDown()
    {
        if (Phase is AppPhase.Waiting or AppPhase.Unreachable)
        {
            _ = RetryConnectionAsync();
        }
    }

    /// <summary>
    /// <c>NetworkInformation.NetworkStatusChanged</c> (any thread): after the
    /// network settles, retry a server that was down, or catch up on counts
    /// while signed in.
    /// </summary>
    private void OnNetworkStatusChanged(object? sender) =>
        Dispatcher.TryEnqueue(() =>
        {
            networkTimer?.Stop();
            if (networkTimer == null)
            {
                networkTimer = Dispatcher.CreateTimer();
                networkTimer.IsRepeating = false;
                networkTimer.Interval = NetworkSettleDelay;
                networkTimer.Tick += (_, _) =>
                {
                    networkTimer?.Stop();
                    RetryIfDown();
                    RefreshCounts();
                };
            }
            networkTimer.Start();
        });

    /// <summary>"Retry" on the can't-reach card, "Retry now" while waiting, the automatic attempts, and the sign-in card's credential-store notice.</summary>
    public async Task RetryConnectionAsync()
    {
        if (IsRetryingConnection || Phase is not (AppPhase.Waiting or AppPhase.Unreachable or AppPhase.SignIn))
        {
            return;
        }
        StopReconnectTimer();
        IsRetryingConnection = true;
        try
        {
            await ConnectToSavedServerAsync();
        }
        finally
        {
            IsRetryingConnection = false;
        }
    }

    /// <summary>A server entered by hand that has already answered server-info.</summary>
    public async Task SelectServerAsync(ServerAddress address, ServerInfo info)
    {
        Session.Select(address, info);
        ConnectionProblem = null;
        AuthNotice = null;
        if (Session.HasToken)
        {
            Phase = AppPhase.Launching;
            await ConnectToSavedServerAsync();
        }
        else
        {
            AuthForm = info.SetupComplete == false ? AuthForm.Setup : AuthForm.SignIn;
            Phase = AppPhase.SignIn;
        }
    }

    /// <summary>"Change server": signs out, forgets the server, and starts over at the connect screen.</summary>
    public void ChangeServer()
    {
        var previous = Session.Server?.DisplayName;
        Session.ForgetServer();
        ClearSignedInState();
        ConnectionProblem = null;
        AuthNotice = null;
        AddressPrefill = previous;
        Phase = AppPhase.Connect;
    }

    /// <summary>Swap between the first-run and sign-in cards.</summary>
    public void ShowAuthForm(AuthForm target)
    {
        if (Phase == AppPhase.SignIn)
        {
            AuthForm = target;
        }
    }

    /// <param name="interactive">
    /// Signed in with a password (or first-run setup) rather than a saved
    /// session at launch: only then does "Not now" get asked again.
    /// </param>
    public void CompleteSignIn(User user, bool interactive = false)
    {
        Viewer = user;
        TitleState.Clear();
        AuthNotice = null;
        ConnectionProblem = null;
        MovieFilters = BrowseQuery.Default;
        SeriesFilters = BrowseQuery.Default;
        Phase = AppPhase.Ready;
        StartBadgePolling();
        OpenPendingNotification();
        if (user.Language == null)
        {
            // The login answer doesn't carry the account's language; /me does.
            _ = RefreshViewerAsync();
        }
        // After the shell has drawn: the question comes over Discover, not over a blank window.
        // "What's new" waits for it: WinUI shows one dialog at a time.
        Dispatcher.TryEnqueue(DispatcherQueuePriority.Low, async () =>
        {
            await Notifications.SignedInAsync(interactive);
            await ShowWhatsNewIfNeededAsync();
        });
    }

    /// <summary>
    /// Set by the main window: shows "What's new in Marquee …" and answers
    /// true once it's dismissed, or false when it couldn't be shown (another
    /// dialog was open), so it's tried again at the next launch.
    /// </summary>
    internal Func<WhatsNewContent, Task<bool>>? ShowWhatsNew { get; set; }

    /// <summary>
    /// After an upgrade, once per server (Marquee.Core/Updates/WhatsNew.cs):
    /// a newer server shows its changelog entries, a newer Windows app its own
    /// (embedded at build time), both at once in one dialog. The first run on
    /// this PC only remembers the versions.
    /// </summary>
    private async Task ShowWhatsNewIfNeededAsync()
    {
        if (Phase != AppPhase.Ready || Session.Server is not { } server || ShowWhatsNew is not { } show)
        {
            return;
        }
        var key = server.BaseUrlString;
        var store = new WhatsNewStore(Settings);
        var seen = store.Seen(key);
        var app = AppVersion.Current;
        var api = Api;
        var serverVersion = AppVersion.Parse(Session.ServerInfo?.Version);
        if (serverVersion is null)
        {
            // A saved sign-in restored at launch skips server-info; About has the version.
            try
            {
                serverVersion = AppVersion.Parse((await api.About.InfoAsync()).Version);
            }
            catch (ApiException)
            {
                // Unknown: the server's side waits for the next launch.
            }
        }
        var remember = WhatsNew.Remembered(seen, serverVersion, app);
        if (WhatsNew.Pending(seen, serverVersion, app) is not { } pending)
        {
            store.Save(remember, key);
            return;
        }
        IReadOnlyList<ChangelogEntry> serverChangelog = [];
        if (pending.ServerSince is not null)
        {
            try
            {
                serverChangelog = await api.About.ChangelogAsync();
            }
            catch (ApiException)
            {
                // Try again next launch rather than lose the notes.
                return;
            }
        }
        if (Phase != AppPhase.Ready || Session.Server?.BaseUrlString != key)
        {
            return;
        }
        IReadOnlyList<ChangelogEntry> appChangelog = pending.AppSince is not null ? BundledChangelog.Load() : [];
        if (WhatsNew.Content(pending, serverVersion, app, serverChangelog, appChangelog) is not { } content)
        {
            store.Save(remember, key);
            return;
        }
        if (await show(content))
        {
            store.Save(remember, key);
        }
    }

    /// <summary>Signs out of the server (revoking this PC's token) but stays on it.</summary>
    public async Task SignOutAsync()
    {
        ClearSignedInState();
        AuthNotice = null;
        if (Session.Server == null)
        {
            Phase = AppPhase.Connect;
        }
        else
        {
            AuthForm = Session.ServerInfo?.SetupComplete == false ? AuthForm.Setup : AuthForm.SignIn;
            Phase = AppPhase.SignIn;
        }
        // Clears the token locally first; the revoke on the server is best effort.
        await Session.SignOutAsync();
    }

    /// <summary>
    /// Any API call answered 401: the token expired or was revoked (a
    /// password change revokes every token), so go back to sign-in on the
    /// same server.
    /// </summary>
    private void SessionEnded()
    {
        if (Phase != AppPhase.Ready)
        {
            return;
        }
        ClearSignedInState();
        AuthForm = AuthForm.SignIn;
        AuthNotice = SessionEndedNotice;
        Phase = AppPhase.SignIn;
    }

    /// <summary>
    /// The notification stream said the server revoked this PC's token (a
    /// password change, Sign out elsewhere): back to sign-in with the same
    /// notice a 401 gets, and the dead token dropped here too.
    /// </summary>
    internal async Task EndRevokedSessionAsync()
    {
        if (Phase != AppPhase.Ready)
        {
            return;
        }
        SessionEnded();
        await Session.SignOutAsync();
    }

    private void ClearSignedInState()
    {
        StopBadgePolling();
        Viewer = null;
        TitleState.Clear();
        pendingNotification = null;
        Notifications.SignedOut();
        AvatarImages.Clear();
    }

    /// <summary>
    /// Role or display name can change on the server underneath a signed-in
    /// session (promotion, a rename in Settings): re-read <c>/me</c>. A 401
    /// here signs out through <see cref="SessionEnded"/>.
    /// </summary>
    public async Task RefreshViewerAsync()
    {
        if (Phase != AppPhase.Ready)
        {
            return;
        }
        try
        {
            var fresh = await Session.RefreshUserAsync();
            if (Phase == AppPhase.Ready && fresh != Viewer)
            {
                Viewer = fresh;
            }
        }
        catch (ApiException)
        {
            // The account shown is still the last one the server confirmed.
        }
    }

    /// <summary>The window came to the front: catch up on counts right away.</summary>
    public void RefreshCounts()
    {
        if (Phase == AppPhase.Ready)
        {
            _ = RefreshBadgesAsync(BadgeRefreshReason.Activation);
        }
    }

    /// <summary>F5: the visible page refetches, and the account and counts are re-read.</summary>
    public void Reload()
    {
        if (Phase != AppPhase.Ready)
        {
            return;
        }
        // The refetch is authoritative again.
        TitleState.Clear();
        ReloadToken++;
        _ = RefreshViewerAsync();
        RefreshCounts();
    }

    // MARK: Navigation

    /// <summary>
    /// Menu navigation opens Movies and Series unfiltered, like the web
    /// menu's plain /movies and /series links.
    /// </summary>
    public void Select(Section section, bool resetFilters = true)
    {
        if (resetFilters)
        {
            if (section == Section.Movies)
            {
                MovieFilters = BrowseQuery.Default;
            }
            if (section == Section.Series)
            {
                SeriesFilters = BrowseQuery.Default;
            }
        }
        Navigator?.ShowSection(section);
    }

    /// <summary>
    /// Settings on <paramref name="tab"/> (the Mac's <c>openSettings</c>):
    /// "Connect an integration" links open Integrations, the update button
    /// About. Already on Settings, the page just switches tab.
    /// </summary>
    public void OpenSettings(SettingsTab tab)
    {
        SettingsTab = tab;
        Select(Section.Settings);
    }

    public void Open(Route route) => Navigator?.Open(route);

    public void OpenTitle(TitleId id) => Open(new Route.Title(id));

    /// <summary>
    /// A Windows notification was clicked: the window comes forward and the
    /// title opens, marked read like a click in the bell. A click for an
    /// account that isn't signed in yet (it launched the app) waits for
    /// that sign-in; one for another account only brings the window forward.
    /// </summary>
    internal void OpenFromNotification(NotificationTarget? target)
    {
        Navigator?.BringToFront();
        if (target == null)
        {
            return;
        }
        if (Phase == AppPhase.Ready && target.Account == Notifications.CurrentAccount)
        {
            OpenNotificationTarget(target);
        }
        else
        {
            pendingNotification = target;
        }
    }

    private void OpenPendingNotification()
    {
        if (pendingNotification is not { } target)
        {
            return;
        }
        pendingNotification = null;
        if (target.Account == Notifications.CurrentAccount)
        {
            OpenNotificationTarget(target);
        }
    }

    private void OpenNotificationTarget(NotificationTarget target)
    {
        _ = MarkNotificationReadAsync(Api, target.NotificationId);
        OpenTitle(target.Title);
    }

    private static async Task MarkNotificationReadAsync(MarqueeApi api, Guid id)
    {
        try
        {
            await api.Notifications.MarkReadAsync(id);
        }
        catch (ApiException)
        {
            // The bell still shows it unread; nothing to say here.
        }
    }

    public void OpenTitle(MediaType mediaType, int tmdbId) => OpenTitle(new TitleId(mediaType, tmdbId));

    public void OpenPerson(int tmdbId) => Open(new Route.Person(tmdbId));

    public void OpenCompany(int tmdbId) => Open(new Route.Company(tmdbId));

    /// <summary>Genre tiles and network logos on Discover jump into a filtered grid.</summary>
    public void Browse(MediaType mediaType, int? genreId = null, int? networkId = null)
    {
        var filters = new BrowseQuery
        {
            GenreId = genreId,
            NetworkId = mediaType == MediaType.Tv ? networkId : null,
        };
        if (mediaType == MediaType.Movie)
        {
            MovieFilters = filters;
            Select(Section.Movies, resetFilters: false);
        }
        else
        {
            SeriesFilters = filters;
            Select(Section.Series, resetFilters: false);
        }
    }

    /// <summary>
    /// A Discover shelf's "See all": its own list page, or the unfiltered
    /// Movies/Series grid (any filters a genre tile left behind are cleared).
    /// </summary>
    public void OpenSeeAll(SeeAllTarget target)
    {
        switch (target)
        {
            case SeeAllTarget.DiscoverList list:
                Open(new Route.DiscoverList(list.Kind, list.Title));
                break;
            case SeeAllTarget.BrowseGrid grid:
                Browse(grid.MediaType);
                break;
        }
    }

    public void Search(string query)
    {
        var trimmed = query.Trim();
        if (trimmed.Length > 0)
        {
            Open(new Route.Search(trimmed));
        }
    }

    public bool CanGoBack => Navigator?.CanGoBack == true;

    public void GoBack() => Navigator?.GoBack();

    /// <summary>The page for <paramref name="route"/> on the server's own website, for "Open in browser".</summary>
    public Uri? WebUrl(Route route) =>
        route.WebPath is { } path && Session.Server is { } server && Uri.TryCreate(server.BaseUrl, path, out var url) ? url : null;

    // MARK: Badges

    private void StartBadgePolling()
    {
        StopBadgePolling();
        var timer = Dispatcher.CreateTimer();
        timer.Interval = BadgePollInterval;
        timer.IsRepeating = true;
        timer.Tick += OnBadgeTimerTick;
        timer.Start();
        badgeTimer = timer;
        _ = RefreshBadgesAsync(BadgeRefreshReason.Activation);
    }

    /// <summary>Sign-out, server change, 401: stop polling and clear the counts.</summary>
    private void StopBadgePolling()
    {
        badgeGeneration++;
        StopOutageTimer();
        _ = outage.Answered();
        IsReconnecting = false;
        if (badgeTimer != null)
        {
            badgeTimer.Stop();
            badgeTimer.Tick -= OnBadgeTimerTick;
            badgeTimer = null;
        }
        lastBadges = null;
        badgeRefreshQueued = false;
        if (Badges != Badges.Zero)
        {
            Badges = Badges.Zero;
        }
    }

    private void OnBadgeTimerTick(DispatcherQueueTimer sender, object args) =>
        _ = RefreshBadgesAsync(BadgeRefreshReason.Poll);

    /// <summary>
    /// One <c>GET /badges</c>. A count that moved without this app's doing
    /// (a download finished, a member requested something from the website)
    /// bumps <see cref="Events"/> as a server-side change so open pages
    /// reload; a change this app just made was already recorded by the
    /// mutation, so a <see cref="BadgeRefreshReason.LocalChange"/> refresh
    /// only updates the numbers.
    /// </summary>
    private async Task RefreshBadgesAsync(BadgeRefreshReason reason)
    {
        if (Phase != AppPhase.Ready)
        {
            return;
        }
        if (refreshingBadges)
        {
            badgeRefreshQueued = true;
            return;
        }
        refreshingBadges = true;
        var generation = badgeGeneration;
        try
        {
            var fresh = await Api.BadgesAsync();
            if (generation != badgeGeneration || Phase != AppPhase.Ready)
            {
                return;
            }
            ServerAnswered();
            var previous = lastBadges;
            lastBadges = fresh;
            if (fresh != Badges)
            {
                Badges = fresh;
            }
            if (previous != null && reason != BadgeRefreshReason.LocalChange)
            {
                var moved = ServerChange.None;
                if (fresh.UnreadNotifications != previous.UnreadNotifications)
                {
                    moved |= ServerChange.Notifications;
                }
                if (fresh.PendingRequests != previous.PendingRequests || fresh.OpenIssues != previous.OpenIssues || fresh.NotFoundRequests != previous.NotFoundRequests
                    || fresh.FailedRequests != previous.FailedRequests)
                {
                    moved |= ServerChange.Requests;
                }
                if (moved != ServerChange.None)
                {
                    Events.Record(moved, ServerChangeSource.Server);
                }
            }
        }
        catch (ApiException error)
        {
            // The next poll tries again; a rejected token has already signed
            // the session out through the session's Unauthorized event, and a
            // server that didn't answer at all started the outage checks.
            if (!error.IsConnectivityFailure && generation == badgeGeneration)
            {
                ServerAnswered();
            }
        }
        finally
        {
            refreshingBadges = false;
            // A refresh that queued behind this one runs now, even when this
            // one belonged to a session that has since ended: that queued
            // refresh may be the next sign-in's first, and dropping it left
            // the counts at 0 until the next poll.
            if (badgeRefreshQueued && Phase == AppPhase.Ready)
            {
                badgeRefreshQueued = false;
                _ = RefreshBadgesAsync(BadgeRefreshReason.LocalChange);
            }
        }
    }

    // MARK: Outages

    /// <summary>
    /// A call couldn't reach the server at all while signed in: check it on
    /// <see cref="ReconnectSchedule.SignedIn"/> until it answers. Nothing
    /// shows until a check fails too.
    /// </summary>
    private void SuspectOutage()
    {
        if (Phase == AppPhase.Ready && outage.Suspect() is { } wait)
        {
            ScheduleOutageCheck(wait);
        }
    }

    private void ScheduleOutageCheck(TimeSpan wait)
    {
        StopOutageTimer();
        var timer = Dispatcher.CreateTimer();
        timer.Interval = wait;
        timer.IsRepeating = false;
        timer.Tick += OnOutageTick;
        timer.Start();
        outageTimer = timer;
    }

    private void StopOutageTimer()
    {
        if (outageTimer != null)
        {
            outageTimer.Stop();
            outageTimer.Tick -= OnOutageTick;
            outageTimer = null;
        }
    }

    private async void OnOutageTick(DispatcherQueueTimer sender, object args)
    {
        StopOutageTimer();
        if (Phase != AppPhase.Ready)
        {
            return;
        }
        var generation = badgeGeneration;
        try
        {
            await Api.BadgesAsync();
        }
        catch (ApiException error) when (error.IsConnectivityFailure && !error.IsCancellation)
        {
            if (generation != badgeGeneration || Phase != AppPhase.Ready)
            {
                return;
            }
            var next = outage.CheckFailed();
            IsReconnecting = true;
            if (next is { } wait)
            {
                ScheduleOutageCheck(wait);
            }
            return;
        }
        catch (ApiException)
        {
            // It answered, even if with an error: it's back.
        }
        if (generation == badgeGeneration && Phase == AppPhase.Ready)
        {
            ServerAnswered();
        }
    }

    /// <summary>
    /// Any answer from the server ends an outage; one that had the strip up
    /// reloads the page and the counts.
    /// </summary>
    private void ServerAnswered()
    {
        if (!outage.IsChecking)
        {
            return;
        }
        StopOutageTimer();
        var wasReconnecting = outage.Answered();
        IsReconnecting = false;
        if (wasReconnecting)
        {
            Reload();
        }
    }

    private void OnSessionServerUnreachable(object? sender, EventArgs e) =>
        Dispatcher.TryEnqueue(SuspectOutage);

    // MARK: Poster quick actions

    /// <summary>
    /// A poster's "+ Add" (admin): into Radarr/Sonarr, then the status the
    /// server reports now, remembered so every card showing the title drops
    /// the button and shows the new badge. Throws the add's <see cref="ApiException"/>.
    /// </summary>
    public async Task QuickAddAsync(TitleId id)
    {
        var api = Api;
        await api.Titles.AddAsync(id.MediaType, id.TmdbId);
        LibraryStatus? status = null;
        try
        {
            status = (await api.Titles.StatusAsync(id.MediaType, id.TmdbId)).Library.Status;
        }
        catch (ApiException)
        {
            // The add went through; the badge catches up on the next load.
        }
        TitleState.Added(id, status);
    }

    /// <summary>A poster's "Request" (member). Throws the request's <see cref="ApiException"/>.</summary>
    public async Task RequestTitleAsync(TitleId id)
    {
        await Api.Titles.RequestAsync(id.MediaType, id.TmdbId);
        TitleState.Requested(id);
    }

    // MARK: Events from other threads

    private void OnTitleStateChanged(object? sender, TitleStateChangedEventArgs e) =>
        Dispatcher.TryEnqueue(() => WeakReferenceMessenger.Default.Send(e));

    private void OnSessionStateChanged(object? sender, EventArgs e) =>
        Dispatcher.TryEnqueue(() => SessionChanged?.Invoke(this, EventArgs.Empty));

    private void OnSessionUnauthorized(object? sender, EventArgs e) =>
        Dispatcher.TryEnqueue(SessionEnded);

    private void OnServerChanged(object? sender, ServerChangedEventArgs e)
    {
        if (e.Source != ServerChangeSource.Mutation)
        {
            return;
        }
        if ((e.Change & (ServerChange.Requests | ServerChange.Notifications)) == ServerChange.None)
        {
            return;
        }
        Dispatcher.TryEnqueue(() => _ = RefreshBadgesAsync(BadgeRefreshReason.LocalChange));
    }
}
