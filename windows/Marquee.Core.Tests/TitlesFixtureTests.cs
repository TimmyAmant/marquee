using System.Text.Json.Nodes;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// The doc's example responses for the title page, its library actions and
// requesting a title, decoded with their DTOs (the Mac's APIFixtureTests
// testTitleDetailValues), plus the labels the page computes from them.

public sealed class TitlesFixtureTests
{
    [Fact]
    public void EveryTitleExampleDecodes()
    {
        Fixtures.Decode<TitleDetail>("title-detail");
        Fixtures.Decode<SeasonEpisodes>("season-episodes");
        Fixtures.Decode<TitleStatus>("title-status");
        Assert.True(Fixtures.Decode<OK>("title-add").Ok);
        Assert.True(Fixtures.Decode<OK>("title-search").Ok);
        Fixtures.Decode<MonitoredResult>("title-monitored");
        Fixtures.Decode<RelinkResult>("title-relink");
        Fixtures.Decode<TitleRequestCreated>("request-created");
    }

    [Fact]
    public void TitleDetailValues()
    {
        var detail = Fixtures.Decode<TitleDetail>("title-detail");
        Assert.Equal(new TitleId(MediaType.Movie, 603), detail.Id);
        Assert.Null(detail.TvdbId);
        Assert.Equal("tt0133093", detail.ImdbId);
        Assert.Equal("Believe the unbelievable.", detail.Tagline);
        Assert.Equal(new DateOnly(1999, 3, 31), detail.ReleaseDate);
        Assert.Equal("Released", detail.TmdbStatus);
        Assert.Equal("https://image.tmdb.org/t/p/w1280/lrtSb1skJayPydZk0OSMAKjBOVe.jpg", detail.BackdropPath.Url(ImageSize.W1280)?.AbsoluteUri);

        Assert.Equal(136, detail.Facts.RuntimeMinutes);
        Assert.Equal("2h 16m", detail.Facts.RuntimeLabel);
        Assert.Equal(83, detail.Facts.RatingPercent);
        Assert.Equal(["Action", "Science Fiction"], detail.Facts.Genres);
        Assert.Null(detail.Facts.Network);
        Assert.Null(detail.Facts.NextAirDate);
        Assert.Equal("English", detail.Facts.OriginalLanguageLabel);
        Assert.NotNull(detail.Facts.ProductionCountry);
        Assert.Equal("US", detail.Facts.ProductionCountry.Code);
        Assert.Equal("🇺🇸", detail.Facts.ProductionCountry.Flag);
        Assert.Equal("YouTube TV", Assert.Single(detail.Facts.WatchProviders).Name);

        Assert.Equal(2, detail.Credits.Count);
        Assert.Equal("Director", detail.Credits[0].Role);
        Assert.Equal(["man vs machine", "martial arts", "cyberpunk"], detail.Keywords);

        Assert.Equal("https://www.youtube.com/watch?v=FVI84Dfx2-I", detail.Links.TrailerUrl?.AbsoluteUri);
        Assert.Equal("www.imdb.com", detail.Links.External[0].Link?.Host);
        Assert.Equal("IMDb", detail.Links.External[0].Label);
        Assert.Equal("TheMatrixMovie", detail.Links.FacebookId);
        Assert.Null((detail.Links with { TrailerYoutubeKey = " " }).TrailerUrl);

        Assert.Equal(LibraryStatus.Owned, detail.Library.Status);
        Assert.Equal(LibraryProvider.Plex, detail.Library.Provider);
        Assert.True(detail.Library.Configured);
        Assert.NotNull(detail.Library.File);
        var file = detail.Library.File;
        Assert.Equal(31_229_390_464, file.SizeBytes);
        Assert.Equal("29.1 GB", file.SizeLabel);
        Assert.Equal(ResolutionTier.Uhd, file.ResolutionTier);
        Assert.Equal("4K", file.ResolutionLabel);
        Assert.Equal("HDR10", file.DynamicRangeLabel);
        Assert.Equal("TrueHD Atmos 7.1ch", file.AudioLabel);
        Assert.Equal(Json.ParseDate("2025-11-02T09:14:00.000Z"), file.DateAdded);
        Assert.Equal("FraMeSToR", file.ReleaseGroup);
        Assert.Null(file.Edition);
        Assert.Equal("MKV", file.Container);
        Assert.Equal(58421, file.BitrateKbps);
        Assert.Equal("58.4 Mbps", file.BitrateLabel);

        Assert.True(detail.Viewer.IsAdmin);
        Assert.Null(detail.Viewer.RequestStatus);
        Assert.Equal(new ArrTracking { ArrId = 412, Monitored = true }, detail.Viewer.ArrTracking);
        Assert.Null(detail.Viewer.OtherRequestersLine);
        Assert.True(detail.Viewer.CanRelink);

        Assert.Empty(detail.Seasons);
        Assert.Equal("Neo", detail.Cast[0].Character);
        Assert.Equal(6384, detail.Cast[0].Id);
        Assert.NotNull(detail.Franchise);
        Assert.Equal(2344, detail.Franchise.CollectionId);
        Assert.False(detail.Franchise.CollectionFavorited);
        Assert.Equal([new TitleId(MediaType.Movie, 604)], detail.Franchise.AddAllMissing);
        Assert.Equal("Village Roadshow Pictures", Assert.Single(detail.Studios).Name);
        Assert.Single(detail.Similar);

        var status = Fixtures.Decode<TitleStatus>("title-status");
        var updated = detail.Updating(status);
        Assert.Equal(LibraryStatus.TrackedMonitored, updated.Library.Status);
        Assert.Equal(LibraryProvider.Radarr, updated.Library.Provider);
        Assert.Null(updated.Library.File);
        Assert.Same(detail.Cast, updated.Cast);
        Assert.Equal(detail.Name, updated.Name);
        Assert.Equal(detail.Id, updated.Id);
    }

