using System.Text.Json.Nodes;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// Any number of Sonarr/Radarr servers (api-v1.md section 12, 0.43+): the
// doc's examples decode, every /settings/arr-servers call sends what the doc
// specifies, and the Add/Edit form turns into the right bodies. An older
// server's overview (no arrServers) keeps the four fixed cards.

public sealed class ArrServersTests
{
    private static readonly Uri Base = new("http://127.0.0.1:3000");
    private const string Token = "mqt_testtesttesttesttesttesttesttesttesttesttes";
    private const string SonarrId = "4f0c2a8e-1b7d-4c1e-9a55-3c2d8e6f7a10";
    private const string Radarr4kId = "7d2a9e40-3c1b-4f6e-8a2d-5b9c0e1f4a73";

    /// <summary>A connection change: the Settings page plus the library badges built from it.</summary>
    private const ServerChange Reconnected = ServerChange.Integrations | ServerChange.Library;

    /// <summary><c>{ "ok": true, "server": … }</c> around the doc's first server.</summary>
    private static string SavedResponse()
    {
        var server = JsonNode.Parse(Fixtures.Read("arr-servers"))!["results"]![0]!.DeepClone();
        return new JsonObject { ["ok"] = true, ["server"] = server }.ToJsonString();
    }

    // MARK: Fixtures

    [Fact]
    public void OverviewListsEveryServer()
    {
        var overview = Fixtures.Decode<IntegrationsOverview>("integrations");

        Assert.True(overview.HasArrServers);
        Assert.Equal(2, overview.ArrServers!.Count);

        var sonarr = overview.ArrServers[0];
        Assert.Equal(SonarrId, sonarr.Id);
        Assert.Equal(ArrProvider.Sonarr, sonarr.Kind);
        Assert.True(sonarr.IsSonarr);
        Assert.Equal("Sonarr", sonarr.Name);
        Assert.Equal("http://192.168.1.10:8989", sonarr.BaseUrl);
        Assert.True(sonarr.HasApiKey);
        Assert.False(sonarr.Is4k);
        Assert.True(sonarr.IsDefault);
        Assert.Equal(4, sonarr.QualityProfileId);
        Assert.Equal("/tv", sonarr.RootFolderPath);
        Assert.Empty(sonarr.Tags);
        Assert.Equal(SeriesType.Standard, sonarr.SeriesType);
        Assert.True(sonarr.SeasonFolders);
        Assert.Equal(7, sonarr.AnimeQualityProfileId);
        Assert.Equal("/anime", sonarr.AnimeRootFolderPath);
        Assert.Equal([3], sonarr.AnimeTags);
        Assert.True(sonarr.FullyConfigured);
        Assert.StartsWith("http://marquee.local:3000/api/webhooks/servers/4f0c2a8e-", sonarr.WebhookUrl, StringComparison.Ordinal);

        var radarr4k = overview.ArrServers[1];
        Assert.Equal(Radarr4kId, radarr4k.Id);
        Assert.Equal(ArrProvider.Radarr, radarr4k.Kind);
        Assert.False(radarr4k.IsSonarr);
        Assert.Equal("4K Radarr", radarr4k.Name);
        Assert.True(radarr4k.Is4k);
        Assert.Null(radarr4k.SeriesType);
        Assert.Null(radarr4k.SeasonFolders);
        Assert.Null(radarr4k.AnimeQualityProfileId);
        Assert.Null(radarr4k.AnimeRootFolderPath);
        Assert.Empty(radarr4k.AnimeTags);

        Assert.Equal([sonarr], overview.ArrServersOf(ArrProvider.Sonarr));
        Assert.Equal([radarr4k], overview.ArrServersOf(ArrProvider.Radarr));
    }

    [Fact]
    public void OlderServerWithoutArrServersKeepsTheFixedCards()
    {
        // Before 0.43 there's no arrServers: the four fixed cards stay.
        var json = JsonNode.Parse(Fixtures.Read("integrations"))!.AsObject();
        json.Remove("arrServers");

        var overview = Json.Decode<IntegrationsOverview>(json.ToJsonString());

        Assert.Null(overview.ArrServers);
        Assert.False(overview.HasArrServers);
        Assert.Empty(overview.ArrServersOf(ArrProvider.Sonarr));
        Assert.True(overview.HasFourKArr);
        Assert.True(overview.Sonarr.Connected);
    }

