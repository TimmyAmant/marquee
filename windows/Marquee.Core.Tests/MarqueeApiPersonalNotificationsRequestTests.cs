using System.Text.Json.Nodes;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// Personal notifications (api-v1.md section 8, 0.45+): each method against a
// stubbed server must send exactly the method, path and JSON body the doc
// specifies, decode its answer, and record only what it changes (the
// preferences PUT changes what the bell shows).

public sealed class MarqueeApiPersonalNotificationsRequestTests
{
    private static readonly Uri Base = new("http://127.0.0.1:3000");
    private const string Token = "mqt_testtesttesttesttesttesttesttesttesttesttes";

    // Parsed from uppercase on purpose: paths carry the lowercase form.
    private static readonly Guid ChannelId = Guid.Parse("0B7D5F6E-3C1A-4F3E-9D61-6F0C2E1A9B44");
    private const string ChannelPath = "/me/notification-channels/0b7d5f6e-3c1a-4f3e-9d61-6f0c2e1a9b44";

    private const string TelegramStartJson = """{"code":"tg_abc","url":"https://t.me/MarqueeHomeBot?start=tg_abc","expiresAt":"2099-01-01T00:00:00.000Z"}""";

    /// <summary>The fixture's first channel, alone, as the single-channel endpoints answer.</summary>
    private static string ChannelJson =>
        JsonNode.Parse(Fixtures.Read("notification-channels"))!["channels"]![0]!.ToJsonString();

    /// <param name="Body">Expected JSON body; null means no body at all.</param>
    private sealed record Case(string Name, string Method, string Path, string? Body, int Status, Func<string> Response, ServerChange Changes, Func<MarqueeApi, Task> Call);

    private static readonly Case[] Cases =
    [
        new("list", "GET", "/me/notification-channels", null, 200, () => Fixtures.Read("notification-channels"), ServerChange.None, async api =>
            Assert.Equal(2, (await api.NotificationChannels.ListAsync()).Channels.Count)),
        new("create telegram", "POST", "/me/notification-channels", """{"kind":"telegram","config":{"chatId":"123456789"},"name":"My phone"}""", 201, () => ChannelJson, ServerChange.None, async api =>
            Assert.Equal(ChannelId, (await api.NotificationChannels.CreateAsync(new CreateNotificationChannelRequest(
                NotificationChannelKind.Telegram, new NotificationChannelConfig { ChatId = "123456789" }, Name: "My phone"))).Id)),
        new("create email", "POST", "/me/notification-channels", """{"kind":"email","config":{"address":"anna@example.com"}}""", 201, () => ChannelJson, ServerChange.None, api =>
            api.NotificationChannels.CreateAsync(new CreateNotificationChannelRequest(
                NotificationChannelKind.Email, new NotificationChannelConfig { Address = "anna@example.com" }))),
        new("create webhook", "POST", "/me/notification-channels", """{"kind":"webhook","config":{"url":"https://example.com/hook"},"enabled":true}""", 201, () => ChannelJson, ServerChange.None, api =>
            api.NotificationChannels.CreateAsync(new CreateNotificationChannelRequest(
                NotificationChannelKind.Webhook, new NotificationChannelConfig { Url = "https://example.com/hook" }, Enabled: true))),
        new("turn off", "PATCH", ChannelPath, """{"enabled":false}""", 200, () => ChannelJson, ServerChange.None, async api =>
            Assert.Equal("My phone", (await api.NotificationChannels.UpdateAsync(ChannelId, new UpdateNotificationChannelRequest(Enabled: false))).Name)),
        new("rename", "PATCH", ChannelPath, """{"name":"Work phone"}""", 200, () => ChannelJson, ServerChange.None, api =>
            api.NotificationChannels.UpdateAsync(ChannelId, new UpdateNotificationChannelRequest(Name: "Work phone"))),
        new("remove", "DELETE", ChannelPath, null, 200, () => Fixtures.Read("ok"), ServerChange.None, api =>
            api.NotificationChannels.RemoveAsync(ChannelId)),
        new("test", "POST", ChannelPath + "/test", null, 200, () => ChannelJson, ServerChange.None, async api =>
            Assert.NotNull((await api.NotificationChannels.TestAsync(ChannelId)).LastSuccessAt)),
        new("verify", "POST", ChannelPath + "/verify", """{"code":"123456"}""", 200, () => ChannelJson, ServerChange.None, async api =>
            Assert.True((await api.NotificationChannels.VerifyAsync(ChannelId, "123456")).Verified)),
        new("resend code", "POST", ChannelPath + "/resend-code", null, 200, () => ChannelJson, ServerChange.None, api =>
            api.NotificationChannels.ResendCodeAsync(ChannelId)),
        new("telegram link", "POST", "/me/notification-channels/telegram-link", null, 200, () => TelegramStartJson, ServerChange.None, async api =>
            Assert.Equal("tg_abc", (await api.NotificationChannels.StartTelegramLinkAsync()).Code)),
        new("telegram poll pending", "POST", "/me/notification-channels/telegram-link/poll", """{"code":"tg_abc"}""", 202, () => """{"status":"pending"}""", ServerChange.None, async api =>
            Assert.Null(await api.NotificationChannels.PollTelegramLinkAsync("tg_abc"))),
        new("telegram poll done", "POST", "/me/notification-channels/telegram-link/poll", """{"code":"tg_abc","name":"My phone"}""", 201, () => ChannelJson, ServerChange.None, async api =>
            Assert.Equal(NotificationChannelKind.Telegram, (await api.NotificationChannels.PollTelegramLinkAsync("tg_abc", "My phone"))!.Kind)),
        new("preferences", "GET", "/me/notification-preferences", null, 200, () => Fixtures.Read("notification-preferences"), ServerChange.None, async api =>
            Assert.Equal(3, (await api.NotificationPreferences.GetAsync()).Events.Count)),
        new("save preferences", "PUT", "/me/notification-preferences", """{"events":[{"event":"request_downloading","push":false,"channels":{"0b7d5f6e-3c1a-4f3e-9d61-6f0c2e1a9b44":true}}]}""", 200, () => Fixtures.Read("notification-preferences"), ServerChange.Notifications, async api =>
            Assert.Equal(3, (await api.NotificationPreferences.SaveAsync(new NotificationPreferencesUpdate(
                [new NotificationPreferenceChange("request_downloading", Push: false, Channels: new Dictionary<Guid, bool> { [ChannelId] = true })]))).Events.Count)),
        new("household events", "GET", "/settings/notification-events", null, 200, () => Fixtures.Read("household-notification-events"), ServerChange.None, async api =>
            Assert.Equal(2, (await api.HouseholdNotificationEvents.GetAsync()).Events.Count)),
        new("save household events", "PUT", "/settings/notification-events", """{"events":{"issue_updated":true}}""", 200, () => Fixtures.Read("household-notification-events"), ServerChange.Integrations, api =>
            api.HouseholdNotificationEvents.SaveAsync(new Dictionary<string, bool> { ["issue_updated"] = true })),
    ];

