using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// Personal notifications (api-v1.md section 8, deviation 13, 0.45+): the
// doc's examples for /me/notification-channels, /me/notification-preferences
// and /settings/notification-events decoded with their values; unknown kinds
// and events surviving; NotificationItem.alert defaulting to true; the
// matrix's optimistic toggle and PUT body; and which notifications get a
// Windows banner.

public sealed class NotificationChannelsFixtureTests
{
    private static readonly Guid TelegramId = Guid.Parse("0b7d5f6e-3c1a-4f3e-9d61-6f0c2e1a9b44");
    private static readonly Guid EmailId = Guid.Parse("5a0f4b1e-8d2c-4b6a-a1f7-2e9c3d4b5a61");

    /// <summary>The fixture's text with Windows line endings (a checkout with autocrlf) made plain, so a search for a fragment matches.</summary>
    private static string Read(string name) => Fixtures.Read(name).Replace("\r\n", "\n", StringComparison.Ordinal);

    // MARK: Channels

    [Fact]
    public void ChannelsDecode()
    {
        var overview = Fixtures.Decode<NotificationChannelsOverview>("notification-channels");

        Assert.Equal(6, overview.Available.Count);
        var telegram = overview.AvailabilityOf(NotificationChannelKind.Telegram)!;
        Assert.True(telegram.Available);
        Assert.Equal("MarqueeHomeBot", telegram.BotUsername);
        Assert.False(overview.AvailabilityOf(NotificationChannelKind.Pushover)!.Available);
        Assert.True(overview.AvailabilityOf(NotificationChannelKind.Email)!.Available);
        Assert.True(overview.AvailabilityOf(NotificationChannelKind.Discord)!.Available);
        Assert.Equal("https://ntfy.sh", overview.AvailabilityOf(NotificationChannelKind.Ntfy)!.HouseholdServer);
        var webhook = overview.AvailabilityOf(NotificationChannelKind.Webhook)!;
        Assert.True(webhook.Available);
        Assert.False(webhook.HomeNetwork);
        Assert.Null(webhook.BotUsername);

        Assert.Equal(
            [NotificationChannelKind.Telegram, NotificationChannelKind.Email, NotificationChannelKind.Discord, NotificationChannelKind.Ntfy, NotificationChannelKind.Webhook],
            overview.AddableKinds);

        Assert.Equal(2, overview.Channels.Count);
        var phone = overview.Channels[0];
        Assert.Equal(TelegramId, phone.Id);
        Assert.Equal(NotificationChannelKind.Telegram, phone.Kind);
        Assert.Equal("My phone", phone.Name);
        Assert.Equal("My phone", phone.Label);
        Assert.Equal("Chat ••••6789", phone.Target);
        Assert.True(phone.Enabled);
        Assert.True(phone.Verified);
        Assert.False(phone.NeedsCode);
        Assert.Equal(Json.ParseDate("2026-09-25T18:40:05.000Z"), phone.LastSuccessAt);
        Assert.Null(phone.LastError);
        Assert.Null(phone.LastErrorAt);
        Assert.Equal(Json.ParseDate("2026-09-20T09:12:00.000Z"), phone.CreatedAt);

        var email = overview.Channels[1];
        Assert.Equal(EmailId, email.Id);
        Assert.Equal(NotificationChannelKind.Email, email.Kind);
        Assert.Null(email.Name);
        Assert.Equal("Email", email.Label);
        Assert.Equal("anna@example.com", email.Target);
        Assert.False(email.Verified);
        Assert.True(email.NeedsCode);
        Assert.Null(email.LastSuccessAt);
        Assert.Equal(Json.ParseDate("2026-09-25T18:41:00.000Z"), email.CreatedAt);
    }

