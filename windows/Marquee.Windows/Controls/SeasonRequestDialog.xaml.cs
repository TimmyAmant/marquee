using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Marquee.Windows.Controls;

/// <summary>
/// The season picker. Unlike the other dialogs it sends the request itself
/// (through <c>submit</c>) before closing, so the server's refusal ("Those
/// seasons are already in your library or on their way.") shows inline and
/// the viewer can change the selection. The caller sets <c>XamlRoot</c>
/// before showing it, as every ContentDialog needs.
/// </summary>
public sealed partial class SeasonRequestDialog : ContentDialog
{
    private readonly SeasonPickerSelection selection;
    private readonly Func<IReadOnlyList<int>, Task> submit;
    private readonly List<SeasonPickerRow> rows;
    private bool pending;
    private bool syncing;

    /// <param name="title">The show, for the explanation line.</param>
    /// <param name="seasons">Every season of the title, in the accordion's order.</param>
    /// <param name="submit">Sends <c>POST …/request</c> with the picked seasons; throws <see cref="ApiException"/> on a refusal.</param>
    public SeasonRequestDialog(string title, IReadOnlyList<SeasonSummary> seasons, Func<IReadOnlyList<int>, Task> submit)
    {
        this.submit = submit;
        selection = new SeasonPickerSelection(seasons);
        rows = seasons.Select(season => new SeasonPickerRow(season, OnRowChanged)).ToList();
        InitializeComponent();
        ExplanationText.Text =
            $"Pick the seasons of \"{title}\" you'd like added. Seasons already in the library or on their way can't be picked again.";
        SelectAllBox.Visibility = selection.Requestable.Count > 0 ? Visibility.Visible : Visibility.Collapsed;
        RowsRepeater.ItemsSource = rows;
        Update();
    }

    private void OnRowChanged(SeasonPickerRow row)
    {
        if (syncing)
        {
            return;
        }
        selection.Set(row.SeasonNumber, row.IsChecked == true);
        Update();
    }

    /// <summary>"Select all": every requestable season, or none once they all are.</summary>
    private void OnSelectAllClick(object sender, RoutedEventArgs e)
    {
        selection.ToggleAll();
        syncing = true;
        foreach (var row in rows)
        {
            row.IsChecked = selection.IsSelected(row.SeasonNumber);
        }
        syncing = false;
        Update();
    }

    /// <summary>The Request button's text and state, and the select-all box, from the selection.</summary>
    private void Update()
    {
        PrimaryButtonText = pending ? "Requesting…" : selection.SubmitTitle;
        IsPrimaryButtonEnabled = !pending && selection.Seasons.Count > 0;
        SelectAllBox.IsChecked = selection.AllSelected;
        SelectAllBox.IsEnabled = !pending;
        RowsScroller.IsEnabled = !pending;
    }

    /// <summary>Sends the request; a failure cancels the close and shows the server's message.</summary>
    private async void OnPrimaryButtonClick(ContentDialog sender, ContentDialogButtonClickEventArgs args)
    {
        var seasons = selection.Seasons;
        if (pending || seasons.Count == 0)
        {
            args.Cancel = true;
            return;
        }
        var deferral = args.GetDeferral();
        pending = true;
        ErrorText.Visibility = Visibility.Collapsed;
        Update();
        try
        {
            await submit(seasons);
        }
        catch (ApiException error)
        {
            args.Cancel = true;
            ErrorText.Text = error.Message;
            ErrorText.Visibility = Visibility.Visible;
        }
        finally
        {
            pending = false;
            Update();
            deferral.Complete();
        }
    }

    /// <summary>Escape or Cancel waits for a request already on its way, so its outcome isn't lost.</summary>
    private void OnClosing(ContentDialog sender, ContentDialogClosingEventArgs args)
    {
        if (pending && args.Result != ContentDialogResult.Primary)
        {
            args.Cancel = true;
        }
    }
}
