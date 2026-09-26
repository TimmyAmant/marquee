using System.Text.Json.Nodes;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// The "Advanced" section under Approve and the admin's Add (0.43+): the
// picks start at the default server's defaults, another server resets them
// to its own, and only an opened section sends a body.

public sealed class AddOverridesTests
{
    private static readonly Uri Base = new("http://127.0.0.1:3000");
    private const string Token = "mqt_testtesttesttesttesttesttesttesttesttesttes";
    private static readonly Guid RequestId = Guid.Parse("28713d50-27f2-4230-9c95-c1e6a000f6c0");

    /// <summary>The doc's single Sonarr, plus a second one that's down.</summary>
    private static AddOptions TwoServers(bool isAnime = false)
    {
        var options = Fixtures.Decode<AddOptions>("add-options");
        var second = new AddServerOption
        {
            Id = "sonarr-2",
            Name = "Sonarr 2",
            IsDefault = false,
            Is4k = false,
            Reachable = false,
            Defaults = new AddDefaults { QualityProfileId = 9, RootFolderPath = "/tv2", Tags = [5], SeriesType = SeriesType.Daily },
        };
        // Listed second on purpose: the default is first on the wire, but the selection shouldn't rely on it.
        return options with { IsAnime = isAnime, Servers = [second, options.Servers[0]] };
    }

    [Fact]
    public void StartsAtTheDefaultServersDefaults()
    {
        var selection = new AddOverridesSelection(TwoServers());

        Assert.True(selection.HasServers);
        Assert.True(selection.IsTv);
        Assert.Equal("4f0c2a8e-1b7d-4c1e-9a55-3c2d8e6f7a10", selection.Server?.Id);
        Assert.Equal(1, selection.ServerIndex);
        Assert.Equal(["Sonarr 2 (not responding)", "Sonarr"], selection.ServerNames);
        Assert.Equal(4, selection.QualityProfileId);
        Assert.Equal(0, selection.QualityProfileIndex);
        Assert.Equal("/tv", selection.RootFolderPath);
        Assert.Equal(0, selection.RootFolderIndex);
        Assert.Empty(selection.Tags);
        Assert.Equal(SeriesType.Standard, selection.SeriesType);
        Assert.Equal(0, selection.SeriesTypeIndex);
        Assert.Equal(["Standard", "Daily", "Anime"], selection.SeriesTypeLabels);
        Assert.Equal(["kids", "anime"], selection.AvailableTags.Select(tag => tag.Label));

        Assert.Equal(
            """{"serverId":"4f0c2a8e-1b7d-4c1e-9a55-3c2d8e6f7a10","qualityProfileId":4,"rootFolderPath":"/tv","tags":[],"seriesType":"standard"}""",
            Json.EncodeBodyToString(selection.Overrides!));
    }

    [Fact]
    public void SwitchingServerResetsThePicksToItsDefaults()
    {
        var selection = new AddOverridesSelection(TwoServers());
        selection.QualityProfileIndex = 1;
        selection.RootFolderIndex = 1;
        selection.SetTag(3, true);
        selection.SeriesTypeIndex = 2;
        Assert.Equal(7, selection.QualityProfileId);
        Assert.Equal("/anime", selection.RootFolderPath);
        Assert.True(selection.HasTag(3));
        Assert.Equal(SeriesType.Anime, selection.SeriesType);

        selection.ServerIndex = 0;

        Assert.Equal("sonarr-2", selection.Server?.Id);
        Assert.Equal(9, selection.QualityProfileId);
        Assert.Equal("/tv2", selection.RootFolderPath);
        Assert.Equal([5], selection.Tags);
        Assert.Equal(SeriesType.Daily, selection.SeriesType);
        // Down: nothing listed, so the pickers show nothing while the saved choices still go out.
        Assert.Empty(selection.QualityProfileNames);
        Assert.Equal(-1, selection.QualityProfileIndex);
        Assert.Equal(-1, selection.RootFolderIndex);

        // Back again: that server's defaults, not the picks made before.
        selection.SelectServer("4f0c2a8e-1b7d-4c1e-9a55-3c2d8e6f7a10");
        Assert.Equal(4, selection.QualityProfileId);
        Assert.Empty(selection.Tags);
        Assert.Equal(SeriesType.Standard, selection.SeriesType);

        // Same server again, or an unknown one: nothing changes.
        selection.SetTag(1, true);
        selection.ServerIndex = 1;
        selection.SelectServer("gone");
        Assert.True(selection.HasTag(1));
        selection.SetTag(1, false);
        Assert.Empty(selection.Tags);
    }

