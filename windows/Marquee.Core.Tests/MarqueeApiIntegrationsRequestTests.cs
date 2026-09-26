using System.Text.Json.Nodes;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// The integrations area of the Mac's MarqueeAPIRequestTests: every
// /settings/integrations call sends exactly what api-v1.md section 12
// specifies, the doc's example decodes, and the change signal fires for
// mutations only, plus the one read that records: a Plex PIN poll that
// comes back connected (it just synced the library).

public sealed class MarqueeApiIntegrationsRequestTests
{
    private static readonly Uri Base = new("http://127.0.0.1:3000");

    /// <param name="Body">Expected JSON body; null means no body at all.</param>
    /// <param name="Changes">What a successful call records; None for a read or a read-only POST.</param>
    private sealed record Case(
        string Method,
        string Path,
        string? Body,
        string Response,
        ServerChange Changes,
        Func<MarqueeApi, Task> Call)
    {
        public string Name => $"{Method} {Path}";
    }

    /// <summary>A connection change: the Settings page plus the library badges built from it.</summary>
    private const ServerChange Reconnected = ServerChange.Integrations | ServerChange.Library;

    /// <summary>The four Sonarr/Radarr calls, once per provider, through <c>Arr(provider)</c> like the Mac test.</summary>
    private static IEnumerable<Case> ArrCases(ArrProvider provider)
    {
        var path = $"/settings/integrations/{provider.Value}";
        yield return new("PUT", path, """{"baseUrl":"http://10.0.0.2:8989","apiKey":"k"}""", "arr-connect", Reconnected,
            api => api.Integrations.Arr(provider).ConnectAsync("http://10.0.0.2:8989", "k"));
        yield return new("DELETE", path, null, "ok", Reconnected, api => api.Integrations.Arr(provider).DisconnectAsync());
        yield return new("GET", path + "/options", null, "arr-options", ServerChange.None, api => api.Integrations.Arr(provider).OptionsAsync());
        yield return new("PUT", path + "/defaults", """{"rootFolderPath":"/tv","qualityProfileId":4}""", "ok", Reconnected,
            api => api.Integrations.Arr(provider).SaveDefaultsAsync("/tv", 4));
    }