    [Fact]
    public void TitleStatusValues()
    {
        var status = Fixtures.Decode<TitleStatus>("title-status");
        Assert.Equal(new TitleId(MediaType.Movie, 603), status.Id);
        Assert.Equal(LibraryStatus.TrackedMonitored, status.Library.Status);
        Assert.Equal("Missing", status.Library.Status.Label);
        Assert.Null(status.Library.File);
        Assert.False(status.Viewer.CanAdd);
        Assert.NotNull(status.Viewer.ArrTracking);
        Assert.True(status.Viewer.ArrTracking.Monitored);
    }

    [Fact]
    public void FileDetailsFromAServerWithoutContainerOrBitrateStillDecode()
    {
        // Servers before 0.26 don't send these two.
        var body = JsonNode.Parse(Fixtures.Read("title-detail"))!;
        var fileNode = body["library"]!["file"]!.AsObject();
        fileNode.Remove("container");
        fileNode.Remove("bitrateKbps");

        var file = Json.Decode<TitleDetail>(body.ToJsonString()).Library.File!;
        Assert.Null(file.Container);
        Assert.Null(file.BitrateKbps);
        Assert.Null(file.BitrateLabel);
    }

    [Fact]
    public void FileDetailsLabels()
    {
        var file = new FileDetails { SizeBytes = 0 };
        Assert.Equal("0 B", file.SizeLabel);
        Assert.Equal("1.5 KB", (file with { SizeBytes = 1536 }).SizeLabel);
        Assert.Equal("58.4 Mbps", (file with { BitrateKbps = 58421 }).BitrateLabel);
        Assert.Equal("820 kbps", (file with { BitrateKbps = 820 }).BitrateLabel);
        Assert.Null((file with { BitrateKbps = 0 }).BitrateLabel);
        Assert.Equal("Dolby Vision", (file with { DynamicRange = "DV" }).DynamicRangeLabel);
        Assert.Equal("HDR10+", (file with { DynamicRange = "hdr10plus" }).DynamicRangeLabel);
        Assert.Equal("HLG", (file with { DynamicRange = "HLG" }).DynamicRangeLabel);
        Assert.Null((file with { DynamicRange = "" }).DynamicRangeLabel);
        Assert.Equal("AAC 2ch", (file with { AudioCodec = "AAC", AudioChannels = 2.0 }).AudioLabel);
        Assert.Equal("AAC", (file with { AudioCodec = "AAC" }).AudioLabel);
        Assert.Null((file with { AudioChannels = 5.1 }).AudioLabel);
        Assert.Equal("1920x816", (file with { Resolution = "1920x816" }).ResolutionLabel);
        Assert.Equal("1080p", (file with { ResolutionTier = ResolutionTier.FullHd, Resolution = "1920x816" }).ResolutionLabel);
        Assert.Null(file.ResolutionLabel);
    }

