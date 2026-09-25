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
    /// <summary>The free-text choice. Only the chooser's label: what gets sent is the admin's own words, never this word itself.</summary>
    public const string Other = "Other";

    /// <summary>The server's cap (api-v1.md, reject); the TextBox enforces it too.</summary>
    public const int MaxReasonLength = 200;

    /// <summary>
    /// The website's preset list, for a server older than 0.28.0 that sends
    /// no <c>rejectionReasons</c>. Such a server ignores the reason anyway,
    /// but the admin still gets the same chooser.
    /// </summary>
    public static IReadOnlyList<string> DefaultReasons { get; } =
    [
        "Already available on a streaming service we have",
        "Not released yet, ask again once it's out",
        "Not enough space on the server right now",
        "Not a fit for the household library",
        "Couldn't find a good copy of it",
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
        ExplanationText.Text =
            $"Let {requester} know why \"{title}\" isn't being added. They'll see it under Declined on their Requests page and in the notification.";
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
            var choice = options[index];
            if (choice != Other)
            {
                return choice;
            }
            var custom = CustomReasonBox.Text.Trim();
            return custom.Length == 0 ? null : custom;
        }
    }

    private bool IsOtherChosen => ReasonButtons.SelectedIndex >= 0
        && ReasonButtons.SelectedIndex < options.Count
        && options[ReasonButtons.SelectedIndex] == Other;

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