    [Fact]
    public void ServerListDecodes()
    {
        var list = Fixtures.Decode<ListResponse<ArrServer>>("arr-servers").Results;

        var server = Assert.Single(list);
        Assert.Equal(SonarrId, server.Id);
        Assert.Null(server.AnimeQualityProfileId);
        Assert.Null(server.AnimeRootFolderPath);
        Assert.Empty(server.AnimeTags);
    }

    [Fact]
    public void TestResultDecodes()
    {
        var result = Fixtures.Decode<ArrServerTestResult>("arr-server-test");

        Assert.True(result.Ok);
        Assert.Equal("5.26.2.10099", result.Version);
        Assert.Equal([new QualityProfile { Id = 4, Name = "HD-1080p" }, new QualityProfile { Id = 6, Name = "HD - 720p/1080p" }], result.QualityProfiles);
        Assert.Equal(["/movies", "/movies-kids"], result.RootFolders.Select(folder => folder.Path));
        Assert.Equal(new ArrTag { Id = 2, Label = "kids" }, Assert.Single(result.Tags));
        Assert.Equal(result.QualityProfiles, result.Options.QualityProfiles);
        Assert.Equal(result.Tags, result.Options.Tags);

        // The options endpoint's shape is the same lists.
        var options = Json.Decode<ArrServerOptions>(Fixtures.Read("arr-server-test"));
        Assert.Equal(2, options.RootFolders.Count);
    }

    [Fact]
    public void AddOptionsDecode()
    {
        var options = Fixtures.Decode<AddOptions>("add-options");

        Assert.Equal(MediaType.Tv, options.MediaType);
        Assert.Equal(95396, options.TmdbId);
        Assert.False(options.Is4k);
        Assert.False(options.IsAnime);
        var server = Assert.Single(options.Servers);
        Assert.Equal(SonarrId, server.Id);
        Assert.Equal("Sonarr", server.Name);
        Assert.True(server.IsDefault);
        Assert.False(server.Is4k);
        Assert.True(server.Reachable);
        Assert.Equal("Sonarr", server.DisplayName);
        Assert.Equal(["HD-1080p", "Anime"], server.QualityProfiles.Select(profile => profile.Name));
        Assert.Equal(["/tv", "/anime"], server.RootFolders.Select(folder => folder.Path));
        Assert.Equal(["kids", "anime"], server.Tags.Select(tag => tag.Label));
        Assert.Equal(4, server.Defaults.QualityProfileId);
        Assert.Equal("/tv", server.Defaults.RootFolderPath);
        Assert.Empty(server.Defaults.Tags);
        Assert.Equal(SeriesType.Standard, server.Defaults.SeriesType);

        Assert.Equal("Sonarr (not responding)", (server with { Reachable = false }).DisplayName);
    }

    // MARK: Requests

    private sealed record Case(string Method, string Path, string? Body, Func<string> Response, ServerChange Changes, Func<MarqueeApi, Task> Call, string? Label = null)
    {
        public string Name => Label ?? $"{Method} {Path}";
    }

