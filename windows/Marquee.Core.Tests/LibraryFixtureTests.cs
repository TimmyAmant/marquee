using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// The section 17 examples (the Library page, 0.51+) decoded as the Mac's
// LibraryPageTests decodes them, plus the open enums a newer server may grow.

public sealed class LibraryFixtureTests
{
    [Fact]
    public void LibraryPageDecodes()
    {
        var page = Fixtures.Decode<LibraryPage>("library-page");

        Assert.Equal(1, page.Page);
        Assert.Equal(60, page.PageSize);
        Assert.Equal(14, page.TotalPages);
        Assert.Equal(812, page.TotalResults);
        Assert.True(page.HasMorePages);
        Assert.True(page.Connected);
        Assert.Equal(2, page.Results.Count);

        var matrix = page.Results[0];
        Assert.Equal(new TitleId(MediaType.Movie, 603), matrix.Id);
        Assert.Equal("The Matrix", matrix.Name);
        Assert.Equal(LibraryStatus.Owned, matrix.Status);
        Assert.True(matrix.Favorited);
        Assert.Equal(LibraryProvider.Plex, matrix.Source);
        Assert.Equal(31234567890L, matrix.SizeBytes);
        Assert.NotNull(matrix.AddedAt);
        Assert.Equal(["Action", "Science Fiction"], matrix.Genres);
        Assert.Equal(LibraryResolution.Uhd, matrix.Resolution);
        Assert.Equal("Dolby Vision", matrix.Hdr);
        Assert.Equal("HEVC", matrix.VideoCodec);
        Assert.Equal("TrueHD Atmos", matrix.AudioCodec);
        Assert.Equal("Bluray-2160p", matrix.Quality);
        Assert.Null(matrix.EpisodeCount);
        Assert.False(matrix.UpgradeAvailable);
        Assert.False(matrix.PossibleDuplicate);
        Assert.Equal(12, matrix.ArrTracking?.ArrId);
        Assert.True(matrix.ArrTracking?.Monitored);
        Assert.Equal(matrix.Id, matrix.ToTitleCard().Id);
        Assert.Equal(LibraryStatus.Owned, matrix.ToTitleCard().Status);

        var thrones = page.Results[1];
        Assert.Equal(MediaType.Tv, thrones.MediaType);
        Assert.Equal(121361, thrones.TvdbId);
        Assert.Equal(LibraryProvider.Sonarr, thrones.Source);
        Assert.Equal(LibraryStatus.TrackedDownloading, thrones.Status);
        Assert.Null(thrones.AddedAt);
        Assert.Null(thrones.Resolution);
        Assert.Equal(61, thrones.EpisodeCount);

        Assert.Equal(640, page.Summary.Movies);
        Assert.Equal(172, page.Summary.Series);
        Assert.Equal(9840, page.Summary.Episodes);
        Assert.Equal(48000000000000L, page.Summary.TotalBytes);
        Assert.Equal(23, page.Summary.Tracked);

        Assert.Equal([LibraryProvider.Plex, LibraryProvider.Sonarr, LibraryProvider.Radarr], page.Filters.Sources);
        Assert.Equal(4, page.Filters.Genres.Count);
        Assert.Equal(["AV1", "H264", "HEVC"], page.Filters.Codecs);
        Assert.Equal([2026, 2025, 2011, 1999], page.Filters.Years);
        Assert.Equal([LibraryResolution.Uhd, LibraryResolution.FullHd, LibraryResolution.Sd], page.Filters.Resolutions);
        Assert.True(page.Filters.HasHdr);
    }

    [Fact]
    public void LastPageHasNoMore()
    {
        var page = Json.Decode<LibraryPage>("""
            {"page":3,"pageSize":60,"totalPages":3,"totalResults":130,"results":[],
             "summary":{"movies":1,"series":0,"episodes":0,"totalBytes":0,"tracked":0},
             "filters":{"sources":[],"genres":[],"codecs":[],"years":[],"resolutions":[],"hasHdr":false},
             "connected":false}
            """);
        Assert.False(page.HasMorePages);
        Assert.False(page.Connected);
        Assert.Empty(page.Results);
    }

