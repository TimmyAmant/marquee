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

    public static void Initialize(AppModel value) => model = value;
}