    [Fact]
    public void AnyUnconfirmedChannelNeedsItsCode()
    {
        var overview = Fixtures.Decode<NotificationChannelsOverview>("notification-channels");
        var email = overview.Channels[1];
        Assert.True(email.NeedsCode);
        Assert.Equal("We emailed a 6-digit code to anna@example.com.", email.CodeSentLine);

        // A Telegram chat ID typed in by hand is confirmed with a code too (only one-tap Telegram isn't).
        var typedTelegram = overview.Channels[0] with { Verified = false };
        Assert.True(typedTelegram.NeedsCode);
        Assert.Equal("The bot sent a 6-digit code to your Telegram chat.", typedTelegram.CodeSentLine);
        Assert.False(overview.Channels[0].NeedsCode);

        Assert.True(PersonalNotificationChannel.AddingSendsCode(NotificationChannelKind.Email));
        Assert.True(PersonalNotificationChannel.AddingSendsCode(NotificationChannelKind.Telegram));
        Assert.False(PersonalNotificationChannel.AddingSendsCode(NotificationChannelKind.Discord));
        Assert.False(PersonalNotificationChannel.AddingSendsCode(NotificationChannelKind.Ntfy));
        Assert.False(PersonalNotificationChannel.AddingSendsCode(NotificationChannelKind.Webhook));
        Assert.False(PersonalNotificationChannel.AddingSendsCode(NotificationChannelKind.Pushover));
    }

    [Fact]
    public void AnUnknownKindSurvivesInBothPlaces()
    {
        var json = Read("notification-channels")
            .Replace("\"kind\": \"telegram\"", "\"kind\": \"signal\"", StringComparison.Ordinal)
            .Replace("\"pushover\": {", "\"signal\": {\n      \"available\": true\n    },\n    \"pushover\": {", StringComparison.Ordinal);
        var overview = Json.Decode<NotificationChannelsOverview>(json);

        var channel = overview.Channels[0];
        Assert.Equal("signal", channel.Kind.Value);
        Assert.False(channel.Kind.IsKnown);
        Assert.Equal("Signal", channel.Kind.DisplayName);
        Assert.Equal("My phone", channel.Label);

        Assert.True(overview.AvailabilityOf(NotificationChannelKind.FromValue("signal"))!.Available);
        // Only the kinds this app has a form for are offered.
        Assert.DoesNotContain(NotificationChannelKind.FromValue("signal"), overview.AddableKinds);
    }

    [Fact]
    public void AMissingAvailabilityIsNotOffered()
    {
        var json = """{"available":{"email":{"available":true}},"channels":[]}""";
        var overview = Json.Decode<NotificationChannelsOverview>(json);

        Assert.Equal([NotificationChannelKind.Email], overview.AddableKinds);
        Assert.Null(overview.AvailabilityOf(NotificationChannelKind.Telegram));
        Assert.Empty(overview.Channels);
    }

    [Fact]
    public void TelegramLinkOpensOnlyHttps()
    {
        var start = Json.Decode<TelegramLinkStart>("""{"code":"abc","url":"https://t.me/MarqueeHomeBot?start=abc","expiresAt":"2026-09-25T18:50:00.000Z"}""");
        Assert.Equal("abc", start.Code);
        Assert.Equal("https://t.me/MarqueeHomeBot?start=abc", start.LinkUrl!.AbsoluteUri);
        Assert.Equal(Json.ParseDate("2026-09-25T18:50:00.000Z"), start.ExpiresAt);

        Assert.Null((start with { Url = "javascript:alert(1)" }).LinkUrl);
        Assert.Null((start with { Url = "http://t.me/x" }).LinkUrl);
    }

    [Fact]
    public void CreateBodyCarriesOnlyTheKindsField()
    {
        var body = Json.EncodeBodyToString(new CreateNotificationChannelRequest(
            NotificationChannelKind.Ntfy,
            new NotificationChannelConfig { Topic = "marquee-anna" },
            Name: "Laptop"));

        Assert.Equal("""{"kind":"ntfy","config":{"topic":"marquee-anna"},"name":"Laptop"}""", body);
    }

