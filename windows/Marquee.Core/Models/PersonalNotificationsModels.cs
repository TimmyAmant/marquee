namespace Marquee.Core.Models;

// Personal notifications (api-v1.md section 8 and deviation 13, 0.45+):
// the account's own channels (/me/notification-channels), which events
// reach the bell, device banners and each channel
// (/me/notification-preferences), and the admin's choice of what the
// household channels post (/settings/notification-events). An older server
// answers 404 on all of them, and the screens stay hidden.

/// <summary>
/// A personal channel's kind. Open: a kind a newer server adds still lists
/// (read-only, under its raw name) instead of failing the call.
/// </summary>
public readonly record struct NotificationChannelKind(string Value) : IOpenEnum<NotificationChannelKind>
{
    public static readonly NotificationChannelKind Telegram = new("telegram");
    public static readonly NotificationChannelKind Pushover = new("pushover");
    public static readonly NotificationChannelKind Email = new("email");
    public static readonly NotificationChannelKind Discord = new("discord");
    public static readonly NotificationChannelKind Ntfy = new("ntfy");
    public static readonly NotificationChannelKind Webhook = new("webhook");

    /// <summary>In the order the website's "Add a channel" offers them.</summary>
    public static IReadOnlyList<NotificationChannelKind> Known { get; } = [Telegram, Pushover, Email, Discord, Ntfy, Webhook];
    public static NotificationChannelKind FromValue(string value) => new(value);
    public bool IsKnown => Known.Contains(this);
    public override string ToString() => Value;

    public string DisplayName
    {
        get
        {
            if (this == Telegram) return "Telegram";
            if (this == Pushover) return "Pushover";
            if (this == Email) return "Email";
            if (this == Discord) return "Discord";
            if (this == Ntfy) return "ntfy";
            if (this == Webhook) return "Webhook";
            return OpenEnum.Capitalized(Value);
        }
    }
}

/// <summary>One kind's entry in <c>available</c>: whether this server can offer it, and the details its form needs.</summary>
public sealed record NotificationChannelAvailability
{
    public required bool Available { get; init; }

    /// <summary>Telegram: the household bot ("message @… /start", and the one-tap link). Null when Telegram can't be reached.</summary>
    public string? BotUsername { get; init; }

    /// <summary>ntfy: the household server, where a topic alone is enough. Null: only full topic URLs.</summary>
    public string? HouseholdServer { get; init; }

    /// <summary>Webhook: whether this account's webhook and ntfy URLs may point at the home network.</summary>
    public bool? HomeNetwork { get; init; }
}

/// <summary>
/// One of the account's own channels. <see cref="Target"/> is already
/// masked by the server (webhook URLs, ntfy topics and Pushover keys are
/// never sent back; email addresses are shown whole).
/// </summary>
public sealed record PersonalNotificationChannel
{
    public required Guid Id { get; init; }
    public required NotificationChannelKind Kind { get; init; }

    /// <summary>The name the account gave it ("My phone"); null for none.</summary>
    public string? Name { get; init; }

    /// <summary>Where it goes, masked: "Chat ••••6789", "anna@example.com".</summary>
    public required string Target { get; init; }

    /// <summary>Off, it gets nothing.</summary>
    public required bool Enabled { get; init; }

    /// <summary>
    /// False for an email address, or a Telegram chat ID typed in by hand,
    /// until the 6-digit code sent there is entered; it gets nothing else
    /// until then. (One-tap Telegram needs no code.)
    /// </summary>
    public required bool Verified { get; init; }

    public DateTimeOffset? LastSuccessAt { get; init; }

    /// <summary>Why the last delivery failed, in the service's own words; cleared by the next one that arrives.</summary>
    public string? LastError { get; init; }

    public DateTimeOffset? LastErrorAt { get; init; }
    public required DateTimeOffset CreatedAt { get; init; }

    /// <summary>The name, else the kind ("Email").</summary>
    public string Label => Name.NonBlank() ?? Kind.DisplayName;

