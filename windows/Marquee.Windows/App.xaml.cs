using Marquee.Core.Api;
using Marquee.Core.Connection;
using Marquee.Core.Models;
using Marquee.Windows.Services;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;

namespace Marquee.Windows;

/// <summary>
/// The composition root. Everything the app shares is built here, once, in
/// the order it depends on: the HTTP handler (the one connection pool every
/// client uses), the two stores, the session over them, the model over the
/// session, and finally the window that shows it.
/// </summary>
public partial class App : Application
{
    private Window? window;

    public App()
    {
        CrashReporter.Install(this);
        try
        {
            InitializeComponent();
        }
        catch (Exception error)
        {
            // App.xaml's resources failed to load: nothing can show, so say
            // why before the process goes.
            CrashReporter.Report(error, "Loading App.xaml", fatal: true);
            throw;
        }
    }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        try
        {
            Launch();
        }
        catch (Exception error)
        {
            CrashReporter.Report(error, "Starting up", fatal: true);
            Exit();
        }
    }

    private void Launch()
    {
        var settings = new JsonSettingsStore();
        var session = new ServerSession(
            settings,
            new PasswordVaultTokenStore(),
            ApiClient.DefaultHandler,
            DeviceName());
        var model = new AppModel(session, DispatcherQueue.GetForCurrentThread(), settings);
        AppServices.Initialize(model);

        window = new MainWindow();
        AppServices.WindowHandle = WinRT.Interop.WindowNative.GetWindowHandle(window);

        // Before the window shows: when a click on a Windows notification
        // launched the app, that click is delivered through this registration.
        model.Notifications.Register();
        window.Activate();

        // Restores the saved session after the window is up, so the spinner
        // has somewhere to show.
        _ = model.BootstrapAsync();
    }

    /// <summary>What the server's device list calls this PC (the <c>name</c> on its token row).</summary>
    private static string DeviceName()
    {
        try
        {
            return Environment.MachineName.NonBlank() ?? "Windows PC";
        }
        catch (InvalidOperationException)
        {
            return "Windows PC";
        }
    }
}
