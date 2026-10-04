using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// The rest of a movie's collection (0.72+): the doc's examples decode, and
// what the offer dialog reads from them.

public sealed class CollectionRestTests
{
    [Fact]
    public void TheOfferDecodes()
    {
        var rest = Fixtures.Decode<CollectionRest>("collection-rest");
        Assert.Equal("The Matrix Collection", rest.Collection?.Name);
        Assert.False(rest.IsAdd);
        Assert.True(rest.HasOffer);
        Assert.Equal([604, 605], rest.Items.Select(i => i.TmdbId));
    }

    [Fact]
    public void NothingToOfferIsNoOffer()
    {
        var rest = new CollectionRest { Collection = null, Action = "add", Items = [] };
        Assert.True(rest.IsAdd);
        Assert.False(rest.HasOffer);
    }

    [Fact]
    public void TheResultDecodes()
    {
        var result = Fixtures.Decode<CollectionRestResult>("collection-rest-result");
        Assert.Equal(2, result.Done);
        Assert.Empty(result.Failed);
        Assert.Equal("Requested all 2.", result.Message);
    }
}
