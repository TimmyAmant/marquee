using System.ComponentModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core.Api;
using Marquee.Core.Connection;
using Marquee.Core.Models;
using Marquee.Windows.Services;

namespace Marquee.Windows.ViewModels;

/// <summary>
/// The pre-sign-in screen: enter a server address and check it, then sign
/// in (or create the server's first account), with the can't-reach card for
/// a saved server that stopped answering. Which card shows follows
/// <see cref="AppModel.Phase"/> and <see cref="AppModel.AuthForm"/>; this
/// class owns the form fields and the buttons.
///
/// Created once by <c>ConnectPage</c>, which the window keeps for the app's
/// lifetime, so the subscriptions to the model are never torn down.
/// </summary>
public sealed partial class ConnectViewModel : ObservableObject
{
    /// <summary>Everything derived from the model, re-announced whenever the model moves.</summary>
    private static readonly string[] DerivedProperties =
    [
        nameof(IsLaunching),
        nameof(IsConnectStep),
        nameof(IsSignInStep),
        nameof(IsSetupStep),
        nameof(IsUnreachable),
        nameof(ServerLabel),
        nameof(ServerVersionLabel),
        nameof(AuthNotice),
        nameof(HasAuthNotice),
        nameof(OffersSetup),
        nameof(IsDegraded),
        nameof(CanRetryRestore),
        nameof(IsRetrying),
        nameof(RetryLabel),
        nameof(UnreachableTitle),
        nameof(UnreachableExplanation),
        nameof(UnreachableDetail),
        nameof(HasUnreachableDetail),
        nameof(OffersPlexSignIn),
        nameof(OffersJellyfinSignIn),
        nameof(OffersSsoSignIn),
        nameof(OffersOtherSignIn),
        nameof(ShowsPlexButton),
        nameof(ShowsSsoButton),
        nameof(SsoSignInLabel),
        nameof(OffersQuickConnect),
        nameof(ShowsQuickConnectButton),
        nameof(UsesJellyfin),
        nameof(SignInSubtitle),
        nameof(UsernameHeader),
        nameof(PasswordHeader),
        nameof(SignInLabel),
        nameof(JellyfinToggleLabel),
        nameof(JellyfinName),
        nameof(SignupHint),
        nameof(ShowsSignupHint),
    ];

    private readonly AppModel model;

    /// <summary>
    /// The Plex, single sign-on or Quick Connect sign-in in progress (one at
    /// a time); cancelled by Cancel, by leaving the sign-in card, and when
    /// the window closes.
    /// </summary>
    private CancellationTokenSource? externalCancellation;

