using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Windows.Services;

namespace Marquee.Windows.ViewModels;

/// <summary>
/// A row of "Your channels": the name and kind, where it goes (masked by
/// the server), the On switch (<c>PATCH</c>), Send a test, Remove, how the
/// last delivery went, and for an unconfirmed email address the code box
/// with Confirm and Send a new code. A kind this app doesn't know is shown
/// read-only. Updated in place from each answer about it.
/// </summary>
public sealed partial class PersonalChannelRow : ObservableObject
{
    private readonly PersonalNotificationsViewModel owner;

    /// <summary>Set while the switch is moved to match the server, so that isn't taken for the user flipping it.</summary>
    private bool syncing;

    internal PersonalChannelRow(PersonalNotificationChannel channel, bool showsDivider, PersonalNotificationsViewModel owner)
    {
        this.owner = owner;
        ShowsDivider = showsDivider;
        Channel = channel;
        Apply(channel);
    }

    // Internal: a public Core record here would make the XAML compiler
    // generate an activator for it (CS9035). Bindings use the flat properties.
    internal PersonalNotificationChannel Channel { get; private set; }

    public bool ShowsDivider { get; }

    [ObservableProperty]
    private string title = "";

    /// <summary>"Telegram · Chat ••••6789".</summary>
    [ObservableProperty]
    private string detailLine = "";

    /// <summary>"Last delivered 5m ago", "Nothing delivered yet", or what's waiting.</summary>
    [ObservableProperty]
    private string statusLine = "";

    /// <summary>Why the last delivery failed; empty collapses it.</summary>
    [ObservableProperty]
    private string lastErrorLine = "";

    /// <summary>The On switch; flipping it sends <c>PATCH {"enabled"}</c>.</summary>
    [ObservableProperty]
    private bool isOn;

    /// <summary>A known kind: the switch, Send a test and Remove are offered.</summary>
    [ObservableProperty]
    private bool canManage;

    /// <summary>Send a test: a known kind that's confirmed.</summary>
    [ObservableProperty]
    private bool canTest;

    /// <summary>Not confirmed yet (an email address, a hand-typed Telegram chat ID): the code box, Confirm and Send a new code.</summary>
    [ObservableProperty]
    private bool needsCode;

    /// <summary>"We emailed a 6-digit code to …" / "The bot sent a 6-digit code to your Telegram chat."; empty when confirmed.</summary>
    [ObservableProperty]
    private string codeSentLine = "";

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CanChange))]
    private bool isBusy;

    /// <summary>The 6-digit code from the email or the Telegram chat.</summary>
    [ObservableProperty]
    private string code = "";

    /// <summary>What the last action on this row said: a failure, or "Test sent."; empty collapses it.</summary>
    [ObservableProperty]
    private string errorLine = "";

    [ObservableProperty]
    private string noticeLine = "";

    public bool CanChange => !IsBusy;

    /// <summary>Shows what the server answered about this channel, moving the switch without sending anything.</summary>
    internal void Apply(PersonalNotificationChannel channel)
    {
        Channel = channel;
        Title = channel.Label;
        DetailLine = channel.Name.NonBlank() != null ? $"{channel.Kind.DisplayName} · {channel.Target}" : channel.Target;
        CanManage = channel.Kind.IsKnown;
        NeedsCode = channel.NeedsCode && channel.Kind.IsKnown;
        CodeSentLine = NeedsCode ? channel.CodeSentLine : "";
        CanTest = channel.Kind.IsKnown && channel.Verified;
        StatusLine = PersonalNotificationsViewModel.StatusLine(channel, DateTimeOffset.UtcNow);
        LastErrorLine = PersonalNotificationsViewModel.LastErrorLine(channel, DateTimeOffset.UtcNow);
        SetOn(channel.Enabled);
    }

    internal void SetOn(bool value)
    {
        syncing = true;
        try
        {
            IsOn = value;
        }
        finally
        {
            syncing = false;
        }
    }

    internal void ShowError(string message)
    {
        NoticeLine = "";
        ErrorLine = message;
    }

    internal void ShowNotice(string message)
    {
        ErrorLine = "";
        NoticeLine = message;
    }

    internal void ClearMessages()
    {
        ErrorLine = "";
        NoticeLine = "";
    }

    partial void OnIsOnChanged(bool value)
    {
        if (!syncing)
        {
            _ = owner.SetEnabledAsync(this, value);
        }
    }

    [RelayCommand]
    private Task TestAsync() => owner.TestAsync(this);

    [RelayCommand]
    private Task RemoveAsync() => owner.RemoveAsync(this);

    [RelayCommand]
    private Task VerifyAsync() => owner.VerifyAsync(this);

    [RelayCommand]
    private Task ResendCodeAsync() => owner.ResendCodeAsync(this);
}

