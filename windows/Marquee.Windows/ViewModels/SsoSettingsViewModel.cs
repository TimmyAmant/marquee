using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Windows.Services;

namespace Marquee.Windows.ViewModels;

/// <summary>
/// Settings › Integrations › Sign-in's "Single sign-on" card
/// (components/sso-settings-card.tsx), the admin's: any OpenID Connect
/// provider (Authentik, Authelia, Pocket ID, Keycloak, Google…). The
/// button name, Marquee's address with the redirect URI it makes, the
/// issuer with "Test", the client ID and write-only secret, scopes, the
/// sign-up and email-matching switches, the groups, then "Test &amp; save"
/// (<c>PUT /settings/sso</c>) and "Turn off single sign-on" (<c>DELETE</c>).
/// Hidden on a server older than 0.44, which answers <c>GET /settings/sso</c>
/// with 404.
/// </summary>
public sealed partial class SsoSettingsViewModel : ObservableObject
{
    public const string SavedSecretPlaceholder = "(saved — enter to replace)";
    public const string PublicClientPlaceholder = "Leave empty for a public client";
    public const string SavedNotice = "Saved. The sign-in button is live.";

    /// <summary>What the redirect URI reads while Marquee's address isn't an http(s) address yet.</summary>
    private static readonly string CallbackPlaceholder = "https://your-marquee-address" + SsoSettings.CallbackPath;

    private readonly AppModel model;
    private CancellationTokenSource? loadCancellation;

    public SsoSettingsViewModel(AppModel model)
    {
        this.model = model;
    }

    /// <summary><c>GET /settings/sso</c> answered: the card shows (never on an older server).</summary>
    [ObservableProperty]
    private bool isAvailable;

    /// <summary>Single sign-on is set up: the "On" pill and "Turn off single sign-on".</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(OnBadge))]
    [NotifyPropertyChangedFor(nameof(CanRemove))]
    private bool isConfigured;

    // MARK: The form

    [ObservableProperty]
    private string name = "";

