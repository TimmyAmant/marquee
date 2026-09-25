using System.ComponentModel;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Windows.ViewModels;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Marquee.Windows.Controls;

/// <summary>
/// "Import from Plex/Jellyfin". Loads <c>GET /users/import/{server}</c>
/// when it opens; Import sends <c>POST /users/import/{server}</c> with the
/// ticked ids through the functions it was given, and keeps the dialog open
/// with the server's message when that fails. After <c>ShowAsync</c> returns
/// <c>ContentDialogResult.Primary</c>, <see cref="Result"/> is what was
/// imported. The caller sets <c>XamlRoot</c> before showing it.
/// </summary>
public sealed partial class ImportMembersDialog : ContentDialog
{
    private const string ImportLabel = "Import";
    private const string ImportingLabel = "Importing…";

    private readonly MediaServerKind server;
    private readonly Func<MediaServerKind, Task<IReadOnlyList<ImportCandidate>>> load;
    private readonly Func<MediaServerKind, IReadOnlyList<ExternalId>, Task<ImportUsersResult>> import;
    private List<ImportCandidateRow> rows = [];
    private bool isSaving;

    public ImportMembersDialog(
        MediaServerKind server,
        Func<MediaServerKind, Task<IReadOnlyList<ImportCandidate>>> load,
        Func<MediaServerKind, IReadOnlyList<ExternalId>, Task<ImportUsersResult>> import)
    {
        this.server = server;
        this.load = load;
        this.import = import;
        InitializeComponent();
        Title = $"Import from {server.Label()}";
        IntroText.Text = $"Each person you pick gets a member account linked to their {server.Label()} account, so they can sign in with it.";
    }

    /// <summary>What the server imported; null until Import succeeds.</summary>
    // Internal: see HouseholdMemberRow.Member (a public Core record on a
    // XAML type fails the build with CS9035).
    internal ImportUsersResult? Result { get; private set; }

    private List<ExternalId> PickedIds => rows.Where(row => row.IsPicked).Select(row => row.Id).ToList();

    private async void OnOpened(ContentDialog sender, ContentDialogOpenedEventArgs args)
    {
        try
        {
            var candidates = await load(server);
            rows = candidates.Select(candidate => new ImportCandidateRow(candidate)).ToList();
            foreach (var row in rows)
            {
                row.PropertyChanged += OnRowChanged;
            }
            CandidateList.ItemsSource = rows;
            if (rows.Count == 0)
            {
                EmptyText.Text = $"No {server.Label()} users to import.";
                EmptyText.Visibility = Visibility.Visible;
            }
        }
        catch (ApiException error)
        {
            ErrorBar.Message = error.Message;
            ErrorBar.IsOpen = true;
        }
        finally
        {
            LoadingRing.IsActive = false;
            LoadingRing.Visibility = Visibility.Collapsed;
            Validate();
        }
    }

    private void OnRowChanged(object? sender, PropertyChangedEventArgs e) => Validate();

    private void Validate()
    {
        var count = PickedIds.Count;
        IsPrimaryButtonEnabled = !isSaving && count > 0;
        if (!isSaving)
        {
            PrimaryButtonText = count > 0 ? $"{ImportLabel} {count}" : ImportLabel;
        }
    }

    /// <summary>Holds the dialog open (a deferral) while the request runs, and keeps it open on failure.</summary>
    private async void OnImportClick(ContentDialog sender, ContentDialogButtonClickEventArgs args)
    {
        var ids = PickedIds;
        if (isSaving || ids.Count == 0)
        {
            args.Cancel = true;
            return;
        }
        var deferral = args.GetDeferral();
        isSaving = true;
        IsPrimaryButtonEnabled = false;
        PrimaryButtonText = ImportingLabel;
        ErrorBar.IsOpen = false;
        try
        {
            Result = await import(server, ids);
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
