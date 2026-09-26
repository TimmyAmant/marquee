using Marquee.Core.Api;
using Marquee.Core.Models;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Marquee.Windows.Controls;

/// <summary>
/// "Report a problem" on a title. Like the season picker it sends the report
/// itself (through <c>submit</c>) before closing, so the server's refusal
/// ("You have a lot of open reports already. …") shows inline. What the
/// form checks first is <see cref="IssueReportForm.Build"/>. The caller sets
/// <c>XamlRoot</c> before showing it, as every ContentDialog needs.
/// </summary>
public sealed partial class ReportProblemDialog : ContentDialog
{
    private readonly Func<ReportIssueBody, Task> submit;
    private readonly IReadOnlyList<IssueKind> kinds = IssueKind.Known;
    private readonly IReadOnlyList<IssueSeasonChoice> seasonChoices;
    private readonly bool isTv;
    private bool pending;

    /// <param name="isTv">A show: the season and episode row shows (when it has seasons).</param>
    /// <param name="seasonNumbers">The show's seasons, for the picker; empty for a movie.</param>
    /// <param name="submit">Sends <c>POST …/issues</c>; throws <see cref="ApiException"/> on a refusal.</param>
    public ReportProblemDialog(bool isTv, IEnumerable<int> seasonNumbers, Func<ReportIssueBody, Task> submit)
    {
        this.submit = submit;
        this.isTv = isTv;
        seasonChoices = IssueReportForm.SeasonChoices(seasonNumbers);
        InitializeComponent();
        KindButtons.ItemsSource = kinds.Select(kind => kind.Label).ToList();
        if (isTv && seasonChoices.Count > 1)
        {
            SeasonBox.ItemsSource = seasonChoices.Select(choice => choice.Label).ToList();
            SeasonBox.SelectedIndex = 0;
            EpisodeRow.Visibility = Visibility.Visible;
        }
    }

    private IssueKind? SelectedKind =>
        KindButtons.SelectedIndex is var index && index >= 0 && index < kinds.Count ? kinds[index] : null;

    private int? SelectedSeason =>
        SeasonBox.SelectedIndex is var index && index >= 0 && index < seasonChoices.Count ? seasonChoices[index].SeasonNumber : null;

    /// <summary>The note's label follows the kind: "What's wrong?" for Something else, where it's required.</summary>
    private void OnKindChanged(object sender, SelectionChangedEventArgs e)
    {
        NoteBox.Header = IssueReportForm.MessageHeader(SelectedKind);
        ErrorText.Visibility = Visibility.Collapsed;
    }

    /// <summary>An episode needs its season: the box is off (and emptied) for the whole show.</summary>
    private void OnSeasonChanged(object sender, SelectionChangedEventArgs e)
    {
        var hasSeason = SelectedSeason != null;
        EpisodeBox.IsEnabled = hasSeason && !pending;
        if (!hasSeason)
        {
            EpisodeBox.Text = "";
        }
    }

    private void Update()
    {
        PrimaryButtonText = pending ? "Sending…" : "Send report";
        IsPrimaryButtonEnabled = !pending;
        KindButtons.IsEnabled = !pending;
        SeasonBox.IsEnabled = !pending;
        EpisodeBox.IsEnabled = !pending && SelectedSeason != null;
        NoteBox.IsEnabled = !pending;
    }

    private void ShowError(string message)
    {
        ErrorText.Text = message;
        ErrorText.Visibility = Visibility.Visible;
    }

    /// <summary>Checks the form, then sends; a problem cancels the close and says what's wrong.</summary>
    private async void OnPrimaryButtonClick(ContentDialog sender, ContentDialogButtonClickEventArgs args)
    {
        if (pending)
        {
            args.Cancel = true;
            return;
        }
        var (body, error) = IssueReportForm.Build(SelectedKind, NoteBox.Text, isTv, SelectedSeason, EpisodeBox.Text);
        if (body == null)
        {
            args.Cancel = true;
            ShowError(error ?? "Pick what's wrong.");
            return;
        }
        var deferral = args.GetDeferral();
        pending = true;
        ErrorText.Visibility = Visibility.Collapsed;
        Update();
        try
        {
            await submit(body);
        }
        catch (ApiException failure)
        {
            args.Cancel = true;
            ShowError(failure.Message);
        }
        finally
        {
            pending = false;
            Update();
            deferral.Complete();
        }
    }

    /// <summary>Escape or Cancel waits for a report already on its way, so its outcome isn't lost.</summary>
    private void OnClosing(ContentDialog sender, ContentDialogClosingEventArgs args)
    {
        if (pending && args.Result != ContentDialogResult.Primary)
        {
            args.Cancel = true;
        }
    }
}
