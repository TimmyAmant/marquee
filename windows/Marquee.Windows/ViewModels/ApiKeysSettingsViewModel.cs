using System.Windows.Input;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core.Api;
using Marquee.Core.Localization;
using Marquee.Core.Models;
using Marquee.Windows.Services;

namespace Marquee.Windows.ViewModels;

/// <summary>
/// A row of "API keys": the name with its "Read-only"/"Full access" pill
/// (and "Expired"), then "as Kid", the hint and the dates, and Revoke.
/// Immutable; the list is rebuilt after every change.
/// </summary>
public sealed class ApiKeyRow
{
    public ApiKeyRow(ApiKey key, DateTimeOffset now, bool showsDivider, ICommand revoke)
    {
        Key = key;
        Name = key.Name;
        ScopeBadge = key.ScopeLabel;
        ExpiredBadge = key.Expired ? Loc.Get("ApiKeys_Expired") : "";
        DetailsLine = string.Join(
            " · ",
            new[] { key.ActAsLabel, key.Hint + "…", key.CreatedLabel, key.LastUsedLabel(now), key.ExpiryLabel }.OfType<string>());
        ShowsDivider = showsDivider;
        Revoke = revoke;
    }

    public ApiKey Key { get; }
    public string Name { get; }

    /// <summary>"Read-only" or "Full access".</summary>
    public string ScopeBadge { get; }
    public BadgeTone ScopeTone { get; } = BadgeTone.Neutral;

    /// <summary>"Expired", or empty (the pill collapses).</summary>
    public string ExpiredBadge { get; }
    public BadgeTone ExpiredTone { get; } = BadgeTone.Missing;

    /// <summary>"as Kid · mq_x9Tb… · Created Sep 20, 2026 · Never used · Expires Dec 19, 2026".</summary>
    public string DetailsLine { get; }

    public bool ShowsDivider { get; }
    public ICommand Revoke { get; }
}

/// <summary>
/// Settings › Integrations › "API keys" (0.47+), the admin's: keys for
/// dashboards like Homepage or Homarr, scripts and other apps. The list with
/// Revoke (after a confirmation), and a form to create one (name, Read-only
/// or Full access, who it acts as, when it expires). The new key's secret
/// shows once, with Copy, until Done. Hidden on an older server, whose
/// <c>GET /settings/api-keys</c> answers 404. The rules live in
/// <see cref="ApiKeysModel"/>; this adds the bindable state.
/// </summary>
public sealed partial class ApiKeysSettingsViewModel : ObservableObject
{
    public static string EmptyText => Loc.Get("ApiKeys_Empty");

    private readonly ApiKeysModel keys;
    private CancellationTokenSource? loadCancellation;

    /// <summary>The "Act as" choices the ComboBox shows, in <see cref="ActAsChoices"/>' order.</summary>
    private IReadOnlyList<ApiKeyActAsChoice> shownActAs = [ApiKeyActAsChoice.Admin];

    public ApiKeysSettingsViewModel(AppModel model)
    {
        keys = new ApiKeysModel(() => model.Api);
    }

    /// <summary>Set by the page: "Revoke {name}?", true only when confirmed.</summary>
    internal Func<ApiKeyRow, Task<bool>>? RevokePrompt { get; set; }

    public string Description => ApiKeyLabels.Description;
    public string CopyNowText => ApiKeyLabels.CopyNowMessage;

