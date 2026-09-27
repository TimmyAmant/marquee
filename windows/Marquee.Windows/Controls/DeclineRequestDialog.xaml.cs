using Marquee.Core.Localization;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Marquee.Windows.Controls;

/// <summary>
/// "Decline request": pick one of the household's reasons, or "Other" and
/// type one. After <c>ShowAsync</c> returns <c>ContentDialogResult.Primary</c>,
/// <see cref="Reason"/> is the text to send to <c>POST /requests/{id}/reject</c>.
/// The caller sets <c>XamlRoot</c> before showing it, as every ContentDialog needs.
/// </summary>
public sealed partial class DeclineRequestDialog : ContentDialog
{
    /// <summary>The free-text choice, always the last option. Only the chooser's label: what gets sent is the admin's own words, never this word itself.</summary>
    public static string Other => Loc.Get("Decline_OtherChoice");

    /// <summary>The server's cap (api-v1.md, reject); the TextBox enforces it too.</summary>
    public const int MaxReasonLength = 200;

    /// <summary>
    /// The website's preset list, for a server older than 0.28.0 that sends
    /// no <c>rejectionReasons</c>. Such a server ignores the reason anyway,
    /// but the admin still gets the same chooser.
    /// </summary>
    public static IReadOnlyList<string> DefaultReasons =>
    [
        Loc.Get("Decline_DefaultStreaming"),
        Loc.Get("Decline_DefaultUnreleased"),
        Loc.Get("Decline_DefaultNoSpace"),
        Loc.Get("Decline_DefaultNotAFit"),
        Loc.Get("Decline_DefaultNoCopy"),
    ];

    private readonly IReadOnlyList<string> options;

    /// <param name="title">The requested title, for the explanation line.</param>
    /// <param name="requester">Who asked, for the explanation line.</param>
    /// <param name="reasons">The server's presets; empty falls back to <see cref="DefaultReasons"/>.</param>
    public DeclineRequestDialog(string title, string requester, IReadOnlyList<string> reasons)
    {
        var presets = reasons.Count > 0 ? reasons : DefaultReasons;
        options = presets.Append(Other).ToList();
        InitializeComponent();
        ExplanationText.Text = Loc.Format("Decline_Explanation", requester, title);
        ReasonButtons.ItemsSource = options;
    }

    /// <summary>What Decline sends: the preset, or the trimmed custom text; null while nothing valid is chosen.</summary>
    public string? Reason
    {
        get
        {
            var index = ReasonButtons.SelectedIndex;
            if (index < 0 || index >= options.Count)
            {
                return null;
            }
            if (index != options.Count - 1)
            {
                return options[index];
            }
            var custom = CustomReasonBox.Text.Trim();
            return custom.Length == 0 ? null : custom;
        }
    }

    /// <summary>"Other" is the last option (compared by place: a preset could read the same).</summary>
    private bool IsOtherChosen => ReasonButtons.SelectedIndex == options.Count - 1;

    private void OnReasonChanged(object sender, SelectionChangedEventArgs e)
    {
        CustomReasonBox.Visibility = IsOtherChosen ? Visibility.Visible : Visibility.Collapsed;
        if (IsOtherChosen)
        {
            CustomReasonBox.Focus(FocusState.Programmatic);
        }
        Validate();
    }

    private void OnCustomReasonChanged(object sender, TextChangedEventArgs e) => Validate();

    private void Validate() => IsPrimaryButtonEnabled = Reason != null;
}
