using System.ComponentModel;
using System.Windows.Input;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core.Api;
using Marquee.Core.Connection;
using Marquee.Core.Models;
using Marquee.Windows.Services;

namespace Marquee.Windows.ViewModels;

/// <summary>
/// A row of "Household members" (household-members-list.tsx): the name,
/// the username under it when there is a name, the admin's "Active 3 hours
/// ago" line on other members' rows, the "Admin", "Trusted" and "You" tags,
/// and the Edit and Remove buttons each viewer is offered. Immutable; the
/// list is rebuilt from every <c>GET /users</c> answer.
/// </summary>
public sealed class HouseholdMemberRow
{
    public HouseholdMemberRow(HouseholdMember member, bool viewerIsAdmin, bool showsDivider, string jellyfinName, ICommand edit, ICommand remove)
    {
        Member = member;
        Label = member.Label;
        AvatarUrl = member.AvatarUrl ?? "";
        UsernameLine = member.DisplayName.NonBlank() != null ? member.Username : "";
        // Relative to this PC's clock when the list arrives; the list is
        // rebuilt from every GET /users answer.
        LastActiveLine = viewerIsAdmin && !member.IsCurrentUser
            ? member.LastActiveLine(DateTimeOffset.Now) ?? ""
            : "";
        IsAdminRow = member.IsAdmin;
        TrustedTag = member.IsTrusted ? "Trusted" : "";
        IsCurrentUser = member.IsCurrentUser;
        PlexTag = member.Linked?.Plex == true ? "Plex" : "";
        JellyfinTag = member.Linked?.Jellyfin == true ? jellyfinName : "";
        SsoTag = member.Linked?.Sso == true ? "SSO" : "";
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

    /// <summary>The photo's server path, empty for none (the avatar shows initials).</summary>
    public string AvatarUrl { get; }

    /// <summary>The username, under a display name; empty when <see cref="Label"/> already is the username.</summary>
    public string UsernameLine { get; }

    /// <summary>
    /// "Active 3 hours ago" / "Never signed in", for the admin on every row
    /// but their own; empty (collapsed) otherwise, and from an older server
    /// that doesn't report it.
    /// </summary>
    public string LastActiveLine { get; }

    /// <summary>The "Admin" tag.</summary>
    public bool IsAdminRow { get; }

    /// <summary>The "Trusted" tag (0.39+): can approve requests and handle problem reports. Empty collapses it.</summary>
    public string TrustedTag { get; }

    /// <summary>The "You" tag.</summary>
    public bool IsCurrentUser { get; }

    public BadgeTone AdminTone { get; } = BadgeTone.Tracked;
    public BadgeTone YouTone { get; } = BadgeTone.Neutral;

    /// <summary>"Plex" on an account linked to a Plex user; empty (the pill collapses) otherwise.</summary>
    public string PlexTag { get; }

    /// <summary>"Jellyfin" ("Emby" on an Emby server) on an account linked to a Jellyfin user; empty otherwise.</summary>
    public string JellyfinTag { get; }

    /// <summary>"SSO" on an account linked to the admin's single sign-on (0.44+); empty otherwise.</summary>
    public string SsoTag { get; }

    public BadgeTone LinkTone { get; } = BadgeTone.Owned;

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
/// Settings › Account (app/settings/page.tsx, the Mac's
/// AccountSettingsView), for this PC: your account (name, username, role)
/// with the edit form (<c>PATCH /users/{id}</c>), linked Plex/Jellyfin
/// accounts and the Plex Watchlist, this PC's notifications, the household
/// members list (<c>GET /users</c>: every account for the admin, only your
/// own for a member) with Edit, the admin's Add member (<c>POST /users</c>),
/// Remove (<c>DELETE /users/{id}</c>), Plex/Jellyfin import and sign-in
/// setting, and the request blocklist.
/// </summary>
public sealed partial class AccountSettingsViewModel : ObservableObject
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
        nameof(NeedsCurrentPassword),
        nameof(ShowsLinkedAccounts),
        nameof(HasNoPassword),
        nameof(PlexLinkStatus),
        nameof(JellyfinLinkStatus),
        nameof(CanLinkPlex),
        nameof(CanUnlinkPlex),
        nameof(CanLinkJellyfin),
        nameof(CanUnlinkJellyfin),
        nameof(ShowsSsoLink),
        nameof(SsoLinkName),
        nameof(SsoLinkStatus),
        nameof(LinkSsoLabel),
        nameof(SsoWaitingLine),
        nameof(CanLinkSso),
        nameof(CanUnlinkSso),
        nameof(ShowsMediaServerMembers),
        nameof(CanImportFromPlex),
        nameof(CanImportFromJellyfin),
        nameof(HasNoMediaServers),
        nameof(JellyfinName),
        nameof(LinkJellyfinLabel),
        nameof(ImportFromJellyfinLabel),
        nameof(MediaServerMembersTitle),
        nameof(MediaServerSignupHeader),
        nameof(MediaServerSignupExplanation),
        nameof(NoMediaServersExplanation),
    ];