    /// <summary>Waiting for its 6-digit code (an email address, a hand-typed Telegram chat ID): the code box shows.</summary>
    public bool NeedsCode => !Verified;

    /// <summary>Where the code went, per kind: "We emailed a 6-digit code to anna@example.com.".</summary>
    public string CodeSentLine
    {
        get
        {
            if (Kind == NotificationChannelKind.Email) return $"We emailed a 6-digit code to {Target}.";
            if (Kind == NotificationChannelKind.Telegram) return "The bot sent a 6-digit code to your Telegram chat.";
            return $"A 6-digit code was sent to {Target}.";
        }
    }

    /// <summary>Whether adding <paramref name="kind"/> by hand sends a code to confirm it (email, and a typed Telegram chat ID) instead of a test.</summary>
    public static bool AddingSendsCode(NotificationChannelKind kind) =>
        kind == NotificationChannelKind.Email || kind == NotificationChannelKind.Telegram;
}

/// <summary><c>GET /me/notification-channels</c>.</summary>
public sealed record NotificationChannelsOverview
{
    /// <summary>By kind; a kind a newer server adds is kept under its own key.</summary>
    public required IReadOnlyDictionary<NotificationChannelKind, NotificationChannelAvailability> Available { get; init; }

    public required IReadOnlyList<PersonalNotificationChannel> Channels { get; init; }

    /// <summary>The kinds "Add a channel" offers: the known ones this server has available, in the website's order.</summary>
    public IReadOnlyList<NotificationChannelKind> AddableKinds =>
        NotificationChannelKind.Known.Where(kind => AvailabilityOf(kind)?.Available == true).ToList();

    public NotificationChannelAvailability? AvailabilityOf(NotificationChannelKind kind) =>
        Available.TryGetValue(kind, out var availability) ? availability : null;
}

/// <summary>
/// A channel's <c>config</c>: the one field (or two, for ntfy) its kind
/// needs, the rest left null, which the request encoding leaves out.
/// </summary>
public sealed record NotificationChannelConfig
{
    /// <summary>Telegram: your own chat with the household bot.</summary>
    public string? ChatId { get; init; }

    /// <summary>Pushover: the 30-character user key.</summary>
    public string? UserKey { get; init; }

    /// <summary>Email.</summary>
    public string? Address { get; init; }

    /// <summary>Discord.</summary>
    public string? WebhookUrl { get; init; }

    /// <summary>ntfy: a topic on the household server.</summary>
    public string? Topic { get; init; }

    /// <summary>ntfy: a full topic URL; webhook: its URL.</summary>
    public string? Url { get; init; }

    /// <summary>
    /// The <c>config</c> for <paramref name="kind"/> from the form's fields,
    /// trimmed; null when its field is empty. ntfy takes the topic when one
    /// is given, else the full URL.
    /// </summary>
    public static NotificationChannelConfig? FromForm(
        NotificationChannelKind kind, string chatId, string userKey, string address, string webhookUrl, string topic, string url)
    {
        if (kind == NotificationChannelKind.Telegram)
        {
            return chatId.Trim().NonBlank() is { } value ? new NotificationChannelConfig { ChatId = value } : null;
        }
        if (kind == NotificationChannelKind.Pushover)
        {
            return userKey.Trim().NonBlank() is { } value ? new NotificationChannelConfig { UserKey = value } : null;
        }
        if (kind == NotificationChannelKind.Email)
        {
            return address.Trim().NonBlank() is { } value ? new NotificationChannelConfig { Address = value } : null;
        }
        if (kind == NotificationChannelKind.Discord)
        {
            return webhookUrl.Trim().NonBlank() is { } value ? new NotificationChannelConfig { WebhookUrl = value } : null;
        }
        if (kind == NotificationChannelKind.Ntfy)
        {
            if (topic.Trim().NonBlank() is { } name)
            {
                return new NotificationChannelConfig { Topic = name };
            }
            return url.Trim().NonBlank() is { } value ? new NotificationChannelConfig { Url = value } : null;
        }
        if (kind == NotificationChannelKind.Webhook)
        {
            return url.Trim().NonBlank() is { } value ? new NotificationChannelConfig { Url = value } : null;
        }
        return null;
    }
}

