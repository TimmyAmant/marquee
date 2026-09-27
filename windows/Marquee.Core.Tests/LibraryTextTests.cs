using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// Every line the Library page writes from its data (the website's
// lib/i18n/messages/en/library.json): the counts strip, a row's meta line,
// a collection's heading, a duplicate copy's server line and the Storage
// card's forecast lines.

public sealed class LibraryTextTests
{
    private const long Gigabyte = 1024L * 1024 * 1024;

    [Fact]
    public void CountsLineAndTrackedNote()
    {
        var summary = Fixtures.Decode<LibraryResults>("library-page").Summary;
        Assert.Equal("640 movies · 172 series · 9840 episodes · 43.7 TB on disk", LibraryText.CountsLine(summary));
        Assert.Equal("+ 23 more downloading, missing or coming soon, not counted above", LibraryText.TrackedNote(summary));

        var bare = new LibraryPageSummary { Movies = 1, Series = 1, Episodes = 1, TotalBytes = 0, Tracked = 0 };
        Assert.Equal("1 movie · 1 series · 1 episode · 0 B on disk", LibraryText.CountsLine(bare));
        Assert.Null(LibraryText.TrackedNote(bare));
        Assert.Equal("+ 1 more downloading, missing or coming soon, not counted above", LibraryText.TrackedNote(bare with { Tracked = 1 }));
    }

    [Fact]
    public void RowMetaAndQualityLines()
    {
        var page = Fixtures.Decode<LibraryResults>("library-page");
        var matrix = page.Results[0];
        var thrones = page.Results[1];

        Assert.Equal("Plex · 29.1 GB", matrix.MetaLine);
        Assert.Equal("29.1 GB", matrix.SizeLabel);
        Assert.Equal("Sonarr · 92.0 GB · 61 episodes", thrones.MetaLine);
        Assert.Equal("The Matrix Collection · 2 missing", LibraryText.CollectionHeading("The Matrix Collection", 2));
        Assert.Equal("Heat Collection · 1 missing", LibraryText.CollectionHeading("Heat Collection", 1));
    }

    [Fact]
    public void ServerLineNamesTheProviderOnlyWhenItAddsSomething()
    {
        Assert.Equal("Tower · Plex", LibraryText.ServerLine("Tower", LibraryProvider.Plex));
        Assert.Equal("Radarr", LibraryText.ServerLine("Radarr", LibraryProvider.Radarr));
        Assert.Equal("Different files", LibraryDuplicateReason.Paths.Label);
        Assert.Equal("On several servers", LibraryDuplicateReason.Servers.Label);
    }

    [Fact]
    public void StorageForecastLines()
    {
        var storage = Fixtures.Decode<LibraryStorage>("library-storage");
        Assert.Equal("Full in about 42 days at the current rate (11.5 GB/day).", LibraryText.ForecastLine(storage.Forecast));
        Assert.Equal("Around November 7, 2026.", LibraryText.AroundLine(storage.Forecast));
        Assert.Equal("Read from your servers just now.", LibraryText.MeasuredLine(storage));
        Assert.Equal("1.5 TB free", storage.TotalFreeLabel);
        Assert.Equal("756.2 GB free", storage.Folders[0].FreeLabel);
        Assert.Equal("Radarr · 4K Radarr", storage.Folders[0].ServersLine);

        Assert.Equal("Full in about 1 day at the current rate (1.0 GB/day).",
            LibraryText.ForecastLine(new LibraryForecast { DaysRemaining = 1, BytesPerDay = Gigabyte, FullOn = new DateOnly(2026, 9, 28) }));
        Assert.Equal("Full today at the current rate (2.0 GB/day).",
            LibraryText.ForecastLine(new LibraryForecast { DaysRemaining = 0, BytesPerDay = 2 * Gigabyte, FullOn = new DateOnly(2026, 9, 27) }));
        Assert.Equal("No forecast yet — it needs a couple of days of readings from the daily disk-space snapshot.", LibraryText.ForecastLine(null));
        Assert.Null(LibraryText.AroundLine(null));

        var snapshot = storage with { Live = false, MeasuredAt = new DateTimeOffset(2026, 9, 26, 21, 10, 0, TimeSpan.Zero) };
        Assert.StartsWith("From the last daily snapshot, ", LibraryText.MeasuredLine(snapshot));
        Assert.Null(LibraryText.MeasuredLine(storage with { Live = false, MeasuredAt = null }));
        Assert.True((storage with { Folders = [] }).IsEmpty);
    }

    [Fact]
    public void EmptyStatesTellTheAdminWhatToConnect()
    {
        Assert.Equal("Connect Plex, Jellyfin, Sonarr or Radarr to see everything you already own in one place.", LibraryText.ConnectMessage(isAdmin: true));
        Assert.Equal("The household admin hasn't connected Plex, Jellyfin, Sonarr or Radarr yet.", LibraryText.ConnectMessage(isAdmin: false));
        Assert.Equal("Connect Sonarr or Radarr to see free space per root folder here.", LibraryText.StorageEmptyMessage(isAdmin: true));
        Assert.Equal("The household admin hasn't connected Sonarr or Radarr yet.", LibraryText.StorageEmptyMessage(isAdmin: false));
    }
}
