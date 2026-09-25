using Marquee.Core.Api;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// The person and studio pages of the Mac's MarqueeAPIRequestTests: both are
// plain GETs whose only variable is the id in the path.

public sealed class MarqueeApiPeopleRequestTests
{
    private static readonly Uri Base = new("http://127.0.0.1:3000");

    private sealed record Case(string Method, string Path, string Response, Func<MarqueeApi, Task> Call)
    {
        public string Name => $"{Method} {Path}";
    }

    private static readonly Case[] Cases =
    [
        new("GET", "/people/6384", "person-detail", api => api.People.DetailAsync(6384)),
        new("GET", "/companies/420", "company-detail", api => api.Companies.DetailAsync(420)),
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
        Assert.Equal(testCase.Method, request.Method.Method);
        Assert.Equal("/api/v1" + testCase.Path, request.Path);
        Assert.Empty(request.Query);
        Assert.Equal("Bearer mqt_testtesttesttesttesttesttesttesttesttesttes", request.Authorization);
        Assert.Equal("", request.Body);
        Assert.Null(request.ContentType);
        // Reads never signal a change.
        Assert.Equal(0, events.Revision(ServerChange.All));
    }

    [Fact]
    public async Task DetailsDecodeIntoTheirPages()
    {
        var stub = new StubHttpMessageHandler();
        stub.Answer(request => request.Path.StartsWith("/api/v1/people/", StringComparison.Ordinal)
            ? StubHttpMessageHandler.Fixture("person-detail")
            : StubHttpMessageHandler.Fixture("company-detail"));
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub));

        var person = await api.People.DetailAsync(6384);
        Assert.Equal("Keanu Reeves", person.Name);
        Assert.Equal(6384, person.Id);

        var company = await api.Companies.DetailAsync(420);
        Assert.Equal("Marvel Studios", company.Name);
        Assert.Equal(137, company.TitleCount);
    }

    [Fact]
    public async Task UnknownPersonIsNotFound()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(404, """{"error":"Person not found.","code":"not_found"}""");
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub));

        var error = await Assert.ThrowsAsync<ApiException>(() => api.People.DetailAsync(1));
        Assert.Equal(ApiErrorKind.NotFound, error.Kind);
    }
}