/// <summary><c>POST /me/notification-channels</c> body.</summary>
public sealed record CreateNotificationChannelRequest(
    NotificationChannelKind Kind,
    NotificationChannelConfig Config,
    string? Name = null,
    bool? Enabled = null);

/// <summary><c>PATCH /me/notification-channels/{id}</c> body: only what's set changes (a secret left out keeps the saved one).</summary>
public sealed record UpdateNotificationChannelRequest(
    string? Name = null,
    bool? Enabled = null,
    NotificationChannelConfig? Config = null);

/// <summary><c>POST /me/notification-channels/{id}/verify</c> body.</summary>
public sealed record VerifyNotificationChannelRequest(string Code);

/// <summary><c>POST /me/notification-channels/telegram-link</c>: open <see cref="Url"/>, then poll with <see cref="Code"/>.</summary>
public sealed record TelegramLinkStart
{
    public required string Code { get; init; }

    /// <summary><c>https://t.me/{bot}?start={code}</c>.</summary>
    public required string Url { get; init; }

    public required DateTimeOffset ExpiresAt { get; init; }

    /// <summary><see cref="Url"/> when it's an https link (anything else isn't opened).</summary>
    public Uri? LinkUrl =>
        Uri.TryCreate(Url, UriKind.Absolute, out var url) && url.Scheme == Uri.UriSchemeHttps ? url : null;
}

/// <summary><c>POST /me/notification-channels/telegram-link/poll</c> body.</summary>
public sealed record TelegramLinkPollRequest(string Code, string? Name = null);

// MARK: What you hear about

/// <summary>
/// One row of "What you hear about": an event, and where it goes. The
/// <see cref="Event"/> stays a plain string and <see cref="Label"/> is shown
/// as it comes, so an event a newer server adds needs no app update.
/// </summary>
public sealed record NotificationPreference
{
    public required string Event { get; init; }
    public required string Label { get; init; }

    /// <summary>Shown under "For reviewers".</summary>
    public bool ReviewerOnly { get; init; }

    /// <summary>The bell.</summary>
    public required bool InApp { get; init; }

    /// <summary>Devices: Web Push, and banners in the Mac and Windows apps.</summary>
    public required bool Push { get; init; }

    /// <summary>Each of the account's channels, by id.</summary>
    public IReadOnlyDictionary<Guid, bool> Channels { get; init; } = new Dictionary<Guid, bool>();

    /// <summary>Whether this event goes to <paramref name="column"/> (a channel missing from the map: off).</summary>
    public bool IsOn(NotificationPreferenceColumn column) => column.Kind switch
    {
        NotificationPreferenceColumnKind.Bell => InApp,
        NotificationPreferenceColumnKind.Devices => Push,
        _ => Channels.TryGetValue(column.ChannelId, out var on) && on,
    };

    /// <summary>A copy with <paramref name="column"/> set to <paramref name="on"/>.</summary>
    public NotificationPreference With(NotificationPreferenceColumn column, bool on)
    {
        switch (column.Kind)
        {
            case NotificationPreferenceColumnKind.Bell:
                return this with { InApp = on };
            case NotificationPreferenceColumnKind.Devices:
                return this with { Push = on };
            default:
                var channels = new Dictionary<Guid, bool>(Channels) { [column.ChannelId] = on };
                return this with { Channels = channels };
        }
    }
}

/// <summary><c>GET</c> and <c>PUT /me/notification-preferences</c>: every event this account can get, in the order to show them.</summary>
public sealed record NotificationPreferences
{
    public required IReadOnlyList<NotificationPreference> Events { get; init; }

