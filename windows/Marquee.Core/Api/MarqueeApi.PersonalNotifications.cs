using Marquee.Core.Models;

namespace Marquee.Core.Api;

// Personal notifications (api-v1.md section 8, deviation 13; 0.45+): the
// account's own channels, what it hears about where, and the admin's pick of
// what the household channels post. A server older than 0.45 answers every
// one of these with NotFound, and the screens stay hidden.

public sealed partial class MarqueeApi
{
    /// <summary><c>/me/notification-channels</c>: Settings › Account › Notifications › "Your channels".</summary>
    public NotificationChannelsEndpoints NotificationChannels => new(transport);

    /// <summary><c>/me/notification-preferences</c>: "What you hear about".</summary>
    public NotificationPreferencesEndpoints NotificationPreferences => new(transport);

    /// <summary><c>/settings/notification-events</c> (admin): what the household channels post.</summary>
    public HouseholdNotificationEventsEndpoints HouseholdNotificationEvents => new(transport);
}

public sealed class NotificationChannelsEndpoints(MarqueeApi.Transport transport)
{
    private const string Path = "/me/notification-channels";

    /// <summary>The statuses the Telegram link poll answers with that aren't failures of the call: 202 pending, 410 expired.</summary>
    private static readonly IReadOnlyCollection<int> TelegramPollAnswers = [202, 410];

    /// <summary>What an expired one-tap Telegram link says.</summary>
    public const string TelegramLinkExpiredMessage = "The Telegram link expired. Try again.";

    private static string ChannelPath(Guid id) => $"{Path}/{MarqueeApi.Segment(id)}";

    /// <summary><c>GET /me/notification-channels</c>: which kinds this server offers, and the account's channels. NotFound from an older server.</summary>
    public Task<NotificationChannelsOverview> ListAsync(CancellationToken ct = default) =>
        transport.GetAsync<NotificationChannelsOverview>(Path, ct: ct);

    /// <summary>
    /// <c>POST /me/notification-channels</c>: the server sends a test first
    /// and saves the channel only if it arrives (Invalid with the reason
    /// otherwise). An email address gets a 6-digit code instead, and comes
    /// back unverified. Conflict for a kind the household hasn't set up or
    /// past 10 channels; RateLimited after 10 adds in 10 minutes.
    /// </summary>
    public Task<PersonalNotificationChannel> CreateAsync(CreateNotificationChannelRequest request, CancellationToken ct = default) =>
        transport.MutateAsync<PersonalNotificationChannel>(
            HttpMethod.Post, Path, body: request, timeout: MarqueeApi.Timeouts.Integrations, ct: ct);

    /// <summary><c>PATCH /me/notification-channels/{id}</c>: new details are tested before they're kept.</summary>
    public Task<PersonalNotificationChannel> UpdateAsync(Guid id, UpdateNotificationChannelRequest request, CancellationToken ct = default) =>
        transport.MutateAsync<PersonalNotificationChannel>(
            HttpMethod.Patch, ChannelPath(id), body: request, timeout: MarqueeApi.Timeouts.Integrations, ct: ct);

    /// <summary><c>DELETE /me/notification-channels/{id}</c>.</summary>
    public Task RemoveAsync(Guid id, CancellationToken ct = default) =>
        transport.MutateAsync<OK>(HttpMethod.Delete, ChannelPath(id), ct: ct);

    /// <summary>
    /// <c>POST /me/notification-channels/{id}/test</c>: "Send a test",
    /// answering the channel with <c>lastSuccessAt</c> updated, or Invalid
    /// with the reason (also kept as <c>lastError</c>).
    /// </summary>
    public Task<PersonalNotificationChannel> TestAsync(Guid id, CancellationToken ct = default) =>
        transport.MutateAsync<PersonalNotificationChannel>(
            HttpMethod.Post, $"{ChannelPath(id)}/test", timeout: MarqueeApi.Timeouts.Integrations, ct: ct);

