using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Microsoft.Windows.AppNotifications;
using Microsoft.Windows.AppNotifications.Builder;

namespace Marquee.Windows.Services;

/// <summary>Whether an account on a server wants Windows notifications on this PC.</summary>
public enum NotificationChoice
{
    /// <summary>Never asked: the question comes after the next sign-in, or the next launch.</summary>
    Unanswered,

    /// <summary>"Turn on", or Settings switched on.</summary>
    On,

    /// <summary>Switched off in Settings: no question again.</summary>
    Off,

    /// <summary>"Not now": no notifications, and the question comes back at the next sign-in.</summary>
    NotNow,
}

/// <summary>What a click on a notification asks to open: whose it was, which one, and its title.</summary>
internal sealed record NotificationTarget(string Account, Guid NotificationId, TitleId Title);

/// <summary>
/// Windows notifications for new Marquee notifications, straight from the
/// server over <c>GET /notifications/stream</c> while the app runs: nothing
/// goes through Microsoft's, or anyone else's, push service.
///
/// Per server and account (the choice and a watermark live in the settings
/// file): after signing in, the app asks "Get notifications on this PC?";
/// once on, it keeps the stream open, shows each <c>notification</c> event
/// as a Windows notification, and on every (re)connection catches up with
/// <c>GET /notifications</c>, showing only what is newer than the newest
/// one already shown. So a relaunch shows what arrived meanwhile, not the
/// whole history. A click opens the title through the model, and marks it read.
///
/// UI thread only, except <see cref="OnNotificationInvoked"/> and the
/// stream's events, which hop onto it.
/// </summary>
public sealed class NotificationCenter
{
    private const string SettingsPrefix = "marquee.notifications.";

    /// <summary>How far back a catch-up looks; the bell's own page size.</summary>
    private const int CatchUpLimit = 20;

    /// <summary>After a long absence, only the newest few get a notification of their own; the bell has the rest.</summary>
    private const int MaxCatchUpNotifications = 5;

    // Carried by every notification and read back when it's clicked.
    private const string AccountArgument = "account";
    private const string NotificationArgument = "notification";
    private const string MediaTypeArgument = "mediaType";
    private const string TmdbIdArgument = "tmdbId";

    private readonly AppModel model;

    /// <summary>Already shown this run, so the live event and a catch-up never show the same one twice.</summary>
    private readonly HashSet<Guid> shown = [];

    private NotificationStream? stream;
    private string? streamAccount;
    private bool registered;

    /// <summary>The signed-in server answered the stream with 404: it predates it.</summary>
    private bool serverLacksStream;

    public NotificationCenter(AppModel model)
    {
        this.model = model;
    }

    /// <summary>The choice or what Windows allows changed; Settings re-reads <see cref="IsEnabled"/>.</summary>
    public event EventHandler? StateChanged;

    /// <summary>
    /// Set by the main window: asks "Get notifications on this PC?" and
    /// answers true for Turn on, false for Not now, or null when it couldn't
    /// ask (another dialog was open), in which case it asks another time.
    /// </summary>
    internal Func<Task<bool?>>? AskPermission { get; set; }

    /// <summary>Windows notifications work for this copy of the app (registration succeeded).</summary>
    public bool IsSupported => registered;

    /// <summary>Notifications are on, but this server is too old to send them (no stream).</summary>
    public bool ServerLacksStream => serverLacksStream;

    /// <summary>The signed-in account has notifications on, on this PC.</summary>
    public bool IsEnabled => CurrentAccount is { } account && ChoiceFor(account) == NotificationChoice.On;

    /// <summary>Notifications are on here, but Windows is set to hide Marquee's (Settings › System › Notifications).</summary>
    public bool IsBlockedByWindows
    {
        get
        {
            if (!registered)
            {
                return false;
            }
            try
            {
                return AppNotificationManager.Default.Setting != AppNotificationSetting.Enabled;
            }
            catch (Exception error) when (error is COMException or InvalidOperationException)
            {
                return false;
            }
        }
    }

    /// <summary>"server|account": whose choice and watermark apply, and whose notifications a click may open.</summary>
    internal string? CurrentAccount =>
        model.Phase == AppPhase.Ready && model.Session.Server is { } server && model.Viewer is { } viewer
            ? $"{server.BaseUrlString}|{viewer.Id:D}"
            : null;

    // MARK: App lifetime

    /// <summary>
    /// At launch, before the window shows: registers this process to show
    /// notifications and to hear their clicks (the app is unpackaged, so
    /// the Windows App SDK registers the executable itself). A click that
    /// launched the app arrives through here too. Never fatal: a copy that
    /// can't use Windows notifications works without them.
    /// </summary>
    public void Register()
    {
        try
        {
            if (!AppNotificationManager.IsSupported())
            {
                return;
            }
            AppNotificationManager.Default.NotificationInvoked += OnNotificationInvoked;
            AppNotificationManager.Default.Register();
            registered = true;
        }
        catch (Exception error)
        {
            Debug.WriteLine($"Windows notifications aren't available: {error.Message}");
            registered = false;
            try
            {
                AppNotificationManager.Default.NotificationInvoked -= OnNotificationInvoked;
            }
            catch (Exception cleanup)
            {
                Debug.WriteLine($"Couldn't undo the notification subscription: {cleanup.Message}");
            }
        }
    }