    private static readonly Case[] Cases =
    [
        .. ArrCases(ArrProvider.Sonarr),
        .. ArrCases(ArrProvider.Radarr),
        .. ArrCases(ArrProvider.Sonarr4k),
        .. ArrCases(ArrProvider.Radarr4k),
        new("GET", "/settings/integrations", null, "integrations", ServerChange.None, api => api.Integrations.OverviewAsync()),
        new("POST", "/settings/integrations/sync", null, "ok", Reconnected, api => api.Integrations.SyncNowAsync()),
        new("POST", "/settings/integrations/webhook-secret", null, "webhook-secret", ServerChange.Integrations,
            api => api.Integrations.RegenerateWebhookSecretAsync()),
        // Starting a PIN changes nothing on the server; a poll that comes
        // back connected has just run the first library sync.
        new("POST", "/settings/integrations/plex/pin", null, "plex-pin-start", ServerChange.None, api => api.Integrations.Plex.StartPinAsync()),
        new("GET", "/settings/integrations/plex/pin/123456789", null, "plex-pin-connected", Reconnected,
            api => api.Integrations.Plex.PollPinAsync(123_456_789)),
        new("DELETE", "/settings/integrations/plex", null, "ok", Reconnected, api => api.Integrations.Plex.DisconnectAsync()),
        new("PUT", "/settings/integrations/jellyfin", """{"baseUrl":"http://10.0.0.2:8096","apiKey":"k"}""", "ok", Reconnected,
            api => api.Integrations.Jellyfin.ConnectAsync("http://10.0.0.2:8096", "k")),
        new("DELETE", "/settings/integrations/jellyfin", null, "ok", Reconnected, api => api.Integrations.Jellyfin.DisconnectAsync()),
        new("PUT", "/settings/integrations/tmdb", """{"accessToken":"t"}""", "ok", Reconnected, api => api.Integrations.Tmdb.SaveAsync("t")),
        new("DELETE", "/settings/integrations/tmdb", null, "ok", Reconnected, api => api.Integrations.Tmdb.RemoveAsync()),
        new("PUT", "/settings/integrations/trakt", """{"clientId":"c"}""", "ok", ServerChange.Integrations, api => api.Integrations.Trakt.SaveAsync("c")),
        new("DELETE", "/settings/integrations/trakt", null, "ok", ServerChange.Integrations, api => api.Integrations.Trakt.RemoveAsync()),
        new("POST", "/settings/integrations/trakt/import", """{"url":"https://trakt.tv/users/u/watchlist"}""", "trakt-import",
            ServerChange.Requests | ServerChange.Integrations, api => api.Integrations.Trakt.ImportListAsync("https://trakt.tv/users/u/watchlist")),
        new("PUT", "/settings/integrations/tvdb", """{"apiKey":"v"}""", "ok", Reconnected, api => api.Integrations.Tvdb.SaveAsync("v")),
        new("DELETE", "/settings/integrations/tvdb", null, "ok", Reconnected, api => api.Integrations.Tvdb.RemoveAsync()),
        new("PUT", "/settings/integrations/discord", """{"webhookUrl":"https://discord.com/api/webhooks/1"}""", "ok", ServerChange.Integrations,
            api => api.Integrations.Discord.SaveAsync("https://discord.com/api/webhooks/1")),
        new("DELETE", "/settings/integrations/discord", null, "ok", ServerChange.Integrations, api => api.Integrations.Discord.RemoveAsync()),
        new("PUT", "/settings/integrations/ntfy", """{"topicUrl":"https://ntfy.sh/t"}""", "ok", ServerChange.Integrations,
            api => api.Integrations.Ntfy.SaveAsync("https://ntfy.sh/t")),
        new("DELETE", "/settings/integrations/ntfy", null, "ok", ServerChange.Integrations, api => api.Integrations.Ntfy.RemoveAsync()),
        new("PUT", "/settings/integrations/webhook", """{"webhookUrl":"https://example.com/hook"}""", "ok", ServerChange.Integrations,
            api => api.Integrations.Webhook.SaveAsync("https://example.com/hook")),
        new("DELETE", "/settings/integrations/webhook", null, "ok", ServerChange.Integrations, api => api.Integrations.Webhook.RemoveAsync()),
        new("PUT", "/settings/integrations/telegram", """{"botToken":"123456789:AAx","chatId":"-1001234567890"}""", "ok", ServerChange.Integrations,
            api => api.Integrations.Telegram.SaveAsync(new TelegramSettingRequest("123456789:AAx", "-1001234567890"))),
        new("DELETE", "/settings/integrations/telegram", null, "ok", ServerChange.Integrations, api => api.Integrations.Telegram.RemoveAsync()),
        new("PUT", "/settings/integrations/pushover", """{"appToken":"","userKey":"uQiRzpo4DXghDmr9QzzfQu27cmVRsG"}""", "ok", ServerChange.Integrations,
            api => api.Integrations.Pushover.SaveAsync(new PushoverSettingRequest("", "uQiRzpo4DXghDmr9QzzfQu27cmVRsG"))),
        new("DELETE", "/settings/integrations/pushover", null, "ok", ServerChange.Integrations, api => api.Integrations.Pushover.RemoveAsync()),
        new("PUT", "/settings/integrations/email",
            """{"host":"smtp.gmail.com","port":587,"secure":false,"username":"me@gmail.com","password":"","from":"me@gmail.com","to":["me@gmail.com","partner@example.com"]}""",
            "ok", ServerChange.Integrations,
            api => api.Integrations.Email.SaveAsync(new EmailSettingRequest(
                "smtp.gmail.com", 587, false, "me@gmail.com", "", "me@gmail.com", ["me@gmail.com", "partner@example.com"]))),
        new("DELETE", "/settings/integrations/email", null, "ok", ServerChange.Integrations, api => api.Integrations.Email.RemoveAsync()),
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

    [Fact]
    public void EveryCaseCoversADifferentEndpoint()
    {
        // Section 12 documents 43 endpoints (the Sonarr/Radarr four count four
        // times: Sonarr, Radarr, and their 4K instances from 0.37).
        Assert.Equal(43, Cases.Length);
        Assert.Equal(Cases.Length, Cases.Select(testCase => testCase.Name).Distinct(StringComparer.Ordinal).Count());
    }

    [Theory]
    [MemberData(nameof(CaseNames))]
    public async Task SendsWhatTheDocSpecifies(string name)
    {
        var testCase = Cases.Single(candidate => candidate.Name == name);
        var stub = new StubHttpMessageHandler();
        stub.AnswerFixture(testCase.Response);
        var events = new ServerEvents();
        var raised = new List<ServerChangedEventArgs>();
        events.Changed += (_, args) => raised.Add(args);
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub), events);

