using CommunityToolkit.Mvvm.ComponentModel;
using Marquee.Core.Api;
using Marquee.Core.Connection;
using Marquee.Core.Models;
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
    public const string SessionEndedNotice = "Your session has ended. Please sign in again.";

    /// <summary>Shown when the credential store refused to answer, so the saved sign-in is probably still there.</summary>
    public const string CredentialStoreUnreadableNotice =
        "Couldn't read your saved sign-in from the Windows credential store. Sign in again, or press Retry.";

    /// <summary>The server has no push; <c>GET /badges</c> is cheap enough to ask every minute.</summary>
    public static readonly TimeSpan BadgePollInterval = TimeSpan.FromSeconds(60);

    /// <summary>The Marquee server this PC is a client of.</summary>
    public ServerSession Session { get; }

    /// <summary>Bumped by API mutations and by polling; pages key their reloads off it.</summary>
    public ServerEvents Events { get; } = new();

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

    /// <summary>The signed-in account, exactly as the server reports it.</summary>
    [ObservableProperty]
    private User? viewer;

    [ObservableProperty]
    private AuthForm authForm = AuthForm.SignIn;

    /// <summary>A note on the sign-in card, e.g. after the server ended the session.</summary>
    [ObservableProperty]
    private string? authNotice;

    /// <summary>Why <see cref="AppPhase.Unreachable"/> couldn't use the saved server.</summary>
    [ObservableProperty]
    private ProbeOutcome? connectionProblem;

    [ObservableProperty]
    private bool isRetryingConnection;

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

    /// <summary>The session's server, token or user changed (already on the UI thread).</summary>
    public event EventHandler? SessionChanged;

    private bool bootstrapped;
    private DispatcherQueueTimer? badgeTimer;
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
        session.StateChanged += OnSessionStateChanged;
        session.Unauthorized += OnSessionUnauthorized;
        Events.Changed += OnServerChanged;
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

    private void ShowUnreachable(ProbeOutcome outcome)
    {
        ConnectionProblem = outcome;
        Phase = AppPhase.Unreachable;
    }

    /// <summary>"Retry" on the can't-reach card, and on the sign-in card's credential-store notice.</summary>
    public async Task RetryConnectionAsync()
    {
        if (IsRetryingConnection || Phase is not (AppPhase.Unreachable or AppPhase.SignIn))
        {
            return;
        }
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
        AuthNotice = null;
        ConnectionProblem = null;
        MovieFilters = BrowseQuery.Default;
        SeriesFilters = BrowseQuery.Default;
        Phase = AppPhase.Ready;
        StartBadgePolling();
        OpenPendingNotification();
        // After the shell has drawn: the question comes over Discover, not over a blank window.
        Dispatcher.TryEnqueue(DispatcherQueuePriority.Low, () => _ = Notifications.SignedInAsync(interactive));
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
                if (fresh.PendingRequests != previous.PendingRequests)
                {
                    moved |= ServerChange.Requests;
                }
                if (moved != ServerChange.None)
                {
                    Events.Record(moved, ServerChangeSource.Server);
                }
            }
        }
        catch (ApiException)
        {
            // The next poll tries again; a rejected token has already signed
            // the session out through the session's Unauthorized event.
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

    // MARK: Events from other threads

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
