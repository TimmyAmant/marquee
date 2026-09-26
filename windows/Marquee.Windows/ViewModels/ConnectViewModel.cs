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
        nameof(OffersMediaSignIn),
        nameof(ShowsPlexButton),
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

    /// <summary>The Plex sign-in in progress; cancelled by Cancel, by leaving the sign-in card, and when the window closes.</summary>
    private CancellationTokenSource? plexCancellation;

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
    private bool isSubmitting;

    // MARK: Plex / Jellyfin sign-in

    /// <summary>"Sign in with Jellyfin" was chosen: the same two fields, posted to <c>/auth/jellyfin</c>.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(UsesJellyfin))]
    [NotifyPropertyChangedFor(nameof(SignInSubtitle))]
    [NotifyPropertyChangedFor(nameof(UsernameHeader))]
    [NotifyPropertyChangedFor(nameof(PasswordHeader))]
    [NotifyPropertyChangedFor(nameof(SignInLabel))]
    [NotifyPropertyChangedFor(nameof(JellyfinToggleLabel))]
    private bool isJellyfinMode;

    /// <summary>The browser is open at plex.tv and the poll is running.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsPlexButton))]
    [NotifyCanExecuteChangedFor(nameof(SignInCommand))]
    [NotifyCanExecuteChangedFor(nameof(SignInWithPlexCommand))]
    [NotifyCanExecuteChangedFor(nameof(ToggleJellyfinCommand))]
    private bool isWaitingForPlex;

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

    // MARK: Plex / Jellyfin (server-info.signIn; an older server sends none, so no buttons)

    public bool OffersPlexSignIn => model.Session.ServerInfo?.OffersPlexSignIn == true;
    public bool OffersJellyfinSignIn => model.Session.ServerInfo?.OffersJellyfinSignIn == true;
    public bool OffersMediaSignIn => OffersPlexSignIn || OffersJellyfinSignIn;
    public bool ShowsPlexButton => OffersPlexSignIn && !IsWaitingForPlex;

    /// <summary>The form posts to <c>/auth/jellyfin</c>.</summary>
    public bool UsesJellyfin => IsJellyfinMode && OffersJellyfinSignIn;

    /// <summary>"Jellyfin", or "Emby" when that's the server connected (server-info.signIn.jellyfinName).</summary>
    public string JellyfinName => model.Session.ServerInfo?.JellyfinName ?? MediaServerKindExtensions.DefaultJellyfinName;

    /// <summary>
    /// "New here? Use Sign in with Plex — …" when the admin has new accounts
    /// from Plex/Jellyfin sign-in on: that's how a newcomer gets in.
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

    private bool CanSignIn => !IsWaitingForPlex;

    /// <summary>
    /// app/(auth)/login/login-form.tsx, against <c>POST /api/v1/auth/login</c>,
    /// or <c>POST /api/v1/auth/jellyfin</c> after "Sign in with Jellyfin".
    /// </summary>
    [RelayCommand(CanExecute = nameof(CanSignIn))]
    private async Task SignInAsync()
    {
        if (IsSubmitting || IsWaitingForPlex)
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

    private bool CanSignInWithPlex => !IsWaitingForPlex && !IsSubmitting;

    /// <summary>
    /// "Sign in with Plex": <c>POST /auth/plex/start</c>, the plex.tv page in
    /// the browser, then <c>POST /auth/plex/poll</c> every 2 seconds until
    /// Plex says yes (the token is stored like a password sign-in's), the
    /// server refuses the account, the PIN expires, or Cancel.
    /// </summary>
    [RelayCommand(CanExecute = nameof(CanSignInWithPlex))]
    private async Task SignInWithPlexAsync()
    {
        if (IsWaitingForPlex || IsSubmitting)
        {
            return;
        }
        FormError = null;
        plexCancellation?.Cancel();
        var cancellation = new CancellationTokenSource();
        plexCancellation = cancellation;
        IsWaitingForPlex = true;
        try
        {
            var start = await model.Session.StartPlexSignInAsync(cancellation.Token);
            if (start.Url is not { } url || !await ExternalLinks.OpenAsync(url))
            {
                FormError = PlexPageUnopenedMessage;
                return;
            }
            var user = await model.Session.FinishPlexSignInAsync(start, ct: cancellation.Token);
            Password = "";
            model.CompleteSignIn(user, interactive: true);
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
            if (ReferenceEquals(plexCancellation, cancellation))
            {
                plexCancellation = null;
                IsWaitingForPlex = false;
            }
            cancellation.Dispose();
        }
    }

    public const string PlexPageUnopenedMessage = "Couldn't open the Plex sign-in page in your browser.";

    /// <summary>"Cancel" while waiting for Plex.</summary>
    [RelayCommand]
    private void CancelPlex() => CancelPlexSignIn();

    /// <summary>Stops a Plex sign-in in progress (Cancel, leaving the card, the window closing).</summary>
    public void CancelPlexSignIn()
    {
        var cancellation = plexCancellation;
        plexCancellation = null;
        IsWaitingForPlex = false;
        cancellation?.Cancel();
    }

    private bool CanToggleJellyfin => !IsWaitingForPlex;

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
                // Leaving the sign-in card ends a Plex sign-in in progress.
                CancelPlexSignIn();
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