/// <summary>A column heading of "What you hear about": Bell, Devices, or a channel's name.</summary>
public sealed class NotificationPreferenceHeader(string label)
{
    public string Label { get; } = label;
}

/// <summary>One checkbox of "What you hear about": an event going to one place.</summary>
public sealed partial class NotificationPreferenceCell : ObservableObject
{
    private readonly PersonalNotificationsViewModel owner;
    private bool syncing;

    internal NotificationPreferenceCell(string @event, string eventLabel, NotificationPreferenceColumn column, bool on, PersonalNotificationsViewModel owner)
    {
        this.owner = owner;
        Event = @event;
        Column = column;
        AutomationName = $"{eventLabel}: {column.Label}";
        SetOn(on);
    }

    internal string Event { get; }
    internal NotificationPreferenceColumn Column { get; }

    /// <summary>"A request is approved: Devices", for screen readers.</summary>
    public string AutomationName { get; }

    /// <summary><c>bool?</c> to match <c>CheckBox.IsChecked</c>; never indeterminate.</summary>
    [ObservableProperty]
    private bool? isChecked;

    internal void SetOn(bool value)
    {
        syncing = true;
        try
        {
            IsChecked = value;
        }
        finally
        {
            syncing = false;
        }
    }

    partial void OnIsCheckedChanged(bool? value)
    {
        if (!syncing)
        {
            _ = owner.ToggleAsync(this, value == true);
        }
    }
}

/// <summary>A row of "What you hear about": the event's label as the server gives it, and a checkbox per column.</summary>
public sealed class NotificationPreferenceRow(string @event, string label, IReadOnlyList<NotificationPreferenceCell> cells)
{
    internal string Event { get; } = @event;
    public string Label { get; } = label;
    public IReadOnlyList<NotificationPreferenceCell> Cells { get; } = cells;
}

/// <summary>
/// Settings › Account › Notifications for the account itself (0.45+,
/// api-v1.md section 8): "Your channels" (<c>/me/notification-channels</c>),
/// "Add a channel" with its kind's fields and one-tap Telegram, and "What
/// you hear about" (<c>/me/notification-preferences</c>): which events reach
/// the bell, this and other devices, and each confirmed channel. Hidden on
/// an older server, which answers 404.
/// </summary>
public sealed partial class PersonalNotificationsViewModel : ObservableObject
{
    /// <summary>How often the one-tap Telegram link asks whether the bot has seen the /start yet.</summary>
    public static readonly TimeSpan TelegramPollInterval = TimeSpan.FromSeconds(3);

    public const string TelegramUnopenedMessage = "Couldn't open Telegram. Enter your chat ID instead.";
    public const string TestSentNotice = "Test sent. It arrived.";

    private readonly AppModel model;
    private CancellationTokenSource? loadCancellation;
    private CancellationTokenSource? telegramCancellation;

    private NotificationChannelsOverview? overview;
    private IReadOnlyList<NotificationChannelKind> addableKinds = [];

    private NotificationPreferences? preferences;
    private IReadOnlyList<NotificationPreferenceColumn> columns = [];

    /// <summary>Counts matrix saves, so only the newest one's answer is shown.</summary>
    private int preferencesSequence;

    public PersonalNotificationsViewModel(AppModel model)
    {
        this.model = model;
    }

    /// <summary>Set by the page: "Remove {name}?", true only when confirmed.</summary>
    internal Func<string, Task<bool>>? RemoveChannelPrompt { get; set; }

    // MARK: State