    private readonly AppModel model;
    private CancellationTokenSource? membersCancellation;
    private CancellationTokenSource? plexLinkCancellation;
    private CancellationTokenSource? ssoLinkCancellation;
    private CancellationTokenSource? plexWatchlistCancellation;
    private CancellationTokenSource? plexWatchlistLoadCancellation;

    /// <summary>Whether Plex was linked when the watchlist state was last asked for; linking or unlinking asks again.</summary>
    private bool? plexLinkedForWatchlist;
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

    // MARK: Linked accounts and Plex/Jellyfin members

    /// <summary>Linking Plex: the browser is open at plex.tv and the poll is running.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CanLinkPlex))]
    [NotifyPropertyChangedFor(nameof(CanUnlinkPlex))]
    [NotifyPropertyChangedFor(nameof(CanLinkJellyfin))]
    [NotifyPropertyChangedFor(nameof(CanUnlinkJellyfin))]
    [NotifyPropertyChangedFor(nameof(CanLinkSso))]
    [NotifyPropertyChangedFor(nameof(CanUnlinkSso))]
    private bool isLinkingPlex;

    /// <summary>Linking single sign-on: the browser is open at the identity provider's page and the poll is running.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CanLinkPlex))]
    [NotifyPropertyChangedFor(nameof(CanUnlinkPlex))]
    [NotifyPropertyChangedFor(nameof(CanLinkJellyfin))]
    [NotifyPropertyChangedFor(nameof(CanUnlinkJellyfin))]
    [NotifyPropertyChangedFor(nameof(CanLinkSso))]
    [NotifyPropertyChangedFor(nameof(CanUnlinkSso))]
    private bool isLinkingSso;