    private static readonly Case[] Cases =
    [
        new("GET", "/settings/arr-servers", null, () => Fixtures.Read("arr-servers"), ServerChange.None, api => api.Integrations.ArrServers.ListAsync()),
        new("POST", "/settings/arr-servers/test", """{"kind":"radarr","baseUrl":"http://192.168.1.10:7878","apiKey":"k"}""",
            () => Fixtures.Read("arr-server-test"), ServerChange.None,
            api => api.Integrations.ArrServers.TestAsync(new ArrServerTestRequest(ArrProvider.Radarr, "http://192.168.1.10:7878", "k"))),
        new("POST", "/settings/arr-servers/test", $$"""{"kind":"sonarr","baseUrl":"http://192.168.1.10:8989","serverId":"{{SonarrId}}"}""",
            () => Fixtures.Read("arr-server-test"), ServerChange.None,
            api => api.Integrations.ArrServers.TestAsync(new ArrServerTestRequest(ArrProvider.Sonarr, "http://192.168.1.10:8989", ServerId: SonarrId)),
            Label: "POST /settings/arr-servers/test with the saved key"),
        new("POST", "/settings/arr-servers", """{"kind":"radarr","baseUrl":"http://192.168.1.10:7878","apiKey":"k","name":"Radarr 2","is4k":false,"tags":[]}""",
            SavedResponse, Reconnected,
            api => api.Integrations.ArrServers.AddAsync(new ArrServerCreateRequest
            {
                Kind = ArrProvider.Radarr,
                BaseUrl = "http://192.168.1.10:7878",
                ApiKey = "k",
                Name = "Radarr 2",
                Is4k = false,
                Tags = [],
            })),
        new("PATCH", $"/settings/arr-servers/{SonarrId}", """{"isDefault":true}""", SavedResponse, Reconnected,
            api => api.Integrations.ArrServers.UpdateAsync(SonarrId, new ArrServerUpdateRequest { IsDefault = true })),
        new("DELETE", $"/settings/arr-servers/{SonarrId}", null, () => Fixtures.Read("ok"), Reconnected,
            api => api.Integrations.ArrServers.RemoveAsync(SonarrId)),
        new("GET", $"/settings/arr-servers/{SonarrId}/options", null, () => Fixtures.Read("arr-server-test"), ServerChange.None,
            api => api.Integrations.ArrServers.OptionsAsync(SonarrId)),
        new("POST", $"/settings/arr-servers/{SonarrId}/webhook-secret", null,
            () => """{"ok":true,"webhookUrl":"http://…/api/webhooks/servers/…?secret=…"}""", ServerChange.Integrations,
            api => api.Integrations.ArrServers.RegenerateWebhookSecretAsync(SonarrId)),
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
    public void EveryEndpointIsCovered()
    {
        // The seven /settings/arr-servers endpoints, test twice (key or saved key).
        Assert.Equal(8, Cases.Length);
        Assert.Equal(7, Cases.Select(testCase => $"{testCase.Method} {testCase.Path}").Distinct(StringComparer.Ordinal).Count());
        Assert.Equal(Cases.Length, Cases.Select(testCase => testCase.Name).Distinct(StringComparer.Ordinal).Count());
    }

    [Theory]
    [MemberData(nameof(CaseNames))]
    public async Task SendsWhatTheDocSpecifies(string name)
    {
        var testCase = Cases.Single(candidate => candidate.Name == name);
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(200, testCase.Response());
        var events = new ServerEvents();
        var raised = new List<ServerChangedEventArgs>();
        events.Changed += (_, args) => raised.Add(args);
        var api = new MarqueeApi(new ApiClient(Base, Token, stub), events);

        await testCase.Call(api);

        var request = Assert.Single(stub.Requests);
        Assert.Equal(testCase.Method, request.Method.Method);
        Assert.Equal("/api/v1" + testCase.Path, request.Path);
        Assert.Empty(request.Query);
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
        }
        else
        {
            Assert.Equal(testCase.Changes, Assert.Single(raised).Change);
        }
    }

