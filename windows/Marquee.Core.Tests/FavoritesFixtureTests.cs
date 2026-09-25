using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// The section 6 examples decoded as the Mac's APIFixtureTests decodes them.

public sealed class FavoritesFixtureTests
{
    [Fact]
    public void FavoritesPageDecodes()
    {
        var favorites = Fixtures.Decode<FavoritesResponse>("favorites");

        Assert.False(favorites.IsEmpty);

        var movie = Assert.Single(favorites.Movies);
        Assert.Equal(MediaType.Movie, movie.MediaType);
        Assert.Equal(603, movie.TmdbId);
        Assert.Equal("The Matrix", movie.Name);
        Assert.True(movie.Favorited);
        Assert.Empty(favorites.Tv);

        var collection = Assert.Single(favorites.Collections);
        Assert.Equal(2344, collection.CollectionId);
        Assert.Equal(2344, collection.Id);
        Assert.Equal("The Matrix Collection", collection.Name);
        Assert.Equal(603, collection.FirstMovieTmdbId);
        Assert.Equal("https://image.tmdb.org/t/p/w342/bV9q.jpg", collection.PosterPath.Url(ImageSize.W342)?.AbsoluteUri);

        var person = Assert.Single(favorites.People);
        Assert.Equal(6384, person.TmdbId);
        Assert.Equal("Keanu Reeves", person.Name);
        Assert.Null(person.KnownForDepartment);
        Assert.True(person.Favorited);

        var studio = Assert.Single(favorites.Studios);
        Assert.Equal(420, studio.TmdbId);
        Assert.Equal("Marvel Studios", studio.Name);
        Assert.True(studio.Favorited);
    }

    [Fact]
    public void EmptyFavoritesIsEmpty()
    {
        var favorites = Json.Decode<FavoritesResponse>("""{"movies":[],"tv":[],"collections":[],"people":[],"studios":[]}""");
        Assert.True(favorites.IsEmpty);

        // One section is enough to show the page.
        var one = Json.Decode<FavoritesResponse>("""
            {"movies":[],"tv":[],"collections":[{"collectionId":1,"name":"Solo","posterPath":null,"firstMovieTmdbId":null}],"people":[],"studios":[]}
            """);
        Assert.False(one.IsEmpty);
        Assert.Null(one.Collections[0].FirstMovieTmdbId);
        Assert.Null(one.Collections[0].PosterPath);
    }

    [Fact]
    public void MissingSectionFailsToDecode()
    {
        // Every section is required: a response without one is not a
        // favorites page, not an empty section.
        Assert.ThrowsAny<System.Text.Json.JsonException>(() =>
            Json.Decode<FavoritesResponse>("""{"movies":[],"tv":[],"collections":[],"people":[]}"""));
    }

    [Fact]
    public void FavoriteStatesDecode()
    {
        var state = Fixtures.Decode<FavoriteState>("favorite-state");
        Assert.Equal(FavoriteEntityType.Movie, state.EntityType);
        Assert.Equal(603, state.TmdbId);
        Assert.False(state.Favorited);

        var toggled = Fixtures.Decode<FavoriteState>("favorite-toggle");
        Assert.Equal(FavoriteEntityType.Person, toggled.EntityType);
        Assert.Equal(6384, toggled.TmdbId);
        Assert.True(toggled.Favorited);
    }

    [Fact]
    public void UnknownEntityTypeStillDecodes()
    {
        var state = Json.Decode<FavoriteState>("""{"entityType":"playlist","tmdbId":7,"favorited":true}""");
        Assert.Equal("playlist", state.EntityType.Value);
        Assert.False(state.EntityType.IsKnown);
        Assert.True(state.Favorited);
    }

    [Fact]
    public void EntityTypeOfAMediaTypeSharesItsWireValue()
    {
        Assert.Equal(FavoriteEntityType.Movie, FavoriteEntityType.Of(MediaType.Movie));
        Assert.Equal(FavoriteEntityType.Tv, FavoriteEntityType.Of(MediaType.Tv));
    }
}
