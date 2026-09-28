using Marquee.Core.Localization;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Marquee.Windows.Controls;

/// <summary>
/// The reasons to tell a requester (components/decline-reason-chooser.tsx):
/// one of the household's presets, or "Other" and the admin's own words.
/// The Decline dialog needs one; with <c>optional</c> (the Remove from
/// Radarr/Sonarr dialog) "No reason" comes first and is chosen to begin with.
/// </summary>
public sealed partial class ReasonChooser : UserControl
{
    /// <summary>The free-text choice, always the last option. Only the chooser's label: what gets sent is the admin's own words, never this word itself.</summary>
    public static string Other => Loc.Get("Decline_OtherChoice");

    /// <summary>The server's cap (api-v1.md, reject); the TextBox enforces it too.</summary>
    public const int MaxReasonLength = 200;

    /// <summary>
    /// The website's preset list, for a server older than 0.28.0 that sends
    /// no <c>rejectionReasons</c> (and for the title page, which has no queue
    /// to take them from). Such a server ignores the reason anyway, but the
    /// admin still gets the same chooser.
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
    private readonly bool optional;

    /// <param name="reasons">The server's presets; empty falls back to <see cref="DefaultReasons"/>.</param>
    /// <param name="optional">List "No reason" first, chosen to begin with.</param>
    public ReasonChooser(IReadOnlyList<string> reasons, bool optional = false)
    {
        this.optional = optional;
        var presets = reasons.Count > 0 ? reasons : DefaultReasons;
        var all = new List<string>();
        if (optional)
        {
            all.Add(Loc.Get("Decline_NoReason"));
        }
        all.AddRange(presets);
        all.Add(Other);
        options = all;
        InitializeComponent();
        CustomReasonBox.MaxLength = MaxReasonLength;
        ReasonButtons.ItemsSource = options;
        if (optional)
        {
            ReasonButtons.SelectedIndex = 0;
        }
    }

    /// <summary>The choice or the typed words changed: <see cref="Reason"/> and <see cref="IsValid"/> may read differently.</summary>
    public event EventHandler? Changed;

    /// <summary>What gets sent: the preset, or the trimmed custom text; null for "No reason", or while nothing valid is chosen.</summary>
    public string? Reason
    {
        get
        {
            var index = ReasonButtons.SelectedIndex;
            if (index < 0 || index >= options.Count || (optional && index == 0))
            {
                return null;
            }
            if (!IsOtherChosen)
            {
                return options[index];
            }
            var custom = CustomReasonBox.Text.Trim();
            return custom.Length == 0 ? null : custom;
        }
    }

    /// <summary>
    /// Ready to go: a reason (or, when optional, "No reason" or a preset).
    /// "Other" always needs its words.
    /// </summary>
    public bool IsValid => optional
        ? ReasonButtons.SelectedIndex >= 0 && (!IsOtherChosen || Reason != null)
        : Reason != null;

    /// <summary>"Other" is the last option (compared by place: a preset could read the same).</summary>
    private bool IsOtherChosen => ReasonButtons.SelectedIndex == options.Count - 1;

    private void OnReasonChanged(object sender, SelectionChangedEventArgs e)
    {
        CustomReasonBox.Visibility = IsOtherChosen ? Visibility.Visible : Visibility.Collapsed;
        if (IsOtherChosen)
        {
            CustomReasonBox.Focus(FocusState.Programmatic);
        }
        Changed?.Invoke(this, EventArgs.Empty);
    }

    private void OnCustomReasonChanged(object sender, TextChangedEventArgs e) => Changed?.Invoke(this, EventArgs.Empty);
}