    [Fact]
    public void FormFieldsBecomeTheKindsConfig()
    {
        NotificationChannelConfig? From(NotificationChannelKind kind, string chatId = "", string userKey = "", string address = "", string webhookUrl = "", string topic = "", string url = "") =>
            NotificationChannelConfig.FromForm(kind, chatId, userKey, address, webhookUrl, topic, url);

        Assert.Equal(new NotificationChannelConfig { ChatId = "123456789" }, From(NotificationChannelKind.Telegram, chatId: " 123456789 ", address: "ignored@example.com"));
        Assert.Equal(new NotificationChannelConfig { UserKey = "ukey" }, From(NotificationChannelKind.Pushover, userKey: "ukey"));
        Assert.Equal(new NotificationChannelConfig { Address = "anna@example.com" }, From(NotificationChannelKind.Email, address: "anna@example.com"));
        Assert.Equal(new NotificationChannelConfig { WebhookUrl = "https://discord.com/api/webhooks/1/x" }, From(NotificationChannelKind.Discord, webhookUrl: "https://discord.com/api/webhooks/1/x"));
        // ntfy: the household topic wins over a URL; without one, the URL.
        Assert.Equal(new NotificationChannelConfig { Topic = "anna" }, From(NotificationChannelKind.Ntfy, topic: "anna", url: "https://ntfy.sh/other"));
        Assert.Equal(new NotificationChannelConfig { Url = "https://ntfy.sh/other" }, From(NotificationChannelKind.Ntfy, topic: "  ", url: "https://ntfy.sh/other"));
        Assert.Equal(new NotificationChannelConfig { Url = "https://example.com/hook" }, From(NotificationChannelKind.Webhook, url: "https://example.com/hook"));

        // The kind's own field empty: nothing to send.
        Assert.Null(From(NotificationChannelKind.Telegram, address: "anna@example.com"));
        Assert.Null(From(NotificationChannelKind.Ntfy));
        Assert.Null(From(NotificationChannelKind.FromValue("signal"), url: "https://example.com"));
    }

    // MARK: Preferences

    [Fact]
    public void PreferencesDecode()
    {
        var preferences = Fixtures.Decode<NotificationPreferences>("notification-preferences");

        Assert.Equal(["request_approved", "request_downloading", "request_pending"], preferences.Events.Select(row => row.Event));
        var approved = preferences.Events[0];
        Assert.Equal("A request is approved", approved.Label);
        Assert.False(approved.ReviewerOnly);
        Assert.True(approved.InApp);
        Assert.True(approved.Push);
        Assert.Equal(2, approved.Channels.Count);
        Assert.True(approved.Channels[TelegramId]);
        Assert.True(approved.Channels[EmailId]);

        var downloading = preferences.Events[1];
        Assert.Equal("Started downloading", downloading.Label);
        Assert.True(downloading.InApp);
        Assert.False(downloading.Push);
        Assert.False(downloading.Channels[TelegramId]);
        Assert.False(downloading.Channels[EmailId]);

        var pending = preferences.Events[2];
        Assert.Equal("New request waiting for review", pending.Label);
        Assert.True(pending.ReviewerOnly);

        Assert.Equal(["request_approved", "request_downloading"], preferences.EveryoneEvents.Select(row => row.Event));
        Assert.Equal(["request_pending"], preferences.ReviewerEvents.Select(row => row.Event));
    }

    [Fact]
    public void AnUnknownEventKeepsItsLabel()
    {
        var json = Read("notification-preferences")
            .Replace("\"event\": \"request_downloading\"", "\"event\": \"request_comment\"", StringComparison.Ordinal)
            .Replace("\"label\": \"Started downloading\"", "\"label\": \"Someone commented\"", StringComparison.Ordinal);
        var row = Json.Decode<NotificationPreferences>(json).Events[1];

        Assert.Equal("request_comment", row.Event);
        Assert.Equal("Someone commented", row.Label);
    }

