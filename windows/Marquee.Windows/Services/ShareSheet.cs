using global::Windows.ApplicationModel.DataTransfer;

namespace Marquee.Windows.Services;

/// <summary>
/// Windows' own Share panel (Mail, Teams, Nearby sharing, Phone Link…), the
/// desktop's version of the website's "Share…" (Web Share). An unpackaged
/// WinUI 3 window has no <c>DataTransferManager.GetForCurrentView</c>, so the
/// manager comes from the main window's handle through the interop helper.
/// </summary>
public static class ShareSheet
{
    /// <summary>
    /// The request being offered, read when Windows asks for it. One per
    /// window: the manager is the same object every time, so its handler is
    /// added once and reads whatever was offered last.
    /// </summary>
    private static (string Title, string Text, Uri Url)? pending;

    private static DataTransferManager? manager;

    /// <summary>Whether this PC has the Share panel (Windows 10 1809 and later do).</summary>
    public static bool IsSupported
    {
        get
        {
            try
            {
                return DataTransferManager.IsSupported();
            }
            catch (Exception error) when (error is System.Runtime.InteropServices.COMException or TypeLoadException)
            {
                return false;
            }
        }
    }

    /// <summary>
    /// Opens the Share panel over the main window with <paramref name="url"/>
    /// as a link, <paramref name="text"/> beside it. False when it couldn't
    /// open (no window yet, or Windows refused).
    /// </summary>
    public static bool Show(string title, string text, Uri url)
    {
        var window = AppServices.WindowHandle;
        if (window == IntPtr.Zero || !IsSupported)
        {
            return false;
        }
        try
        {
            if (manager == null)
            {
                manager = DataTransferManagerInterop.GetForWindow(window);
                manager.DataRequested += OnDataRequested;
            }
            pending = (title, text, url);
            DataTransferManagerInterop.ShowShareUIForWindow(window);
            return true;
        }
        catch (System.Runtime.InteropServices.COMException)
        {
            pending = null;
            return false;
        }
    }

    private static void OnDataRequested(DataTransferManager sender, DataRequestedEventArgs args)
    {
        if (pending is not { } offer)
        {
            args.Request.FailWithDisplayText("There's nothing to share.");
            return;
        }
        var data = args.Request.Data;
        data.Properties.Title = offer.Title;
        data.Properties.Description = offer.Url.AbsoluteUri;
        data.SetWebLink(offer.Url);
        // Apps that take text only (a chat box) still get the link.
        data.SetText($"{offer.Text} {offer.Url.AbsoluteUri}");
    }
}