    [Fact]
    public void OutOfRangePicksAreIgnored()
    {
        var selection = new AddOverridesSelection(TwoServers());
        selection.QualityProfileIndex = -1;
        selection.RootFolderIndex = 5;
        selection.SeriesTypeIndex = 3;
        selection.ServerIndex = -1;

        Assert.Equal(4, selection.QualityProfileId);
        Assert.Equal("/tv", selection.RootFolderPath);
        Assert.Equal(SeriesType.Standard, selection.SeriesType);
        Assert.Equal(1, selection.ServerIndex);
    }

    [Fact]
    public void AnAnimeShowWithoutASeriesTypeDefaultIsAnime()
    {
        var options = TwoServers(isAnime: true);
        var withoutType = options with
        {
            Servers = [options.Servers[1] with { Defaults = options.Servers[1].Defaults with { SeriesType = null } }],
        };

        Assert.Equal(SeriesType.Anime, new AddOverridesSelection(withoutType).SeriesType);
    }

    [Fact]
    public void MoviesSendNoSeriesType()
    {
        var movie = new AddOptions
        {
            MediaType = MediaType.Movie,
            TmdbId = 438631,
            Is4k = true,
            IsAnime = false,
            Servers =
            [
                new AddServerOption
                {
                    Id = "r4k",
                    Name = "4K Radarr",
                    IsDefault = true,
                    Is4k = true,
                    Reachable = true,
                    QualityProfiles = [new QualityProfile { Id = 5, Name = "UHD" }],
                    RootFolders = [new RootFolder { Id = 1, Path = "/movies-4k" }],
                    Defaults = new AddDefaults { QualityProfileId = 5, RootFolderPath = "/movies-4k", Tags = [2, 1] },
                },
            ],
        };

        var selection = new AddOverridesSelection(movie);

        Assert.False(selection.IsTv);
        Assert.Null(selection.SeriesType);
        Assert.Equal(-1, selection.SeriesTypeIndex);
        Assert.Equal("""{"serverId":"r4k","qualityProfileId":5,"rootFolderPath":"/movies-4k","tags":[1,2]}""", Json.EncodeBodyToString(selection.Overrides!));
    }

    [Fact]
    public void NoServersMeansNoOverrides()
    {
        var none = Fixtures.Decode<AddOptions>("add-options") with { Servers = [] };
        var selection = new AddOverridesSelection(none);

        Assert.False(selection.HasServers);
        Assert.Null(selection.Server);
        Assert.Equal(-1, selection.ServerIndex);
        Assert.Empty(selection.QualityProfileNames);
        Assert.Null(selection.Overrides);
    }

    // MARK: Requests