    /// <summary>Marquee's address as people reach it; the redirect URI follows it as it's typed.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CallbackUrl))]
    private string publicUrl = "";

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CanTest))]
    private string issuer = "";

    [ObservableProperty]
    private string clientId = "";

    /// <summary>Write-only: blank keeps the saved one.</summary>
    [ObservableProperty]
    private string clientSecret = "";

    /// <summary>A secret is saved: the placeholder says so and "Remove the saved secret" shows.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ClientSecretPlaceholder))]
    private bool hasClientSecret;

    /// <summary>"Remove the saved secret (a public client)".</summary>
    [ObservableProperty]
    private bool clearClientSecret;

    [ObservableProperty]
    private string scopes = SsoSettings.DefaultScopes;

    /// <summary>"New accounts from single sign-on" (default off).</summary>
    [ObservableProperty]
    private bool allowSignup;

    /// <summary>"Match existing accounts by verified email" (default off).</summary>
    [ObservableProperty]
    private bool matchEmail;

    [ObservableProperty]
    private string requiredGroup = "";

    [ObservableProperty]
    private string trustedGroup = "";

    [ObservableProperty]
    private string groupsClaim = SsoSettings.DefaultGroupsClaim;

    /// <summary>The redirect URI to register with the provider: Marquee's address plus <c>/api/auth/sso/callback</c>.</summary>
    public string CallbackUrl => SsoSettings.CallbackUrlFor(PublicUrl) ?? CallbackPlaceholder;

    public string ClientSecretPlaceholder => HasClientSecret ? SavedSecretPlaceholder : PublicClientPlaceholder;

    /// <summary>"On" while it's set up; empty (the pill collapses) otherwise.</summary>
    public string OnBadge => IsConfigured ? "On" : "";
    public BadgeTone OnTone { get; } = BadgeTone.Owned;

    // MARK: Copy

    [ObservableProperty]
    private string copyLabel = "Copy";

    /// <summary>"Copy" for the redirect URI; reads "Copied" for a moment.</summary>
    [RelayCommand]
    private async Task CopyCallbackAsync()
    {
        if (!ClipboardText.Copy(CallbackUrl))
        {
            return;
        }
        CopyLabel = "Copied";
        await Task.Delay(TimeSpan.FromSeconds(1.5));
        CopyLabel = "Copy";
    }

    // MARK: Test

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(TestLabel))]
    [NotifyPropertyChangedFor(nameof(CanTest))]
    private bool isTesting;

    /// <summary>"Found https://auth.example.com/…" after a Test that checked out.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasTestFound))]
    private string? testFound;

    /// <summary>The provider's warnings, one per line ("The provider isn't using https — …").</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasTestWarnings))]
    private string? testWarnings;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasTestError))]
    private string? testError;

    public string TestLabel => IsTesting ? "Testing…" : "Test";
    public bool CanTest => !IsTesting && !string.IsNullOrWhiteSpace(Issuer);
    public bool HasTestFound => TestFound != null;
    public bool HasTestWarnings => TestWarnings != null;
    public bool HasTestError => TestError != null;

    /// <summary><c>POST /settings/sso/test</c>: checks the provider's discovery document without saving anything.</summary>
    [RelayCommand]
    private async Task TestAsync()
    {
        if (!CanTest)
        {
            return;
        }
        TestFound = null;
        TestWarnings = null;
        TestError = null;
        IsTesting = true;
        try
        {
            var result = await model.Api.Sso.TestAsync(Issuer.Trim());
            TestFound = $"Found {result.Issuer}";
            TestWarnings = result.Warnings.Count > 0 ? string.Join("\n", result.Warnings) : null;
        }
        catch (ApiException failure)
        {
            TestError = failure.Message;
        }
        finally
        {
            IsTesting = false;
        }
    }

    // MARK: Save and turn off

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(SaveLabel))]
    [NotifyPropertyChangedFor(nameof(CanSave))]
    [NotifyPropertyChangedFor(nameof(CanRemove))]
    private bool isSaving;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(RemoveLabel))]
    [NotifyPropertyChangedFor(nameof(CanSave))]
    [NotifyPropertyChangedFor(nameof(CanRemove))]
    private bool isRemoving;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasError))]
    private string? error;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasNotice))]
    private string? notice;

    public string SaveLabel => IsSaving ? "Checking…" : "Test & save";
    public string RemoveLabel => IsRemoving ? "Turning off…" : "Turn off single sign-on";
    public bool CanSave => !IsSaving && !IsRemoving;
    public bool CanRemove => IsConfigured && !IsSaving && !IsRemoving;
    public bool HasError => Error != null;
    public bool HasNotice => Notice != null;

    /// <summary>
    /// <c>PUT /settings/sso</c>: the server checks the provider's discovery
    /// document, then saves; the answer (the issuer exactly as the provider
    /// states it) replaces the form. A blank secret keeps the saved one.
    /// </summary>
    [RelayCommand]
    private async Task SaveAsync()
    {
        if (!CanSave)
        {
            return;
        }
        Error = null;
        Notice = null;
        IsSaving = true;
        try
        {
            var saved = await model.Api.Sso.SaveAsync(new SsoSettingsRequest
            {
                Name = Name.Trim(),
                Issuer = Issuer.Trim(),
                ClientId = ClientId.Trim(),
                ClientSecret = ClientSecret.Trim().NonBlank(),
                ClearClientSecret = HasClientSecret && ClearClientSecret ? true : null,
                Scopes = Scopes.Trim(),
                PublicUrl = PublicUrl.Trim(),
                AllowSignup = AllowSignup,
                MatchEmail = MatchEmail,
                RequiredGroup = RequiredGroup.Trim().NonBlank(),
                TrustedGroup = TrustedGroup.Trim().NonBlank(),
                GroupsClaim = GroupsClaim.Trim(),
            });
            Apply(saved);
            Notice = SavedNotice;
            // The sign-in buttons (server-info.signIn.sso) changed.
            _ = model.Session.RefreshInfoAsync();
        }
        catch (ApiException failure)
        {
            Error = failure.Message;
        }
        finally
        {
            IsSaving = false;
        }
    }

    /// <summary><c>DELETE /settings/sso</c>: turns it off; accounts keep their links for if it's set up again.</summary>
    [RelayCommand]
    private async Task RemoveAsync()
    {
        if (!CanRemove)
        {
            return;
        }
        Error = null;
        Notice = null;
        IsRemoving = true;
        try
        {
            Apply(await model.Api.Sso.RemoveAsync());
            _ = model.Session.RefreshInfoAsync();
        }
        catch (ApiException failure)
        {
            Error = failure.Message;
        }
        finally
        {
            IsRemoving = false;
        }
    }

    // MARK: Loading

    /// <summary>
    /// <c>GET /settings/sso</c>, when the tab opens. A 404 (an older server)
    /// or a failure keeps the card hidden: the rest of the tab doesn't
    /// depend on it.
    /// </summary>
    internal async Task LoadAsync()
    {
        loadCancellation?.Cancel();
        var cancellation = new CancellationTokenSource();
        loadCancellation = cancellation;
        var token = cancellation.Token;
        try
        {
            var settings = await model.Api.Sso.GetAsync(token);
            if (token.IsCancellationRequested)
            {
                return;
            }
            if (settings == null)
            {
                IsAvailable = false;
                return;
            }
            Apply(settings);
            IsAvailable = true;
        }
        catch (ApiException)
        {
            // Cancelled by a newer load, or it failed: keep what's shown.
        }
    }

    internal void Cancel() => loadCancellation?.Cancel();

    /// <summary>The server's settings into the form; the secret fields are emptied.</summary>
    private void Apply(SsoSettings settings)
    {
        IsConfigured = settings.Configured;
        Name = settings.Name;
        PublicUrl = settings.PublicUrl;
        Issuer = settings.Issuer;
        ClientId = settings.ClientId;
        ClientSecret = "";
        HasClientSecret = settings.HasClientSecret;
        ClearClientSecret = false;
        Scopes = settings.Scopes;
        AllowSignup = settings.AllowSignup;
        MatchEmail = settings.MatchEmail;
        RequiredGroup = settings.RequiredGroup ?? "";
        TrustedGroup = settings.TrustedGroup ?? "";
        GroupsClaim = settings.GroupsClaim;
    }
}