    [Fact]
    public void ColumnsAreBellDevicesAndEachVerifiedChannel()
    {
        var overview = Fixtures.Decode<NotificationChannelsOverview>("notification-channels");

        var columns = NotificationPreferenceColumn.All(overview.Channels);

        // The unconfirmed email gets nothing yet, so it has no column.
        Assert.Equal(["Bell", "Devices", "My phone"], columns.Select(column => column.Label));
        Assert.Equal(TelegramId, columns[2].ChannelId);
        Assert.Equal(NotificationPreferenceColumnKind.Channel, columns[2].Kind);
    }

    [Fact]
    public void ToggleChangesOnlyThatCell()
    {
        var preferences = Fixtures.Decode<NotificationPreferences>("notification-preferences");
        var phone = new NotificationPreferenceColumn(NotificationPreferenceColumnKind.Channel, TelegramId, "My phone");

        var devices = preferences.Toggled("request_downloading", NotificationPreferenceColumn.Devices, true);
        Assert.True(devices.Events[1].Push);
        Assert.True(devices.Events[1].InApp);
        Assert.False(devices.Events[1].IsOn(phone));
        Assert.False(preferences.Events[1].Push); // the original is untouched
        Assert.Equal(preferences.Events[0], devices.Events[0]);
        Assert.Equal(preferences.Events[2], devices.Events[2]);

        var bell = preferences.Toggled("request_approved", NotificationPreferenceColumn.Bell, false);
        Assert.False(bell.Events[0].InApp);
        Assert.False(bell.Events[0].IsOn(NotificationPreferenceColumn.Bell));
        Assert.True(bell.Events[0].Push);

        var channel = preferences.Toggled("request_pending", phone, false);
        Assert.False(channel.Events[2].IsOn(phone));
        Assert.True(channel.Events[2].Channels[EmailId]);
        Assert.True(preferences.Events[2].Channels[TelegramId]);

        // A channel the map doesn't mention yet reads as off, and can be turned on.
        var fresh = new NotificationPreferenceColumn(NotificationPreferenceColumnKind.Channel, Guid.Parse("11111111-2222-3333-4444-555555555555"), "New");
        Assert.False(preferences.Events[0].IsOn(fresh));
        Assert.True(preferences.Toggled("request_approved", fresh, true).Events[0].IsOn(fresh));

        // An event this list doesn't have changes nothing.
        Assert.Equal(preferences.Events, preferences.Toggled("nope", NotificationPreferenceColumn.Bell, false).Events);
    }

    [Fact]
    public void PutBodySendsOnlyTheChange()
    {
        var phone = new NotificationPreferenceColumn(NotificationPreferenceColumnKind.Channel, TelegramId, "My phone");

        Assert.Equal(
            """{"events":[{"event":"request_downloading","push":false}]}""",
            Json.EncodeBodyToString(NotificationPreferences.Change("request_downloading", NotificationPreferenceColumn.Devices, false)));
        Assert.Equal(
            """{"events":[{"event":"request_approved","inApp":true}]}""",
            Json.EncodeBodyToString(NotificationPreferences.Change("request_approved", NotificationPreferenceColumn.Bell, true)));
        Assert.Equal(
            """{"events":[{"event":"request_pending","channels":{"0b7d5f6e-3c1a-4f3e-9d61-6f0c2e1a9b44":true}}]}""",
            Json.EncodeBodyToString(NotificationPreferences.Change("request_pending", phone, true)));
    }

    // MARK: Household channels

