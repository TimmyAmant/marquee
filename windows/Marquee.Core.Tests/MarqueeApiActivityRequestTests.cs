using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// The activity row of the Mac's MarqueeAPIRequestTests: GET /settings/activity
// is a plain admin read, so nothing is recorded, and a member gets Forbidden.

public sealed class MarqueeApiActivityRequestTests
{
    private static readonly Uri Base = new("http://127.0.0.1:3000");

    [Fact]
    public async Task SendsWhatTheDocSpecifies()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerFixture("activity");
        var events = new ServerEvents();
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub), events);

        var items = await api.Activity.RecentAsync();

        var request = Assert.Single(stub.Requests);
        Assert.Equal(HttpMethod.Get, request.Method);
        Assert.Equal("/api/v1/settings/activity", request.Path);
        Assert.Empty(request.Query);
        Assert.Equal("Bearer mqt_testtesttesttesttesttesttesttesttesttesttes", request.Authorization);
        Assert.Equal("", request.Body);
        Assert.Null(request.ContentType);
        Assert.Equal(0, events.Revision(ServerChange.All));

        var item = Assert.Single(items);
        Assert.Equal(ActivityEventType.RequestRejected, item.EventType);
        Assert.Equal("Timmy declined The Matrix", item.Sentence);
    }

    [Fact]
    public async Task EmptyLogDecodesToNoRows()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(200, """{"results":[]}""");
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub));

        // "Nothing yet." on the website: an empty list, not an error.
        Assert.Empty(await api.Activity.RecentAsync());
    }

    [Fact]
    public async Task MemberCallingItIsForbidden()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(403, """{"error":"Admin only.","code":"forbidden"}""");
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub));

        var error = await Assert.ThrowsAsync<ApiException>(() => api.Activity.RecentAsync());
        Assert.Equal(ApiErrorKind.Forbidden, error.Kind);
    }
}
