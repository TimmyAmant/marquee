using System.ComponentModel;
using System.Globalization;
using System.Windows.Input;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Windows.Services;

namespace Marquee.Windows.ViewModels;

/// <summary>
/// A row of "Household members" (household-members-list.tsx): the name,
/// the username under it when there is a name, the "Admin" and "You" tags,
/// and the Edit and Remove buttons each viewer is offered. Immutable; the
/// list is rebuilt from every <c>GET /users</c> answer.
/// </summary>
public sealed class HouseholdMemberRow
{
    public HouseholdMemberRow(HouseholdMember member, bool viewerIsAdmin, bool showsDivider, ICommand edit, ICommand remove)
    {
        Member = member;
        Label = member.Label;
        UsernameLine = member.DisplayName.NonBlank() != null ? member.Username : "";
        IsAdminRow = member.IsAdmin;
        IsCurrentUser = member.IsCurrentUser;
        CanEdit = viewerIsAdmin || member.IsCurrentUser;
        CanRemove = viewerIsAdmin && !member.IsAdmin && !member.IsCurrentUser;
        ShowsDivider = showsDivider;
        Edit = edit;
        Remove = remove;
    }

    // Internal, not public: a public Core record here would make the XAML
    // compiler generate an activator for it, and its required members
    // don't allow that (CS9035). Bindings use the flattened properties.
    internal HouseholdMember Member { get; }

    /// <summary>The display name, else the username.</summary>
    public string Label { get; }

    /// <summary>The username, under a display name; empty when <see cref="Label"/> already is the username.</summary>
    public string UsernameLine { get; }

    /// <summary>The "Admin" tag.</summary>
    public bool IsAdminRow { get; }

    /// <summary>The "You" tag.</summary>
    public bool IsCurrentUser { get; }

    public BadgeTone AdminTone { get; } = BadgeTone.Tracked;
    public BadgeTone YouTone { get; } = BadgeTone.Neutral;

    /// <summary>"Edit" on every row for the admin, on your own row for a member.</summary>
    public bool CanEdit { get; }

    /// <summary>"Remove" only for the admin, and never on the admin account.</summary>
    public bool CanRemove { get; }

    /// <summary>Every row but the first draws a divider above itself.</summary>
    public bool ShowsDivider { get; }

    /// <summary>Runs with this row as its parameter: the edit dialog.</summary>
    public ICommand Edit { get; }

    /// <summary>Runs with this row as its parameter: the remove confirmation.</summary>
    public ICommand Remove { get; }
}

/// <summary>
/// app/settings/page.tsx's Account tab, for this PC: your account (name,
/// username, role) with the edit form (<c>PATCH /users/{id}</c>), the
/// household members list (<c>GET /users</c>: every account for the admin,
/// only your own for a member) with Edit, the admin's Add member
/// (<c>POST /users</c>) and Remove (<c>DELETE /users/{id}</c>), the server
/// this PC talks to, Sign out, and About (<c>GET /settings/about</c> plus
/// this app's own version).
/// </summary>
public sealed partial class SettingsViewModel : ObservableObject
{
    public const string PasswordsDifferMessage = "The passwords don't match.";
    public const string CurrentPasswordMissingMessage = "Enter your current password to set a new one.";
    public const string SavedNotice = "Saved.";
    public const string PasswordChangedNotice = "Your password was changed, which signed out every device. Sign in again with the new one.";
    public const string PasswordWarning = "Setting a new password signs you out of every device, including this PC.";
    public const string RemoveMemberConsequence = "Their favorites, requests and notifications are removed with the account.";

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
    private CancellationTokenSource? membersCancellation;
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

    // MARK: Household members

    /// <summary>Add member, Remove and the list's caption; follows the viewer's role.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(MembersCaption))]
    private bool isAdmin;

    /// <summary>Null until <c>GET /users</c> first answers.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsMembersError))]
    private IReadOnlyList<HouseholdMemberRow>? members;

    [ObservableProperty]
    private bool isMembersLoading;