    /// <summary>On exit: closes the stream and unregisters, so a later click launches the app afresh.</summary>
    public void Shutdown()
    {
        StopStream();
        if (!registered)
        {
            return;
        }
        registered = false;
        try
        {
            AppNotificationManager.Default.NotificationInvoked -= OnNotificationInvoked;
            AppNotificationManager.Default.Unregister();
        }
        catch (Exception error)
        {
            Debug.WriteLine($"Couldn't unregister notifications: {error.Message}");
        }
    }

    // MARK: Account lifetime

    /// <summary>
    /// Just signed in (<paramref name="interactive"/>: with a password,
    /// rather than a saved session at launch). Notifications on: connect.
    /// Never answered: ask. "Not now": ask again, but only after a real sign-in.
    /// </summary>
    internal async Task SignedInAsync(bool interactive)
    {
        if (CurrentAccount is not { } account)
        {
            return;
        }
        var choice = ChoiceFor(account);
        if (choice == NotificationChoice.On)
        {
            StartStream(account);
            RaiseStateChanged();
            return;
        }
        var asks = registered
            && AskPermission != null
            && (choice == NotificationChoice.Unanswered || (choice == NotificationChoice.NotNow && interactive));
        if (!asks || AskPermission is not { } ask)
        {
            RaiseStateChanged();
            return;
        }
        var answer = await ask();
        if (answer is not { } turnOn || CurrentAccount != account)
        {
            return;
        }
        SetChoice(account, turnOn ? NotificationChoice.On : NotificationChoice.NotNow);
    }

    /// <summary>Signed out, or the server changed: stop listening; the next account's choice is its own.</summary>
    internal void SignedOut()
    {
        StopStream();
        shown.Clear();
        serverLacksStream = false;
        RaiseStateChanged();
    }

    /// <summary>Settings' switch. Off sticks (no question at the next sign-in); on connects right away.</summary>
    public void SetEnabled(bool enabled)
    {
        if (CurrentAccount is { } account)
        {
            SetChoice(account, enabled ? NotificationChoice.On : NotificationChoice.Off);
        }
    }

    private void SetChoice(string account, NotificationChoice choice)
    {
        model.Settings.SetString(Key(account, "choice"), choice switch
        {
            NotificationChoice.On => "on",
            NotificationChoice.Off => "off",
            NotificationChoice.NotNow => "not-now",
            _ => null,
        });
        if (choice == NotificationChoice.On)
        {
            StartStream(account);
        }
        else
        {
            StopStream();
        }
        RaiseStateChanged();
    }

    private NotificationChoice ChoiceFor(string account) => model.Settings.GetString(Key(account, "choice")) switch
    {
        "on" => NotificationChoice.On,
        "off" => NotificationChoice.Off,
        "not-now" => NotificationChoice.NotNow,
        _ => NotificationChoice.Unanswered,
    };

    private static string Key(string account, string name) => $"{SettingsPrefix}{account}.{name}";

    private void RaiseStateChanged() => StateChanged?.Invoke(this, EventArgs.Empty);

    // MARK: The stream

    private void StartStream(string account)
    {
        if (stream != null && streamAccount == account)
        {
            return;
        }
        StopStream();
        serverLacksStream = false;
        var session = model.Session;
        var next = new NotificationStream(() => session.Client);
        next.Connected += OnStreamConnected;
        next.NotificationReceived += OnStreamNotification;
        next.SignedOut += OnStreamSignedOut;
        next.Unsupported += OnStreamUnsupported;
        stream = next;
        streamAccount = account;
        next.Start();
    }

    private void StopStream()
    {
        if (stream is not { } current)
        {
            return;
        }
        current.Connected -= OnStreamConnected;
        current.NotificationReceived -= OnStreamNotification;
        current.SignedOut -= OnStreamSignedOut;
        current.Unsupported -= OnStreamUnsupported;
        current.Stop();
        stream = null;
        streamAccount = null;
    }

    private void OnStreamConnected(object? sender, EventArgs e) =>
        OnUiThread(sender, account =>
        {
            _ = CatchUpAsync(account);
        });

    private void OnStreamNotification(object? sender, NotificationItem item) =>
        OnUiThread(sender, account => Receive(account, item));

    /// <summary>A server from before the stream: nothing to listen to. Settings says so.</summary>
    private void OnStreamUnsupported(object? sender, EventArgs e) =>
        OnUiThread(sender, account =>
        {
            StopStream();
            serverLacksStream = true;
            RaiseStateChanged();
        });

    /// <summary>The server revoked this PC's token (a password change, Sign out elsewhere): back to sign-in.</summary>
    private void OnStreamSignedOut(object? sender, EventArgs e) =>
        OnUiThread(sender, account =>
        {
            _ = model.EndRevokedSessionAsync();
        });

