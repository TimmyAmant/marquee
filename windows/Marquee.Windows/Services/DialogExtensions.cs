using System.Runtime.InteropServices;
using Microsoft.UI.Xaml.Controls;

namespace Marquee.Windows.Services;

public static class DialogExtensions
{
    /// <summary>
    /// <c>ShowAsync</c>, or <see cref="ContentDialogResult.None"/> (as if
    /// cancelled) when another ContentDialog is already open: WinUI shows one
    /// at a time and throws for a second, which from an async click handler
    /// would take the whole app down.
    /// </summary>
    public static async Task<ContentDialogResult> TryShowAsync(this ContentDialog dialog)
    {
        try
        {
            return await dialog.ShowAsync();
        }
        catch (COMException)
        {
            return ContentDialogResult.None;
        }
    }
}