    [Fact]
    public void SeasonEpisodesValues()
    {
        var season = Fixtures.Decode<SeasonEpisodes>("season-episodes");
        Assert.Equal(1399, season.TmdbId);
        Assert.Equal(1, season.SeasonNumber);
        var episode = Assert.Single(season.Episodes);
        Assert.Equal(63056, episode.Id);
        Assert.Equal("S01E01", episode.Code(season.SeasonNumber));
        Assert.Equal("S10E12", (episode with { EpisodeNumber = 12 }).Code(10));
        Assert.Equal("Winter Is Coming", episode.Name);
        Assert.Equal(new DateOnly(2011, 4, 17), episode.AirDate);
        Assert.True(episode.HasFile);
        Assert.Equal("https://image.tmdb.org/t/p/w300/o4IX9Mm0kpLITVANJMx7inyEUaY.jpg", episode.StillPath.Url(ImageSize.W300)?.AbsoluteUri);
        Assert.Equal(episode.Overview, episode.ShortOverview);

        // 44 five-character words fill the limit exactly, so the cut lands on
        // a space, which the clamp drops before the ellipsis.
        var longOverview = string.Concat(Enumerable.Repeat("abcd ", 60));
        var clamped = (episode with { Overview = longOverview }).ShortOverview;
        Assert.NotNull(clamped);
        Assert.EndsWith("…", clamped);
        Assert.Equal(Episode.OverviewLimit, clamped.Length);
        Assert.Null((episode with { Overview = null }).ShortOverview);

        var untracked = Json.Decode<SeasonEpisodes>("""{"tmdbId":1399,"seasonNumber":2,"episodes":[{"id":1,"episodeNumber":1,"name":"x","overview":null,"airDate":"","stillPath":null,"hasFile":null}]}""");
        var bare = Assert.Single(untracked.Episodes);
        Assert.Null(bare.AirDate);
        Assert.Null(bare.HasFile);
    }

    [Fact]
    public void SeasonSummaryBadges()
    {
        var season = Json.Decode<SeasonSummary>("""{"seasonNumber":1,"name":"Season 1","episodeCount":10,"airDate":"2011-04-17","posterPath":null,"have":3,"total":10}""");
        Assert.Equal(1, season.Id);
        Assert.Equal("3/10", season.CompletenessLabel);
        Assert.False(season.IsComplete);
        Assert.True((season with { Have = 10 }).IsComplete);
        Assert.False((season with { Have = 0, Total = 0 }).IsComplete);

        var untracked = season with { Have = null, Total = null };
        Assert.Null(untracked.CompletenessLabel);
        Assert.False(untracked.IsComplete);
    }

    [Fact]
    public void ViewerStateLines()
    {
        var viewer = Fixtures.Decode<TitleStatus>("title-status").Viewer;
        Assert.Null(viewer.OtherRequestersLine);
        Assert.Equal("Also requested by A, B", (viewer with { OtherRequesters = ["A", "B"] }).OtherRequestersLine);
        Assert.Null((viewer with { OtherRequesters = ["A"], AlreadyRequested = true }).OtherRequestersLine);
    }

    [Fact]
    public void ActionResults()
    {
        var monitored = Fixtures.Decode<MonitoredResult>("title-monitored");
        Assert.True(monitored.Ok);
        Assert.False(monitored.Monitored);

        var relinked = Fixtures.Decode<RelinkResult>("title-relink");
        Assert.True(relinked.Ok);
        Assert.Equal(604, relinked.NewTmdbId);

        var created = Fixtures.Decode<TitleRequestCreated>("request-created");
        Assert.True(created.Ok);
        Assert.Equal(Guid.Parse("28713d50-27f2-4230-9c95-c1e6a000f6c0"), created.RequestId);
    }

    [Fact]
    public void FourKViewerDecodes()
    {
        var fourK = Fixtures.Decode<TitleDetail>("title-detail").Viewer.FourK;
        Assert.NotNull(fourK);
        Assert.Equal(LibraryStatus.Untracked, fourK.Status);
        Assert.Null(fourK.RequestStatus);
        Assert.False(fourK.CanRequest);
        Assert.True(fourK.CanAdd);
        Assert.Null(fourK.StatusLabel);
        Assert.False(fourK.IsRequested);

        // No 4K instance for this type: an explicit null.
        Assert.Null(Fixtures.Decode<TitleStatus>("title-status").Viewer.FourK);
    }

    [Fact]
    public void OlderServerWithoutFourKDecodes()
    {
        var json = JsonNode.Parse(Fixtures.Read("title-detail"))!.AsObject();
        json["viewer"]!.AsObject().Remove("fourK");
        Assert.Null(Json.Decode<TitleDetail>(json.ToJsonString()).Viewer.FourK);
    }

    [Theory]
    [InlineData("owned", "In 4K")]
    [InlineData("tracked_downloading", "4K downloading")]
    [InlineData("tracked_monitored", "4K missing")]
    [InlineData("coming_soon", "4K coming soon")]
    [InlineData("untracked", null)]
    [InlineData("someday", null)]
    public void FourKStatusLabelsMatchTheWebsite(string status, string? label)
    {
        var fourK = Json.Decode<FourKViewerState>(
            $$"""{"status":"{{status}}","requestStatus":"pending","canRequest":false,"canAdd":false}""");
        Assert.Equal(label, fourK.StatusLabel);
        Assert.True(fourK.IsRequested);
    }
}
