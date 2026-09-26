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
///
/// Built from a <see cref="RequestEditOptions"/> it is "Edit" on a pending
/// request instead (0.46+): the request's seasons ticked, "The whole series"
/// / "Just these seasons", "In 4K" where it's set up, and "Save changes",
/// with Core's <see cref="RequestEditForm"/> deciding what's allowed and sent.
/// </summary>
public sealed partial class SeasonRequestDialog : ContentDialog
{
    private readonly SeasonPickerSelection selection;
    private readonly Func<IReadOnlyList<int>, Task>? submit;
    private readonly RequestEditForm? form;
    private readonly Func<RequestEdit, Task>? save;
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

    /// <summary>"Edit" on a pending request.</summary>
    /// <param name="options">What <c>GET /requests/{id}/edit-options</c> offered.</param>
    /// <param name="save">Sends <c>PATCH /requests/{id}</c>; throws <see cref="ApiException"/> on a refusal, which stays in the dialog.</param>
    public SeasonRequestDialog(RequestEditOptions options, Func<RequestEdit, Task> save)
    {
        this.save = save;
        form = new RequestEditForm(options);
        selection = form.Selection;
        rows = options.SeasonRows.Select(row => new SeasonPickerRow(row, OnRowChanged)).ToList();
        InitializeComponent();
        Title = RequestEditForm.Heading;
        ExplanationText.Text = options.Title;
        EditOptionsPanel.Visibility = Visibility.Visible;
        var scope = form.IsTv ? Visibility.Visible : Visibility.Collapsed;
        WholeSeriesRadio.Visibility = scope;
        JustTheseRadio.Visibility = scope;
        FourKBox.Content = form.FourKLabel;
        FourKBox.Visibility = form.OffersFourK ? Visibility.Visible : Visibility.Collapsed;
        NothingToChangeText.Text = RequestEditForm.NothingToChangeMessage;
        NothingToChangeText.Visibility = form.HasNothingToChange ? Visibility.Visible : Visibility.Collapsed;
        RowsBorder.Visibility = rows.Count > 0 ? Visibility.Visible : Visibility.Collapsed;
        SelectAllBox.Visibility = form.IsTv && selection.Requestable.Count > 0 ? Visibility.Visible : Visibility.Collapsed;

        syncing = true;
        foreach (var row in rows)
        {
            row.IsChecked = selection.IsSelected(row.SeasonNumber);
        }
        WholeSeriesRadio.IsChecked = form.WholeSeries;
        JustTheseRadio.IsChecked = !form.WholeSeries;
        FourKBox.IsChecked = form.Is4k;
        syncing = false;

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

    /// <summary>"The whole series" / "Just these seasons".</summary>
    private void OnScopeChecked(object sender, RoutedEventArgs e)
    {
        if (syncing || form == null)
        {
            return;
        }
        form.WholeSeries = WholeSeriesRadio.IsChecked == true;
        Update();
    }

    /// <summary>"In 4K": always the whole show, so the scope and the list give way while it's ticked.</summary>
    private void OnFourKClick(object sender, RoutedEventArgs e)
    {
        if (form == null)
        {
            return;
        }
        form.Is4k = FourKBox.IsChecked == true;
        Update();
    }

    /// <summary>The primary button's text and state, and the other controls, from the selection (and the edit's choices).</summary>
    private void Update()
    {
        if (form != null)
        {
            PrimaryButtonText = RequestEditForm.SubmitTitle(pending);
            IsPrimaryButtonEnabled = !pending && form.CanSave;
            SelectAllBox.IsEnabled = !pending && form.ListEnabled;
            RowsScroller.IsEnabled = !pending && form.ListEnabled;
            WholeSeriesRadio.IsEnabled = !pending && form.ScopeEnabled;
            JustTheseRadio.IsEnabled = !pending && form.ScopeEnabled;
            FourKBox.IsEnabled = !pending;
        }
        else
        {
            PrimaryButtonText = pending ? "Requesting…" : selection.SubmitTitle;
            IsPrimaryButtonEnabled = !pending && selection.Seasons.Count > 0;
            SelectAllBox.IsEnabled = !pending;
            RowsScroller.IsEnabled = !pending;
        }
        SelectAllBox.IsChecked = selection.AllSelected;
    }

    /// <summary>Sends the request (or the change); a failure cancels the close and shows the server's message.</summary>
    private async void OnPrimaryButtonClick(ContentDialog sender, ContentDialogButtonClickEventArgs args)
    {
        Func<Task>? send = null;
        if (!pending)
        {
            if (form != null && save != null && form.CanSave)
            {
                var edit = form.Edit;
                send = () => save(edit);
            }
            else if (form == null && submit != null && selection.Seasons.Count > 0)
            {
                var seasons = selection.Seasons;
                send = () => submit(seasons);
            }
        }
        if (send == null)
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
            await send();
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
