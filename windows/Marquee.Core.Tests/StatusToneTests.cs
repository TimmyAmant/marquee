using Marquee.Core.Models;

namespace Marquee.Core.Tests;

// The library-status colors, the same as the website's
// lib/library/status-tone.ts, the Mac's API.LibraryStatus.tone, and
// Radarr's and Sonarr's own legends.

public sealed class StatusToneTests
{
    [Theory]
    [InlineData("owned", StatusTone.Owned)]
    [InlineData("tracked_downloading", StatusTone.Downloading)]
    [InlineData("tracked_monitored", StatusTone.Missing)]
    [InlineData("tracked_unmonitored", StatusTone.Unmonitored)]
    [InlineData("coming_soon", StatusTone.Soon)]
    [InlineData("untracked", StatusTone.Neutral)]
    [InlineData("something_newer", StatusTone.Neutral)]
    public void EveryStatusWearsItsOwnTone(string status, StatusTone tone)
    {
        Assert.Equal(tone, LibraryStatus.FromValue(status).Tone);
    }

    [Fact]
    public void NoTwoStatusesShareATone()
    {
        var tones = LibraryStatus.Known.Select(status => status.Tone).ToList();
        Assert.Equal(tones.Count, tones.Distinct().Count());
    }

    [Fact]
    public void OnlyTitlesInTheLibraryGetAPosterStrip()
    {
        foreach (var status in LibraryStatus.Known)
        {
            Assert.Equal(status.IsInLibrary, status.Tone.HasPosterStrip());
        }
    }

    [Fact]
    public void TheColorKeyListsEveryStatusInOrder()
    {
        Assert.Equal(
            ["owned", "tracked_downloading", "tracked_monitored", "tracked_unmonitored", "coming_soon", "untracked"],
            LibraryStatus.Known.Select(status => status.Value));
    }

    [Fact]
    public void TheColorKeyExplainsEveryStatus()
    {
        foreach (var status in LibraryStatus.Known)
        {
            Assert.False(string.IsNullOrEmpty(status.Name));
            Assert.False(string.IsNullOrEmpty(status.Meaning));
        }
        Assert.Equal("In your library", LibraryStatus.Owned.Name);
        Assert.Equal("Missing", LibraryStatus.TrackedMonitored.Name);
        Assert.Equal("It's downloading or queued right now.", LibraryStatus.TrackedDownloading.Meaning);
        Assert.Equal("Monitored, but Sonarr/Radarr hasn't found a copy yet — it keeps looking.", LibraryStatus.TrackedMonitored.Meaning);
        Assert.Equal("Same colors as Radarr and Sonarr.", LibraryStatus.ColorKeyFootnote);
    }

    [Fact]
    public void TrackedUnmonitoredIsNamedAndInTheLibrary()
    {
        var status = LibraryStatus.TrackedUnmonitored;
        Assert.True(status.IsKnown);
        Assert.True(status.IsInLibrary);
        Assert.Equal("Not monitored", status.Label);
        Assert.Equal("Not monitored", status.CompactLabel);
        Assert.Equal("Not monitored", status.Name);
        Assert.Equal("In Sonarr/Radarr but not monitored — it won't download on its own.", status.Meaning);
        Assert.Equal(StatusTone.Unmonitored, status.Tone);
        Assert.True(status.Tone.HasPosterStrip());
    }

    [Fact]
    public void AnUnknownStatusStaysNeutralAndUnnamed()
    {
        var status = LibraryStatus.FromValue("something_newer");
        Assert.False(status.IsKnown);
        Assert.False(status.IsInLibrary);
        Assert.Equal(StatusTone.Neutral, status.Tone);
        Assert.False(status.Tone.HasPosterStrip());
        Assert.Equal("", status.Meaning);
    }

    [Fact]
    public void TrackedUnmonitoredDecodesFromJson()
    {
        var holder = Json.Decode<StatusHolder>("""{"status":"tracked_unmonitored"}""");
        Assert.Equal(LibraryStatus.TrackedUnmonitored, holder.Status);
        Assert.Equal(StatusTone.Unmonitored, holder.Status!.Value.Tone);
    }

    [Fact]
    public void FourKChipNamesNotMonitored()
    {
        var fourK = new FourKViewerState { Status = LibraryStatus.TrackedUnmonitored, CanRequest = false, CanAdd = false };
        Assert.Equal("4K not monitored", fourK.StatusLabel);
    }

    private sealed record StatusHolder
    {
        public LibraryStatus? Status { get; init; }
    }
}