    [Fact]
    public async Task ResultsDecodeIntoTheirValues()
    {
        var stub = new StubHttpMessageHandler();
        stub.Answer(request => request.Path switch
        {
            "/api/v1/settings/arr-servers" when request.Method == HttpMethod.Get => StubHttpMessageHandler.Fixture("arr-servers"),
            "/api/v1/settings/arr-servers" => StubHttpMessageHandler.Json(201, SavedResponse()),
            "/api/v1/settings/arr-servers/test" => StubHttpMessageHandler.Fixture("arr-server-test"),
            _ => StubHttpMessageHandler.Json(200, """{"ok":true,"webhookUrl":"http://x/api/webhooks/servers/1?secret=new"}"""),
        });
        var api = new MarqueeApi(new ApiClient(Base, Token, stub));

        Assert.Equal("Sonarr", Assert.Single(await api.Integrations.ArrServers.ListAsync()).Name);
        Assert.Equal("5.26.2.10099", (await api.Integrations.ArrServers.TestAsync(new ArrServerTestRequest(ArrProvider.Radarr, "http://x", "k"))).Version);
        var added = await api.Integrations.ArrServers.AddAsync(new ArrServerCreateRequest { Kind = ArrProvider.Sonarr, BaseUrl = "http://x", ApiKey = "k" });
        Assert.Equal(SonarrId, added.Id);
        Assert.Equal("http://x/api/webhooks/servers/1?secret=new", await api.Integrations.ArrServers.RegenerateWebhookSecretAsync("1"));
    }

    [Fact]
    public async Task AnOlderServerIsNotFound()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(404, """{"error":"Not found.","code":"not_found"}""");
        var api = new MarqueeApi(new ApiClient(Base, Token, stub));

