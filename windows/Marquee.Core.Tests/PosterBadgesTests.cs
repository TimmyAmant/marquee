using Marquee.Core.Models;

namespace Marquee.Core.Tests;

// The poster card's corner badges, the same as the Mac's PosterCard: a solid
// blue "MOVIE" or magenta "SERIES" pill top-left, or the rating chip on the
// Movies/Series grid.

public sealed class PosterBadgesTests
{
    [Theory]
    [InlineData("movie", "MOVIE", TypeBadgeStyle.Movie)]
    [InlineData("tv", "SERIES", TypeBadgeStyle.Series)]
    [InlineData("anime", "ANIME", TypeBadgeStyle.Series)]
    public void EveryMediaTypeHasALabelAndAFill(string mediaType, string label, TypeBadgeStyle style)
    {
        var type = MediaType.FromValue(mediaType);
        Assert.Equal(label, PosterBadges.TypeLabel(type));
        Assert.Equal(style, PosterBadges.TypeBadgeStyle(type));
    }

    [Theory]
    [InlineData(7.94, "7.9")]
    [InlineData(7.96, "8.0")]
    [InlineData(10.0, "10.0")]
    [InlineData(0.05, "0.1")]
    public void TheRatingChipShowsOneDecimal(double rating, string label)
    {
        Assert.Equal(label, PosterBadges.RatingLabel(rating));
    }

    [Theory]
    [InlineData(null)]
    [InlineData(0.0)]
    [InlineData(-1.0)]
    public void AnUnratedTitleHasNoChip(double? rating)
    {
        Assert.Null(PosterBadges.RatingLabel(rating));
    }

    [Fact]
    public void TheRatingIgnoresTheCurrentCulture()
    {
        var saved = System.Globalization.CultureInfo.CurrentCulture;
        try
        {
            System.Globalization.CultureInfo.CurrentCulture = new System.Globalization.CultureInfo("fr-FR");
            Assert.Equal("7.5", PosterBadges.RatingLabel(7.5));
        }
        finally
        {
            System.Globalization.CultureInfo.CurrentCulture = saved;
        }
    }
}
