using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// The favorites area of the Mac's MarqueeAPIRequestTests: the entity type
// and id go in the path, no call has a body, and only the three writes
// signal a Favorites change.

public sealed class MarqueeApiFavoritesRequestTests
{
    private static readonly Uri Base = new("http://127.0.0.1:3000");

    /// <param name="Changes">What a successful call records; None for a read.</param>
    private sealed record Case(string Method, string Path, string Response, ServerChange Changes, Func<MarqueeApi, Task> Call)
    {
        public string Name => $"{Method} {Path}";
    }

    private static readonly Case[] Cases =
    [
        new("GET", "/favorites", "favorites", ServerChange.None, api => api.Favorites.AllAsync()),
        new("GET", "/favorites/collection/2344", "favorite-state", ServerChange.None,
            api => api.Favorites.IsFavoritedAsync(FavoriteEntityType.Collection, 2344)),
        new("PUT", "/favorites/person/6384", "favorite-toggle", ServerChange.Favorites,
            api => api.Favorites.AddAsync(FavoriteEntityType.Person, 6384)),
        new("DELETE", "/favorites/movie/603", "favorite-state", ServerChange.Favorites,
            api => api.Favorites.RemoveAsync(FavoriteEntityType.Movie, 603)),
        new("POST", "/favorites/company/420/toggle", "favorite-toggle", ServerChange.Favorites,
            api => api.Favorites.ToggleAsync(FavoriteEntityType.Company, 420)),
    ];

    public static TheoryData<string> CaseNames
    {
        get
        {
            var data = new TheoryData<string>();
            foreach (var testCase in Cases)
            {
                data.Add(testCase.Name);
            }
            return data;
        }
    }

    [Theory]
    [MemberData(nameof(CaseNames))]
    public async Task SendsWhatTheDocSpecifies(string name)
    {
        var testCase = Cases.Single(candidate => candidate.Name == name);
        var stub = new StubHttpMessageHandler();
        stub.AnswerFixture(testCase.Response);
        var events = new ServerEvents();
        var raised = new List<ServerChangedEventArgs>();
        events.Changed += (_, args) => raised.Add(args);
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub), events);

        await testCase.Call(api);

        var request = Assert.Single(stub.Requests);
        Assert.Equal(testCase.Method, request.Method.Method);
        Assert.Equal("/api/v1" + testCase.Path, request.Path);
        Assert.Empty(request.Query);
        Assert.Equal("Bearer mqt_testtesttesttesttesttesttesttesttesttesttes", request.Authorization);
        Assert.Equal("", request.Body);
        Assert.Null(request.ContentType);

        if (testCase.Changes == ServerChange.None)
        {
            Assert.Empty(raised);
            Assert.Equal(0, events.Revision(ServerChange.All));
        }
        else
        {
            var change = Assert.Single(raised);
            Assert.Equal(testCase.Changes, change.Change);
            Assert.Equal(ServerChangeSource.Mutation, change.Source);
            Assert.Equal(1, events.Revision(ServerChange.Favorites));
            Assert.Equal(1, events.Revision(ServerChange.All));
        }
    }

    [Fact]
    public async Task EachCallReturnsTheStateTheServerReports()
    {
        // favorite-state says false, favorite-toggle says true: the return
        // value is what the server answered, never what the caller assumed.
        var stub = new StubHttpMessageHandler();
        stub.Answer(request => request.Method == HttpMethod.Get || request.Method == HttpMethod.Delete
            ? StubHttpMessageHandler.Fixture("favorite-state")
            : StubHttpMessageHandler.Fixture("favorite-toggle"));
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub));

        Assert.False(await api.Favorites.IsFavoritedAsync(FavoriteEntityType.Movie, 603));
        Assert.True(await api.Favorites.AddAsync(FavoriteEntityType.Person, 6384));
        Assert.False(await api.Favorites.RemoveAsync(FavoriteEntityType.Movie, 603));
        Assert.True(await api.Favorites.ToggleAsync(FavoriteEntityType.Person, 6384));
    }

    [Fact]
    public async Task SetChoosesPutOrDelete()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerFixture("favorite-state");
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub));

        await api.Favorites.SetAsync(true, FavoriteEntityType.Tv, 1399);
        await api.Favorites.SetAsync(false, FavoriteEntityType.Tv, 1399);

        Assert.Equal(2, stub.Requests.Count);
        Assert.Equal(HttpMethod.Put, stub.Requests[0].Method);
        Assert.Equal(HttpMethod.Delete, stub.Requests[1].Method);
        Assert.All(stub.Requests, request => Assert.Equal("/api/v1/favorites/tv/1399", request.Path));
    }

    [Fact]
    public void PathUsesTheEntityTypeWireValue()
    {
        Assert.Equal("/favorites/collection/2344", FavoritesEndpoints.Path(FavoriteEntityType.Collection, 2344));
        Assert.Equal("/favorites/movie/603", FavoritesEndpoints.Path(FavoriteEntityType.Of(MediaType.Movie), 603));
        // A type this app doesn't know still goes out as the server named it.
        Assert.Equal("/favorites/playlist/7", FavoritesEndpoints.Path(FavoriteEntityType.FromValue("playlist"), 7));
    }

    [Fact]
    public async Task UnknownEntityIsNotFound()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(404, """{"error":"Not found.","code":"not_found"}""");
        var events = new ServerEvents();
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub), events);

        var error = await Assert.ThrowsAsync<ApiException>(() => api.Favorites.ToggleAsync(FavoriteEntityType.FromValue("playlist"), 7));
        Assert.Equal(ApiErrorKind.NotFound, error.Kind);
        Assert.Equal(0, events.Revision(ServerChange.All));
    }
}
