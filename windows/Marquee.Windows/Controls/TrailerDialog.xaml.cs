using System.Text;
using Marquee.Core.Models;
using Marquee.Windows.Services;
using Microsoft.UI.Xaml.Controls;
using Microsoft.Web.WebView2.Core;

namespace Marquee.Windows.Controls;

/// <summary>
/// The trailer player. The page is served from <see cref="PageUri"/> (an
/// https address that only exists inside this player) rather than loaded
/// as a string, because YouTube's embed refuses to play without a real
/// origin and referrer; the Mac loads it with the same base address. Only a
/// key that passes <see cref="YouTubeTrailer.IsValidKey"/> ever reaches it.
/// The player stays on its page: links YouTube opens go to the browser.
/// </summary>
public sealed partial class TrailerDialog : ContentDialog
{
    private const string Host = "marquee.local";
    private static readonly Uri PageUri = new($"https://{Host}/trailer");

    private readonly string key;
    private readonly Uri watchUrl;

    /// <param name="key">A YouTube key that passed <see cref="YouTubeTrailer.IsValidKey"/>.</param>
    public TrailerDialog(string key, string title)
    {
        this.key = key;
        watchUrl = YouTubeTrailer.WatchUrl(key) ?? throw new ArgumentException("Not a YouTube key", nameof(key));
        InitializeComponent();
        Title = title;
    }

    private async void OnOpened(ContentDialog sender, ContentDialogOpenedEventArgs args)
    {
        // Done has the focus, so Escape and Enter close the player straight away.
        Focus(Microsoft.UI.Xaml.FocusState.Programmatic);
        try
        {
            await Player.EnsureCoreWebView2Async();
        }
        catch (Exception error) when (error is System.Runtime.InteropServices.COMException or InvalidOperationException or FileNotFoundException)
        {
            // No WebView2 runtime on this PC: the browser plays it instead.
            Hide();
            await ExternalLinks.OpenAsync(watchUrl);
            return;
        }
        var core = Player.CoreWebView2;
        core.Settings.AreDevToolsEnabled = false;
        core.Settings.AreDefaultContextMenusEnabled = false;
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.AreHostObjectsAllowed = false;
        core.AddWebResourceRequestedFilter($"https://{Host}/*", CoreWebView2WebResourceContext.All);
        core.WebResourceRequested += OnWebResourceRequested;
        core.NavigationStarting += OnNavigationStarting;
        core.NewWindowRequested += OnNewWindowRequested;
        core.WebMessageReceived += OnWebMessageReceived;
        Player.Source = PageUri;
    }

    /// <summary>The player's page, for its own address only.</summary>
    private void OnWebResourceRequested(CoreWebView2 sender, CoreWebView2WebResourceRequestedEventArgs args)
    {
        var bytes = Encoding.UTF8.GetBytes(PageHtml());
        args.Response = sender.Environment.CreateWebResourceResponse(
            new MemoryStream(bytes).AsRandomAccessStream(), 200, "OK", "Content-Type: text/html; charset=utf-8");
    }

    /// <summary>The page itself stays put; anything YouTube links to opens in the browser.</summary>
    private async void OnNavigationStarting(CoreWebView2 sender, CoreWebView2NavigationStartingEventArgs args)
    {
        if (Uri.TryCreate(args.Uri, UriKind.Absolute, out var target) && target == PageUri)
        {
            return;
        }
        args.Cancel = true;
        await ExternalLinks.OpenAsync(target);
    }

    private async void OnNewWindowRequested(CoreWebView2 sender, CoreWebView2NewWindowRequestedEventArgs args)
    {
        args.Handled = true;
        await ExternalLinks.OpenAsync(Uri.TryCreate(args.Uri, UriKind.Absolute, out var target) ? target : null);
    }

    /// <summary>Escape pressed while the page (not Done) has the keyboard.</summary>
    private void OnWebMessageReceived(CoreWebView2 sender, CoreWebView2WebMessageReceivedEventArgs args)
    {
        if (args.TryGetWebMessageAsString() == "close")
        {
            Hide();
        }
    }

    private async void OnOpenOnYouTubeClick(ContentDialog sender, ContentDialogButtonClickEventArgs args) =>
        await ExternalLinks.OpenAsync(watchUrl);

    /// <summary>Stops the video with the dialog: the page is unloaded.</summary>
    private void OnClosed(ContentDialog sender, ContentDialogClosedEventArgs args)
    {
        if (Player.CoreWebView2 is { } core)
        {
            core.WebResourceRequested -= OnWebResourceRequested;
            core.NavigationStarting -= OnNavigationStarting;
            core.NewWindowRequested -= OnNewWindowRequested;
            core.WebMessageReceived -= OnWebMessageReceived;
        }
        Player.Close();
    }

    /// <summary>The embed, built from the checked key (<see cref="YouTubeTrailer.EmbedUrl"/>).</summary>
    private string PageHtml()
    {
        var embed = YouTubeTrailer.EmbedUrl(key)?.AbsoluteUri ?? "about:blank";
        return $$"""
            <!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="strict-origin-when-cross-origin">
            <style>html,body{margin:0;height:100%;background:#000;overflow:hidden}iframe{border:0;width:100%;height:100%}</style></head>
            <body><iframe src="{{embed}}" title="YouTube"
            referrerpolicy="strict-origin-when-cross-origin"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
            <script>document.addEventListener("keydown",function(e){if(e.key==="Escape"){window.chrome.webview.postMessage("close");}});</script>
            </body></html>
            """;
    }
}