    /// <summary>The rows for everyone, in the server's order.</summary>
    public IReadOnlyList<NotificationPreference> EveryoneEvents => Events.Where(row => !row.ReviewerOnly).ToList();

    /// <summary>The rows under "For reviewers", in the server's order.</summary>
    public IReadOnlyList<NotificationPreference> ReviewerEvents => Events.Where(row => row.ReviewerOnly).ToList();

    /// <summary>
    /// The optimistic copy shown while the <c>PUT</c> is in flight:
    /// <paramref name="event"/>'s <paramref name="column"/> set to
    /// <paramref name="on"/>, everything else as it was. An unknown event
    /// leaves it unchanged.
    /// </summary>
    public NotificationPreferences Toggled(string @event, NotificationPreferenceColumn column, bool on) =>
        this with
        {
            Events = Events.Select(row => row.Event == @event ? row.With(column, on) : row).ToList(),
        };

    /// <summary>The <c>PUT</c> body for that one change: only what's sent changes on the server.</summary>
    public static NotificationPreferencesUpdate Change(string @event, NotificationPreferenceColumn column, bool on) =>
        new([column.Kind switch
        {
            NotificationPreferenceColumnKind.Bell => new NotificationPreferenceChange(@event, InApp: on),
            NotificationPreferenceColumnKind.Devices => new NotificationPreferenceChange(@event, Push: on),
            _ => new NotificationPreferenceChange(@event, Channels: new Dictionary<Guid, bool> { [column.ChannelId] = on }),
        }]);
}

public enum NotificationPreferenceColumnKind
{
    Bell,
    Devices,
    Channel,
}

/// <summary>
/// A column of "What you hear about": Bell, Devices, then one per verified
/// channel, headed by its <see cref="Label"/>.
/// </summary>
public readonly record struct NotificationPreferenceColumn(NotificationPreferenceColumnKind Kind, Guid ChannelId, string Label)
{
    public static readonly NotificationPreferenceColumn Bell = new(NotificationPreferenceColumnKind.Bell, Guid.Empty, "Bell");
    public static readonly NotificationPreferenceColumn Devices = new(NotificationPreferenceColumnKind.Devices, Guid.Empty, "Devices");

    public static NotificationPreferenceColumn For(PersonalNotificationChannel channel) =>
        new(NotificationPreferenceColumnKind.Channel, channel.Id, channel.Label);

    /// <summary>Bell, Devices, then each verified channel in the list's order (an unconfirmed email gets nothing yet).</summary>
    public static IReadOnlyList<NotificationPreferenceColumn> All(IEnumerable<PersonalNotificationChannel> channels) =>
        [Bell, Devices, .. channels.Where(channel => channel.Verified).Select(For)];
}

/// <summary><c>PUT /me/notification-preferences</c> body.</summary>
public sealed record NotificationPreferencesUpdate(IReadOnlyList<NotificationPreferenceChange> Events);

/// <summary>One event's change; a null field is left out, and stays as it is.</summary>
public sealed record NotificationPreferenceChange(
    string Event,
    bool? InApp = null,
    bool? Push = null,
    IReadOnlyDictionary<Guid, bool>? Channels = null);

// MARK: Household channels (admin)

/// <summary>One event the household channels may post.</summary>
public sealed record HouseholdNotificationEvent
{
    public required string Event { get; init; }
    public required string Label { get; init; }
    public required bool Enabled { get; init; }
}

/// <summary><c>GET</c> and <c>PUT /settings/notification-events</c>.</summary>
public sealed record HouseholdNotificationEvents
{
    public required IReadOnlyList<HouseholdNotificationEvent> Events { get; init; }
}

/// <summary><c>PUT /settings/notification-events</c> body: <c>{"events": {"issue_updated": true}}</c>, only what's sent changes.</summary>
public sealed record HouseholdNotificationEventsUpdate(IReadOnlyDictionary<string, bool> Events);