        var error = await Assert.ThrowsAsync<ApiException>(() => api.Titles.AddOptionsAsync(MediaType.Movie, 603));
        Assert.Equal(ApiErrorKind.NotFound, error.Kind);
    }

    // MARK: The Add/Edit form

    private static ArrServer SavedSonarr => Fixtures.Decode<IntegrationsOverview>("integrations").ArrServers![0];
    private static ArrServer SavedRadarr4k => Fixtures.Decode<IntegrationsOverview>("integrations").ArrServers![1];

    [Fact]
    public void ANewServerTestsWithItsKeyAndSendsOnlyWhatsSet()
    {
        var draft = new ArrServerDraft(ArrProvider.Radarr) { BaseUrl = " http://192.168.1.10:7878 ", ApiKey = " k " };

        Assert.False(draft.IsEditing);
        Assert.Equal("", draft.ApiKeyPlaceholder);
        Assert.Equal("http://localhost:7878", draft.BaseUrlPlaceholder);
        Assert.False(draft.NeedsKeyAgain);
        Assert.Equal(new ArrServerTestRequest(ArrProvider.Radarr, "http://192.168.1.10:7878", "k"), draft.TestRequest());

        draft.ApplyOptions(Fixtures.Decode<ArrServerTestResult>("arr-server-test").Options);
        Assert.Equal(4, draft.QualityProfileId);
        Assert.Equal("/movies", draft.RootFolderPath);
        draft.Tags.Add(2);

        Assert.Equal(
            """{"kind":"radarr","baseUrl":"http://192.168.1.10:7878","apiKey":"k","is4k":false,"qualityProfileId":4,"rootFolderPath":"/movies","tags":[2]}""",
            Json.EncodeBodyToString(draft.CreateRequest()));

        var sonarr = new ArrServerDraft(ArrProvider.Sonarr) { Name = "Anime box", BaseUrl = "http://s", ApiKey = "k", Is4k = true, IsDefault = true };
        Assert.Equal(
            """{"kind":"sonarr","baseUrl":"http://s","apiKey":"k","name":"Anime box","is4k":true,"isDefault":true,"tags":[],"seriesType":"standard","seasonFolders":true,"animeTags":[]}""",
            Json.EncodeBodyToString(sonarr.CreateRequest()));
    }

    [Fact]
    public void EditingTestsWithTheSavedKeyUntilTheUrlChanges()
    {
        var draft = new ArrServerDraft(SavedSonarr);

        Assert.True(draft.IsEditing);
        Assert.Equal("Saved — enter to replace", draft.ApiKeyPlaceholder);
        Assert.Equal("Sonarr", draft.Name);
        Assert.Equal(SeriesType.Standard, draft.SeriesType);
        Assert.Equal(7, draft.AnimeQualityProfileId);
        Assert.Equal(new ArrServerTestRequest(ArrProvider.Sonarr, "http://192.168.1.10:8989", ServerId: SonarrId), draft.TestRequest());

        // A trailing slash is the same URL.
        draft.BaseUrl = "http://192.168.1.10:8989/";
        Assert.False(draft.UrlChanged);

        draft.BaseUrl = "http://192.168.1.11:8989";
        Assert.True(draft.UrlChanged);
        Assert.True(draft.NeedsKeyAgain);

        draft.ApiKey = "new";
        Assert.False(draft.NeedsKeyAgain);
        Assert.Equal(new ArrServerTestRequest(ArrProvider.Sonarr, "http://192.168.1.11:8989", "new"), draft.TestRequest());
    }

    [Fact]
    public void SavingAnEditedSonarrSendsTheFormAndClearsAnimePicks()
    {
        var draft = new ArrServerDraft(SavedSonarr)
        {
            AnimeQualityProfileId = null,
            AnimeRootFolderPath = null,
            SeriesType = SeriesType.Daily,
        };

        // No key typed (kept), Default unchanged (left out); "Same as above" is an explicit null.
        Assert.True(JsonNode.DeepEquals(
            JsonNode.Parse("""
                {"name":"Sonarr","baseUrl":"http://192.168.1.10:8989","is4k":false,"qualityProfileId":4,"rootFolderPath":"/tv","tags":[],
                 "seriesType":"daily","seasonFolders":true,"animeQualityProfileId":null,"animeRootFolderPath":null,"animeTags":[3]}
                """),
            JsonNode.Parse(Json.EncodeBodyToString(draft.UpdateRequest()))));

        draft.ApiKey = " new ";
        draft.IsDefault = false;
        var body = JsonNode.Parse(Json.EncodeBodyToString(draft.UpdateRequest()))!.AsObject();
        Assert.Equal("new", (string?)body["apiKey"]);
        Assert.False((bool?)body["isDefault"]);
    }

    [Fact]
    public void SavingAnEditedRadarrLeavesTheSonarrFieldsOut()
    {
        var draft = new ArrServerDraft(SavedRadarr4k) { Name = "  " };

        Assert.Equal(
            """{"baseUrl":"http://192.168.1.10:7879","is4k":true,"qualityProfileId":5,"rootFolderPath":"/movies-4k","tags":[]}""",
            Json.EncodeBodyToString(draft.UpdateRequest()));
    }

    [Fact]
    public void OptionsFillThePickersAndDropWhatsGone()
    {
        var draft = new ArrServerDraft(SavedSonarr) { Tags = [1, 9] };
        var options = new ArrServerOptions
        {
            QualityProfiles = [new QualityProfile { Id = 4, Name = "HD-1080p" }, new QualityProfile { Id = 8, Name = "Any" }],
            RootFolders = [new RootFolder { Id = 1, Path = "/tv" }],
            Tags = [new ArrTag { Id = 1, Label = "kids" }, new ArrTag { Id = 3, Label = "anime" }],
        };

        draft.ApplyOptions(options);

        Assert.Same(options, draft.Options);
        Assert.Equal(4, draft.QualityProfileId);
        Assert.Equal("/tv", draft.RootFolderPath);
        // The anime profile 7 and folder /anime aren't listed any more: "Same as above".
        Assert.Null(draft.AnimeQualityProfileId);
        Assert.Null(draft.AnimeRootFolderPath);
        Assert.Equal([1], draft.Tags);
        Assert.Equal([3], draft.AnimeTags);

        var empty = new ArrServerDraft(ArrProvider.Sonarr);
        empty.ApplyOptions(new ArrServerOptions { QualityProfiles = [], RootFolders = [] });
        Assert.Null(empty.QualityProfileId);
        Assert.Null(empty.RootFolderPath);
    }

    [Fact]
    public void ClearablesWriteAValueOrAnExplicitNull()
    {
        Assert.Equal("""{"animeQualityProfileId":7,"animeRootFolderPath":null}""",
            Json.EncodeBodyToString(new ArrServerUpdateRequest { AnimeQualityProfileId = new ClearableInt(7), AnimeRootFolderPath = new ClearableString(null) }));
        Assert.Equal("{}", Json.EncodeBodyToString(new ArrServerUpdateRequest()));
    }
}
