using Marquee.Core.Api;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// The about area of the Mac's MarqueeAPIRequestTests (api-v1.md section 14).

public sealed class MarqueeApiAboutRequestTests
{
    private static readonly Uri Base = new("http://127.0.0.1:3000");

    private sealed record Case(string Path, string Response, Func<MarqueeApi, Task> Call)
    {
        public string Name => $"GET {Path}";
    }

    private static readonly Case[] Cases =
    [
        new("/settings/about", "about", api => api.About.InfoAsync()),
        new("/changelog", "changelog", api => api.About.ChangelogAsync()),
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
        Assert.Equal(HttpMethod.Get, request.Method);
        Assert.Equal("/api/v1" + testCase.Path, request.Path);
        Assert.Empty(request.Query);
        Assert.Equal("Bearer mqt_testtesttesttesttesttesttesttesttesttesttes", request.Authorization);
        Assert.Equal("", request.Body);
        Assert.Null(request.ContentType);
        Assert.Equal(0, events.Revision(ServerChange.All));
    }

    [Fact]
    public async Task ResultsDecodeIntoTheirValues()
    {
        var stub = new StubHttpMessageHandler();
        stub.Answer(request => request.Path == "/api/v1/settings/about"
            ? StubHttpMessageHandler.Fixture("about")
            : StubHttpMessageHandler.Fixture("changelog"));
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub));

        var about = await api.About.InfoAsync();
        Assert.Equal("v0.22.0", about.VersionLabel);
        Assert.Equal(812, about.MovieCount);
        Assert.Equal("America/New_York", about.TimeZone);

        var changelog = await api.About.ChangelogAsync();
        var release = Assert.Single(changelog);
        Assert.Equal("0.22.0", release.Version);
        Assert.Equal(new DateOnly(2026, 9, 17), release.Date);
    }
}
