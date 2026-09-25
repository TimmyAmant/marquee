using Marquee.Core.Api;
using Marquee.Core.Models;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Marquee.Windows.Controls;

/// <summary>
/// "Add a household member". Create account sends <c>POST /users</c>
/// through the function it was given and, when the server refuses (a taken
/// username, a short password), shows the server's message and stays open
/// so nothing typed is lost. After <c>ShowAsync</c> returns
/// <c>ContentDialogResult.Primary</c>, <see cref="Created"/> is the new
/// account. The caller sets <c>XamlRoot</c> before showing it.
/// </summary>
public sealed partial class AddMemberDialog : ContentDialog
{
    private const string CreateLabel = "Create account";
    private const string CreatingLabel = "Creating…";

    private readonly Func<CreateUserRequest, Task<HouseholdMember>> create;
    private bool isSaving;

    public AddMemberDialog(Func<CreateUserRequest, Task<HouseholdMember>> create)
    {
        this.create = create;
        InitializeComponent();
    }

    /// <summary>The account the server created; null until Create account succeeds.</summary>
    // Internal: see HouseholdMemberRow.Member (a public Core record on a
    // XAML type fails the build with CS9035).
    internal HouseholdMember? Created { get; private set; }

    private bool CanCreate => UsernameBox.Text.Trim().Length > 0 && PasswordInput.Password.Length > 0;

    private void OnUsernameChanged(object sender, TextChangedEventArgs e) => Validate();

    private void OnPasswordChanged(object sender, RoutedEventArgs e) => Validate();

    private void Validate() => IsPrimaryButtonEnabled = !isSaving && CanCreate;

    /// <summary>Holds the dialog open (a deferral) while the request runs, and keeps it open on failure.</summary>
    private async void OnCreateClick(ContentDialog sender, ContentDialogButtonClickEventArgs args)
    {
        if (isSaving || !CanCreate)
        {
            args.Cancel = true;
            return;
        }
        var request = new CreateUserRequest(
            UsernameBox.Text.Trim(),
            PasswordInput.Password,
            DisplayNameBox.Text.Trim().NonBlank());

        var deferral = args.GetDeferral();
        isSaving = true;
        IsPrimaryButtonEnabled = false;
        PrimaryButtonText = CreatingLabel;
        ErrorBar.IsOpen = false;
        try
        {
            Created = await create(request);
        }
        catch (ApiException error)
        {
            ErrorBar.Message = error.Message;
            ErrorBar.IsOpen = true;
            args.Cancel = true;
        }
        finally
        {
            isSaving = false;
            PrimaryButtonText = CreateLabel;
            Validate();
            deferral.Complete();
        }
    }

    /// <summary>Cancel and Esc wait for a request in flight, so its outcome is never lost.</summary>
    private void OnDialogClosing(ContentDialog sender, ContentDialogClosingEventArgs args)
    {
        if (isSaving)
        {
            args.Cancel = true;
        }
    }
}
