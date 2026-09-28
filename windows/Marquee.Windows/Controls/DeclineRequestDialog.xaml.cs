using Marquee.Core.Localization;
using Microsoft.UI.Xaml.Controls;

namespace Marquee.Windows.Controls;

/// <summary>
/// "Decline request": pick one of the household's reasons, or "Other" and
/// type one (<see cref="ReasonChooser"/>). After <c>ShowAsync</c> returns
/// <c>ContentDialogResult.Primary</c>, <see cref="Reason"/> is the text to
/// send to <c>POST /requests/{id}/reject</c>. The caller sets <c>XamlRoot</c>
/// before showing it, as every ContentDialog needs.
/// </summary>
public sealed partial class DeclineRequestDialog : ContentDialog
{
    private readonly ReasonChooser chooser;

    /// <param name="title">The requested title, for the explanation line.</param>
    /// <param name="requester">Who asked, for the explanation line.</param>
    /// <param name="reasons">The server's presets; empty falls back to <see cref="ReasonChooser.DefaultReasons"/>.</param>
    /// <param name="approved">
    /// "Can't get it" (0.68+): the request was already approved, so its
    /// requester hears it couldn't be added after all.
    /// </param>
    public DeclineRequestDialog(string title, string requester, IReadOnlyList<string> reasons, bool approved = false)
    {
        InitializeComponent();
        ExplanationText.Text = Loc.Format(approved ? "Decline_ExplanationApproved" : "Decline_Explanation", requester, title);
        chooser = new ReasonChooser(reasons);
        chooser.Changed += (_, _) => IsPrimaryButtonEnabled = chooser.IsValid;
        Body.Children.Add(chooser);
    }

    /// <summary>What Decline sends: the preset, or the trimmed custom text; null while nothing valid is chosen.</summary>
    public string? Reason => chooser.Reason;
}
