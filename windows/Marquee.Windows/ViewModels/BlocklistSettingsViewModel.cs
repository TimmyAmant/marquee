using System.Windows.Input;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Windows.Services;

namespace Marquee.Windows.ViewModels;

/// <summary>
/// A row of "Request blocklist": the title (a link to its page) or
/// "Keyword: anime", the reason under it, and Remove. Immutable; the list is
/// rebuilt from every <c>GET /settings/blocklist</c> answer.
/// </summary>
public sealed class BlocklistRow
{
    public BlocklistRow(BlocklistEntry entry, bool showsDivider, ICommand open, ICommand remove)
    {
        Entry = entry;
        Label = entry.Label;
        ReasonLine = entry.Reason.NonBlank() ?? "";
        IsTitle = entry.TitleId != null;
        IsKeyword = !IsTitle;
        ShowsDivider = showsDivider;
        Open = open;
        Remove = remove;
    }

    public BlocklistEntry Entry { get; }
    public string Label { get; }

    /// <summary>The admin's reason; empty collapses the line.</summary>
    public string ReasonLine { get; }

    /// <summary>A title: the label is a link to its page.</summary>
    public bool IsTitle { get; }
    public bool IsKeyword { get; }
    public bool ShowsDivider { get; }
    public ICommand Open { get; }
    public ICommand Remove { get; }
}

/// <summary>
/// Settings' admin "Request blocklist" (app/settings/blocklist-settings.tsx,
/// 0.41+): what nobody may request — titles blocked from their page, and
/// TMDb keywords/genres added here — each with Remove, and a form to block a
/// keyword with an optional reason. Hidden for a member and on an older
/// server, whose <c>GET /settings/blocklist</c> answers 404.
/// </summary>
public sealed partial class BlocklistSettingsViewModel : ObservableObject
{
    public const string EmptyText = "Nothing blocked. Block a title from its page, or a keyword below.";

    private readonly AppModel model;
    private CancellationTokenSource? loadCancellation;

    public BlocklistSettingsViewModel(AppModel model)
    {
        this.model = model;
    }

    /// <summary>The section shows: the viewer is the admin and the server has a blocklist.</summary>
    [ObservableProperty]
    private bool isVisible;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsEmpty))]
    private IReadOnlyList<BlocklistRow> rows = [];

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(BlockLabel))]
    [NotifyPropertyChangedFor(nameof(CanBlock))]
    [NotifyCanExecuteChangedFor(nameof(BlockCommand))]
    private bool isBlocking;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CanBlock))]
    [NotifyCanExecuteChangedFor(nameof(BlockCommand))]
    private string keyword = "";

    [ObservableProperty]
    private string reason = "";

    /// <summary>A failed Block or Remove, in the section's InfoBar.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasError))]
    private string? error;

    public bool IsEmpty => Rows.Count == 0;
    public bool HasError => Error != null;
    public string BlockLabel => IsBlocking ? "Blocking…" : "Block";
    public bool CanBlock => !IsBlocking && Keyword.NonBlank() != null;

    /// <summary>
    /// <c>GET /settings/blocklist</c> for the admin; hides the section for a
    /// member and on a server that answers 404. Any other failure keeps
    /// whatever showed before (hidden the first time).
    /// </summary>
    public async Task LoadAsync(bool isAdmin)
    {
        loadCancellation?.Cancel();
        if (!isAdmin)
        {
            IsVisible = false;
            Rows = [];
            return;
        }
        var cancellation = new CancellationTokenSource();
        loadCancellation = cancellation;
        var token = cancellation.Token;
        try
        {
            var entries = await model.Api.Blocklist.ListAsync(token);
            if (!token.IsCancellationRequested)
            {
                Apply(entries);
                IsVisible = true;
            }
        }
        catch (ApiException failure) when (failure.Kind is ApiErrorKind.NotFound or ApiErrorKind.Forbidden)
        {
            if (!token.IsCancellationRequested)
            {
                IsVisible = false;
            }
        }
        catch (ApiException)
        {
            // Cancelled, or the list couldn't load: nothing to change.
        }
    }

    public void Cancel() => loadCancellation?.Cancel();

    private void Apply(IReadOnlyList<BlocklistEntry> entries)
    {
        Rows = entries
            .Select((entry, index) => new BlocklistRow(entry, index > 0, OpenCommand, RemoveCommand))
            .ToList();
    }

    /// <summary>A title row's link: its page.</summary>
    [RelayCommand]
    private void Open(BlocklistRow? row)
    {
        if (row?.Entry.TitleId is { } id)
        {
            model.OpenTitle(id);
        }
    }

    /// <summary>"Remove" (<c>DELETE /settings/blocklist/{id}</c>), then the list is re-read.</summary>
    [RelayCommand]
    private async Task RemoveAsync(BlocklistRow? row)
    {
        if (row == null)
        {
            return;
        }
        Error = null;
        try
        {
            await model.Api.Blocklist.RemoveAsync(row.Entry.Id);
        }
        catch (ApiException failure) when (failure.Kind != ApiErrorKind.NotFound)
        {
            // "Not on the blocklist." means it's already gone: just re-read.
            Error = failure.Message;
            return;
        }
        await LoadAsync(isAdmin: true);
    }

    /// <summary>"Block a keyword or genre" (<c>POST /settings/blocklist</c>): the form clears on success.</summary>
    [RelayCommand(CanExecute = nameof(CanBlock))]
    private async Task BlockAsync()
    {
        if (!CanBlock)
        {
            return;
        }
        IsBlocking = true;
        Error = null;
        try
        {
            await model.Api.Blocklist.BlockKeywordAsync(Keyword, Reason);
            Keyword = "";
            Reason = "";
            await LoadAsync(isAdmin: true);
        }
        catch (ApiException failure)
        {
            Error = failure.Message;
        }
        finally
        {
            IsBlocking = false;
        }
    }
}