        await testCase.Call(api);

        var request = Assert.Single(stub.Requests);
        Assert.Equal(testCase.Method, request.Method.Method);
        Assert.Equal("/api/v1" + testCase.Path, request.Path);
        Assert.Empty(request.Query);
        Assert.Equal("Bearer mqt_testtesttesttesttesttesttesttesttesttesttes", request.Authorization);
        if (testCase.Body is { } expected)
        {
            Assert.Equal("application/json", request.ContentType);
            Assert.True(JsonNode.DeepEquals(JsonNode.Parse(expected), request.JsonBody), $"{name} body was {request.Body}");
        }
        else
        {
            Assert.Equal("", request.Body);
            Assert.Null(request.ContentType);
        }

        if (testCase.Changes == ServerChange.None)
        {
            Assert.Empty(raised);
            Assert.Equal(0, events.Revision(ServerChange.All));
        }
        else
        {
            var change = Assert.Single(raised);
            Assert.Equal(testCase.Changes, change.Change);
            Assert.Equal(ServerChangeSource.Mutation, change.Source);
            Assert.Equal(1, events.Revision(ServerChange.Integrations));
            Assert.Equal(testCase.Changes.HasFlag(ServerChange.Library) ? 1 : 0, events.Revision(ServerChange.Library));
            Assert.Equal(testCase.Changes.HasFlag(ServerChange.Requests) ? 1 : 0, events.Revision(ServerChange.Requests));
            Assert.Equal(0, events.Revision(ServerChange.Notifications | ServerChange.Favorites | ServerChange.Users | ServerChange.Jobs));
        }
    }

    [Fact]
    public async Task SonarrAndRadarrPropertiesUseTheirOwnPaths()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerFixture("arr-options");
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub));

        Assert.Equal(ArrProvider.Sonarr, api.Integrations.Sonarr.Provider);
        Assert.Equal(ArrProvider.Radarr, api.Integrations.Radarr.Provider);
        Assert.Equal(ArrProvider.Sonarr4k, api.Integrations.Sonarr4k.Provider);
        Assert.Equal(ArrProvider.Radarr4k, api.Integrations.Radarr4k.Provider);
        await api.Integrations.Sonarr.OptionsAsync();
        await api.Integrations.Radarr.OptionsAsync();
        await api.Integrations.Sonarr4k.OptionsAsync();
        await api.Integrations.Radarr4k.OptionsAsync();

        Assert.Equal(
            [
                "/api/v1/settings/integrations/sonarr/options", "/api/v1/settings/integrations/radarr/options",
                "/api/v1/settings/integrations/sonarr4k/options", "/api/v1/settings/integrations/radarr4k/options",
            ],
            stub.Requests.Select(request => request.Path));
    }

    [Fact]
    public async Task AWaitingPlexPollRecordsNothing()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerFixture("plex-pin-waiting");
        var events = new ServerEvents();
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub), events);

        var status = await api.Integrations.Plex.PollPinAsync(123_456_789);

        Assert.False(status.Connected);
        Assert.Null(status.MovieCount);
        Assert.Null(status.TvCount);
        Assert.Equal(0, events.Revision(ServerChange.All));
    }

    [Fact]
    public async Task ResultsDecodeIntoTheirValues()
    {
        var stub = new StubHttpMessageHandler();
        stub.Answer(request => request.Path switch
        {
            "/api/v1/settings/integrations" => StubHttpMessageHandler.Fixture("integrations"),
            "/api/v1/settings/integrations/webhook-secret" => StubHttpMessageHandler.Fixture("webhook-secret"),
            "/api/v1/settings/integrations/sonarr" => StubHttpMessageHandler.Fixture("arr-connect"),
            "/api/v1/settings/integrations/sonarr/options" => StubHttpMessageHandler.Fixture("arr-options"),
            "/api/v1/settings/integrations/plex/pin" => StubHttpMessageHandler.Fixture("plex-pin-start"),
            "/api/v1/settings/integrations/trakt/import" => StubHttpMessageHandler.Fixture("trakt-import"),
            _ => StubHttpMessageHandler.Fixture("plex-pin-connected"),
        });
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub));

        var overview = await api.Integrations.OverviewAsync();
        Assert.True(overview.Plex.Connected);
        Assert.Equal(9_123_456_789_012L, overview.Plex.TotalBytes);
        Assert.True(overview.Sonarr.FullyConfigured);
        Assert.Null(overview.Radarr.BaseUrl);

        var webhooks = await api.Integrations.RegenerateWebhookSecretAsync();
        Assert.Equal("0f3c…", webhooks.Secret);

        var connected = await api.Integrations.Sonarr.ConnectAsync("http://192.168.1.10:8989/", "k");
        Assert.True(connected.Ok);
        Assert.Equal("http://192.168.1.10:8989", connected.BaseUrl);
        Assert.Equal("/tv", connected.SelectedRootFolder);

        var options = await api.Integrations.Sonarr.OptionsAsync();
        Assert.Equal("HD-1080p", Assert.Single(options.QualityProfiles).Name);

        var pin = await api.Integrations.Plex.StartPinAsync();
        Assert.Equal(123_456_789, pin.PinId);

        var poll = await api.Integrations.Plex.PollPinAsync(pin.PinId);
        Assert.True(poll.Connected);
        Assert.Equal(812, poll.MovieCount);

        var imported = await api.Integrations.Trakt.ImportListAsync("https://trakt.tv/users/u/watchlist");
        Assert.Equal(12, imported.ImportedCount);
        Assert.Equal(3, imported.SkippedCount);
    }

    [Fact]
    public async Task FailedSyncIsUpstreamAndRecordsNothing()
    {
        // The doc's upstream example: a connected service that didn't answer.
        var stub = new StubHttpMessageHandler();
        stub.Answer(() => StubHttpMessageHandler.Json(502, Fixtures.Read("error-upstream")));
        var events = new ServerEvents();
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub), events);

        var error = await Assert.ThrowsAsync<ApiException>(() => api.Integrations.SyncNowAsync());

        Assert.Equal(ApiErrorKind.Upstream, error.Kind);
        Assert.StartsWith("TMDb isn't configured", error.Message, StringComparison.Ordinal);
        Assert.Equal(0, events.Revision(ServerChange.All));
    }

    [Fact]
    public async Task RejectedSettingIsInvalidWithTheWebsitesMessage()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(400, """{"error":"Enter an access token.","code":"invalid"}""");
        var events = new ServerEvents();
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub), events);

        var error = await Assert.ThrowsAsync<ApiException>(() => api.Integrations.Tmdb.SaveAsync(""));

        Assert.Equal(ApiErrorKind.Invalid, error.Kind);
        Assert.Equal("Enter an access token.", error.Message);
        Assert.Equal(0, events.Revision(ServerChange.All));
    }

    [Fact]
    public async Task RejectedChannelIsInvalidWithTheServersMessage()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(400, """{"error":"Telegram didn't take the test message: chat not found","code":"invalid"}""");
        var events = new ServerEvents();
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub), events);

        var error = await Assert.ThrowsAsync<ApiException>(
            () => api.Integrations.Telegram.SaveAsync(new TelegramSettingRequest("", "-100")));

        Assert.Equal(ApiErrorKind.Invalid, error.Kind);
        Assert.Equal("Telegram didn't take the test message: chat not found", error.Message);
        Assert.Equal(0, events.Revision(ServerChange.All));
        Assert.Equal(IntegrationProvider.Telegram, api.Integrations.Telegram.Provider);
        Assert.Equal(IntegrationProvider.Pushover, api.Integrations.Pushover.Provider);
        Assert.Equal(IntegrationProvider.Email, api.Integrations.Email.Provider);
    }

    [Fact]
    public async Task OptionsWithoutAConnectionIsAConflict()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(409, """{"error":"Connect Sonarr in Settings first.","code":"conflict"}""");
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub));

        var error = await Assert.ThrowsAsync<ApiException>(() => api.Integrations.Sonarr.OptionsAsync());

        Assert.Equal(ApiErrorKind.Conflict, error.Kind);
        Assert.Equal("Connect Sonarr in Settings first.", error.Message);
        Assert.False(error.IsSonarrUnresolvable);
    }

    [Fact]
    public async Task MemberManagingIntegrationsIsForbidden()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(403, """{"error":"Only the admin can manage integrations.","code":"forbidden"}""");
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub));

        var error = await Assert.ThrowsAsync<ApiException>(() => api.Integrations.OverviewAsync());
        Assert.Equal(ApiErrorKind.Forbidden, error.Kind);
    }
}
