namespace Marquee.Core.Models;

/// <summary>
/// A YouTube trailer key (<c>links.trailerYoutubeKey</c>), checked before
/// it's put into a URL or the player's page: YouTube's ids are letters,
/// digits, <c>-</c> and <c>_</c>. Anything else is refused, not escaped.
/// The same rule as the Mac's <c>YouTubeTrailer</c>.
/// </summary>
public static class YouTubeTrailer
{
    public static bool IsValidKey(string? key) =>
        key is { Length: >= 6 and <= 20 } && key.All(character => char.IsAsciiLetterOrDigit(character) || character is '-' or '_');

    /// <summary><c>https://www.youtube.com/watch?v={key}</c>, or null for a key that isn't one.</summary>
    public static Uri? WatchUrl(string? key) =>
        IsValidKey(key) ? new UriBuilder(Uri.UriSchemeHttps, "www.youtube.com") { Path = "/watch", Query = "v=" + key }.Uri : null;

    /// <summary>The privacy-enhanced embed player, playing straight away; null for a key that isn't one.</summary>
    public static Uri? EmbedUrl(string? key) =>
        IsValidKey(key)
            ? new UriBuilder(Uri.UriSchemeHttps, "www.youtube-nocookie.com") { Path = "/embed/" + key, Query = "autoplay=1&playsinline=1" }.Uri
            : null;
}
