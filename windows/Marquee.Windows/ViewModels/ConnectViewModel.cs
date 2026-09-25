using System.ComponentModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core.Api;
using Marquee.Core.Connection;
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
    ];

    private readonly AppModel model;

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
    private bool isSubmitting;

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

    // MARK: Labels

    public bool HasAddressError => AddressError != null;
    public bool HasFormError => FormError != null;
    public string CheckLabel => IsChecking ? "Checking…" : "Check";
    public string SignInLabel => IsSubmitting ? "Signing in…" : "Sign in";
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

    /// <summary>app/(auth)/login/login-form.tsx, against <c>POST /api/v1/auth/login</c>.</summary>
    [RelayCommand]
    private async Task SignInAsync()
    {
        if (IsSubmitting)
        {
            return;
        }
        FormError = null;
        IsSubmitting = true;
        try
        {
            var user = await model.Session.LoginAsync(Username, Password);
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
