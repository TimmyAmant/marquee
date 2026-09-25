using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// The section 12 examples decoded as the Mac's APIFixtureTests decodes them
// (testEveryDocExampleDecodes for each fixture, testSettingsShapes for the
// values), plus the request bodies this area sends.

public sealed class IntegrationsFixtureTests
{
    [Fact]
    public void OverviewDecodes()
    {
        var overview = Fixtures.Decode<IntegrationsOverview>("integrations");

        Assert.True(overview.Plex.Connected);
        var server = Assert.Single(overview.Plex.Servers);
        Assert.Equal("Basement", server.Name);
        Assert.Equal(Json.ParseDate("2026-09-17T16:00:03.412Z"), server.LastSyncedAt);
        Assert.Equal(812, overview.Plex.MovieCount);
        Assert.Equal(143, overview.Plex.TvCount);
        Assert.Equal(9_123_456_789_012L, overview.Plex.TotalBytes);

        Assert.False(overview.Jellyfin.Connected);
        Assert.Null(overview.Jellyfin.BaseUrl);
        Assert.False(overview.Jellyfin.HasApiKey);
        Assert.Empty(overview.Jellyfin.Servers);
        Assert.Equal(0L, overview.Jellyfin.TotalBytes);

        Assert.True(overview.Sonarr.Connected);
        Assert.Equal("http://192.168.1.10:8989", overview.Sonarr.BaseUrl);
        Assert.True(overview.Sonarr.HasApiKey);
        Assert.Equal("/tv", overview.Sonarr.RootFolderPath);
        Assert.Equal(4, overview.Sonarr.QualityProfileId);
        Assert.True(overview.Arr(ArrProvider.Sonarr).FullyConfigured);

        Assert.False(overview.Radarr.Connected);
        Assert.Null(overview.Arr(ArrProvider.Radarr).BaseUrl);
        Assert.Null(overview.Radarr.RootFolderPath);
        Assert.Null(overview.Radarr.QualityProfileId);
        Assert.False(overview.Radarr.FullyConfigured);

        Assert.True(overview.Tmdb.Connected);
        Assert.False(overview.Tmdb.SavedInSettings);
        Assert.True(overview.Tmdb.ConfiguredFromEnv);
        Assert.False(overview.Trakt.Connected);
        Assert.True(overview.Tvdb.Connected);
        Assert.False(overview.Discord.Connected);
        Assert.False(overview.Ntfy.Connected);
        Assert.False(overview.GenericWebhook.Connected);

        Assert.Equal("d8a989b4f0ad05fab2ab959bf0d5615adb0a25a9a3974674", overview.ArrWebhooks.Secret);
        Assert.StartsWith("http://marquee.local:3000/api/webhooks/radarr/", overview.ArrWebhooks.RadarrUrl, StringComparison.Ordinal);
        Assert.Equal(overview.ArrWebhooks.SonarrUrl, overview.ArrWebhooks.Url(ArrProvider.Sonarr));
        Assert.Equal(overview.ArrWebhooks.RadarrUrl, overview.ArrWebhooks.Url(ArrProvider.Radarr));
    }

    [Fact]
    public void WebhookSecretDecodes()
    {
        var webhooks = Fixtures.Decode<ArrWebhooks>("webhook-secret");

        Assert.Equal("0f3c…", webhooks.Secret);
        Assert.Equal("http://…/api/webhooks/radarr/…?secret=0f3c…", webhooks.RadarrUrl);
        Assert.Equal("http://…/api/webhooks/sonarr/…?secret=0f3c…", webhooks.SonarrUrl);
    }

    [Fact]
    public void ArrConnectionResultDecodes()
    {
        var result = Fixtures.Decode<ArrConnectionResult>("arr-connect");

        Assert.True(result.Ok);
        Assert.Equal("http://192.168.1.10:8989", result.BaseUrl);
        var folder = Assert.Single(result.RootFolders);
        Assert.Equal(1, folder.Id);
        Assert.Equal("/tv", folder.Path);
        var profile = Assert.Single(result.QualityProfiles);
        Assert.Equal(4, profile.Id);
        Assert.Equal("HD-1080p", profile.Name);
        Assert.Equal("/tv", result.SelectedRootFolder);
        Assert.Equal(4, result.SelectedQualityProfileId);

        // The same pickers' choices as GET …/options would give.
        var options = Fixtures.Decode<ArrOptions>("arr-options");
        Assert.Equal(options.RootFolders, result.Options.RootFolders);
        Assert.Equal(options.QualityProfiles, result.Options.QualityProfiles);
    }