    /// <summary>An unlink (or the Jellyfin link) is in flight.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CanLinkPlex))]
    [NotifyPropertyChangedFor(nameof(CanUnlinkPlex))]
    [NotifyPropertyChangedFor(nameof(CanLinkJellyfin))]
    [NotifyPropertyChangedFor(nameof(CanUnlinkJellyfin))]
    [NotifyPropertyChangedFor(nameof(CanLinkSso))]
    [NotifyPropertyChangedFor(nameof(CanUnlinkSso))]
    private bool isChangingLinks;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasLinksError))]
    private string? linksError;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasLinksNotice))]
    private string? linksNotice;

    /// <summary>"New accounts from Plex/Jellyfin sign-in" (admin); the switch shows once it's loaded.</summary>
    [ObservableProperty]
    private bool mediaServerSignup;

    /// <summary><c>GET /settings/sign-in</c> answered (an older server answers NotFound, and the switch stays hidden).</summary>
    [ObservableProperty]
    private bool hasSignInSettings;

    /// <summary>Set while the switch is moved to match the server, so that isn't taken for the admin flipping it.</summary>
    private bool syncingSignInSettings;

    // MARK: Request from my Plex Watchlist

    /// <summary>
    /// <c>GET /me/plex-watchlist</c>'s last answer; null until it answers.
    /// An older server's 404 is <see cref="PlexWatchlist.Unavailable"/>, so
    /// the card stays hidden.
    /// </summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsPlexWatchlist))]
    [NotifyPropertyChangedFor(nameof(IsPlexWatchlistOn))]
    [NotifyPropertyChangedFor(nameof(CanTurnOnPlexWatchlist))]
    [NotifyPropertyChangedFor(nameof(PlexWatchlistBadge))]
    [NotifyPropertyChangedFor(nameof(PlexWatchlistSummary))]
    [NotifyPropertyChangedFor(nameof(PlexWatchlistLastError))]
    [NotifyPropertyChangedFor(nameof(HasPlexWatchlistLastError))]
    private PlexWatchlist? plexWatchlistState;

    /// <summary>Turning it on: the browser is open at plex.tv and the poll is running.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CanTurnOnPlexWatchlist))]
    private bool isTurningOnPlexWatchlist;

    /// <summary>A switch, Check now or Turn off is in flight.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CanTurnOnPlexWatchlist))]
    [NotifyPropertyChangedFor(nameof(CanChangePlexWatchlist))]
    [NotifyPropertyChangedFor(nameof(CheckPlexWatchlistLabel))]
    private bool isChangingPlexWatchlist;

    /// <summary>The Movies switch; follows the server, and flipping it sends <c>PATCH /me/plex-watchlist</c>.</summary>
    [ObservableProperty]
    private bool plexWatchlistMovies;

    /// <summary>The TV shows switch.</summary>
    [ObservableProperty]
    private bool plexWatchlistTv;

    /// <summary>Turning on, a switch, Check now or Turn off failed (Check now's "Checked a moment ago…" too).</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasPlexWatchlistError))]
    private string? plexWatchlistError;

    /// <summary>Set while the switches are moved to match the server, so that isn't taken for the user flipping them.</summary>
    private bool syncingPlexWatchlist;

    // MARK: Notifications

    /// <summary>The switch: Windows notifications for this account on this PC.</summary>
    [ObservableProperty]
    private bool notificationsEnabled;

    /// <summary>False when Windows notifications can't work for this copy of the app; the switch is disabled.</summary>
    [ObservableProperty]
    private bool notificationsSupported;

    /// <summary>Why the switch may not do what it says (not available, or turned off in Windows); empty otherwise.</summary>
    [ObservableProperty]
    private string notificationsNote = "";

    /// <summary>Set while the switch is moved to match the model, so that isn't taken for the user flipping it.</summary>
    private bool syncingNotifications;

    // MARK: Menu position

    /// <summary>
    /// "Menu position" (This PC): the index of <see cref="MenuPositionSetting.All"/>
    /// the radio buttons show; picking one moves the bar at once.
    /// </summary>
    [ObservableProperty]
    private int menuPositionIndex;

    /// <summary>"Left", "Right", "Top", "Bottom", in <see cref="MenuPositionIndex"/>'s order.</summary>
    public IReadOnlyList<string> MenuPositionLabels { get; } = MenuPositionSetting.All.Select(position => position.Label()).ToList();

    partial void OnMenuPositionIndexChanged(int value)
    {
        if (value >= 0 && value < MenuPositionSetting.All.Count)
        {
            model.MenuPosition = MenuPositionSetting.All[value];
        }
    }

    private void SyncMenuPosition()
    {
        var index = MenuPositionSetting.All.ToList().IndexOf(model.MenuPosition);
        MenuPositionIndex = index >= 0 ? index : 0;
    }

    public AccountSettingsViewModel(AppModel model)
    {
        this.model = model;
        DisplayName = model.Viewer?.DisplayName ?? "";
        IsAdmin = model.Viewer?.IsAdmin == true;
        Blocklist = new BlocklistSettingsViewModel(model);
        Personal = new PersonalNotificationsViewModel(model);
        SyncMenuPosition();
    }

    /// <summary>Your own channels and "What you hear about" (0.45+ servers), under Notifications.</summary>
    public PersonalNotificationsViewModel Personal { get; }

    /// <summary>The admin's "Request blocklist" (0.41+ servers).</summary>
    public BlocklistSettingsViewModel Blocklist { get; }

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

    /// <summary>Set by the page: the "Link Jellyfin" dialog, true once it linked the account.</summary>
    internal Func<Task<bool>>? LinkJellyfinPrompt { get; set; }

    /// <summary>Set by the page: "Import from Plex/Jellyfin", answering what was imported or null when cancelled.</summary>
    internal Func<MediaServerKind, Task<ImportUsersResult?>>? ImportMembersPrompt { get; set; }

    public string Username => model.Viewer?.Username ?? "";
    public string RoleLabel => model.Viewer?.Role.Label ?? "";

    public string SaveLabel => IsSaving ? "Saving…" : "Save changes";
    public bool HasSaveError => SaveError != null;
    public bool HasSaveNotice => SaveNotice != null;

    public string MembersCaption => IsAdmin
        ? "Everyone with an account on this Marquee server. There's no public signup: add accounts for the rest of your household here."
        : "Only the admin sees and manages every account. Yours is below.";

    /// <summary>
    /// The form asks for your current password with a new one, unless your
    /// account has none yet (made by Plex/Jellyfin sign-in or import).
    /// </summary>
    public bool NeedsCurrentPassword => model.Viewer?.HasPassword != false;

    // Linked accounts: only servers with Plex/Jellyfin sign-in send `linked`.
    public bool ShowsLinkedAccounts => model.Viewer?.Linked != null;
    public bool HasNoPassword => model.Viewer?.HasPassword == false;
    private bool PlexLinked => model.Viewer?.Linked?.Plex == true;
    private bool JellyfinLinked => model.Viewer?.Linked?.Jellyfin == true;
    private bool OffersPlex => model.Session.ServerInfo?.OffersPlexSignIn == true;
    private bool OffersJellyfin => model.Session.ServerInfo?.OffersJellyfinSignIn == true;

    public string PlexLinkStatus => LinkStatus(MediaServerKind.Plex, PlexLinked, OffersPlex);
    public string JellyfinLinkStatus => LinkStatus(MediaServerKind.Jellyfin, JellyfinLinked, OffersJellyfin);
    private bool IsLinkBusy => IsLinkingPlex || IsLinkingSso || IsChangingLinks;
    public bool CanLinkPlex => !PlexLinked && OffersPlex && !IsLinkBusy;
    public bool CanUnlinkPlex => PlexLinked && !IsLinkBusy;
    public bool CanLinkJellyfin => !JellyfinLinked && OffersJellyfin && !IsLinkBusy;
    public bool CanUnlinkJellyfin => JellyfinLinked && !IsLinkBusy;

    // Single sign-on (0.44+): shown while the admin has it set up, or while
    // this account is still linked to it (so it can always be unlinked).
    private bool SsoLinked => model.Viewer?.Linked?.Sso == true;
    private bool OffersSso => model.Session.ServerInfo?.OffersSsoSignIn == true;
    public bool ShowsSsoLink => OffersSso || SsoLinked;

    /// <summary>The identity provider's button name ("Authentik"), or "Single sign-on" once it's turned off.</summary>
    public string SsoLinkName => model.Session.ServerInfo?.SsoName ?? "Single sign-on";

    public string SsoLinkStatus => SsoLinked
        ? $"Linked: you can sign in with your {SsoLinkName} account."
        : OffersSso ? "Not linked." : "Single sign-on isn't set up on this server.";

    public string LinkSsoLabel => $"Link {SsoLinkName}";
    public string SsoWaitingLine => $"Waiting for {SsoLinkName}… Finish signing in in the browser window that just opened.";
    public bool CanLinkSso => !SsoLinked && OffersSso && !IsLinkBusy;
    public bool CanUnlinkSso => SsoLinked && !IsLinkBusy;
    public bool HasLinksError => LinksError != null;
    public bool HasLinksNotice => LinksNotice != null;

    // The admin's Plex/Jellyfin members card.
    public bool ShowsMediaServerMembers => IsAdmin && model.Viewer?.Linked != null;
    public bool CanImportFromPlex => OffersPlex;
    public bool CanImportFromJellyfin => OffersJellyfin;
    public bool HasNoMediaServers => !OffersPlex && !OffersJellyfin;

    /// <summary>"Jellyfin", or "Emby" when that's the server connected (server-info.signIn.jellyfinName).</summary>
    public string JellyfinName => model.Session.ServerInfo?.JellyfinName ?? MediaServerKindExtensions.DefaultJellyfinName;

    /// <summary>The user-facing name of <paramref name="server"/>: Jellyfin reads "Emby" on an Emby server.</summary>
    internal string ServerName(MediaServerKind server) => server.Label(JellyfinName);

    public string LinkJellyfinLabel => $"Link {JellyfinName}";
    public string ImportFromJellyfinLabel => $"Import from {JellyfinName}";
    public string MediaServerMembersTitle => $"Plex and {JellyfinName} members";
    public string MediaServerSignupHeader => $"New accounts from Plex/{JellyfinName} sign-in";
    public string MediaServerSignupExplanation =>
        $"When someone who can use your Plex or {JellyfinName} server signs in without a Marquee account, create a member account for them. That includes anyone you remove here, who can come straight back. The sign-in screen tells newcomers to sign in that way. Off: only the people you import (or who link their account) can sign in that way.";
    public string NoMediaServersExplanation =>
        $"Connect Plex or {JellyfinName} on the Integrations tab to import household members from it and let them sign in with those accounts.";

    private string LinkStatus(MediaServerKind server, bool linked, bool offered) =>
        linked ? $"Linked: you can sign in with your {ServerName(server)} account."
            : offered ? "Not linked."
            : $"{ServerName(server)} isn't connected to this server.";

    // Request from my Plex Watchlist: shown while Plex is linked (the server says so).
    public bool ShowsPlexWatchlist => PlexWatchlistState?.Available == true;
    public bool IsPlexWatchlistOn => PlexWatchlistState?.Enabled == true;
    public bool CanTurnOnPlexWatchlist => ShowsPlexWatchlist && !IsPlexWatchlistOn && !IsTurningOnPlexWatchlist && !IsChangingPlexWatchlist;
    public bool CanChangePlexWatchlist => !IsChangingPlexWatchlist;

    /// <summary>"On" while it's on; empty (the pill collapses) otherwise.</summary>
    public string PlexWatchlistBadge => IsPlexWatchlistOn ? "On" : "";
    public BadgeTone PlexWatchlistTone { get; } = BadgeTone.Owned;

    /// <summary>"Checked 5m ago · 3 titles requested so far", or "Checking your watchlist…" before the first check.</summary>
    public string PlexWatchlistSummary => PlexWatchlistState?.Summary(DateTimeOffset.UtcNow) ?? "";
    public string CheckPlexWatchlistLabel => IsChangingPlexWatchlist ? "Checking…" : "Check now";
    public string PlexWatchlistLastError => PlexWatchlistState?.LastError ?? "";
    public bool HasPlexWatchlistLastError => PlexWatchlistLastError.Length > 0;
    public bool HasPlexWatchlistError => PlexWatchlistError != null;

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
        model.Notifications.StateChanged += OnNotificationsStateChanged;
        SyncNotifications();
        NotifyDerived();
        _ = LoadMembersAsync();
        _ = LoadSignInSettingsAsync();
        _ = LoadPlexWatchlistAsync();
        _ = Blocklist.LoadAsync(IsAdmin);
        _ = Personal.LoadAsync();
        // Which of Plex/Jellyfin are connected now (server-info.signIn).
        _ = model.Session.RefreshInfoAsync();
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
        model.Notifications.StateChanged -= OnNotificationsStateChanged;
        membersCancellation?.Cancel();
        plexWatchlistLoadCancellation?.Cancel();
        Blocklist.Cancel();
        Personal.Cancel();
        CancelLinkPlex();
        CancelLinkSso();
        CancelTurnOnPlexWatchlist();
    }

    // MARK: Notifications

    /// <summary>The user flipped the switch: the choice is saved for this account and the stream follows it.</summary>
    partial void OnNotificationsEnabledChanged(bool value)
    {
        if (!syncingNotifications)
        {
            model.Notifications.SetEnabled(value);
        }
    }

    private void OnNotificationsStateChanged(object? sender, EventArgs e) => SyncNotifications();

    private void SyncNotifications()
    {
        var notifications = model.Notifications;
        syncingNotifications = true;
        try
        {
            NotificationsSupported = notifications.IsSupported;
            NotificationsEnabled = notifications.IsEnabled;
        }
        finally
        {
            syncingNotifications = false;
        }
        NotificationsNote = !notifications.IsSupported
            ? "Windows notifications aren't available to this copy of Marquee."
            : !notifications.IsEnabled
                ? ""
                : notifications.ServerLacksStream
                    ? "Your Marquee server is too old to send notifications. Update it to get them here."
                    : notifications.IsBlockedByWindows
                        ? "Windows is set to hide notifications from Marquee. Turn them on in Windows Settings › System › Notifications."
                        : "";
    }

    // MARK: Profile photos

    /// <summary>
    /// <c>PUT /users/{id}/avatar</c> for the edit dialog, answering the new
    /// photo path. The member list reloads through <see cref="ServerChange.Users"/>;
    /// your own photo also refreshes the account, so the rail shows it at once.
    /// </summary>
    internal async Task<string?> SetMemberPhotoAsync(Guid id, byte[] image, string contentType)
    {
        var result = await model.Api.Users.SetAvatarAsync(id, image, contentType);
        await RefreshViewerIfOwnAsync(id);
        return result.AvatarUrl;
    }

    /// <summary><c>DELETE /users/{id}/avatar</c> for the edit dialog: back to initials.</summary>
    internal async Task RemoveMemberPhotoAsync(Guid id)
    {
        await model.Api.Users.RemoveAvatarAsync(id);
        await RefreshViewerIfOwnAsync(id);
    }

    private async Task RefreshViewerIfOwnAsync(Guid id)
    {
        if (model.Viewer?.Id == id)
        {
            await model.RefreshViewerAsync();
        }
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
        // The server checks it too; asking here saves a round trip. An
        // account without a password yet has none to give.
        if (NewPassword.Length > 0 && NeedsCurrentPassword && CurrentPassword.Length == 0)
        {
            SaveError = CurrentPasswordMissingMessage;
            return;
        }
        var request = new UpdateUserRequest(
            viewer.Username,
            DisplayName.Trim().NonBlank(),
            NewPassword.NonBlank(),
            CurrentPassword: NeedsCurrentPassword ? CurrentPassword.NonBlank() : null);

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
        var jellyfinName = JellyfinName;
        Members = list
            .Select((member, index) => new HouseholdMemberRow(member, viewerIsAdmin, index > 0, jellyfinName, EditMemberCommand, RemoveMemberCommand))
            .ToList();
    }

    private void ClearMembersMessages()
    {
        MembersActionError = null;
        MembersNotice = null;
    }

    // MARK: Linked accounts

    /// <summary>
    /// "Link Plex": <c>POST /me/links/plex/start</c>, the plex.tv page in the
    /// browser, then <c>POST /me/links/plex/poll</c> every 2 seconds until
    /// it's linked, refused, expired or cancelled.
    /// </summary>
    [RelayCommand]
    private async Task LinkPlexAsync()
    {
        if (!CanLinkPlex)
        {
            return;
        }
        ClearLinksMessages();
        plexLinkCancellation?.Cancel();
        var cancellation = new CancellationTokenSource();
        plexLinkCancellation = cancellation;
        IsLinkingPlex = true;
        var api = model.Api;
        try
        {
            var start = await api.Links.PlexStartAsync(cancellation.Token);
            if (start.Url is not { } url || !await ExternalLinks.OpenAsync(url))
            {
                LinksError = ConnectViewModel.PlexPageUnopenedMessage;
                return;
            }
            await PlexPoll.UntilAsync(start.ExpiresAt, token => api.Links.PlexPollAsync(start.Handle, token), ct: cancellation.Token);
            LinksNotice = "Your Plex account is linked.";
            await model.RefreshViewerAsync();
        }
        catch (ApiException error)
        {
            if (!error.IsCancellation && !cancellation.IsCancellationRequested)
            {
                LinksError = error.Message;
            }
        }
        finally
        {
            if (ReferenceEquals(plexLinkCancellation, cancellation))
            {
                plexLinkCancellation = null;
                IsLinkingPlex = false;
            }
            cancellation.Dispose();
        }
    }

    /// <summary>"Cancel" while waiting for Plex; also leaving the page.</summary>
    [RelayCommand]
    private void CancelLinkPlex()
    {
        var cancellation = plexLinkCancellation;
        plexLinkCancellation = null;
        IsLinkingPlex = false;
        cancellation?.Cancel();
    }

    /// <summary>"Link Jellyfin": the dialog sends <c>POST /me/links/jellyfin</c> itself and shows a refusal in place.</summary>
    [RelayCommand]
    private async Task LinkJellyfinAsync()
    {
        if (!CanLinkJellyfin || LinkJellyfinPrompt is not { } prompt)
        {
            return;
        }
        ClearLinksMessages();
        if (await prompt())
        {
            LinksNotice = $"Your {JellyfinName} account is linked.";
            await model.RefreshViewerAsync();
        }
    }

    [RelayCommand]
    private Task UnlinkPlexAsync() => UnlinkAsync(MediaServerKind.Plex);

    [RelayCommand]
    private Task UnlinkJellyfinAsync() => UnlinkAsync(MediaServerKind.Jellyfin);

    /// <summary><c>DELETE /me/links/{server}</c>; the server refuses when it would leave no way to sign in.</summary>
    private Task UnlinkAsync(MediaServerKind server) =>
        UnlinkAsync(ServerName(server), api => api.Links.UnlinkAsync(server));

    /// <summary><c>DELETE /me/links/sso</c> (0.44+); refused like the others when it would leave no way to sign in.</summary>
    [RelayCommand]
    private Task UnlinkSsoAsync() => UnlinkAsync(SsoLinkName, api => api.Links.UnlinkSsoAsync());

    private async Task UnlinkAsync(string name, Func<MarqueeApi, Task> unlink)
    {
        if (IsLinkBusy)
        {
            return;
        }
        ClearLinksMessages();
        IsChangingLinks = true;
        try
        {
            await unlink(model.Api);
            LinksNotice = $"Your {name} account is unlinked.";
            await model.RefreshViewerAsync();
        }
        catch (ApiException error)
        {
            LinksError = error.Message;
        }
        finally
        {
            IsChangingLinks = false;
        }
    }

    /// <summary>
    /// "Link {name}" (0.44+): <c>POST /me/links/sso/start</c>, Marquee's own
    /// page in the browser (only if it's https or on this server's address),
    /// then <c>POST /me/links/sso/poll</c> every 2 seconds until it's linked,
    /// refused, expired or cancelled, like Link Plex.
    /// </summary>
    [RelayCommand]
    private async Task LinkSsoAsync()
    {
        if (!CanLinkSso)
        {
            return;
        }
        ClearLinksMessages();
        ssoLinkCancellation?.Cancel();
        var cancellation = new CancellationTokenSource();
        ssoLinkCancellation = cancellation;
        IsLinkingSso = true;
        var api = model.Api;
        var name = SsoLinkName;
        try
        {
            var start = await api.Links.SsoStartAsync(cancellation.Token);
            var server = model.Session.Server?.BaseUrl;
            if (start.UrlOn(server) is not { } url || !await ExternalLinks.OpenSignInPageAsync(url, server))
            {
                LinksError = ConnectViewModel.SsoPageUnopenedMessage(name);
                return;
            }
            await PlexPoll.UntilAsync(
                start.ExpiresAt,
                token => api.Links.SsoPollAsync(start.Handle, token),
                ct: cancellation.Token,
                expiredMessage: ApiException.SsoSignInExpiredMessage);
            LinksNotice = $"Your {name} account is linked.";
            await model.RefreshViewerAsync();
        }
        catch (ApiException error)
        {
            if (!error.IsCancellation && !cancellation.IsCancellationRequested)
            {
                LinksError = error.Message;
            }
        }
        finally
        {
            if (ReferenceEquals(ssoLinkCancellation, cancellation))
            {
                ssoLinkCancellation = null;
                IsLinkingSso = false;
            }
            cancellation.Dispose();
        }
    }

    /// <summary>"Cancel" while waiting for the identity provider; also leaving the page.</summary>
    [RelayCommand]
    private void CancelLinkSso()
    {
        var cancellation = ssoLinkCancellation;
        ssoLinkCancellation = null;
        IsLinkingSso = false;
        cancellation?.Cancel();
    }

    /// <summary><c>POST /me/links/jellyfin</c>, for the Link Jellyfin dialog.</summary>
    internal Task LinkJellyfinAccountAsync(string username, string password) => model.Api.Links.JellyfinAsync(username, password);

    private void ClearLinksMessages()
    {
        LinksError = null;
        LinksNotice = null;
    }

    // MARK: Request from my Plex Watchlist

    /// <summary>How long after turning it on to ask again: the server's first check runs in the background.</summary>
    private static readonly TimeSpan PlexWatchlistFirstCheckDelay = TimeSpan.FromSeconds(8);

    /// <summary>
    /// <c>GET /me/plex-watchlist</c>. A failure keeps what's shown (nothing,
    /// the first time): the card is an extra, not worth an error of its own.
    /// </summary>
    private async Task LoadPlexWatchlistAsync()
    {
        plexWatchlistLoadCancellation?.Cancel();
        var cancellation = new CancellationTokenSource();
        plexWatchlistLoadCancellation = cancellation;
        var token = cancellation.Token;
        plexLinkedForWatchlist = PlexLinked;
        try
        {
            var state = await model.Api.PlexWatchlist.StatusAsync(token);
            if (token.IsCancellationRequested)
            {
                return;
            }
            ShowPlexWatchlist(state);
        }
        catch (ApiException)
        {
            // Cancelled by a newer load, or it failed: keep what's shown.
        }
    }

    /// <summary>
    /// "Turn on": <c>POST /me/plex-watchlist/start</c>, the plex.tv page in
    /// the browser, then <c>POST /me/plex-watchlist/poll</c> every 2 seconds
    /// until it's on, refused, expired or cancelled, like Link Plex.
    /// </summary>
    [RelayCommand]
    private async Task TurnOnPlexWatchlistAsync()
    {
        if (!CanTurnOnPlexWatchlist)
        {
            return;
        }
        PlexWatchlistError = null;
        plexWatchlistCancellation?.Cancel();
        var cancellation = new CancellationTokenSource();
        plexWatchlistCancellation = cancellation;
        IsTurningOnPlexWatchlist = true;
        var api = model.Api;
        try
        {
            var start = await api.PlexWatchlist.StartAsync(cancellation.Token);
            if (start.Url is not { } url || !await ExternalLinks.OpenAsync(url))
            {
                PlexWatchlistError = ConnectViewModel.PlexPageUnopenedMessage;
                return;
            }
            var state = await PlexPoll.RunAsync(start.ExpiresAt, token => api.PlexWatchlist.PollAsync(start.Handle, token), ct: cancellation.Token);
            ShowPlexWatchlist(state);
            _ = RefreshPlexWatchlistAfterFirstCheckAsync();
        }
        catch (ApiException error)
        {
            if (!error.IsCancellation && !cancellation.IsCancellationRequested)
            {
                PlexWatchlistError = error.Message;
            }
        }
        finally
        {
            if (ReferenceEquals(plexWatchlistCancellation, cancellation))
            {
                plexWatchlistCancellation = null;
                IsTurningOnPlexWatchlist = false;
            }
            cancellation.Dispose();
        }
    }

    /// <summary>"Cancel" while waiting for Plex; also leaving the page.</summary>
    [RelayCommand]
    private void CancelTurnOnPlexWatchlist()
    {
        var cancellation = plexWatchlistCancellation;
        plexWatchlistCancellation = null;
        IsTurningOnPlexWatchlist = false;
        cancellation?.Cancel();
    }

    /// <summary>The first check's result ("Checked just now", what it requested), shortly after turning it on.</summary>
    private async Task RefreshPlexWatchlistAfterFirstCheckAsync()
    {
        await Task.Delay(PlexWatchlistFirstCheckDelay);
        if (active && model.IsSignedIn)
        {
            await LoadPlexWatchlistAsync();
        }
    }

    /// <summary>"Check now": <c>POST /me/plex-watchlist/sync</c>, answering once the check is done.</summary>
    [RelayCommand]
    private Task CheckPlexWatchlistAsync() => ChangePlexWatchlistAsync(api => api.PlexWatchlist.SyncAsync());

    /// <summary>"Turn off": <c>DELETE /me/plex-watchlist</c>, which also deletes the stored Plex sign-in.</summary>
    [RelayCommand]
    private Task TurnOffPlexWatchlistAsync() => ChangePlexWatchlistAsync(api => api.PlexWatchlist.DisableAsync());

    /// <summary>The user flipped Movies: <c>PATCH /me/plex-watchlist</c> with just that kind.</summary>
    partial void OnPlexWatchlistMoviesChanged(bool value)
    {
        if (!syncingPlexWatchlist)
        {
            _ = ChangePlexWatchlistAsync(api => api.PlexWatchlist.SetTypesAsync(movies: value, tv: null));
        }
    }

    /// <summary>The user flipped TV shows.</summary>
    partial void OnPlexWatchlistTvChanged(bool value)
    {
        if (!syncingPlexWatchlist)
        {
            _ = ChangePlexWatchlistAsync(api => api.PlexWatchlist.SetTypesAsync(movies: null, tv: value));
        }
    }

    /// <summary>
    /// One change, each answering the new state. A failure says why and
    /// puts the switches back where the server has them.
    /// </summary>
    private async Task ChangePlexWatchlistAsync(Func<MarqueeApi, Task<PlexWatchlist>> change)
    {
        if (IsChangingPlexWatchlist || IsTurningOnPlexWatchlist)
        {
            ShowPlexWatchlist(PlexWatchlistState);
            return;
        }
        PlexWatchlistError = null;
        IsChangingPlexWatchlist = true;
        try
        {
            ShowPlexWatchlist(await change(model.Api));
        }
        catch (ApiException error)
        {
            PlexWatchlistError = error.Message;
            ShowPlexWatchlist(PlexWatchlistState);
        }
        finally
        {
            IsChangingPlexWatchlist = false;
        }
    }

    /// <summary>Shows a state from the server, moving the switches to match without sending anything.</summary>
    private void ShowPlexWatchlist(PlexWatchlist? state)
    {
        PlexWatchlistState = state;
        if (state == null)
        {
            return;
        }
        syncingPlexWatchlist = true;
        try
        {
            PlexWatchlistMovies = state.Movies;
            PlexWatchlistTv = state.Tv;
        }
        finally
        {
            syncingPlexWatchlist = false;
        }
        // "Checked 5m ago" is relative to now: re-read even when the state didn't change.
        OnPropertyChanged(nameof(PlexWatchlistSummary));
    }

    // MARK: Plex / Jellyfin members (admin)

    [RelayCommand]
    private Task ImportFromPlexAsync() => ImportMembersAsync(MediaServerKind.Plex);

    [RelayCommand]
    private Task ImportFromJellyfinAsync() => ImportMembersAsync(MediaServerKind.Jellyfin);

    /// <summary>"Import from Plex/Jellyfin": the dialog loads the list and imports; the member list reloads through <see cref="ServerChange.Users"/>.</summary>
    private async Task ImportMembersAsync(MediaServerKind server)
    {
        if (!IsAdmin || ImportMembersPrompt is not { } prompt)
        {
            return;
        }
        ClearMembersMessages();
        if (await prompt(server) is { } result)
        {
            MembersNotice = ImportSummary(result.Created.Count, result.Skipped);
        }
    }

    public static string ImportSummary(int created, int skipped)
    {
        var made = created == 1 ? "Imported 1 member." : $"Imported {created} members.";
        return skipped > 0 ? $"{made} {skipped} skipped (already members, or couldn't be added)." : made;
    }

    /// <summary><c>GET /users/import/{server}</c>, for the import dialog.</summary>
    internal Task<IReadOnlyList<ImportCandidate>> LoadImportCandidatesAsync(MediaServerKind server) => model.Api.Users.ImportCandidatesAsync(server);

    /// <summary><c>POST /users/import/{server}</c>, for the import dialog.</summary>
    internal Task<ImportUsersResult> RunImportAsync(MediaServerKind server, IReadOnlyList<ExternalId> ids) => model.Api.Users.ImportAsync(server, ids);

    /// <summary><c>GET /settings/sign-in</c> (admin); NotFound from an older server keeps the switch hidden.</summary>
    private async Task LoadSignInSettingsAsync()
    {
        if (!IsAdmin)
        {
            return;
        }
        try
        {
            var settings = await model.Api.Users.SignInSettingsAsync();
            syncingSignInSettings = true;
            try
            {
                MediaServerSignup = settings.MediaServerSignup;
            }
            finally
            {
                syncingSignInSettings = false;
            }
            HasSignInSettings = true;
        }
        catch (ApiException)
        {
            HasSignInSettings = false;
        }
    }

    /// <summary>The admin flipped "New accounts from Plex/Jellyfin sign-in": <c>PUT /settings/sign-in</c>, put back on failure.</summary>
    partial void OnMediaServerSignupChanged(bool value)
    {
        if (!syncingSignInSettings)
        {
            _ = SaveSignInSettingsAsync(value);
        }
    }

    private async Task SaveSignInSettingsAsync(bool value)
    {
        MembersActionError = null;
        try
        {
            await model.Api.Users.SaveSignInSettingsAsync(new SignInSettings { MediaServerSignup = value });
        }
        catch (ApiException error)
        {
            MembersActionError = error.Message;
            syncingSignInSettings = true;
            try
            {
                MediaServerSignup = !value;
            }
            finally
            {
                syncingSignInSettings = false;
            }
        }
    }

    // MARK: Following the model

    private void OnModelPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(AppModel.Viewer))
        {
            NotifyDerived();
            // Linking or unlinking Plex decides whether the watchlist card shows.
            if (model.Viewer != null && plexLinkedForWatchlist != PlexLinked)
            {
                _ = LoadPlexWatchlistAsync();
            }
            // A promotion (or demotion) changes which accounts the list shows.
            if (model.Viewer is { } viewer && viewer.IsAdmin != IsAdmin)
            {
                IsAdmin = viewer.IsAdmin;
                OnPropertyChanged(nameof(ShowsMediaServerMembers));
                _ = LoadMembersAsync();
                _ = LoadSignInSettingsAsync();
                _ = Blocklist.LoadAsync(IsAdmin);
                // Reviewers get more events to choose from.
                _ = Personal.LoadAsync();
            }
        }
        else if (e.PropertyName == nameof(AppModel.ReloadToken))
        {
            _ = LoadMembersAsync();
            _ = LoadPlexWatchlistAsync();
            _ = Blocklist.LoadAsync(IsAdmin);
            _ = Personal.LoadAsync();
        }
        else if (e.PropertyName == nameof(AppModel.MenuPosition))
        {
            SyncMenuPosition();
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