    /// <summary>
    /// Runs <paramref name="action"/> on the UI thread, if <paramref name="sender"/>
    /// is still the stream of the account that is signed in by then.
    /// </summary>
    private void OnUiThread(object? sender, Action<string> action) =>
        model.Dispatcher.TryEnqueue(() =>
        {
            if (sender != null && ReferenceEquals(sender, stream) && streamAccount is { } account && account == CurrentAccount)
            {
                action(account);
            }
        });

    /// <summary>A live one: new by definition, unless a catch-up got there first.</summary>
    private void Receive(string account, NotificationItem item)
    {
        var watermark = WatermarkFor(account);
        if (!item.Read && (watermark is not { } last || item.CreatedAt > last))
        {
            Show(account, item);
        }
        AdvanceWatermark(account, item.CreatedAt);
        model.RefreshCounts();
    }

    /// <summary>
    /// After every (re)connection: shows what arrived while the app was
    /// closed or the connection was down. The first time notifications are
    /// on for an account there is nothing to compare with, so what's
    /// already there only sets the watermark.
    /// </summary>
    private async Task CatchUpAsync(string account)
    {
        NotificationList list;
        try
        {
            list = await model.Api.Notifications.ListAsync(CatchUpLimit);
        }
        catch (ApiException)
        {
            // The next connection tries again.
            return;
        }
        if (account != streamAccount || account != CurrentAccount)
        {
            return;
        }
        DateTimeOffset? newest = list.Results.Count > 0 ? list.Results.Max(item => item.CreatedAt) : null;
        if (WatermarkFor(account) is not { } watermark)
        {
            SaveWatermark(account, newest ?? DateTimeOffset.UnixEpoch);
            return;
        }
        var missed = list.Results
            .Where(item => !item.Read && item.CreatedAt > watermark && !shown.Contains(item.Id))
            .OrderBy(item => item.CreatedAt)
            .ToList();
        foreach (var item in missed.TakeLast(MaxCatchUpNotifications))
        {
            Show(account, item);
        }
        if (newest is { } latest)
        {
            AdvanceWatermark(account, latest);
        }
        model.RefreshCounts();
    }

    private DateTimeOffset? WatermarkFor(string account) =>
        DateTimeOffset.TryParse(model.Settings.GetString(Key(account, "watermark")), CultureInfo.InvariantCulture, DateTimeStyles.None, out var value)
            ? value
            : null;

    private void SaveWatermark(string account, DateTimeOffset value) =>
        model.Settings.SetString(Key(account, "watermark"), value.ToString("O", CultureInfo.InvariantCulture));

    private void AdvanceWatermark(string account, DateTimeOffset candidate)
    {
        if (WatermarkFor(account) is not { } current || candidate > current)
        {
            SaveWatermark(account, candidate);
        }
    }

    // MARK: Windows notifications

    /// <summary>The server's own wording: "Request declined" over the message, the same as its Web Push.</summary>
    private void Show(string account, NotificationItem item)
    {
        if (!registered || !shown.Add(item.Id))
        {
            return;
        }
        try
        {
            var notification = new AppNotificationBuilder()
                .AddArgument(AccountArgument, account)
                .AddArgument(NotificationArgument, item.Id.ToString("D"))
                .AddArgument(MediaTypeArgument, item.MediaType.Value)
                .AddArgument(TmdbIdArgument, item.TmdbId.ToString(CultureInfo.InvariantCulture))
                .AddText(item.EventType.NotificationTitle)
                .AddText(item.Message)
                .BuildNotification();
            AppNotificationManager.Default.Show(notification);
        }
        catch (Exception error) when (error is COMException or ArgumentException or InvalidOperationException)
        {
            Debug.WriteLine($"Couldn't show a notification: {error.Message}");
        }
    }

    /// <summary>A notification was clicked (raised on a background thread): open its title in the window.</summary>
    private void OnNotificationInvoked(AppNotificationManager sender, AppNotificationActivatedEventArgs args)
    {
        var target = TargetFrom(args.Arguments);
        model.Dispatcher.TryEnqueue(() => model.OpenFromNotification(target));
    }

    /// <summary>What a click's arguments point at; null for arguments this version didn't write.</summary>
    private static NotificationTarget? TargetFrom(IDictionary<string, string> arguments)
    {
        if (!arguments.TryGetValue(AccountArgument, out var account)
            || !arguments.TryGetValue(NotificationArgument, out var notification)
            || !Guid.TryParse(notification, out var notificationId)
            || !arguments.TryGetValue(MediaTypeArgument, out var mediaType)
            || !arguments.TryGetValue(TmdbIdArgument, out var tmdb)
            || !int.TryParse(tmdb, NumberStyles.None, CultureInfo.InvariantCulture, out var tmdbId))
        {
            return null;
        }
        return new NotificationTarget(account, notificationId, new TitleId(MediaType.FromValue(mediaType), tmdbId));
    }
}