    [Fact]
    public void ArrOptionsDecode()
    {
        var options = Fixtures.Decode<ArrOptions>("arr-options");

        Assert.Equal(new RootFolder { Id = 1, Path = "/tv" }, Assert.Single(options.RootFolders));
        Assert.Equal(new QualityProfile { Id = 4, Name = "HD-1080p" }, Assert.Single(options.QualityProfiles));
    }

    [Fact]
    public void NoDefaultsSelectedDecodesAsNull()
    {
        var result = Json.Decode<ArrConnectionResult>("""
            {"ok":true,"baseUrl":"http://10.0.0.2:7878","rootFolders":[],"qualityProfiles":[],"selectedRootFolder":null,"selectedQualityProfileId":null}
            """);

        Assert.Null(result.SelectedRootFolder);
        Assert.Null(result.SelectedQualityProfileId);
        Assert.Empty(result.Options.RootFolders);
    }

    [Fact]
    public void PlexPinStartDecodes()
    {
        var pin = Fixtures.Decode<PlexPinStart>("plex-pin-start");

        Assert.Equal(123_456_789, pin.PinId);
        Assert.Equal("app.plex.tv", pin.Url?.Host);
        Assert.Null((pin with { AuthUrl = "not a url" }).Url);
    }

    [Fact]
    public void PlexPinStatusDecodes()
    {
        var waiting = Fixtures.Decode<PlexPinStatus>("plex-pin-waiting");
        Assert.False(waiting.Connected);
        Assert.Null(waiting.MovieCount);
        Assert.Null(waiting.TvCount);

        var connected = Fixtures.Decode<PlexPinStatus>("plex-pin-connected");
        Assert.True(connected.Connected);
        Assert.Equal(812, connected.MovieCount);
        Assert.Equal(143, connected.TvCount);
    }

    [Fact]
    public void TraktImportResultDecodes()
    {
        var result = Fixtures.Decode<TraktImportResult>("trakt-import");

        Assert.True(result.Ok);
        Assert.Equal(12, result.ImportedCount);
        Assert.Equal(3, result.SkippedCount);
    }

    [Fact]
    public void UpstreamErrorExampleClassifies()
    {
        var error = ApiException.FromResponse(502, Fixtures.Read("error-upstream"), hasApiHeader: true);

        Assert.Equal(ApiErrorKind.Upstream, error.Kind);
        Assert.StartsWith("TMDb isn't configured", error.Message, StringComparison.Ordinal);
        Assert.Equal(error.Message, error.ServerMessage);
        Assert.False(error.IsConnectivityFailure);
    }

    [Fact]
    public void RequestBodiesEncodeExactlyTheDocsFields()
    {
        Assert.Equal("""{"baseUrl":"http://192.168.1.10:8989","apiKey":"k"}""", Json.EncodeBodyToString(new ServiceConnectionRequest("http://192.168.1.10:8989", "k")));
        Assert.Equal("""{"rootFolderPath":"/tv","qualityProfileId":4}""", Json.EncodeBodyToString(new ArrDefaultsRequest("/tv", 4)));
        Assert.Equal("""{"accessToken":"t"}""", Json.EncodeBodyToString(new TmdbSettingRequest("t")));
        Assert.Equal("""{"clientId":"c"}""", Json.EncodeBodyToString(new TraktSettingRequest("c")));
        Assert.Equal("""{"apiKey":"v"}""", Json.EncodeBodyToString(new TvdbSettingRequest("v")));
        Assert.Equal("""{"webhookUrl":"https://discord.com/api/webhooks/1"}""", Json.EncodeBodyToString(new DiscordSettingRequest("https://discord.com/api/webhooks/1")));
        Assert.Equal("""{"topicUrl":"https://ntfy.sh/t"}""", Json.EncodeBodyToString(new NtfySettingRequest("https://ntfy.sh/t")));
        Assert.Equal("""{"webhookUrl":"https://example.com/hook"}""", Json.EncodeBodyToString(new WebhookSettingRequest("https://example.com/hook")));
        Assert.Equal("""{"url":"https://trakt.tv/users/u/watchlist"}""", Json.EncodeBodyToString(new TraktImportRequest("https://trakt.tv/users/u/watchlist")));
    }

    [Fact]
    public void ProvidersAreTheirPathSegments()
    {
        Assert.Equal("sonarr", MarqueeApi.Segment(ArrProvider.Sonarr));
        Assert.Equal("radarr", MarqueeApi.Segment(ArrProvider.Radarr));
        Assert.Equal("tmdb", MarqueeApi.Segment(IntegrationProvider.Tmdb));
        Assert.Equal(8989, ArrProvider.Sonarr.DefaultPort);
        Assert.Equal(MediaType.Movie, ArrProvider.Radarr.MediaType);
    }
}