    private static (MarqueeApi Api, StubHttpMessageHandler Stub, ServerEvents Events) Api(string response = "ok")
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerFixture(response);
        var events = new ServerEvents();
        return (new MarqueeApi(new ApiClient(Base, Token, stub), events), stub, events);
    }

    [Fact]
    public async Task ApproveWithoutOverridesSendsNoBody()
    {
        var (api, stub, _) = Api();

        await api.Requests.ApproveAsync(RequestId, null);

        var request = Assert.Single(stub.Requests);
        Assert.Equal("/api/v1/requests/28713d50-27f2-4230-9c95-c1e6a000f6c0/approve", request.Path);
        Assert.Equal("", request.Body);
        Assert.Null(request.ContentType);
    }

    [Fact]
    public async Task ApproveWithOverridesSendsThePicks()
    {
        var (api, stub, events) = Api();

        await api.Requests.ApproveAsync(RequestId, new AddOverrides
        {
            ServerId = "b3e1f7a2-9c4d-4e8b-a1f0-6d2c5e7b9a31",
            QualityProfileId = 6,
            RootFolderPath = "/movies-kids",
            Tags = [2],
        });

        var request = Assert.Single(stub.Requests);
        Assert.Equal(HttpMethod.Post, request.Method);
        Assert.Equal("application/json", request.ContentType);
        Assert.True(JsonNode.DeepEquals(
            JsonNode.Parse("""{"serverId":"b3e1f7a2-9c4d-4e8b-a1f0-6d2c5e7b9a31","qualityProfileId":6,"rootFolderPath":"/movies-kids","tags":[2]}"""),
            request.JsonBody));
        Assert.Equal(1, events.Revision(ServerChange.Requests));
        Assert.Equal(1, events.Revision(ServerChange.Library));
        Assert.Equal(1, events.Revision(ServerChange.Notifications));
    }

    [Fact]
    public async Task AddOptionsAsksForTheFourKServersWithAQuery()
    {
        var (api, stub, events) = Api("add-options");

        var options = await api.Titles.AddOptionsAsync(MediaType.Tv, 95396);
        await api.Titles.AddOptionsAsync(MediaType.Movie, 438631, is4k: true);

        Assert.Single(options.Servers);
        Assert.Equal("/api/v1/titles/tv/95396/add-options", stub.Requests[0].Path);
        Assert.Empty(stub.Requests[0].Query);
        Assert.Equal(HttpMethod.Get, stub.Requests[0].Method);
        Assert.Equal("/api/v1/titles/movie/438631/add-options", stub.Requests[1].Path);
        Assert.Equal("true", stub.Requests[1].Query["is4k"]);
        Assert.Equal(0, events.Revision(ServerChange.All));
    }

    [Fact]
    public async Task AddWithOverridesCarriesThePicksAndTheFourKFlag()
    {
        var (api, stub, events) = Api("title-add");
        var overrides = new AddOverrides { ServerId = "r4k", QualityProfileId = 5, RootFolderPath = "/movies-4k", Tags = [] };

        await api.Titles.AddAsync(MediaType.Movie, 603, overrides);
        await api.Titles.AddAsync(MediaType.Movie, 603, overrides, is4k: true);
        await api.Titles.AddAsync(MediaType.Tv, 95396, new AddOverrides { ServerId = "s", SeriesType = SeriesType.Anime });

        Assert.All(stub.Requests, request => Assert.Equal(HttpMethod.Post, request.Method));
        Assert.Equal("/api/v1/titles/movie/603/add", stub.Requests[0].Path);
        Assert.True(JsonNode.DeepEquals(
            JsonNode.Parse("""{"serverId":"r4k","qualityProfileId":5,"rootFolderPath":"/movies-4k","tags":[]}"""), stub.Requests[0].JsonBody));
        Assert.True(JsonNode.DeepEquals(
            JsonNode.Parse("""{"is4k":true,"serverId":"r4k","qualityProfileId":5,"rootFolderPath":"/movies-4k","tags":[]}"""), stub.Requests[1].JsonBody));
        Assert.Equal("/api/v1/titles/tv/95396/add", stub.Requests[2].Path);
        Assert.True(JsonNode.DeepEquals(JsonNode.Parse("""{"serverId":"s","seriesType":"anime"}"""), stub.Requests[2].JsonBody));
        Assert.Equal(3, events.Revision(ServerChange.Library));
        Assert.Equal(3, events.Revision(ServerChange.Requests));
    }
}