    [Fact]
    public void HouseholdEventsDecode()
    {
        var household = Fixtures.Decode<HouseholdNotificationEvents>("household-notification-events");

        Assert.Equal(2, household.Events.Count);
        Assert.Equal("request_approved", household.Events[0].Event);
        Assert.Equal("A request is approved", household.Events[0].Label);
        Assert.True(household.Events[0].Enabled);
        Assert.Equal("issue_updated", household.Events[1].Event);
        Assert.Equal("A reported problem is fixed", household.Events[1].Label);
        Assert.False(household.Events[1].Enabled);

        Assert.Equal(
            """{"events":{"issue_updated":true}}""",
            Json.EncodeBodyToString(new HouseholdNotificationEventsUpdate(new Dictionary<string, bool> { ["issue_updated"] = true })));
    }

    // MARK: alert and banners

    [Fact]
    public void AlertDecodesAndDefaultsToTrue()
    {
        var item = Assert.Single(Fixtures.Decode<NotificationList>("notifications").Results);
        Assert.True(item.Alert);

        var off = Read("notifications").Replace("\"alert\": true", "\"alert\": false", StringComparison.Ordinal);
        Assert.False(Assert.Single(Json.Decode<NotificationList>(off).Results).Alert);

        // An older server doesn't send it at all.
        var older = Read("notifications").Replace("\"alert\": true,", "", StringComparison.Ordinal);
        Assert.DoesNotContain("alert", older, StringComparison.Ordinal);
        Assert.True(Assert.Single(Json.Decode<NotificationList>(older).Results).Alert);
    }

    [Fact]
    public void StreamEventCarriesAlert()
    {
        // The doc's `event: notification` data line (the .sse fixture isn't linked into this project).
        const string data = """{"id":"a23f7682-41ae-4e8a-8b17-14d903ab017a","mediaType":"movie","tmdbId":27205,"title":"Inception","eventType":"request_rejected","message":"\"Inception\" was declined: Already available on a streaming service we have","read":false,"alert":true,"createdAt":"2026-09-25T11:25:16.885Z"}""";

        Assert.True(NotificationStream.DecodeNotification(data)!.Alert);
        Assert.False(NotificationStream.DecodeNotification(data.Replace("\"alert\":true", "\"alert\":false", StringComparison.Ordinal))!.Alert);
        Assert.True(NotificationStream.DecodeNotification(data.Replace("\"alert\":true,", "", StringComparison.Ordinal))!.Alert);
    }

    [Fact]
    public void NoBannerForAnItemThatIsNotAnAlert()
    {
        var item = Assert.Single(Fixtures.Decode<NotificationList>("notifications").Results);
        var before = item.CreatedAt.AddMinutes(-1);

        Assert.True(NotificationBanners.ShowsLive(item, null));
        Assert.True(NotificationBanners.ShowsLive(item, before));
        Assert.False(NotificationBanners.ShowsLive(item with { Alert = false }, null));
        Assert.False(NotificationBanners.ShowsLive(item with { Alert = false }, before));
        Assert.False(NotificationBanners.ShowsLive(item with { Read = true }, before));
        Assert.False(NotificationBanners.ShowsLive(item, item.CreatedAt));
    }

    [Fact]
    public void CatchUpSkipsWhatIsNotAnAlert()
    {
        var template = Assert.Single(Fixtures.Decode<NotificationList>("notifications").Results);
        var watermark = template.CreatedAt;
        NotificationItem At(int minutes, bool alert = true, bool read = false) =>
            template with { Id = Guid.NewGuid(), CreatedAt = watermark.AddMinutes(minutes), Alert = alert, Read = read };

        var old = At(-5);
        var quiet = At(1, alert: false);
        var read = At(2, read: true);
        var first = At(3);
        var second = At(4);
        var shown = At(5);
        var newest = At(6);

        var result = NotificationBanners.CatchUp([newest, shown, second, first, read, quiet, old], watermark, new HashSet<Guid> { shown.Id }, 5);
        Assert.Equal([first.Id, second.Id, newest.Id], result.Select(item => item.Id));

        var capped = NotificationBanners.CatchUp([newest, second, first], watermark, new HashSet<Guid>(), 2);
        Assert.Equal([second.Id, newest.Id], capped.Select(item => item.Id));
    }
}
