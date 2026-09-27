using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// The Library area of the Mac's MarqueeAPIRequestTests: four GETs, the
// page's query built from LibraryQuery (defaults left out), no bodies, and
// none of them signals a change.

public sealed class MarqueeApiLibraryRequestTests
{
    private static readonly Uri Base = new("http://127.0.0.1:3000");

    private sealed record Case(string Path, IReadOnlyDictionary<string, string> Query, string Response, Func<MarqueeApi, Task> Call)
    {
        public string Name => Path + (Query.Count == 0 ? "" : "?" + string.Join("&", Query.Select(pair => pair.Key + "=" + pair.Value)));
    }

    private static IReadOnlyDictionary<string, string> Query(params (string Key, string Value)[] pairs) =>
        pairs.ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.Ordinal);

    private static readonly IReadOnlyDictionary<string, string> NoQuery = Query();

    private static readonly LibraryQuery Everything = new()
    {
        Type = MediaType.Tv,
        Status = LibraryStatus.Owned,
        Source = LibraryProvider.Jellyfin,
        Resolution = LibraryResolution.Sd,
        Hdr = true,
        Codec = "HEVC",
        Genre = "Drama",
        Year = 2020,
        Q = "sev",
        Sort = LibrarySort.Size,
    };

    private static readonly Case[] Cases =
    [
        new("/library", NoQuery, "library-page", api => api.Library.PageAsync()),
        new("/library",
            Query(("type", "tv"), ("status", "owned"), ("source", "jellyfin"), ("resolution", "SD"), ("hdr", "1"),
                ("codec", "HEVC"), ("genre", "Drama"), ("year", "2020"), ("q", "sev"), ("sort", "size"), ("page", "3")),
            "library-page", api => api.Library.PageAsync(Everything, page: 3)),
        new("/library/collections-missing", NoQuery, "library-collections-missing", api => api.Library.CollectionsMissingAsync()),
        new("/library/duplicates", NoQuery, "library-duplicates", api => api.Library.DuplicatesAsync()),
        new("/library/storage", NoQuery, "library-storage", api => api.Library.StorageAsync()),
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
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub), events);

        await testCase.Call(api);

        var request = Assert.Single(stub.Requests);
        Assert.Equal("GET", request.Method.Method);
        Assert.Equal("/api/v1" + testCase.Path, request.Path);
        Assert.Equal(testCase.Query.Count, request.Query.Count);
        foreach (var (key, value) in testCase.Query)
        {
            Assert.True(request.Query.TryGetValue(key, out var actual), $"{name} is missing ?{key}");
            Assert.Equal(value, actual);
        }
        Assert.Equal("Bearer mqt_testtesttesttesttesttesttesttesttesttesttes", request.Authorization);
        Assert.Equal("", request.Body);
        Assert.Null(request.ContentType);
        Assert.Equal(0, events.Revision(ServerChange.All));
    }

    [Fact]
    public void DefaultQuerySendsNothing()
    {
        Assert.All(LibraryQuery.Default.ToQuery(1), pair => Assert.Null(pair.Value));
        Assert.False(LibraryQuery.Default.HasFilters);
        Assert.True(Everything.HasFilters);
        // Sort alone isn't a filter, but it does go on the wire.
        var sorted = new LibraryQuery { Sort = LibrarySort.Title };
        Assert.False(sorted.HasFilters);
        Assert.Equal("title", sorted.ToQuery(1)["sort"]);
    }
}
