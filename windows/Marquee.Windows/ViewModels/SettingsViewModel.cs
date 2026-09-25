using System.ComponentModel;
using System.Globalization;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Windows.Services;

namespace Marquee.Windows.ViewModels;

/// <summary>
/// app/settings/page.tsx's Account tab, for this PC: your account (name,
/// username, role) with the edit form (<c>PATCH /users/{id}</c>), the server
/// this PC talks to, Sign out, and About (<c>GET /settings/about</c> plus
/// this app's own version). Household member management stays on the website
/// for now.
/// </summary>
public sealed partial class SettingsViewModel : ObservableObject
{
    public const string PasswordsDifferMessage = "The passwords don't match.";
    public const string CurrentPasswordMissingMessage = "Enter your current password to set a new one.";
    public const string SavedNotice = "Saved.";
    public const string PasswordChangedNotice = "Your password was changed, which signed out every device. Sign in again with the new one.";
    public const string PasswordWarning = "Setting a new password signs you out of every device, including this PC.";

    /// <summary>Everything read straight from the model, re-announced whenever it moves.</summary>
    private static readonly string[] DerivedProperties =
    [
        nameof(Username),
        nameof(RoleLabel),
        nameof(ServerLabel),
        nameof(ServerVersionLabel),
    ];

    private readonly AppModel model;
    private CancellationTokenSource? aboutCancellation;
    private bool active;

    // MARK: The edit form

    [ObservableProperty]
    private string displayName = "";

    [ObservableProperty]
    private string newPassword = "";

    [ObservableProperty]
    private string confirmPassword = "";

    [ObservableProperty]
    private string currentPassword = "";

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(SaveLabel))]
    private bool isSaving;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasSaveError))]
    private string? saveError;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasSaveNotice))]
    private string? saveNotice;

    // MARK: About

    [ObservableProperty]
    private IReadOnlyList<FactRow> aboutRows = [];

    [ObservableProperty]
    private IReadOnlyList<LinkItem> aboutLinks = [];

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasAboutError))]
    private string? aboutError;

    [ObservableProperty]
    private bool isAboutLoading;

    public SettingsViewModel(AppModel model)
    {
        this.model = model;
        DisplayName = model.Viewer?.DisplayName ?? "";
    }

    public string Username => model.Viewer?.Username ?? "";
    public string RoleLabel => model.Viewer?.Role.Label ?? "";

    /// <summary>"192.168.1.20:3000", or the full URL for HTTPS.</summary>
    public string ServerLabel => model.Session.Server?.DisplayName ?? "";

    /// <summary>"Marquee 0.28.0", from the last server-info answer.</summary>
    public string ServerVersionLabel => model.Session.ServerInfo is { } info ? $"Marquee {info.Version}" : "";

    /// <summary>"Marquee for Windows 0.1.0".</summary>
    public string AppVersionLabel => $"Marquee for Windows {AppInfo.Version}";

    public string SaveLabel => IsSaving ? "Saving…" : "Save changes";
    public bool HasSaveError => SaveError != null;
    public bool HasSaveNotice => SaveNotice != null;
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
        aboutCancellation?.Cancel();
    }

    // MARK: Account

    /// <summary>
    /// <c>PATCH /users/{id}</c> on your own account, sent the way the
    /// website's form sends it: the username is required and unchanged, an
    /// empty name or password leaves that field alone. A new password
    /// revokes every token, this PC's included (deviation 5), so the app
    /// signs out and says why.
    /// </summary>
    [RelayCommand]
    private async Task SaveAsync()
    {
        if (IsSaving || model.Viewer is not { } viewer)
        {
            return;
        }
        SaveError = null;
        SaveNotice = null;
        if (NewPassword.Length > 0 && NewPassword != ConfirmPassword)
        {
            SaveError = PasswordsDifferMessage;
            return;
        }
        // The server checks it too; asking here saves a round trip.
        if (NewPassword.Length > 0 && CurrentPassword.Length == 0)
        {
            SaveError = CurrentPasswordMissingMessage;
            return;
        }
        var request = new UpdateUserRequest(
            viewer.Username,
            DisplayName.Trim().NonBlank(),
            NewPassword.NonBlank(),
            CurrentPassword: CurrentPassword.NonBlank());

        IsSaving = true;
        try
        {
            var result = await model.Api.Users.UpdateAsync(viewer.Id, request);
            NewPassword = "";
            ConfirmPassword = "";
            CurrentPassword = "";
            if (result.TokensRevoked)
            {
                await model.SignOutAsync();
                model.AuthNotice = PasswordChangedNotice;
                return;
            }
            SaveNotice = SavedNotice;
            await model.RefreshViewerAsync();
        }
        catch (ApiException error)
        {
            SaveError = error.Message;
        }
        finally
        {
            IsSaving = false;
        }
    }

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
            AboutRows =
            [
                new FactRow("Version", about.VersionLabel),
                new FactRow("Movies", about.MovieCount.ToString("N0", CultureInfo.CurrentCulture)),
                new FactRow("TV Shows", about.TvCount.ToString("N0", CultureInfo.CurrentCulture)),
                new FactRow("Tracked (not yet owned)", about.TrackedCount.ToString("N0", CultureInfo.CurrentCulture)),
                new FactRow("Total Requests", about.TotalRequests.ToString("N0", CultureInfo.CurrentCulture)),
                new FactRow("Time Zone", about.TimeZone),
            ];
            AboutLinks = new[]
            {
                LinkItem.Https("GitHub", about.RepoUri),
                LinkItem.Https("Report an issue", about.IssuesUri),
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
        if (e.PropertyName == nameof(AppModel.Viewer))
        {
            NotifyDerived();
        }
        else if (e.PropertyName == nameof(AppModel.ReloadToken))
        {
            _ = LoadAboutAsync();
        }
    }

    private void OnSessionChanged(object? sender, EventArgs e) => NotifyDerived();

    private void NotifyDerived()
    {
        foreach (var name in DerivedProperties)
        {
            OnPropertyChanged(name);
        }
    }
}