    // MARK: Server address

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(CheckCommand))]
    private string address = "";

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasAddressError))]
    private string? addressError;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CheckLabel))]
    [NotifyCanExecuteChangedFor(nameof(CheckCommand))]
    private bool isChecking;

    // MARK: Sign-in and setup forms

    [ObservableProperty]
    private string username = "";

    [ObservableProperty]
    private string password = "";

    [ObservableProperty]
    private string displayName = "";

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasFormError))]
    private string? formError;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(SignInLabel))]
    [NotifyPropertyChangedFor(nameof(SetupLabel))]
    [NotifyCanExecuteChangedFor(nameof(SignInWithPlexCommand))]
    [NotifyCanExecuteChangedFor(nameof(SignInWithSsoCommand))]
    [NotifyCanExecuteChangedFor(nameof(UseQuickConnectCommand))]
    private bool isSubmitting;

    // MARK: Plex / Jellyfin / single sign-on

    /// <summary>"Sign in with Jellyfin" was chosen: the same two fields, posted to <c>/auth/jellyfin</c>.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(UsesJellyfin))]
    [NotifyPropertyChangedFor(nameof(SignInSubtitle))]
    [NotifyPropertyChangedFor(nameof(UsernameHeader))]
    [NotifyPropertyChangedFor(nameof(PasswordHeader))]
    [NotifyPropertyChangedFor(nameof(SignInLabel))]
    [NotifyPropertyChangedFor(nameof(JellyfinToggleLabel))]
    [NotifyPropertyChangedFor(nameof(ShowsQuickConnectButton))]
    private bool isJellyfinMode;

    /// <summary>The browser is open at plex.tv or the single sign-on page, and the poll is running.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsSigningInElsewhere))]
    [NotifyPropertyChangedFor(nameof(ShowsPlexButton))]
    [NotifyPropertyChangedFor(nameof(ShowsSsoButton))]
    [NotifyPropertyChangedFor(nameof(ShowsQuickConnectButton))]
    [NotifyCanExecuteChangedFor(nameof(SignInCommand))]
    [NotifyCanExecuteChangedFor(nameof(SignInWithPlexCommand))]
    [NotifyCanExecuteChangedFor(nameof(SignInWithSsoCommand))]
    [NotifyCanExecuteChangedFor(nameof(UseQuickConnectCommand))]
    [NotifyCanExecuteChangedFor(nameof(ToggleJellyfinCommand))]
    private bool isWaitingForBrowser;

    /// <summary>"Waiting for Plex…" / "Waiting for Authentik…".</summary>
    [ObservableProperty]
    private string waitingLabel = "";

    /// <summary>Quick Connect is running: getting a code, then waiting for it to be approved.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsSigningInElsewhere))]
    [NotifyPropertyChangedFor(nameof(ShowsPlexButton))]
    [NotifyPropertyChangedFor(nameof(ShowsSsoButton))]
    [NotifyPropertyChangedFor(nameof(ShowsQuickConnectButton))]
    [NotifyCanExecuteChangedFor(nameof(SignInCommand))]
    [NotifyCanExecuteChangedFor(nameof(SignInWithPlexCommand))]
    [NotifyCanExecuteChangedFor(nameof(SignInWithSsoCommand))]
    [NotifyCanExecuteChangedFor(nameof(UseQuickConnectCommand))]
    [NotifyCanExecuteChangedFor(nameof(ToggleJellyfinCommand))]
    private bool isQuickConnecting;

    /// <summary>The Quick Connect code to enter in a Jellyfin app; empty until the server hands one out.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasQuickConnectCode))]
    [NotifyPropertyChangedFor(nameof(QuickConnectStatus))]
    private string quickConnectCode = "";

    public ConnectViewModel(AppModel model)
    {
        this.model = model;
        Address = model.AddressPrefill ?? "";
        model.PropertyChanged += OnModelPropertyChanged;
        model.SessionChanged += OnSessionChanged;
    }

    // MARK: Which card

    public bool IsLaunching => model.Phase == AppPhase.Launching;
    public bool IsConnectStep => model.Phase == AppPhase.Connect;
    public bool IsSignInStep => model.Phase == AppPhase.SignIn && model.AuthForm == AuthForm.SignIn;
    public bool IsSetupStep => model.Phase == AppPhase.SignIn && model.AuthForm == AuthForm.Setup;
    public bool IsUnreachable => model.Phase == AppPhase.Unreachable;

    // MARK: The chosen server

    /// <summary>"192.168.1.20:3000", or the full URL for HTTPS.</summary>
    public string ServerLabel => model.Session.Server?.DisplayName ?? "";

    /// <summary>"Marquee 0.28.0", once server-info has answered.</summary>
    public string ServerVersionLabel => model.Session.ServerInfo is { } info ? $"Marquee {info.Version}" : "";

    public string? AuthNotice => model.AuthNotice;
    public bool HasAuthNotice => !string.IsNullOrEmpty(model.AuthNotice);

    /// <summary>Setup is only offered while the server has no accounts; after that an admin adds members in Settings.</summary>
    public bool OffersSetup => model.Session.ServerInfo?.SetupComplete == false;

    public bool IsDegraded => model.Session.ServerInfo?.IsDegraded == true;

    /// <summary>The credential store wouldn't answer: Retry re-reads it instead of asking for a password.</summary>
    public bool CanRetryRestore => model.AuthNotice == AppModel.CredentialStoreUnreadableNotice;

    public bool IsRetrying => model.IsRetryingConnection;
    public string RetryLabel => IsRetrying ? "Connecting…" : "Retry";

    // MARK: Plex / Jellyfin / single sign-on (server-info.signIn; an older server sends none, so no buttons)

    public bool OffersPlexSignIn => model.Session.ServerInfo?.OffersPlexSignIn == true;
    public bool OffersJellyfinSignIn => model.Session.ServerInfo?.OffersJellyfinSignIn == true;

    /// <summary>"Sign in with {name}" for the admin's identity provider (0.44+).</summary>
    public bool OffersSsoSignIn => model.Session.ServerInfo?.OffersSsoSignIn == true;

    /// <summary>The "or" section under the password form shows.</summary>
    public bool OffersOtherSignIn => OffersPlexSignIn || OffersJellyfinSignIn || OffersSsoSignIn;

    /// <summary>A Plex, single sign-on or Quick Connect sign-in is running; the other ways in wait.</summary>
    public bool IsSigningInElsewhere => IsWaitingForBrowser || IsQuickConnecting;

    public bool ShowsPlexButton => OffersPlexSignIn && !IsSigningInElsewhere;
    public bool ShowsSsoButton => OffersSsoSignIn && !IsSigningInElsewhere;

    /// <summary>The single sign-on button's name, e.g. "Authentik".</summary>
    private string SsoName => model.Session.ServerInfo?.SsoName ?? "single sign-on";

    public string SsoSignInLabel => $"Sign in with {SsoName}";

    /// <summary>Jellyfin (never Emby) with Quick Connect on the server (server-info.signIn.quickConnect, 0.44+).</summary>
    public bool OffersQuickConnect => model.Session.ServerInfo?.OffersQuickConnect == true;

    /// <summary>"Use Quick Connect" on the Jellyfin form.</summary>
    public bool ShowsQuickConnectButton => UsesJellyfin && OffersQuickConnect && !IsSigningInElsewhere;

    public bool HasQuickConnectCode => QuickConnectCode.Length > 0;
    public string QuickConnectStatus => HasQuickConnectCode ? "Waiting for approval…" : "Getting a code…";

    /// <summary>The form posts to <c>/auth/jellyfin</c>.</summary>
    public bool UsesJellyfin => IsJellyfinMode && OffersJellyfinSignIn;

    /// <summary>"Jellyfin", or "Emby" when that's the server connected (server-info.signIn.jellyfinName).</summary>
    public string JellyfinName => model.Session.ServerInfo?.JellyfinName ?? MediaServerKindExtensions.DefaultJellyfinName;

    /// <summary>
    /// "New here? Use Sign in with Plex — …" when the admin has new accounts
    /// from Plex/Jellyfin (or single sign-on) sign-in on: that's how a
    /// newcomer gets in.
    /// </summary>
    public string SignupHint => model.Session.ServerInfo?.SignupHint ?? "";
    public bool ShowsSignupHint => model.Session.ServerInfo?.SignupHint is not null;

    public string SignInSubtitle => UsesJellyfin ? $"Sign in with your {JellyfinName} account." : "Sign in to your Marquee account.";
    public string UsernameHeader => UsesJellyfin ? $"{JellyfinName} username" : "Username";
    public string PasswordHeader => UsesJellyfin ? $"{JellyfinName} password" : "Password";
    public string JellyfinToggleLabel => UsesJellyfin ? "Sign in with a Marquee account" : $"Sign in with {JellyfinName}";

    // MARK: Labels

    public bool HasAddressError => AddressError != null;
    public bool HasFormError => FormError != null;
    public string CheckLabel => IsChecking ? "Checking…" : "Check";
    public string SignInLabel => IsSubmitting ? "Signing in…" : (UsesJellyfin ? $"Sign in with {JellyfinName}" : "Sign in");
    public string SetupLabel => IsSubmitting ? "Creating account…" : "Create admin account";

    // MARK: Can't-reach card

    private ProbeOutcome Problem => model.ConnectionProblem ?? new ProbeOutcome.Unreachable(UnreachableReason.NoResponse);

    public string UnreachableTitle => Problem switch
    {
        ProbeOutcome.Legacy or ProbeOutcome.Incompatible => "Update needed",
        ProbeOutcome.NotMarquee => "That's not your Marquee server",
        ProbeOutcome.Unreachable { Reason.Kind: UnreachableReasonKind.LocalNetworkDenied } => "Allow local network access",
        _ => "Can't reach your server",
    };

    public string UnreachableExplanation => Problem switch
    {
        ProbeOutcome.Legacy => "Your Marquee server is running an older version. Update it, then try again.",
        ProbeOutcome.Incompatible => "Your Marquee server is newer than this app. Update Marquee for Windows, then try again.",
        ProbeOutcome.NotMarquee => "Something else is answering at your server's address now. Its IP address may have changed.",
        ProbeOutcome.Unreachable { Reason.Kind: UnreachableReasonKind.LocalNetworkDenied } =>
            "Windows is blocking Marquee from your home network. Allow it in the app's network settings, then try again.",
        _ => "Make sure the computer running Marquee is on and connected to your network, then try again.",
    };

    /// <summary>The specific inline message for this server, e.g. which port nothing answers on.</summary>
    public string? UnreachableDetail => model.Session.Server is { } server ? Problem.ProblemMessage(server) : null;

    public bool HasUnreachableDetail => UnreachableDetail != null;

    // MARK: Commands

    private bool CanCheck => !IsChecking && !string.IsNullOrWhiteSpace(Address);

    /// <summary>
    /// Validates the typed address by probing it, with a specific message for
    /// each way it can fail; a usable server becomes the session's server.
    /// </summary>
    [RelayCommand(CanExecute = nameof(CanCheck))]
    private async Task CheckAsync()
    {
        AddressError = null;
        ServerAddress parsed;
        try
        {
            parsed = ServerAddress.Parse(Address);
        }
        catch (ServerAddressParseException error)
        {
            AddressError = error.Message;
            return;
        }

        IsChecking = true;
        try
        {
            // The probe never throws for a bad server; it classifies instead.
            var outcome = await ServerProbe.ProbeAsync(parsed);
            if (outcome is ProbeOutcome.Marquee marquee)
            {
                await model.SelectServerAsync(parsed, marquee.Info);
            }
            else
            {
                AddressError = outcome.ProblemMessage(parsed);
            }
        }
        finally
        {
            IsChecking = false;
        }
    }

    private bool CanSignIn => !IsSigningInElsewhere;

    /// <summary>
    /// app/(auth)/login/login-form.tsx, against <c>POST /api/v1/auth/login</c>,
    /// or <c>POST /api/v1/auth/jellyfin</c> after "Sign in with Jellyfin".
    /// </summary>
    [RelayCommand(CanExecute = nameof(CanSignIn))]
    private async Task SignInAsync()
    {
        if (IsSubmitting || IsSigningInElsewhere)
        {
            return;
        }
        FormError = null;
        IsSubmitting = true;
        try
        {
            var user = UsesJellyfin
                ? await model.Session.LoginWithJellyfinAsync(Username, Password)
                : await model.Session.LoginAsync(Username, Password);
            Password = "";
            model.CompleteSignIn(user, interactive: true);
        }
        catch (ApiException error)
        {
            // The password is cleared either way: a wrong one shouldn't sit in the box.
            Password = "";
            FormError = error.Message;
        }
        finally
        {
            IsSubmitting = false;
        }
    }

    /// <summary>app/(auth)/setup/setup-form.tsx, against <c>POST /api/v1/auth/setup</c>.</summary>
    [RelayCommand]
    private async Task SetupAsync()
    {
        if (IsSubmitting)
        {
            return;
        }
        FormError = null;
        IsSubmitting = true;
        try
        {
            var user = await model.Session.SetupAsync(DisplayName, Username, Password);
            Password = "";
            model.CompleteSignIn(user, interactive: true);
        }
        catch (ApiException error) when (error.Kind == ApiErrorKind.SetupComplete)
        {
            // Someone finished setup (maybe on the web) since the probe.
            await model.Session.RefreshInfoAsync();
            model.AuthNotice = error.Message;
            model.ShowAuthForm(AuthForm.SignIn);
        }
        catch (ApiException error)
        {
            FormError = error.Message;
        }
        finally
        {
            IsSubmitting = false;
        }
    }

    private bool CanSignInElsewhere => !IsSigningInElsewhere && !IsSubmitting;

    /// <summary>
    /// "Sign in with Plex": <c>POST /auth/plex/start</c>, the plex.tv page in
    /// the browser, then <c>POST /auth/plex/poll</c> every 2 seconds until
    /// Plex says yes (the token is stored like a password sign-in's), the
    /// server refuses the account, the PIN expires, or Cancel.
    /// </summary>
    [RelayCommand(CanExecute = nameof(CanSignInElsewhere))]
    private Task SignInWithPlexAsync() =>
        SignInElsewhereAsync(quickConnect: false, "Waiting for Plex…", async token =>
        {
            var start = await model.Session.StartPlexSignInAsync(token);
            if (start.Url is not { } url || !await ExternalLinks.OpenAsync(url))
            {
                FormError = PlexPageUnopenedMessage;
                return null;
            }
            return await model.Session.FinishPlexSignInAsync(start, ct: token);
        });

    public const string PlexPageUnopenedMessage = "Couldn't open the Plex sign-in page in your browser.";

    /// <summary>
    /// "Sign in with {name}" (0.44+): <c>POST /auth/sso/start</c>, Marquee's
    /// own "Continue with {name}?" page in the browser (only if it's https
    /// or on this server's address), then <c>POST /auth/sso/poll</c> every 2
    /// seconds until the sign-in is finished there (the token is stored like
    /// a password sign-in's), refused, expired, or Cancel.
    /// </summary>
    [RelayCommand(CanExecute = nameof(CanSignInElsewhere))]
    private Task SignInWithSsoAsync()
    {
        var name = SsoName;
        return SignInElsewhereAsync(quickConnect: false, $"Waiting for {name}…", async token =>
        {
            var start = await model.Session.StartSsoSignInAsync(token);
            var server = model.Session.Server?.BaseUrl;
            if (start.UrlOn(server) is not { } url || !await ExternalLinks.OpenSignInPageAsync(url, server))
            {
                FormError = SsoPageUnopenedMessage(name);
                return null;
            }
            return await model.Session.FinishSsoSignInAsync(start, ct: token);
        });
    }

    public static string SsoPageUnopenedMessage(string name) => $"Couldn't open the {name} sign-in page in your browser.";

    /// <summary>
    /// "Use Quick Connect" (Jellyfin 10.8+, 0.44+): <c>POST
    /// /auth/jellyfin/quick-connect/start</c>, the code on screen, then
    /// <c>POST …/quick-connect/poll</c> every 2 seconds until it's approved
    /// in a Jellyfin app, refused, expired, or Cancel.
    /// </summary>
    [RelayCommand(CanExecute = nameof(CanSignInElsewhere))]
    private Task UseQuickConnectAsync() =>
        SignInElsewhereAsync(quickConnect: true, "", async token =>
        {
            var start = await model.Session.StartQuickConnectAsync(token);
            QuickConnectCode = start.Code;
            return await model.Session.FinishQuickConnectAsync(start, ct: token);
        });

    /// <summary>
    /// Runs one Plex, single sign-on or Quick Connect sign-in: the waiting
    /// state (or the Quick Connect panel) while <paramref name="signIn"/>
    /// runs, the server's message when it fails, nothing when it was
    /// cancelled. <paramref name="signIn"/> answers null after showing its
    /// own error.
    /// </summary>
    private async Task SignInElsewhereAsync(bool quickConnect, string waiting, Func<CancellationToken, Task<User?>> signIn)
    {
        if (IsSigningInElsewhere || IsSubmitting)
        {
            return;
        }
        FormError = null;
        externalCancellation?.Cancel();
        var cancellation = new CancellationTokenSource();
        externalCancellation = cancellation;
        if (quickConnect)
        {
            QuickConnectCode = "";
            IsQuickConnecting = true;
        }
        else
        {
            WaitingLabel = waiting;
            IsWaitingForBrowser = true;
        }
        try
        {
            if (await signIn(cancellation.Token) is { } user)
            {
                Password = "";
                model.CompleteSignIn(user, interactive: true);
            }
        }
        catch (ApiException error)
        {
            // Cancel (or leaving the card) needs no message.
            if (!error.IsCancellation && !cancellation.IsCancellationRequested)
            {
                FormError = error.Message;
            }
        }
        finally
        {
            if (ReferenceEquals(externalCancellation, cancellation))
            {
                externalCancellation = null;
                IsWaitingForBrowser = false;
                IsQuickConnecting = false;
                QuickConnectCode = "";
            }
            cancellation.Dispose();
        }
    }

    /// <summary>"Cancel" while waiting for Plex, the identity provider or a Quick Connect approval.</summary>
    [RelayCommand]
    private void CancelSignInElsewhere() => CancelExternalSignIn();

    /// <summary>Stops a Plex, single sign-on or Quick Connect sign-in in progress (Cancel, leaving the card, the window closing).</summary>
    public void CancelExternalSignIn()
    {
        var cancellation = externalCancellation;
        externalCancellation = null;
        IsWaitingForBrowser = false;
        IsQuickConnecting = false;
        QuickConnectCode = "";
        cancellation?.Cancel();
    }

    private bool CanToggleJellyfin => !IsSigningInElsewhere;

    /// <summary>"Sign in with Jellyfin" / "Sign in with a Marquee account".</summary>
    [RelayCommand(CanExecute = nameof(CanToggleJellyfin))]
    private void ToggleJellyfin()
    {
        FormError = null;
        Password = "";
        IsJellyfinMode = !IsJellyfinMode;
    }

    [RelayCommand]
    private void ShowSetup()
    {
        FormError = null;
        model.ShowAuthForm(AuthForm.Setup);
    }

    [RelayCommand]
    private void ShowSignIn()
    {
        FormError = null;
        model.ShowAuthForm(AuthForm.SignIn);
    }

    [RelayCommand]
    private void ChangeServer()
    {
        FormError = null;
        AddressError = null;
        Password = "";
        model.ChangeServer();
    }

    [RelayCommand]
    private Task RetryAsync() => model.RetryConnectionAsync();

    // MARK: Following the model

    private void OnModelPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(AppModel.AddressPrefill) && !string.IsNullOrEmpty(model.AddressPrefill))
        {
            Address = model.AddressPrefill;
        }
        if (e.PropertyName is nameof(AppModel.Phase) or nameof(AppModel.AuthForm))
        {
            // A stale error from the other card would be confusing.
            FormError = null;
            if (!IsSignInStep)
            {
                // Leaving the sign-in card ends a Plex, single sign-on or
                // Quick Connect sign-in in progress.
                CancelExternalSignIn();
            }
        }
        NotifyDerived();
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
