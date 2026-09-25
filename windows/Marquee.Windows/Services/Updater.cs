using System.ComponentModel;
using System.Diagnostics;
using CommunityToolkit.Mvvm.ComponentModel;
using Marquee.Core;
using Marquee.Core.Updates;
using Microsoft.UI.Dispatching;

namespace Marquee.Windows.Services;

/// <summary>Where the updater is, from a check to the installer taking over.</summary>
public enum UpdatePhase
{
    Idle,
    Checking,
    UpToDate,

    /// <summary><see cref="Updater.Update"/> is newer than this app.</summary>
    Available,

    /// <summary><see cref="Updater.Progress"/> of the installer.</summary>
    Downloading,

    /// <summary>The installer is running; Marquee is about to quit, and reopens on the new version.</summary>
    Installing,

    /// <summary><see cref="Updater.ErrorMessage"/> says why.</summary>
    Failed,
}

/// <summary>
/// Keeps this PC on the newest Marquee, the Mac app's <c>Updater</c> for
/// Windows: checks GitHub's latest release ten seconds after launch and then
/// daily (and whenever Settings › About's "Check for updates" is clicked),
/// and on "Update" downloads <c>Marquee-Setup.exe</c>, checks its size and
/// SHA-256 against the release, runs it silently and quits. The installer
/// (windows/installer/Marquee.iss) replaces the app in place and, given
/// <c>/relaunch=1</c>, opens the new version. Lives on the UI thread; every
/// property changes there.
/// </summary>
public sealed partial class Updater : ObservableObject
{
    public static readonly TimeSpan FirstCheckDelay = TimeSpan.FromSeconds(10);
    public static readonly TimeSpan CheckInterval = TimeSpan.FromHours(24);

    /// <summary>
    /// Inno Setup's switches: no wizard and no message boxes, close anything
    /// still holding the app's files but don't let Inno reopen it (the
    /// script's own <c>/relaunch=1</c> step does, exactly once).
    /// </summary>
    public const string InstallerArguments =
        "/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /CLOSEAPPLICATIONS /NORESTARTAPPLICATIONS /relaunch=1";