    /// <summary>The server has personal channels (0.45+): the sections show.</summary>
    [ObservableProperty]
    private bool isVisible;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasNoChannels))]
    private IReadOnlyList<PersonalChannelRow> channels = [];

    public bool HasNoChannels => Channels.Count == 0;

    // MARK: Add a channel

    /// <summary>"Telegram", "Email", …: only the kinds this server has available.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CanAddChannels))]
    private IReadOnlyList<string> addKindLabels = [];

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowsChatId))]
    [NotifyPropertyChangedFor(nameof(ShowsUserKey))]
    [NotifyPropertyChangedFor(nameof(ShowsAddress))]
    [NotifyPropertyChangedFor(nameof(ShowsWebhookUrl))]
    [NotifyPropertyChangedFor(nameof(ShowsTopic))]
    [NotifyPropertyChangedFor(nameof(ShowsUrl))]
    [NotifyPropertyChangedFor(nameof(UrlHeader))]
    [NotifyPropertyChangedFor(nameof(UrlPlaceholder))]
    [NotifyPropertyChangedFor(nameof(AddHint))]
    [NotifyPropertyChangedFor(nameof(AddLabel))]
    [NotifyPropertyChangedFor(nameof(ShowsTelegramConnect))]
    [NotifyPropertyChangedFor(nameof(ConnectTelegramLabel))]
    private int selectedAddKindIndex = -1;

    [ObservableProperty]
    private string addName = "";

    [ObservableProperty]
    private string addChatId = "";

    [ObservableProperty]
    private string addUserKey = "";

    [ObservableProperty]
    private string addAddress = "";

    [ObservableProperty]
    private string addWebhookUrl = "";

    [ObservableProperty]
    private string addTopic = "";

    [ObservableProperty]
    private string addUrl = "";

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(AddLabel))]
    [NotifyPropertyChangedFor(nameof(CanAdd))]
    [NotifyPropertyChangedFor(nameof(CanConnectTelegram))]
    private bool isAdding;

    /// <summary>One-tap Telegram: Telegram is open and the poll is running.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CanAdd))]
    [NotifyPropertyChangedFor(nameof(CanConnectTelegram))]
    private bool isConnectingTelegram;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasAddError))]
    private string? addError;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasAddNotice))]
    private string? addNotice;

    public bool CanAddChannels => AddKindLabels.Count > 0;
    public bool HasAddError => AddError != null;
    public bool HasAddNotice => AddNotice != null;
    public bool CanAdd => !IsAdding && !IsConnectingTelegram;
    public bool CanConnectTelegram => !IsAdding && !IsConnectingTelegram;

    private NotificationChannelKind? SelectedAddKind =>
        SelectedAddKindIndex >= 0 && SelectedAddKindIndex < addableKinds.Count ? addableKinds[SelectedAddKindIndex] : null;

    private NotificationChannelAvailability? SelectedAvailability =>
        SelectedAddKind is { } kind ? overview?.AvailabilityOf(kind) : null;

    private string? TelegramBot => overview?.AvailabilityOf(NotificationChannelKind.Telegram)?.BotUsername.NonBlank();
    private string? NtfyHouseholdServer => overview?.AvailabilityOf(NotificationChannelKind.Ntfy)?.HouseholdServer.NonBlank();

    public bool ShowsChatId => SelectedAddKind == NotificationChannelKind.Telegram;
    public bool ShowsUserKey => SelectedAddKind == NotificationChannelKind.Pushover;
    public bool ShowsAddress => SelectedAddKind == NotificationChannelKind.Email;
    public bool ShowsWebhookUrl => SelectedAddKind == NotificationChannelKind.Discord;

    /// <summary>ntfy with a household server: a topic alone is enough there.</summary>
    public bool ShowsTopic => SelectedAddKind == NotificationChannelKind.Ntfy && NtfyHouseholdServer != null;

    /// <summary>ntfy's full topic URL, or the webhook's URL.</summary>
    public bool ShowsUrl => SelectedAddKind == NotificationChannelKind.Ntfy || SelectedAddKind == NotificationChannelKind.Webhook;

    public string UrlHeader => SelectedAddKind == NotificationChannelKind.Ntfy
        ? NtfyHouseholdServer != null ? "Or a full topic URL on another server" : "Topic URL"
        : "Webhook URL";

    public string UrlPlaceholder => SelectedAddKind == NotificationChannelKind.Ntfy ? "https://ntfy.sh/your-topic" : "https://";

    /// <summary>The one-tap Telegram button: Telegram picked, and the household bot can be reached.</summary>
    public bool ShowsTelegramConnect => SelectedAddKind == NotificationChannelKind.Telegram && TelegramBot != null;

    public string ConnectTelegramLabel => "Connect with Telegram";

    public string TelegramWaitingLine => TelegramBot is { } bot
        ? $"Waiting for Telegram… Press Start in your chat with @{bot}."
        : "Waiting for Telegram… Press Start in the chat that just opened.";

    public string AddHint => AddHintFor(SelectedAddKind, SelectedAvailability, TelegramBot, NtfyHouseholdServer);

    /// <summary>"Send code" for email and a typed Telegram chat ID (confirmed with a code), "Test &amp; add" for the rest.</summary>
    public string AddLabel => IsAdding
        ? AddSendsCode ? "Sending…" : "Testing…"
        : AddSendsCode ? "Send code" : "Test & add";

    private bool AddSendsCode => SelectedAddKind is { } kind && PersonalNotificationChannel.AddingSendsCode(kind);

    // MARK: What you hear about

    /// <summary><c>GET /me/notification-preferences</c> answered: the matrix shows.</summary>
    [ObservableProperty]
    private bool showsPreferences;

    [ObservableProperty]
    private IReadOnlyList<NotificationPreferenceHeader> columnHeaders = [];

    [ObservableProperty]
    private IReadOnlyList<NotificationPreferenceRow> everyoneRows = [];

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasReviewerRows))]
    private IReadOnlyList<NotificationPreferenceRow> reviewerRows = [];

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasPreferencesError))]
    private string? preferencesError;

    public bool HasReviewerRows => ReviewerRows.Count > 0;
    public bool HasPreferencesError => PreferencesError != null;

    // MARK: Loading

    /// <summary>
    /// <c>GET /me/notification-channels</c>, then <c>GET /me/notification-preferences</c>.
    /// NotFound (a server older than 0.45) hides the sections; any other
    /// failure keeps what's shown (hidden the first time).
    /// </summary>
    public async Task LoadAsync()
    {
        loadCancellation?.Cancel();
        var cancellation = new CancellationTokenSource();
        loadCancellation = cancellation;
        var token = cancellation.Token;
        var api = model.Api;
        try
        {
            var fresh = await api.NotificationChannels.ListAsync(token);
            if (token.IsCancellationRequested)
            {
                return;
            }
            ShowOverview(fresh);
            IsVisible = true;
        }
        catch (ApiException error) when (error.Kind == ApiErrorKind.NotFound)
        {
            if (!token.IsCancellationRequested)
            {
                IsVisible = false;
            }
            return;
        }
        catch (ApiException)
        {
            // Cancelled, or it couldn't load: keep what's shown.
            return;
        }

        try
        {
            var fresh = await api.NotificationPreferences.GetAsync(token);
            if (token.IsCancellationRequested)
            {
                return;
            }
            PreferencesError = null;
            ShowPreferences(fresh);
            ShowsPreferences = true;
        }
        catch (ApiException error) when (error.Kind == ApiErrorKind.NotFound)
        {
            if (!token.IsCancellationRequested)
            {
                ShowsPreferences = false;
            }
        }
        catch (ApiException error)
        {
            if (!token.IsCancellationRequested && !error.IsCancellation && preferences == null)
            {
                PreferencesError = error.Message;
            }
        }
    }

    /// <summary>Leaving the page: stops a load and a Telegram link in progress.</summary>
    public void Cancel()
    {
        loadCancellation?.Cancel();
        CancelConnectTelegram();
    }

    private void ShowOverview(NotificationChannelsOverview fresh)
    {
        overview = fresh;
        Channels = fresh.Channels
            .Select((channel, index) => new PersonalChannelRow(channel, index > 0, this))
            .ToList();

        var previousKind = SelectedAddKind;
        addableKinds = fresh.AddableKinds;
        AddKindLabels = addableKinds.Select(kind => kind.DisplayName).ToList();
        var index = previousKind is { } kind ? IndexOf(addableKinds, kind) : -1;
        // Re-announce even when the index is unchanged: the fields depend on the availability too.
        SelectedAddKindIndex = -1;
        SelectedAddKindIndex = index >= 0 ? index : addableKinds.Count > 0 ? 0 : -1;
        OnPropertyChanged(nameof(TelegramWaitingLine));

        // A channel confirmed or removed changes the matrix's columns.
        if (preferences != null)
        {
            ShowPreferences(preferences);
        }
    }

    private static int IndexOf(IReadOnlyList<NotificationChannelKind> kinds, NotificationChannelKind kind)
    {
        for (var index = 0; index < kinds.Count; index++)
        {
            if (kinds[index] == kind)
            {
                return index;
            }
        }
        return -1;
    }

    // MARK: Your channels

    /// <summary>A row's On switch: <c>PATCH {"enabled"}</c>; put back with the reason when it fails.</summary>
    internal async Task SetEnabledAsync(PersonalChannelRow row, bool enabled)
    {
        if (row.IsBusy)
        {
            row.SetOn(!enabled);
            return;
        }
        row.ClearMessages();
        row.IsBusy = true;
        try
        {
            row.Apply(await model.Api.NotificationChannels.UpdateAsync(row.Channel.Id, new UpdateNotificationChannelRequest(Enabled: enabled)));
        }
        catch (ApiException error)
        {
            row.SetOn(!enabled);
            row.ShowError(error.Message);
        }
        finally
        {
            row.IsBusy = false;
        }
    }

    /// <summary>"Send a test": the channel comes back with its last delivery updated, or the reason it failed.</summary>
    internal async Task TestAsync(PersonalChannelRow row)
    {
        if (row.IsBusy || !row.CanTest)
        {
            return;
        }
        row.ClearMessages();
        row.IsBusy = true;
        try
        {
            row.Apply(await model.Api.NotificationChannels.TestAsync(row.Channel.Id));
            row.ShowNotice(TestSentNotice);
        }
        catch (ApiException error)
        {
            row.ShowError(error.Message);
        }
        finally
        {
            row.IsBusy = false;
        }
    }

    /// <summary>"Remove", behind a confirmation; then the channels and the matrix are re-read.</summary>
    internal async Task RemoveAsync(PersonalChannelRow row)
    {
        if (row.IsBusy || !row.CanManage)
        {
            return;
        }
        if (RemoveChannelPrompt is { } confirm && !await confirm(row.Title))
        {
            return;
        }
        row.ClearMessages();
        row.IsBusy = true;
        try
        {
            await model.Api.NotificationChannels.RemoveAsync(row.Channel.Id);
        }
        catch (ApiException error) when (error.Kind != ApiErrorKind.NotFound)
        {
            // NotFound means it's already gone: just re-read.
            row.ShowError(error.Message);
            row.IsBusy = false;
            return;
        }
        row.IsBusy = false;
        await LoadAsync();
    }

    /// <summary>"Confirm": the emailed code. Once confirmed the address gets a column in the matrix.</summary>
    internal async Task VerifyAsync(PersonalChannelRow row)
    {
        if (row.IsBusy || !row.NeedsCode)
        {
            return;
        }
        var code = row.Code.Trim();
        if (code.Length == 0)
        {
            row.ShowError("Enter the 6-digit code.");
            return;
        }
        row.ClearMessages();
        row.IsBusy = true;
        try
        {
            row.Apply(await model.Api.NotificationChannels.VerifyAsync(row.Channel.Id, code));
            row.Code = "";
        }
        catch (ApiException error)
        {
            row.ShowError(error.Message);
            return;
        }
        finally
        {
            row.IsBusy = false;
        }
        await LoadAsync();
    }

    /// <summary>"Send a new code".</summary>
    internal async Task ResendCodeAsync(PersonalChannelRow row)
    {
        if (row.IsBusy || !row.NeedsCode)
        {
            return;
        }
        row.ClearMessages();
        row.IsBusy = true;
        try
        {
            var channel = await model.Api.NotificationChannels.ResendCodeAsync(row.Channel.Id);
            row.Apply(channel);
            row.ShowNotice($"New code sent. {channel.CodeSentLine}");
        }
        catch (ApiException error)
        {
            row.ShowError(error.Message);
        }
        finally
        {
            row.IsBusy = false;
        }
    }

    // MARK: Add a channel

    /// <summary>
    /// "Test &amp; add": the server sends a test first and keeps the channel
    /// only if it arrives. "Send code" for email: it's added unconfirmed, and
    /// the code box shows on its row.
    /// </summary>
    [RelayCommand]
    private async Task AddAsync()
    {
        if (!CanAdd || SelectedAddKind is not { } kind)
        {
            return;
        }
        AddError = null;
        AddNotice = null;
        if (NotificationChannelConfig.FromForm(kind, AddChatId, AddUserKey, AddAddress, AddWebhookUrl, ShowsTopic ? AddTopic : "", AddUrl) is not { } config)
        {
            AddError = MissingFieldMessage(kind);
            return;
        }
        IsAdding = true;
        try
        {
            var channel = await model.Api.NotificationChannels.CreateAsync(new CreateNotificationChannelRequest(kind, config, AddName.Trim().NonBlank()));
            ClearAddForm();
            AddNotice = channel.NeedsCode
                ? $"{channel.CodeSentLine} Enter it under Your channels."
                : $"{channel.Label} added. The test message arrived.";
            await LoadAsync();
        }
        catch (ApiException error)
        {
            AddError = error.Message;
        }
        finally
        {
            IsAdding = false;
        }
    }

    /// <summary>
    /// "Connect with Telegram": <c>POST …/telegram-link</c>, the t.me link in
    /// the browser (Telegram offers Start), then <c>POST …/telegram-link/poll</c>
    /// every 3 seconds until the channel is made, it expires, or it's cancelled.
    /// </summary>
    [RelayCommand]
    private async Task ConnectTelegramAsync()
    {
        if (!CanConnectTelegram)
        {
            return;
        }
        AddError = null;
        AddNotice = null;
        telegramCancellation?.Cancel();
        var cancellation = new CancellationTokenSource();
        telegramCancellation = cancellation;
        IsConnectingTelegram = true;
        var api = model.Api;
        var name = AddName.Trim().NonBlank();
        try
        {
            var start = await api.NotificationChannels.StartTelegramLinkAsync(cancellation.Token);
            if (start.LinkUrl is not { } url || !await ExternalLinks.OpenAsync(url))
            {
                AddError = TelegramUnopenedMessage;
                return;
            }
            var channel = await PlexPoll.RunAsync(
                start.ExpiresAt,
                token => api.NotificationChannels.PollTelegramLinkAsync(start.Code, name, token),
                interval: TelegramPollInterval,
                ct: cancellation.Token,
                expiredMessage: NotificationChannelsEndpoints.TelegramLinkExpiredMessage);
            ClearAddForm();
            AddNotice = $"{channel.Label} added. The test message arrived.";
            await LoadAsync();
        }
        catch (ApiException error)
        {
            if (!error.IsCancellation && !cancellation.IsCancellationRequested)
            {
                AddError = error.Message;
            }
        }
        finally
        {
            if (ReferenceEquals(telegramCancellation, cancellation))
            {
                telegramCancellation = null;
                IsConnectingTelegram = false;
            }
            cancellation.Dispose();
        }
    }

    /// <summary>"Cancel" while waiting for Telegram; also leaving the page.</summary>
    [RelayCommand]
    private void CancelConnectTelegram()
    {
        var cancellation = telegramCancellation;
        telegramCancellation = null;
        IsConnectingTelegram = false;
        cancellation?.Cancel();
    }

    private void ClearAddForm()
    {
        AddName = "";
        AddChatId = "";
        AddUserKey = "";
        AddAddress = "";
        AddWebhookUrl = "";
        AddTopic = "";
        AddUrl = "";
    }

    internal static string MissingFieldMessage(NotificationChannelKind kind)
    {
        if (kind == NotificationChannelKind.Telegram) return "Enter your Telegram chat ID.";
        if (kind == NotificationChannelKind.Pushover) return "Enter your Pushover user key.";
        if (kind == NotificationChannelKind.Email) return "Enter an email address.";
        if (kind == NotificationChannelKind.Discord) return "Enter the Discord webhook URL.";
        if (kind == NotificationChannelKind.Ntfy) return "Enter a topic or a topic URL.";
        return "Enter the webhook URL.";
    }

    internal static string AddHintFor(
        NotificationChannelKind? kind, NotificationChannelAvailability? availability, string? telegramBot, string? ntfyServer)
    {
        if (kind == NotificationChannelKind.Telegram)
        {
            return telegramBot is { } bot
                ? $"Connect in one tap, or message @{bot} on Telegram, send /start, and enter your chat ID here: the bot then sends a 6-digit code to confirm it's yours."
                : "Send the household's Telegram bot /start, then enter your chat ID here: the bot sends a 6-digit code to confirm it's yours.";
        }
        if (kind == NotificationChannelKind.Pushover)
        {
            return "Your user key is at the top of your pushover.net dashboard.";
        }
        if (kind == NotificationChannelKind.Email)
        {
            return "We'll email a 6-digit code to confirm the address. Nothing else is sent until it's confirmed.";
        }
        if (kind == NotificationChannelKind.Discord)
        {
            return "In Discord: Server Settings › Integrations › Webhooks › New Webhook, then Copy Webhook URL.";
        }
        var homeNetwork = availability?.HomeNetwork == true;
        var internetOnly = homeNetwork ? "" : " It must be on the internet, not your home network.";
        if (kind == NotificationChannelKind.Ntfy)
        {
            return ntfyServer is { } server
                ? $"Pick a topic on {server}, or give a full topic URL on another ntfy server.{internetOnly}"
                : $"The full URL of your ntfy topic.{internetOnly}";
        }
        if (kind == NotificationChannelKind.Webhook)
        {
            return $"Marquee sends each notification to this URL.{internetOnly}";
        }
        return "";
    }

    /// <summary>"Last delivered 5m ago", "Nothing delivered yet", or what it's waiting for.</summary>
    internal static string StatusLine(PersonalNotificationChannel channel, DateTimeOffset now)
    {
        if (!channel.Kind.IsKnown)
        {
            return "This version of Marquee for Windows can't change this kind of channel.";
        }
        if (channel.NeedsCode)
        {
            return "Waiting for the 6-digit code. Nothing else is sent here until it's confirmed.";
        }
        var status = channel.LastSuccessAt is { } delivered
            ? $"Last delivered {NotificationItem.TimeAgoLabel(delivered, now)}"
            : "Nothing delivered yet";
        return channel.Enabled ? status : $"Off · {status}";
    }

    /// <summary>"Failed 2h ago: Forbidden: bot was blocked by the user"; empty when the last one arrived.</summary>
    internal static string LastErrorLine(PersonalNotificationChannel channel, DateTimeOffset now)
    {
        if (channel.LastError.NonBlank() is not { } error)
        {
            return "";
        }
        return channel.LastErrorAt is { } at ? $"Failed {NotificationItem.TimeAgoLabel(at, now)}: {error}" : error;
    }

    // MARK: What you hear about

    /// <summary>
    /// A checkbox changed: the matrix keeps the change straight away and
    /// sends just that one (<c>PUT</c>); the server's answer, the whole
    /// list, then replaces it. A failure puts the box back and says why.
    /// </summary>
    internal async Task ToggleAsync(NotificationPreferenceCell cell, bool on)
    {
        if (preferences is not { } current)
        {
            return;
        }
        PreferencesError = null;
        preferences = current.Toggled(cell.Event, cell.Column, on);
        var sequence = ++preferencesSequence;
        try
        {
            var answer = await model.Api.NotificationPreferences.SaveAsync(NotificationPreferences.Change(cell.Event, cell.Column, on));
            if (sequence == preferencesSequence)
            {
                ShowPreferences(answer);
            }
        }
        catch (ApiException error)
        {
            PreferencesError = error.Message;
            if (preferences is { } shown)
            {
                ShowPreferences(shown.Toggled(cell.Event, cell.Column, !on));
            }
        }
    }

    /// <summary>
    /// Shows <paramref name="fresh"/>: in place when the events and columns
    /// are the same as what's shown (so a checkbox being clicked isn't
    /// rebuilt under the pointer), rebuilt otherwise.
    /// </summary>
    private void ShowPreferences(NotificationPreferences fresh)
    {
        preferences = fresh;
        var freshColumns = NotificationPreferenceColumn.All(overview?.Channels ?? []);
        var shownRows = EveryoneRows.Concat(ReviewerRows).ToList();
        var sameShape = freshColumns.SequenceEqual(columns)
            && shownRows.Select(row => row.Event).SequenceEqual(fresh.EveryoneEvents.Concat(fresh.ReviewerEvents).Select(row => row.Event));
        if (sameShape)
        {
            var byEvent = fresh.Events
                .GroupBy(row => row.Event, StringComparer.Ordinal)
                .ToDictionary(group => group.Key, group => group.First(), StringComparer.Ordinal);
            foreach (var row in shownRows)
            {
                var preference = byEvent[row.Event];
                foreach (var cell in row.Cells)
                {
                    cell.SetOn(preference.IsOn(cell.Column));
                }
            }
            return;
        }
        columns = freshColumns;
        ColumnHeaders = freshColumns.Select(column => new NotificationPreferenceHeader(column.Label)).ToList();
        EveryoneRows = fresh.EveryoneEvents.Select(MakeRow).ToList();
        ReviewerRows = fresh.ReviewerEvents.Select(MakeRow).ToList();
    }

    private NotificationPreferenceRow MakeRow(NotificationPreference preference) =>
        new(
            preference.Event,
            preference.Label,
            columns.Select(column => new NotificationPreferenceCell(preference.Event, preference.Label, column, preference.IsOn(column), this)).ToList());
}
