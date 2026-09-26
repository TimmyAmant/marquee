using Marquee.Core.Models;

namespace Marquee.Core.Tests;

public sealed class RailOffsetsTests
{
    [Theory]
    [InlineData(-50, 400, 0)]
    [InlineData(0, 400, 0)]
    [InlineData(120, 400, 120)]
    [InlineData(400, 400, 400)]
    [InlineData(900, 400, 400)]
    [InlineData(30, 0, 0)]
    [InlineData(30, -10, 0)]
    public void ClampKeepsTheOffsetInsideTheRow(double offset, double scrollable, double expected) =>
        Assert.Equal(expected, RailOffsets.Clamp(offset, scrollable));

    [Fact]
    public void ClampTreatsNonsenseAsTheStart()
    {
        Assert.Equal(0, RailOffsets.Clamp(double.NaN, 400));
        Assert.Equal(0, RailOffsets.Clamp(double.PositiveInfinity, 400));
        Assert.Equal(0, RailOffsets.Clamp(100, double.NaN));
    }

    [Theory]
    [InlineData(0, false)]
    [InlineData(1, false)]
    [InlineData(1.5, true)]
    [InlineData(600, true)]
    public void ArrowsShowOnlyWhenTheRowOverflows(double scrollable, bool expected) =>
        Assert.Equal(expected, RailOffsets.Overflows(scrollable));

    [Fact]
    public void BackIsOffAtTheStartAndForwardAtTheEnd()
    {
        Assert.False(RailOffsets.CanPageBack(0, 500));
        Assert.False(RailOffsets.CanPageBack(0.5, 500));
        Assert.True(RailOffsets.CanPageForward(0, 500));

        Assert.True(RailOffsets.CanPageBack(250, 500));
        Assert.True(RailOffsets.CanPageForward(250, 500));

        Assert.True(RailOffsets.CanPageBack(500, 500));
        Assert.False(RailOffsets.CanPageForward(499.5, 500));
        Assert.False(RailOffsets.CanPageForward(500, 500));
    }

    [Fact]
    public void NeitherArrowWorksWhenTheRowFits()
    {
        Assert.False(RailOffsets.CanPageBack(0, 0));
        Assert.False(RailOffsets.CanPageForward(0, 0));
    }

    [Fact]
    public void APageIsMostOfTheVisibleWidth()
    {
        Assert.Equal(850, RailOffsets.PageSize(1000), 6);
        Assert.Equal(1, RailOffsets.PageSize(0));
    }

    [Theory]
    [InlineData(0, 1, 1000, 3000, 850)]
    [InlineData(850, 1, 1000, 3000, 1700)]
    [InlineData(2500, 1, 1000, 3000, 3000)]
    [InlineData(850, -1, 1000, 3000, 0)]
    [InlineData(2000, -1, 1000, 3000, 1150)]
    [InlineData(0, -1, 1000, 3000, 0)]
    [InlineData(400, 5, 1000, 3000, 1250)]
    public void ArrowsPageAndStopAtTheEnds(double from, int direction, double viewport, double scrollable, double expected) =>
        Assert.Equal(expected, RailOffsets.PageTarget(from, direction, viewport, scrollable), 6);

    [Fact]
    public void QuickClicksAddUpFromWhereTheLastOneWasHeading()
    {
        var target = RailOffsets.PageTarget(0, 1, 1000, 5000);
        target = RailOffsets.PageTarget(target, 1, 1000, 5000);
        Assert.Equal(1700, target, 6);
    }

    [Theory]
    [InlineData(300, -100, 1000, 400)]
    [InlineData(300, 100, 1000, 200)]
    [InlineData(50, 200, 1000, 0)]
    [InlineData(950, -200, 1000, 1000)]
    public void APanDragsTheRowWithTheFinger(double from, double deltaX, double scrollable, double expected) =>
        Assert.Equal(expected, RailOffsets.PanTarget(from, deltaX, scrollable));

    [Theory]
    [InlineData(0, false)]
    [InlineData(5, false)]
    [InlineData(-7.9, false)]
    [InlineData(8, true)]
    [InlineData(-30, true)]
    public void SmallMovementsStayTaps(double cumulativeX, bool expected) =>
        Assert.Equal(expected, RailOffsets.IsPan(cumulativeX));

    [Fact]
    public void AGlideStopsAtTheEndItIsHeadingFor()
    {
        // Finger moving right shows earlier items: stops at the start.
        Assert.True(RailOffsets.HitEnd(0, 12, 800));
        Assert.False(RailOffsets.HitEnd(0, -12, 800));
        // Finger moving left shows later items: stops at the end.
        Assert.True(RailOffsets.HitEnd(800, -12, 800));
        Assert.False(RailOffsets.HitEnd(800, 12, 800));
        // In the middle, or not moving, it carries on.
        Assert.False(RailOffsets.HitEnd(400, 12, 800));
        Assert.False(RailOffsets.HitEnd(400, 0, 800));
    }
}