    [Fact]
    public void CollectionsMissingDecode()
    {
        var collections = Fixtures.Decode<ListResponse<LibraryCollection>>("library-collections-missing").Results;
        var collection = Assert.Single(collections);

        Assert.Equal("collection-2344", collection.Key);
        Assert.Equal("The Matrix Collection", collection.Title);
        Assert.Equal(2344, collection.CollectionId);
        Assert.False(collection.CollectionFavorited);
        Assert.Equal(2, collection.MissingCount);
        Assert.Single(collection.Items);
        Assert.Equal([new TitleId(MediaType.Movie, 605), new TitleId(MediaType.Movie, 624860)], collection.AddAllMissing);
        Assert.Empty(collection.RequestAllMissing);
        Assert.Equal(new TitleId(MediaType.Movie, 603), collection.RequestAllTarget);
    }

    [Fact]
    public void DuplicatesDecode()
    {
        var duplicates = Fixtures.Decode<ListResponse<LibraryDuplicate>>("library-duplicates").Results;
        var duplicate = Assert.Single(duplicates);

        Assert.Equal(new TitleId(MediaType.Movie, 603), new TitleId(duplicate.MediaType, duplicate.TmdbId));
        Assert.Equal("The Matrix", duplicate.Name);
        Assert.Equal("1999", duplicate.Year);
        Assert.Equal(LibraryDuplicateReason.Paths, duplicate.Reason);
        Assert.Equal(2, duplicate.Copies.Count);
        Assert.Equal(LibraryProvider.Radarr, duplicate.Copies[0].Source);
        Assert.Equal("Radarr", duplicate.Copies[0].Server);
        Assert.Equal("Bluray-2160p", duplicate.Copies[0].Quality);
        Assert.Equal("Tower", duplicate.Copies[1].Server);
        Assert.Equal(8123456789L, duplicate.Copies[1].SizeBytes);
    }

    [Fact]
    public void StorageDecodes()
    {
        var storage = Fixtures.Decode<LibraryStorage>("library-storage");

        Assert.Equal(2, storage.Folders.Count);
        Assert.Equal("/movies", storage.Folders[0].Path);
        Assert.Equal(812000000000L, storage.Folders[0].FreeBytes);
        Assert.Equal(["Radarr", "4K Radarr"], storage.Folders[0].Servers);
        Assert.Equal(1624000000000L, storage.TotalFreeBytes);
        Assert.True(storage.Live);
        Assert.NotNull(storage.MeasuredAt);
        Assert.False(storage.IsEmpty);
        Assert.Equal(42, storage.Forecast?.DaysRemaining);
        Assert.Equal(12300000000L, storage.Forecast?.BytesPerDay);
        Assert.Equal(new DateOnly(2026, 11, 7), storage.Forecast?.FullOn);
    }

    [Fact]
    public void UnknownWireValuesStillDecode()
    {
        var page = Json.Decode<LibraryPage>("""
            {"page":1,"pageSize":60,"totalPages":1,"totalResults":1,
             "results":[{"mediaType":"movie","tmdbId":1,"name":"X","posterPath":null,"year":null,"subtitle":null,"overview":null,"rating":null,
               "status":"owned","favorited":false,"requested":null,"canQuickAdd":false,"canRequest":false,
               "tvdbId":null,"source":"kodi","sizeBytes":null,"addedAt":null,"genres":[],"resolution":"8K","hdr":null,
               "videoCodec":null,"audioCodec":null,"quality":null,"filePath":null,"episodeCount":null,
               "upgradeAvailable":false,"possibleDuplicate":false,"arrTracking":null}],
             "summary":{"movies":1,"series":0,"episodes":0,"totalBytes":0,"tracked":0},
             "filters":{"sources":["kodi"],"genres":[],"codecs":[],"years":[],"resolutions":["8K"],"hasHdr":false},
             "connected":true}
            """);
        var entry = Assert.Single(page.Results);
        Assert.Equal("kodi", entry.Source.Value);
        Assert.False(OpenEnum.IsKnown(entry.Source));
        Assert.Equal("8K", entry.Resolution?.Value);
        Assert.False(OpenEnum.IsKnown(entry.Resolution!.Value));

        var duplicate = Json.Decode<LibraryDuplicate>("""
            {"mediaType":"tv","tmdbId":2,"name":"Y","posterPath":null,"year":null,"reason":"hash","copies":[]}
            """);
        Assert.Equal("hash", duplicate.Reason.Value);
        Assert.False(OpenEnum.IsKnown(duplicate.Reason));
    }
}
