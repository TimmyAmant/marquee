using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// The calendar row of the Mac's MarqueeAPIRequestTests: GET /calendar with
// ?month= as the wire "YYYY-MM", or with no query for the server's current
// month. A read: nothing is recorded.

public sealed class MarqueeApiCalendarRequestTests
{
    private static readonly Uri Base = new("http://127.0.0.1:3000");

    /// <param name="Query">Expected query, percent-decoded; empty means none.</param>
    /// <param name="Label">Distinguishes two cases on the same endpoint.</param>
    private sealed record Case(
        string Method,
        string Path,
        IReadOnlyDictionary<string, string> Query,
        string Response,
        Func<MarqueeApi, Task> Call,
        string? Label = null)
    {
        public string Name => Label ?? $"{Method} {Path}";
    }

    private static IReadOnlyDictionary<string, string> Query(params (string Key, string Value)[] pairs) =>
        pairs.ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.Ordinal);

    // Declared before Cases: static initializers run in textual order.
    private static readonly IReadOnlyDictionary<string, string> NoQuery = Query();

    private static readonly Case[] Cases =
    [
        new("GET", "/calendar", Query(("month", "2026-09")), "calendar", api => api.Calendar.MonthAsync(new CalendarMonth(2026, 9))),
        new("GET", "/calendar", NoQuery, "calendar", api => api.Calendar.MonthAsync(), Label: "GET /calendar for the server's current month"),
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
    public async Task MonthIsSentZeroPadded()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerFixture("calendar");
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub));

        await api.Calendar.MonthAsync(new CalendarMonth(2027, 1));

        // The server rejects "2027-1" as a malformed month, so the query
        // must carry the two-digit form whatever the month.
        Assert.Equal("?month=2027-01", Assert.Single(stub.Requests).Uri.Query);
    }

    [Fact]
    public async Task ResultDecodesIntoItsValues()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerFixture("calendar");
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub));

        var calendar = await api.Calendar.MonthAsync(new CalendarMonth(2026, 9));

        Assert.True(calendar.Configured);
        Assert.Equal(new CalendarMonth(2026, 9), calendar.Month);
        Assert.Equal("America/New_York", calendar.TimeZone);
        Assert.Equal(2, calendar.Entries.Count);
        Assert.Equal("Severance", calendar.Entries[0].Name);
    }

    [Fact]
    public async Task MalformedMonthFromTheServerIsInvalid()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerJson(400, """{"error":"Invalid month.","code":"invalid"}""");
        var api = new MarqueeApi(new ApiClient(Base, "mqt_testtesttesttesttesttesttesttesttesttesttes", stub));

        var error = await Assert.ThrowsAsync<ApiException>(() => api.Calendar.MonthAsync());

        Assert.Equal(ApiErrorKind.Invalid, error.Kind);
        Assert.Equal("Invalid month.", error.ServerMessage);
    }
}
