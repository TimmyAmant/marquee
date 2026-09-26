namespace Marquee.Windows.Services;

/// <summary>Puts text on the Windows clipboard (Settings' webhook URLs' Copy).</summary>
public static class ClipboardText
{
    /// <summary>False when another app is holding the clipboard and nothing was copied.</summary>
    public static bool Copy(string text)
    {
        var package = new global::Windows.ApplicationModel.DataTransfer.DataPackage();
        package.SetText(text);
        try
        {
            global::Windows.ApplicationModel.DataTransfer.Clipboard.SetContent(package);
            return true;
        }
        catch (System.Runtime.InteropServices.COMException)
        {
            // A clipboard manager or Remote Desktop has it open: nothing is
            // copied, rather than the app closing.
            return false;
        }
    }
}