    public static TheoryData<string> CaseNames
    {
        get
        {
            var data = new TheoryData<string>();
            foreach (var testCase in Cases)
            {
                data.Add(testCase.Name);
            }
            return data;
        }
    }

    [Theory]
    [MemberData(nameof(CaseNames))]
    public async Task SendsWhatTheDocSpecifies(string name)
    {
        var testCase = Cases.Single(candidate => candidate.Name == name);
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(testCase.Status, testCase.Response());
        var events = new ServerEvents();
        var api = new MarqueeApi(new ApiClient(Base, Token, stub), events);

        await testCase.Call(api);

        var request = Assert.Single(stub.Requests);
        Assert.Equal(testCase.Method, request.Method.Method);
        Assert.Equal("/api/v1" + testCase.Path, request.Path);
        Assert.Empty(request.Query);
        Assert.Equal("Bearer " + Token, request.Authorization);
        if (testCase.Body is { } expected)
        {
            Assert.Equal("application/json", request.ContentType);
            Assert.True(JsonNode.DeepEquals(JsonNode.Parse(expected), request.JsonBody), $"{name} body was {request.Body}");
        }
        else
        {
            Assert.Equal("", request.Body);
        }
        if (testCase.Changes == ServerChange.None)
        {
            Assert.Equal(0, events.Revision(ServerChange.All));
        }
        else
        {
            Assert.Equal(1, events.Revision(testCase.Changes));
            Assert.Equal(0, events.Revision(ServerChange.All & ~testCase.Changes));
        }
    }

    [Fact]
    public async Task TelegramPollExpiresWith410()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(410, """{"error":"That link expired.","code":"expired"}""");
        var api = new MarqueeApi(new ApiClient(Base, Token, stub));

        var error = await Assert.ThrowsAsync<ApiException>(() => api.NotificationChannels.PollTelegramLinkAsync("tg_abc"));

        Assert.Equal(ApiErrorKind.Expired, error.Kind);
        Assert.Equal(NotificationChannelsEndpoints.TelegramLinkExpiredMessage, error.Message);
    }

    [Fact]
    public async Task TelegramPollConflictSaysEnterTheChatId()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(409, """{"error":"The household bot's messages go to a webhook, so Marquee can't read them. Enter your chat ID instead.","code":"conflict"}""");
        var api = new MarqueeApi(new ApiClient(Base, Token, stub));

        var error = await Assert.ThrowsAsync<ApiException>(() => api.NotificationChannels.PollTelegramLinkAsync("tg_abc"));

        Assert.Equal(ApiErrorKind.Conflict, error.Kind);
        Assert.Contains("chat ID", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task AFailedTestSaysWhy()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(400, """{"error":"The test message didn't arrive: HTTP 404","code":"invalid"}""");
        var api = new MarqueeApi(new ApiClient(Base, Token, stub));

        var error = await Assert.ThrowsAsync<ApiException>(() => api.NotificationChannels.TestAsync(ChannelId));

        Assert.Equal(ApiErrorKind.Invalid, error.Kind);
        Assert.Equal("The test message didn't arrive: HTTP 404", error.Message);
    }

    [Fact]
    public async Task AnOlderServerAnswersNotFound()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(404, """{"error":"Not found","code":"not_found"}""");
        var api = new MarqueeApi(new ApiClient(Base, Token, stub));

        Assert.Equal(ApiErrorKind.NotFound, (await Assert.ThrowsAsync<ApiException>(() => api.NotificationChannels.ListAsync())).Kind);
        Assert.Equal(ApiErrorKind.NotFound, (await Assert.ThrowsAsync<ApiException>(() => api.NotificationPreferences.GetAsync())).Kind);
    }
}