    private readonly UpdateService service;
    private readonly DispatcherQueue dispatcher;
    private DispatcherQueueTimer? timer;
    private CancellationTokenSource? installCancellation;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsBusy), nameof(IsInstalling), nameof(StatusText), nameof(CanCheck), nameof(CanInstall), nameof(IsProgressIndeterminate), nameof(HasFailed))]
    private UpdatePhase phase = UpdatePhase.Idle;

    /// <summary>The newest release, while it's newer than this app.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsUpdate), nameof(StatusText), nameof(UpdateLabel), nameof(CanCheck), nameof(CanInstall), nameof(ReleasePage))]
    private AvailableUpdate? update;

    /// <summary>0 to 1 while downloading.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(StatusText), nameof(ProgressPercent))]
    private double progress;

    /// <summary>Why the last check or install failed; null otherwise.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(StatusText))]
    private string? errorMessage;

    public Updater(DispatcherQueue dispatcher, UpdateService? service = null)
    {
        this.dispatcher = dispatcher;
        this.service = service ?? new UpdateService();
    }

    /// <summary>This build's version, "0.30.0".</summary>
    public string CurrentVersion => AppInfo.Version;

    public bool IsBusy => Phase is UpdatePhase.Checking or UpdatePhase.Downloading or UpdatePhase.Installing;

    public bool IsInstalling => Phase is UpdatePhase.Downloading or UpdatePhase.Installing;

    /// <summary>A newer Marquee is known (the rail's update button shows).</summary>
    public bool ShowsUpdate => Update != null;

    /// <summary>"Check for updates": nothing newer is known and nothing is under way.</summary>
    public bool CanCheck => Update == null && !IsBusy;

    /// <summary>"Update": a newer release is known and isn't already downloading.</summary>
    public bool CanInstall => Update != null && !IsInstalling;

    public bool HasFailed => Phase == UpdatePhase.Failed;

    /// <summary>The bar has no percentage once the installer is running.</summary>
    public bool IsProgressIndeterminate => Phase == UpdatePhase.Installing;

    /// <summary>0 to 100, for the progress bar.</summary>
    public double ProgressPercent => Progress * 100;

    /// <summary>"Update to Marquee 0.31.0".</summary>
    public string UpdateLabel => Update is { } available ? $"Update to Marquee {available.Version}" : "Update Marquee";

    /// <summary>The one line Settings › About shows under the version.</summary>
    public string StatusText => Phase switch
    {
        UpdatePhase.Checking => "Checking for updates…",
        UpdatePhase.UpToDate => "You're up to date.",
        UpdatePhase.Available when Update is { } available => $"Marquee {available.Version} is available. You have {CurrentVersion}.",
        UpdatePhase.Downloading => $"Downloading Marquee {Update?.Version}… {(int)Math.Round(Progress * 100)}%",
        UpdatePhase.Installing => "Installing. Marquee will close and reopen by itself.",
        UpdatePhase.Failed => ErrorMessage ?? "Marquee couldn't update.",
        _ => "Marquee checks for updates once a day.",
    };

    /// <summary>The release to read about or download by hand.</summary>
    public Uri ReleasePage => Update?.ReleasePage ?? UpdateService.ReleasesPage;

    /// <summary>The first check in <see cref="FirstCheckDelay"/>, then one a day.</summary>
    public void Start()
    {
        if (timer != null)
        {
            return;
        }
        timer = dispatcher.CreateTimer();
        timer.IsRepeating = false;
        timer.Interval = FirstCheckDelay;
        timer.Tick += OnTimerTick;
        timer.Start();
    }

    private void OnTimerTick(DispatcherQueueTimer sender, object args)
    {
        sender.Stop();
        sender.Interval = CheckInterval;
        sender.Start();
        _ = CheckAsync();
    }

    /// <summary>Asks GitHub for the newest release. Does nothing while a check or install is under way.</summary>
    public async Task CheckAsync()
    {
        if (IsBusy)
        {
            return;
        }
        Phase = UpdatePhase.Checking;
        ErrorMessage = null;
        try
        {
            var result = await service.CheckAsync(AppVersion.Current);
            Update = result.Update;
            Phase = result.IsUpToDate ? UpdatePhase.UpToDate : UpdatePhase.Available;
        }
        catch (UpdateException error)
        {
            // A known update stays on offer when a later check fails.
            if (Update != null)
            {
                Phase = UpdatePhase.Available;
            }
            else
            {
                ErrorMessage = error.Message;
                Phase = UpdatePhase.Failed;
            }
        }
    }

    /// <summary>
    /// Downloads the installer, checks it, starts it and quits. Checks first
    /// when no update is known yet (a click before the first check finished).
    /// </summary>
    public async Task InstallAsync()
    {
        if (IsInstalling)
        {
            return;
        }
        if (Update == null)
        {
            await CheckAsync();
        }
        if (Update is not { } available)
        {
            return;
        }
        installCancellation?.Dispose();
        installCancellation = new CancellationTokenSource();
        var token = installCancellation.Token;
        ErrorMessage = null;
        Progress = 0;
        Phase = UpdatePhase.Downloading;
        try
        {
            var expected = await service.ExpectedSha256Async(available, token);
            var folder = Path.Combine(Path.GetTempPath(), "Marquee-update");
            var installer = Path.Combine(folder, $"Marquee-Setup-{available.Version}.exe");
            var reporter = new global::System.Progress<double>(value => Progress = value);
            await service.DownloadAsync(available, expected, installer, reporter, token);

            Phase = UpdatePhase.Installing;
            Launch(installer);
            // Give the progress line a moment to say what's happening, then
            // get out of the installer's way.
            await Task.Delay(TimeSpan.FromMilliseconds(600), CancellationToken.None);
            Microsoft.UI.Xaml.Application.Current.Exit();
        }
        catch (UpdateException error)
        {
            ErrorMessage = error.Message;
            Phase = UpdatePhase.Failed;
        }
        catch (OperationCanceledException)
        {
            Phase = UpdatePhase.Available;
        }
    }

    /// <summary>Stops a download in progress.</summary>
    public void CancelInstall() => installCancellation?.Cancel();

    private static void Launch(string installer)
    {
        try
        {
            var started = Process.Start(new ProcessStartInfo(installer)
            {
                Arguments = InstallerArguments,
                UseShellExecute = false,
                WorkingDirectory = Path.GetDirectoryName(installer) ?? Path.GetTempPath(),
            });
            if (started == null)
            {
                throw new UpdateException(UpdateErrorKind.LaunchFailed);
            }
        }
        catch (Exception error) when (error is Win32Exception or InvalidOperationException or IOException)
        {
            throw new UpdateException(UpdateErrorKind.LaunchFailed, error);
        }
    }
}
