using Marquee.Core.Models;

namespace Marquee.Core.Tests;

// The library-status colors, the same as the website's
// lib/library/status-tone.ts and the Mac's API.LibraryStatus.tone.

public sealed class StatusToneTests
{
    [Theory]
    [InlineData("owned", StatusTone.Owned)]
    [InlineData("tracked_downloading", StatusTone.Downloading)]
    [InlineData("tracked_monitored", StatusTone.Missing)]
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
    public void TheColorKeyExplainsEveryStatus()
    {
        foreach (var status in LibraryStatus.Known)
        {
            Assert.False(string.IsNullOrEmpty(status.Name));
            Assert.False(string.IsNullOrEmpty(status.Meaning));
        }
        Assert.Equal("In your library", LibraryStatus.Owned.Name);
        Assert.Equal("Missing", LibraryStatus.TrackedMonitored.Name);
    }
}