    /// <summary><c>POST /me/notification-channels/{id}/verify</c>: the emailed code; answers the channel, now verified.</summary>
    public Task<PersonalNotificationChannel> VerifyAsync(Guid id, string code, CancellationToken ct = default) =>
        transport.MutateAsync<PersonalNotificationChannel>(
            HttpMethod.Post, $"{ChannelPath(id)}/verify", body: new VerifyNotificationChannelRequest(code), ct: ct);

    /// <summary><c>POST /me/notification-channels/{id}/resend-code</c>: emails a new code.</summary>
    public Task<PersonalNotificationChannel> ResendCodeAsync(Guid id, CancellationToken ct = default) =>
        transport.MutateAsync<PersonalNotificationChannel>(
            HttpMethod.Post, $"{ChannelPath(id)}/resend-code", timeout: MarqueeApi.Timeouts.Integrations, ct: ct);

    /// <summary><c>POST /me/notification-channels/telegram-link</c>: open its <c>url</c>, then <see cref="PollTelegramLinkAsync"/>.</summary>
    public Task<TelegramLinkStart> StartTelegramLinkAsync(CancellationToken ct = default) =>
        transport.PostAsync<TelegramLinkStart>($"{Path}/telegram-link", ct: ct);

    /// <summary>
    /// <c>POST /me/notification-channels/telegram-link/poll</c>: one poll.
    /// Null while pending (202), the new channel once the bot saw the
    /// <c>/start</c> (201). Throws Expired (410) and Conflict (409, the bot's
    /// messages go to a webhook of its own: enter the chat ID instead).
    /// </summary>
    public async Task<PersonalNotificationChannel?> PollTelegramLinkAsync(string code, string? name = null, CancellationToken ct = default)
    {
        var raw = await transport.ExchangeAsync(
            HttpMethod.Post, $"{Path}/telegram-link/poll", new TelegramLinkPollRequest(code, name),
            TelegramPollAnswers, MarqueeApi.Timeouts.Integrations, ct).ConfigureAwait(false);
        switch (raw.StatusCode)
        {
            case 202:
                return null;
            case 410:
                throw ApiException.SignInExpired(TelegramLinkExpiredMessage, raw.StatusCode, raw.HasApiHeader);
            default:
                return ApiClient.Decode<PersonalNotificationChannel>(raw);
        }
    }
}

public sealed class NotificationPreferencesEndpoints(MarqueeApi.Transport transport)
{
    private const string Path = "/me/notification-preferences";

    /// <summary><c>GET /me/notification-preferences</c>. NotFound from an older server.</summary>
    public Task<NotificationPreferences> GetAsync(CancellationToken ct = default) =>
        transport.GetAsync<NotificationPreferences>(Path, ct: ct);

    /// <summary>
    /// <c>PUT /me/notification-preferences</c>: only what's sent changes;
    /// answers the whole list. What reaches the bell changes, so the bell
    /// reloads. Invalid for an event this account can't get or a channel
    /// that isn't its own.
    /// </summary>
    public Task<NotificationPreferences> SaveAsync(NotificationPreferencesUpdate update, CancellationToken ct = default) =>
        transport.MutateAsync<NotificationPreferences>(HttpMethod.Put, Path, body: update, changes: ServerChange.Notifications, ct: ct);
}

public sealed class HouseholdNotificationEventsEndpoints(MarqueeApi.Transport transport)
{
    private const string Path = "/settings/notification-events";

    /// <summary><c>GET /settings/notification-events</c> (admin). NotFound from an older server, Forbidden for anyone else.</summary>
    public Task<HouseholdNotificationEvents> GetAsync(CancellationToken ct = default) =>
        transport.GetAsync<HouseholdNotificationEvents>(Path, ct: ct);

    /// <summary><c>PUT /settings/notification-events</c>: only the events sent change; answers as <see cref="GetAsync"/>.</summary>
    public Task<HouseholdNotificationEvents> SaveAsync(IReadOnlyDictionary<string, bool> events, CancellationToken ct = default) =>
        transport.MutateAsync<HouseholdNotificationEvents>(
            HttpMethod.Put, Path, body: new HouseholdNotificationEventsUpdate(events), changes: ServerChange.Integrations, ct: ct);
}