    /// <summary>The list couldn't load; shown only while there is no older list to keep showing.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsMembersError))]
    private string? membersError;

    /// <summary>Remove failed (Add and Edit show theirs inside their dialogs).</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasMembersActionError))]
    private string? membersActionError;

    /// <summary>"Account created…", or the admin's reset of someone's password.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasMembersNotice))]
    private string? membersNotice;

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
        IsAdmin = model.Viewer?.IsAdmin == true;
    }

    /// <summary>
    /// Set by the page: "Add a household member", answering the new account
    /// or null when the admin cancelled. The dialogs need the page's
    /// XamlRoot, which is why they aren't here.
    /// </summary>
    internal Func<Task<HouseholdMember?>>? AddMemberPrompt { get; set; }

    /// <summary>Set by the page: the edit dialog for a row, answering the saved result or null when cancelled.</summary>
    internal Func<HouseholdMember, Task<UpdateUserResult?>>? EditMemberPrompt { get; set; }

    /// <summary>Set by the page: "Remove {username}?", true only when confirmed.</summary>
    internal Func<HouseholdMember, Task<bool>>? RemoveMemberPrompt { get; set; }

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

    public string MembersCaption => IsAdmin
        ? "Everyone with an account on this Marquee server. There's no public signup: add accounts for the rest of your household here."
        : "Only the admin sees and manages every account. Yours is below.";

    public bool ShowsMembersError => MembersError != null && Members == null;
    public bool HasMembersActionError => MembersActionError != null;
    public bool HasMembersNotice => MembersNotice != null;

    // MARK: Lifecycle

    public void Activate()
    {
        if (active)
        {
            return;
        }
        active = true;
        IsAdmin = model.Viewer?.IsAdmin == true;
        model.PropertyChanged += OnModelPropertyChanged;
        model.SessionChanged += OnSessionChanged;
        model.Events.Changed += OnServerChanged;
        _ = LoadMembersAsync();
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
        model.Events.Changed -= OnServerChanged;
        aboutCancellation?.Cancel();
        membersCancellation?.Cancel();
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
                await SignOutAfterPasswordChangeAsync();
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

    /// <summary>Your own new password revoked every token, this PC's included: back to sign-in, saying why.</summary>
    private async Task SignOutAfterPasswordChangeAsync()
    {
        await model.SignOutAsync();
        model.AuthNotice = PasswordChangedNotice;
    }

    // MARK: Household members

    /// <summary>
    /// <c>GET /users</c>. A failure keeps the list already shown, like the
    /// Mac, and says so only when there is nothing to show.
    /// </summary>
    [RelayCommand]
    private async Task LoadMembersAsync()
    {
        membersCancellation?.Cancel();
        var cancellation = new CancellationTokenSource();
        membersCancellation = cancellation;
        var token = cancellation.Token;

        IsMembersLoading = Members == null;
        MembersError = null;
        try
        {
            var fresh = await model.Api.Users.ListAsync(token);
            if (token.IsCancellationRequested)
            {
                return;
            }
            ShowMembers(fresh);
        }
        catch (ApiException error)
        {
            if (error.IsCancellation || token.IsCancellationRequested)
            {
                return;
            }
            if (Members == null)
            {
                MembersError = error.Message;
            }
        }
        finally
        {
            if (!token.IsCancellationRequested)
            {
                IsMembersLoading = false;
            }
        }
    }

    /// <summary>
    /// The admin's "Add a household member". The dialog sends
    /// <c>POST /users</c> itself and shows the server's refusal in place; the
    /// list reloads through <see cref="ServerChange.Users"/>.
    /// </summary>
    [RelayCommand]
    private async Task AddMemberAsync()
    {
        if (!IsAdmin || AddMemberPrompt is not { } prompt)
        {
            return;
        }
        ClearMembersMessages();
        if (await prompt() is { } created)
        {
            MembersNotice = $"Account created. {created.Label} can now sign in.";
        }
    }

    /// <summary>
    /// A row's Edit. The dialog sends <c>PATCH /users/{id}</c> itself; this
    /// follows up on what it saved. A new password on your own account
    /// revoked this PC's token, so the app signs out the same way the
    /// account form above does.
    /// </summary>
    [RelayCommand]
    private async Task EditMemberAsync(HouseholdMemberRow? row)
    {
        if (row == null || !row.CanEdit || EditMemberPrompt is not { } prompt)
        {
            return;
        }
        ClearMembersMessages();
        var member = row.Member;
        if (await prompt(member) is not { } result)
        {
            return;
        }
        if (member.IsCurrentUser)
        {
            if (result.TokensRevoked)
            {
                await SignOutAfterPasswordChangeAsync();
                return;
            }
            // The account form above shows the same name; keep it in step.
            DisplayName = result.User.DisplayName ?? "";
            await model.RefreshViewerAsync();
        }
        else if (result.TokensRevoked)
        {
            MembersNotice = $"{result.User.Label}'s password was changed, which signed them out of every device.";
        }
    }

    /// <summary>
    /// A row's Remove, behind a confirmation. The row goes straight away,
    /// like the web list, and comes back with the server's message if
    /// <c>DELETE /users/{id}</c> fails.
    /// </summary>
    [RelayCommand]
    private async Task RemoveMemberAsync(HouseholdMemberRow? row)
    {
        if (row == null || !row.CanRemove || RemoveMemberPrompt is not { } confirm)
        {
            return;
        }
        ClearMembersMessages();
        if (!await confirm(row.Member))
        {
            return;
        }
        var previous = Members;
        var removedId = row.Member.Id;
        if (previous != null)
        {
            ShowMembers(previous.Select(item => item.Member).Where(member => member.Id != removedId));
        }
        try
        {
            await model.Api.Users.RemoveAsync(removedId);
        }
        catch (ApiException error)
        {
            Members = previous;
            MembersActionError = error.Message;
        }
    }

    /// <summary><c>POST /users</c>, for the Add member dialog.</summary>
    internal Task<HouseholdMember> CreateMemberAsync(CreateUserRequest request) => model.Api.Users.CreateAsync(request);

    /// <summary><c>PATCH /users/{id}</c>, for the edit dialog.</summary>
    internal Task<UpdateUserResult> UpdateMemberAsync(Guid id, UpdateUserRequest request) => model.Api.Users.UpdateAsync(id, request);

    private void ShowMembers(IEnumerable<HouseholdMember> list)
    {
        var viewerIsAdmin = IsAdmin;
        Members = list
            .Select((member, index) => new HouseholdMemberRow(member, viewerIsAdmin, index > 0, EditMemberCommand, RemoveMemberCommand))
            .ToList();
    }

    private void ClearMembersMessages()
    {
        MembersActionError = null;
        MembersNotice = null;
    }

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
            // A promotion (or demotion) changes which accounts the list shows.
            if (model.Viewer is { } viewer && viewer.IsAdmin != IsAdmin)
            {
                IsAdmin = viewer.IsAdmin;
                _ = LoadMembersAsync();
            }
        }
        else if (e.PropertyName == nameof(AppModel.ReloadToken))
        {
            _ = LoadMembersAsync();
            _ = LoadAboutAsync();
        }
    }

    private void OnSessionChanged(object? sender, EventArgs e) => NotifyDerived();

    /// <summary>
    /// Any change to household accounts through this app (the dialogs, the
    /// account form, Remove) reloads the list. Raised on whatever thread
    /// finished the request.
    /// </summary>
    private void OnServerChanged(object? sender, ServerChangedEventArgs e)
    {
        if (!e.Change.HasFlag(ServerChange.Users))
        {
            return;
        }
        model.Dispatcher.TryEnqueue(() =>
        {
            if (active && model.IsSignedIn)
            {
                _ = LoadMembersAsync();
            }
        });
    }

    private void NotifyDerived()
    {
        foreach (var name in DerivedProperties)
        {
            OnPropertyChanged(name);
        }
    }
}
