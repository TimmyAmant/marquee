using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// The help area of the Mac's MarqueeAPIRequestTests (api-v1.md section 15).

public sealed class MarqueeApiHelpRequestTests
{
    private static readonly Uri Base = new("http://127.0.0.1:3000");

    [Fact]
    public async Task ErrorsSendsWhatTheDocSpecifies()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerFixture("help-errors");
        var events = new ServerEvents();
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub), events);

        var categories = await api.Help.ErrorsAsync();

        var request = Assert.Single(stub.Requests);
        Assert.Equal(HttpMethod.Get, request.Method);
        Assert.Equal("/api/v1/help/errors", request.Path);
        Assert.Empty(request.Query);
        Assert.Equal("Bearer mqt_testtesttesttesttesttesttesttesttesttesttes", request.Authorization);
        Assert.Equal("", request.Body);
        Assert.Null(request.ContentType);
        Assert.Equal(0, events.Revision(ServerChange.All));

        var category = Assert.Single(categories);
        Assert.Equal("Adding titles to Sonarr / Radarr", category.Title);
        Assert.NotNull(categories.EntryFor("Connect Sonarr in Settings first."));
    }

    [Fact]
    public async Task NoServerThrowsUnauthorizedWithoutSending()
    {
        var api = new MarqueeApi(client: null);

        var error = await Assert.ThrowsAsync<ApiException>(() => api.Help.ErrorsAsync());
        Assert.Equal(ApiErrorKind.Unauthorized, error.Kind);
    }
}
