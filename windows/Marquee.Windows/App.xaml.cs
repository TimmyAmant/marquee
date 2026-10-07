using Marquee.Core.Api;
using Marquee.Core.Connection;
using Marquee.Core.Models;
using Marquee.Windows.Services;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;
using Microsoft.Windows.AppLifecycle;

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

    /// <summary>Read before any XAML loads: it says which language the app starts in.</summary>
    private readonly JsonSettingsStore settings = new();

    public App()
    {
        CrashReporter.Install(this);
        // Before InitializeComponent: every x:Uid string is looked up in the
        // language chosen here, App.xaml's included.
        AppLocalization.Apply(settings);
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

    protected override async void OnLaunched(LaunchActivatedEventArgs args)
    {
        try
        {
            if (await HandedToRunningCopyAsync())
            {
                Exit();
                return;
            }
            Launch();
        }
        catch (Exception error)
        {
            CrashReporter.Report(error, "Starting up", fatal: true);
            Exit();
        }
    }

    /// <summary>The name every copy registers under; the first one owns it.</summary>
    private const string InstanceKey = "Marquee.Main";

    /// <summary>
    /// One Marquee at a time. Two copies each held their own settings file in
    /// memory and wrote it back whole, undoing each other's changes, and each
    /// kept its own notification stream, so every notification showed twice.
    /// A second launch (the Start menu while it's already open) hands its
    /// activation to the running copy, which comes to the front, and quits.
    /// </summary>
    private static async Task<bool> HandedToRunningCopyAsync()
    {
        var main = AppInstance.FindOrRegisterForKey(InstanceKey);
        if (main.IsCurrent)
        {
            main.Activated += OnActivatedByAnotherCopy;
            return false;
        }
        var activation = AppInstance.GetCurrent().GetActivatedEventArgs();
        // Off the UI thread, as the Windows App SDK asks: the redirect
        // blocks on COM, which can deadlock the STA thread.
        var redirect = Task.Run(async () => await main.RedirectActivationToAsync(activation));
        await Task.WhenAny(redirect, Task.Delay(TimeSpan.FromSeconds(5)));
        return true;
    }

    /// <summary>
    /// Another launch handed over: bring the window forward, and open the
    /// <c>marquee://</c> link it was started with, if any. Raised on a
    /// background thread.
    /// </summary>
    private static void OnActivatedByAnotherCopy(object? sender, AppActivationArguments e)
    {
        if (AppServices.TryGetModel() is { } model)
        {
            var link = LinkIn(e);
            model.Dispatcher.TryEnqueue(() => model.OpenLink(link));
        }
    }

    /// <summary>
    /// The <c>marquee://</c> link an activation carries: a protocol
    /// activation's URI, or (the installer registers the link with the
    /// executable, <c>"%1"</c>) a launch's argument. Null for a plain launch.
    /// </summary>
    private static DeepLink? LinkIn(AppActivationArguments activation)
    {
        try
        {
            return activation.Kind switch
            {
                ExtendedActivationKind.Protocol when activation.Data is global::Windows.ApplicationModel.Activation.IProtocolActivatedEventArgs protocol =>
                    DeepLink.Parse(protocol.Uri?.AbsoluteUri),
                ExtendedActivationKind.Launch when activation.Data is global::Windows.ApplicationModel.Activation.ILaunchActivatedEventArgs launch =>
                    DeepLink.FromCommandLine(launch.Arguments),
                _ => null,
            };
        }
        catch (Exception error) when (error is InvalidCastException or System.Runtime.InteropServices.COMException)
        {
            return null;
        }
    }

    private void Launch()
    {
        var session = new ServerSession(
            settings,
            new PasswordVaultTokenStore(),
            ApiClient.DefaultHandler,
            DeviceName());
        var dispatcher = DispatcherQueue.GetForCurrentThread();
        var model = new AppModel(session, dispatcher, settings);
        var updater = new Updater(dispatcher);
        AppServices.Initialize(model, updater);

        window = new MainWindow();
        AppServices.WindowHandle = WinRT.Interop.WindowNative.GetWindowHandle(window);

        // Before the window shows: when a click on a Windows notification
        // launched the app, that click is delivered through this registration.
        model.Notifications.Register();
        window.Activate();

        // Started by a marquee:// link: it opens once signed in (an unpackaged
        // app's own command line carries it too, in case the activation doesn't).
        var link = LinkIn(AppInstance.GetCurrent().GetActivatedEventArgs())
            ?? DeepLink.FromCommandLine(string.Join(' ', Environment.GetCommandLineArgs().Skip(1)));
        if (link != null)
        {
            model.OpenLink(link);
        }

        // Restores the saved session after the window is up, so the spinner
        // has somewhere to show.
        _ = model.BootstrapAsync();

        // Signed in or not: GitHub is asked, never the Marquee server.
        updater.Start();
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
