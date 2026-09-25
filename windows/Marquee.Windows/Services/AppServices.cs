namespace Marquee.Windows.Services;

/// <summary>
/// The one place pages and view models find the app's shared state. A
/// static locator rather than constructor injection because WinUI creates
/// pages itself (<c>Frame.Navigate(typeof(Page))</c>) and gives them no way
/// to receive arguments; <see cref="App"/> fills it in before the first
/// window exists.
/// </summary>
public static class AppServices
{
    private static AppModel? model;

    /// <summary>The session, API and navigation state shared by every page.</summary>
    public static AppModel Model =>
        model ?? throw new InvalidOperationException("AppServices.Initialize has not run; App.OnLaunched builds the model before any page.");

    /// <summary>
    /// The main window's HWND, which a file picker needs in an unpackaged
    /// app (<c>InitializeWithWindow.Initialize</c>). Zero until the window exists.
    /// </summary>
    public static IntPtr WindowHandle { get; set; }

    private static Updater? updater;

    /// <summary>Checks for, downloads and installs newer releases of the app itself.</summary>
    public static Updater Updater =>
        updater ?? throw new InvalidOperationException("AppServices.Initialize has not run; App.OnLaunched builds the updater before any page.");

    public static void Initialize(AppModel value, Updater updates)
    {
        model = value;
        updater = updates;
    }
}
