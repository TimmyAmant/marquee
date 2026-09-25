using System.Diagnostics;
using System.Runtime.InteropServices;
using Marquee.Core.Api;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;

namespace Marquee.Windows.Services;

/// <summary>
/// Profile photos, fetched with the bearer token from the <c>avatarUrl</c>
/// the server hands out and kept in memory by that URL. The URL changes
/// whenever the photo does (<c>?v=</c>), so an entry never goes stale; a
/// new photo simply arrives under a new key.
///
/// UI thread only: a BitmapImage belongs to the thread that made it, and the
/// cache is a plain dictionary.
/// </summary>
public static class AvatarImages
{
    private static readonly Dictionary<string, Task<ImageSource?>> Cache = new(StringComparer.Ordinal);

    /// <summary>The photo if it has already arrived, so a control can show it without flashing the initials first.</summary>
    public static bool TryGetLoaded(string url, out ImageSource? image)
    {
        if (Cache.TryGetValue(url, out var task) && task.IsCompletedSuccessfully)
        {
            image = task.Result;
            return true;
        }
        image = null;
        return false;
    }

    /// <summary>
    /// The photo under <paramref name="url"/>; null when there is none, it
    /// isn't this account's to see, or it couldn't be read. Never throws.
    /// One request per URL, however many avatars ask at once.
    /// </summary>
    public static Task<ImageSource?> LoadAsync(string url)
    {
        if (Cache.TryGetValue(url, out var pending))
        {
            return pending;
        }
        var task = FetchAsync(url);
        if (!task.IsCompleted)
        {
            Cache[url] = task;
        }
        return task;
    }

    /// <summary>Signing out or changing servers leaves no one's photo behind in memory.</summary>
    public static void Clear() => Cache.Clear();

    private static async Task<ImageSource?> FetchAsync(string url)
    {
        if (AppServices.Model.Session.Client is not { } client)
        {
            return null;
        }
        byte[] bytes;
        try
        {
            bytes = await client.GetBytesAsync(url);
        }
        catch (ApiException error)
        {
            // No photo, or not ours to see, stays that way under this URL;
            // anything else (offline, a timeout) is tried again next time.
            if (error.Kind is not (ApiErrorKind.NotFound or ApiErrorKind.Forbidden or ApiErrorKind.Invalid))
            {
                Cache.Remove(url);
            }
            return null;
        }

        try
        {
            var image = new BitmapImage();
            using var stream = new MemoryStream(bytes);
            await image.SetSourceAsync(stream.AsRandomAccessStream());
            return image;
        }
        catch (Exception error) when (error is COMException or ArgumentException or IOException)
        {
            Debug.WriteLine($"Couldn't decode the photo at {url}: {error.Message}");
            return null;
        }
    }
}
