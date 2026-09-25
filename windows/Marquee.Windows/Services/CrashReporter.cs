using System.Runtime.InteropServices;
using Microsoft.UI.Xaml;

namespace Marquee.Windows.Services;

/// <summary>
/// Makes a crash visible. Without it, an exception while starting up (a XAML
/// resource that doesn't parse, a missing runtime file) closes the app
/// before its window ever shows, with nothing on screen and nothing in Task
/// Manager to say why. Every unhandled exception is appended to
/// <see cref="LogPath"/>, and a fatal one also shows a plain Windows message
/// box naming the error and the log.
/// </summary>
internal static class CrashReporter
{
    /// <summary>Set by the CI smoke test, which reads the log instead of clicking OK.</summary>
    private const string NoDialogVariable = "MARQUEE_NO_CRASH_DIALOG";

    public static string LogPath { get; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Marquee", "crash.log");

    private static int dialogShown;

    /// <summary>Hooks every place an exception can escape to. Call before anything else in <see cref="App"/>.</summary>
    public static void Install(Application app)
    {
        app.UnhandledException += (_, e) => Report(e.Exception, "UI thread", fatal: true);
        AppDomain.CurrentDomain.UnhandledException += (_, e) =>
            Report(e.ExceptionObject as Exception ?? new InvalidOperationException(e.ExceptionObject?.ToString()), "Background thread", fatal: true);
        TaskScheduler.UnobservedTaskException += (_, e) =>
        {
            // A forgotten task's failure: worth a line in the log, not worth
            // taking the app down for.
            Report(e.Exception, "Unobserved task", fatal: false);
            e.SetObserved();
        };
    }

    public static void Report(Exception error, string where, bool fatal)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(LogPath)!);
            File.AppendAllText(
                LogPath,
                $"[{DateTimeOffset.Now:yyyy-MM-dd HH:mm:ss zzz}] {where}{(fatal ? " (fatal)" : "")}, Marquee {typeof(CrashReporter).Assembly.GetName().Version}{Environment.NewLine}{error}{Environment.NewLine}{Environment.NewLine}");
        }
        catch (IOException)
        {
            // Nowhere to write it; the dialog below still says what happened.
        }
        catch (UnauthorizedAccessException)
        {
        }

        if (!fatal || Environment.GetEnvironmentVariable(NoDialogVariable) == "1")
        {
            return;
        }
        // One dialog per run: a crash while starting can raise the same
        // exception through more than one of the hooks above.
        if (Interlocked.Exchange(ref dialogShown, 1) == 1)
        {
            return;
        }
        MessageBoxW(
            IntPtr.Zero,
            $"Marquee ran into a problem and has to close.{Environment.NewLine}{Environment.NewLine}{error.GetType().Name}: {error.Message}{Environment.NewLine}{Environment.NewLine}The details are saved in:{Environment.NewLine}{LogPath}",
            "Marquee",
            MessageBoxIconError);
    }

    private const uint MessageBoxIconError = 0x00000010;

    [DllImport("user32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern int MessageBoxW(IntPtr hWnd, string text, string caption, uint type);
}
