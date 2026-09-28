using System.ComponentModel;
using System.Globalization;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core;
using Marquee.Core.Api;
using Marquee.Core.Localization;
using Marquee.Core.Models;
using Marquee.Core.Updates;
using Marquee.Windows.Services;

namespace Marquee.Windows.ViewModels;

/// <summary>
/// Settings › About (app/settings/about/page.tsx, the Mac's
/// AboutSettingsView), for this PC: the server this PC talks to with Sign out
/// and Change server, this app's version and updates, whether the server is
/// up to date, and <c>GET /settings/about</c>'s facts and links.
/// </summary>
public sealed partial class AboutSettingsViewModel : ObservableObject
{
    private readonly AppModel model;
    private CancellationTokenSource? aboutCancellation;
    private bool active;

    [ObservableProperty]
    private IReadOnlyList<FactRow> aboutRows = [];

    [ObservableProperty]
    private IReadOnlyList<LinkItem> aboutLinks = [];

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasAboutError))]
    private string? aboutError;

    [ObservableProperty]
    private bool isAboutLoading;

    /// <summary>The server's version from the last About answer.</summary>
    private string? aboutServerVersion;

    public AboutSettingsViewModel(AppModel model)
    {
        this.model = model;
    }

    /// <summary>"192.168.1.20:3000", or the full URL for HTTPS.</summary>
    public string ServerLabel => model.Session.Server?.DisplayName ?? "";

    /// <summary>"Marquee 0.28.0", from the last server-info answer.</summary>
    public string ServerVersionLabel => model.Session.ServerInfo is { } info ? $"Marquee {info.Version}" : "";

    /// <summary>
    /// The line about the server: whether it runs the newest release, and if
    /// not, how to get it (the server updates by pulling its Docker image,
    /// which this app can't do). Empty until both versions are known.
    /// </summary>
    public string ServerUpdateText
    {
        get
        {
            // About's own GET /settings/about first: a restored sign-in
            // doesn't re-read server-info.
            if (AppVersion.Parse(aboutServerVersion ?? model.Session.ServerInfo?.Version) is not { } server
                || AppServices.Updater.LatestRelease is not { } latest)
            {
                return "";
            }
            return server >= latest
                ? Loc.Format("About_ServerUpToDate", server)
                : Loc.Format("About_ServerOutdated", server, latest);
        }
    }

    public bool HasServerUpdateText => ServerUpdateText.Length > 0;

    /// <summary>"Marquee for Windows 0.30.0".</summary>
    public string AppVersionLabel => Loc.Format("About_AppVersion", AppInfo.Version);

    public bool HasAboutError => AboutError != null;

    // MARK: Lifecycle

    public void Activate()
    {
        if (active)
        {
            return;
        }
        active = true;
        model.PropertyChanged += OnModelPropertyChanged;
        model.SessionChanged += OnSessionChanged;
        AppServices.Updater.PropertyChanged += OnUpdaterPropertyChanged;
        NotifyServer();
        _ = LoadAboutAsync();
    }

    public void Deactivate()
    {
        if (!active)
        {
            return;
        }
        active = false;
        model.PropertyChanged -= OnModelPropertyChanged;
        model.SessionChanged -= OnSessionChanged;
        AppServices.Updater.PropertyChanged -= OnUpdaterPropertyChanged;
        aboutCancellation?.Cancel();
    }

    // MARK: Server

    /// <summary>Revokes this PC's token and returns to the sign-in card for the same server.</summary>
    [RelayCommand]
    private Task SignOutAsync() => model.SignOutAsync();

    /// <summary>"Change server": signs out, forgets the server, and starts over at the connect screen.</summary>
    [RelayCommand]
    private void ChangeServer() => model.ChangeServer();

    // MARK: About

    [RelayCommand]
    private async Task LoadAboutAsync()
    {
        aboutCancellation?.Cancel();
        var cancellation = new CancellationTokenSource();
        aboutCancellation = cancellation;
        var token = cancellation.Token;

        IsAboutLoading = AboutRows.Count == 0;
        AboutError = null;
        try
        {
            var about = await model.Api.About.InfoAsync(token);
            if (token.IsCancellationRequested)
            {
                return;
            }
            aboutServerVersion = about.Version;
            OnPropertyChanged(nameof(ServerUpdateText));
            OnPropertyChanged(nameof(HasServerUpdateText));
            AboutRows =
            [
                new FactRow(Loc.Get("About_FactVersion"), about.VersionLabel),
                new FactRow(Loc.Get("About_FactMovies"), about.MovieCount.ToString("N0", CultureInfo.CurrentCulture)),
                new FactRow(Loc.Get("About_FactTvShows"), about.TvCount.ToString("N0", CultureInfo.CurrentCulture)),
                new FactRow(Loc.Get("About_FactTracked"), about.TrackedCount.ToString("N0", CultureInfo.CurrentCulture)),
                new FactRow(Loc.Get("About_FactTotalRequests"), about.TotalRequests.ToString("N0", CultureInfo.CurrentCulture)),
                new FactRow(Loc.Get("About_FactTimeZone"), about.TimeZone),
            ];
            AboutLinks = new[]
            {
                LinkItem.Https(Loc.Get("About_AllFeatures"), about.FeaturesUri),
                LinkItem.Https("GitHub", about.RepoUri),
                LinkItem.Https(Loc.Get("About_ReportIssue"), about.IssuesUri),
            }.OfType<LinkItem>().ToList();
        }
        catch (ApiException error)
        {
            if (error.IsCancellation || token.IsCancellationRequested)
            {
                return;
            }
            AboutError = error.Message;
        }
        finally
        {
            if (!token.IsCancellationRequested)
            {
                IsAboutLoading = false;
            }
        }
    }

    // MARK: Following the model

    private void OnModelPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(AppModel.ReloadToken))
        {
            _ = LoadAboutAsync();
        }
    }

    private void OnSessionChanged(object? sender, EventArgs e) => NotifyServer();

    /// <summary>A check answered with the newest release: the server line follows.</summary>
    private void OnUpdaterPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(Updater.LatestRelease))
        {
            OnPropertyChanged(nameof(ServerUpdateText));
            OnPropertyChanged(nameof(HasServerUpdateText));
        }
    }

    private void NotifyServer()
    {
        OnPropertyChanged(nameof(ServerLabel));
        OnPropertyChanged(nameof(ServerVersionLabel));
        OnPropertyChanged(nameof(ServerUpdateText));
        OnPropertyChanged(nameof(HasServerUpdateText));
    }
}