    /// <summary><c>GET /settings/api-keys</c> answered: the section shows (never on an older server).</summary>
    [ObservableProperty]
    private bool isAvailable;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsEmpty))]
    private IReadOnlyList<ApiKeyRow> rows = [];

    public bool IsEmpty => Rows.Count == 0;

    /// <summary>A failed Create or Revoke.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasError))]
    private string? error;

    public bool HasError => Error != null;

    // MARK: The create form

    [ObservableProperty]
    private string name = "";

    /// <summary>"Read-only", "Full access", in <see cref="ApiKeysModel.ScopeChoices"/>' order.</summary>
    public IReadOnlyList<string> ScopeChoices { get; } = ApiKeysModel.ScopeChoices.Select(scope => scope.Label).ToList();

    [ObservableProperty]
    private int scopeIndex;

    /// <summary>"Admin (you)", then the household's other accounts.</summary>
    [ObservableProperty]
    private IReadOnlyList<string> actAsChoices = [ApiKeyLabels.AdminChoiceLabel];

    [ObservableProperty]
    private int actAsIndex;

    /// <summary>"Never", "30 days", "90 days", "1 year".</summary>
    public IReadOnlyList<string> ExpiryChoices { get; } = ApiKeysModel.ExpiryChoices.Select(choice => choice.Label).ToList();

    [ObservableProperty]
    private int expiryIndex;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CreateLabel))]
    [NotifyPropertyChangedFor(nameof(CanCreate))]
    private bool isCreating;

    public string CreateLabel => IsCreating ? Loc.Get("ApiKeys_Creating") : Loc.Get("ApiKeys_CreateKey");
    public bool CanCreate => !IsCreating;

    // MARK: The new key

    /// <summary>The secret of the key just created, until Done.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasNewKey))]
    [NotifyPropertyChangedFor(nameof(ShowsForm))]
    private string? newKey;

    public bool HasNewKey => NewKey != null;

    /// <summary>The create form, while no new key is waiting to be copied.</summary>
    public bool ShowsForm => NewKey == null;

    [ObservableProperty]
    private string copyLabel = Loc.Get("ApiKeys_Copy");

    /// <summary>"Copy" for the new key; reads "Copied" for a moment.</summary>
    [RelayCommand]
    private async Task CopyAsync()
    {
        if (NewKey is not { } secret || !ClipboardText.Copy(secret))
        {
            return;
        }
        CopyLabel = Loc.Get("ApiKeys_Copied");
        await Task.Delay(TimeSpan.FromSeconds(1.5));
        CopyLabel = Loc.Get("ApiKeys_Copy");
    }

    /// <summary>"Done": the secret is gone for good.</summary>
    [RelayCommand]
    private void Done()
    {
        keys.Done();
        CopyLabel = Loc.Get("ApiKeys_Copy");
        Sync();
    }

    // MARK: Actions

    /// <summary>"Create key" (<c>POST /settings/api-keys</c>): the form clears and the secret shows once.</summary>
    [RelayCommand]
    private async Task CreateAsync()
    {
        if (!CanCreate)
        {
            return;
        }
        IsCreating = true;
        Error = null;
        try
        {
            var scope = ApiKeysModel.ScopeChoices[Math.Clamp(ScopeIndex, 0, ApiKeysModel.ScopeChoices.Count - 1)];
            var actAs = shownActAs[Math.Clamp(ActAsIndex, 0, shownActAs.Count - 1)];
            var expiry = ApiKeysModel.ExpiryChoices[Math.Clamp(ExpiryIndex, 0, ApiKeysModel.ExpiryChoices.Count - 1)];
            var failure = await keys.CreateAsync(Name, scope, actAs, expiry);
            if (failure != null)
            {
                Error = failure;
                return;
            }
            Name = "";
            ScopeIndex = 0;
            ActAsIndex = 0;
            ExpiryIndex = 0;
            CopyLabel = Loc.Get("ApiKeys_Copy");
            Sync();
        }
        finally
        {
            IsCreating = false;
        }
    }

    /// <summary>"Revoke" (<c>DELETE /settings/api-keys/{id}</c>) once confirmed: anything using it stops working.</summary>
    [RelayCommand]
    private async Task RevokeAsync(ApiKeyRow? row)
    {
        if (row == null || RevokePrompt is not { } confirm)
        {
            return;
        }
        if (!await confirm(row))
        {
            return;
        }
        Error = null;
        Error = await keys.RevokeAsync(row.Key.Id);
        Sync();
    }

    // MARK: Loading

    /// <summary>
    /// <c>GET /settings/api-keys</c> and the household, when the tab opens.
    /// A 404 (an older server) or 403 keeps the section hidden; any other
    /// failure keeps what's shown.
    /// </summary>
    internal async Task LoadAsync()
    {
        loadCancellation?.Cancel();
        var cancellation = new CancellationTokenSource();
        loadCancellation = cancellation;
        var token = cancellation.Token;
        await keys.LoadAsync(token);
        if (!token.IsCancellationRequested)
        {
            Sync();
        }
    }

    internal void Cancel() => loadCancellation?.Cancel();

    /// <summary>The model's state into the bindable properties; the "Act as" pick survives a reload.</summary>
    private void Sync()
    {
        IsAvailable = keys.IsAvailable;
        var now = DateTimeOffset.Now;
        Rows = keys.Keys
            .Select((key, index) => new ApiKeyRow(key, now, index > 0, RevokeCommand))
            .ToList();
        NewKey = keys.NewKey;

        if (!keys.ActAsChoices.SequenceEqual(shownActAs))
        {
            var picked = shownActAs.ElementAtOrDefault(ActAsIndex)?.UserId;
            shownActAs = keys.ActAsChoices;
            ActAsChoices = shownActAs.Select(choice => choice.Label).ToList();
            ActAsIndex = Math.Max(0, shownActAs.ToList().FindIndex(choice => choice.UserId == picked));
        }
    }
}
