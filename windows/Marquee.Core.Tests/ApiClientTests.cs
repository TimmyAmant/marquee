using System.Net.Http.Headers;
using System.Text.Json.Nodes;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// The transport's policies: headers, redirects, the 401 rule, error mapping
// from code and status, decode failures and empty bodies.

public sealed class ApiClientTests
{
    private static readonly Uri Base = new("http://127.0.0.1:3000");

    private readonly StubHttpMessageHandler stub = new();

    private ApiClient Client(string? token = "mqt_testtesttesttesttesttesttesttesttesttesttes", Func<Task>? onUnauthorized = null) =>
        new(Base, token, stub, onUnauthorized);

    private static async Task<ApiException> Throws(Func<Task> call) =>
        await Assert.ThrowsAsync<ApiException>(call);

    /// <summary>A body the way the areas declare them: a record, with optional fields nullable.</summary>
    private sealed record UpdateBody(string Username, bool? AutoApproveTv, string? DisplayName);

    // MARK: Requests

    [Fact]
    public async Task SendsAcceptUserAgentAndBearerToken()
    {
        stub.AnswerFixture("me");
        var me = await Client().GetAsync<Me>("/me");
        Assert.Equal("timmy", me.Username);

        var request = Assert.Single(stub.Requests);
        Assert.Equal(HttpMethod.Get, request.Method);
        Assert.Equal("/api/v1/me", request.Path);
        Assert.Equal("Bearer mqt_testtesttesttesttesttesttesttesttesttesttes", request.Authorization);
        Assert.Equal("application/json", request.Header("Accept"));
        Assert.Equal($"Marquee-Windows/{AppInfo.Version}", request.Header("User-Agent"));
        Assert.Equal("", request.Body);
        Assert.Null(request.ContentType);
    }

    [Fact]
    public async Task NoTokenMeansNoAuthorizationHeader()
    {
        stub.AnswerFixture("server-info");
        await Client(token: null).GetAsync<ServerInfo>("server-info");
        var request = Assert.Single(stub.Requests);
        Assert.Null(request.Authorization);
        Assert.Equal("/api/v1/server-info", request.Path);
    }

    [Fact]
    public async Task BodiesAreJsonWithNullsLeftOut()
    {
        stub.AnswerFixture("ok");
        await Client().PatchAsync<OK>("/users/x", new UpdateBody("kid", true, null));

        var request = Assert.Single(stub.Requests);
        Assert.Equal(HttpMethod.Patch, request.Method);
        Assert.Equal("application/json", request.ContentType);
        Assert.True(JsonNode.DeepEquals(JsonNode.Parse("""{"username":"kid","autoApproveTv":true}"""), request.JsonBody));
    }

    [Fact]
    public async Task AnonymousBodiesAreRejectedBeforeSending()
    {
        stub.AnswerFixture("ok");
        var error = await Throws(() => Client().PatchAsync<OK>("/users/x", new { Username = "kid" }));
        Assert.Equal(ApiErrorKind.Invalid, error.Kind);
        Assert.StartsWith("Couldn't encode the request", error.Message);
        Assert.Empty(stub.Requests);
    }

    [Fact]
    public async Task QueryValuesArePercentEncodedAndSorted()
    {
        stub.AnswerFixture("ok");
        await Client().GetAsync<OK>("/search", new Dictionary<string, string?> { ["q"] = "Romeo + Juliet & co", ["page"] = "2", ["skip"] = null });

        var request = Assert.Single(stub.Requests);
        Assert.Equal("?page=2&q=Romeo%20%2B%20Juliet%20%26%20co", request.Uri.Query);
        Assert.Equal("Romeo + Juliet & co", request.Query["q"]);
        Assert.False(request.Query.ContainsKey("skip"));
    }

    // MARK: Answers that aren't the server's

    [Fact]
    public async Task RedirectsAreNeverFollowedAndMeanNotMarquee()
    {
        stub.Answer(() => StubHttpMessageHandler.Redirect(302, "/login"));
        var error = await Throws(() => Client().GetAsync<Me>("/me"));
        Assert.Equal(ApiErrorKind.NotMarquee, error.Kind);
        Assert.True(error.IsConnectivityFailure);
        Assert.Single(stub.Requests);
    }

    [Fact]
    public async Task NonJsonAnswerWithoutHeaderIsNotMarquee()
    {
        stub.Answer(() => StubHttpMessageHandler.Html(200, "<html><title>Marquee</title></html>"));
        var error = await Throws(() => Client().GetAsync<Me>("/me"));
        Assert.Equal(ApiErrorKind.NotMarquee, error.Kind);
        Assert.Contains(ServerInfo.MinimumServerVersion, error.Message);
    }

    [Fact]
    public async Task ProxyGatewayErrorPageIsANetworkFailure()
    {
        stub.Answer(() => StubHttpMessageHandler.Html(502, "<html>Bad Gateway</html>"));
        var error = await Throws(() => Client().GetAsync<Me>("/me"));
        Assert.Equal(ApiErrorKind.Network, error.Kind);
        Assert.Equal(NetworkFailure.Refused, error.Failure);
        Assert.True(error.IsConnectivityFailure);
    }

    [Fact]
    public async Task JsonErrorWithoutHeaderStillMaps()
    {
        stub.AnswerJson(502, Fixtures.Read("error-upstream"), apiHeader: false);
        var error = await Throws(() => Client().GetAsync<Me>("/discover"));
        Assert.Equal(ApiErrorKind.Upstream, error.Kind);
        Assert.StartsWith("TMDb isn't configured", error.ServerMessage);
        Assert.False(error.HasApiHeader);
    }

    // MARK: Error mapping

    [Theory]
    [InlineData(401, """{"error":"Unauthorized","code":"unauthorized"}""", ApiErrorKind.Unauthorized, "Unauthorized")]
    [InlineData(401, """{"error":"Incorrect username or password","code":"invalid_credentials"}""", ApiErrorKind.InvalidCredentials, "Incorrect username or password")]
    [InlineData(429, """{"error":"Too many attempts. Try again in 12 minutes.","code":"rate_limited"}""", ApiErrorKind.RateLimited, "Too many attempts. Try again in 12 minutes.")]
    [InlineData(403, """{"error":"Admins only","code":"forbidden"}""", ApiErrorKind.Forbidden, "Admins only")]
    [InlineData(404, """{"error":"Not found","code":"not_found"}""", ApiErrorKind.NotFound, "Not found")]
    [InlineData(409, """{"error":"Already requested","code":"conflict"}""", ApiErrorKind.Conflict, "Already requested")]
    [InlineData(409, """{"error":"Setup is complete","code":"setup_complete"}""", ApiErrorKind.SetupComplete, "Setup is complete")]
    [InlineData(502, """{"error":"Sonarr didn't respond","code":"upstream"}""", ApiErrorKind.Upstream, "Sonarr didn't respond")]
    [InlineData(400, """{"error":"Username must be at least 3 characters","code":"invalid"}""", ApiErrorKind.Invalid, "Username must be at least 3 characters")]
    [InlineData(500, """{"error":"Something went wrong","code":"internal"}""", ApiErrorKind.Server, "Something went wrong")]
    public void ContractCodesPickTheKind(int status, string body, ApiErrorKind kind, string serverMessage)
    {
        var error = ApiException.FromResponse(status, body, hasApiHeader: true);
        Assert.Equal(kind, error.Kind);
        Assert.Equal(status, error.StatusCode);
        Assert.True(error.HasApiHeader);
        // The kinds that carry a message keep it; the fixed ones drop it in favor of their own wording.
        if (kind is ApiErrorKind.RateLimited or ApiErrorKind.Conflict or ApiErrorKind.Upstream or ApiErrorKind.Invalid or ApiErrorKind.Server)
        {
            Assert.Equal(serverMessage, error.ServerMessage);
            Assert.Equal(serverMessage, error.Message);
        }
    }

    [Theory]
    [InlineData(401, "", ApiErrorKind.Unauthorized, null)]
    [InlineData(403, "Forbidden", ApiErrorKind.Forbidden, null)]
    [InlineData(404, "<html>nope</html>", ApiErrorKind.NotFound, null)]
    [InlineData(429, "", ApiErrorKind.RateLimited, null)]
    [InlineData(502, "<html>Bad Gateway</html>", ApiErrorKind.Upstream, null)]
    [InlineData(503, "", ApiErrorKind.Server, null)]
    [InlineData(400, """{"error":"Title is required"}""", ApiErrorKind.Invalid, "Title is required")]
    [InlineData(409, """{"error":"Taken","code":"something_new"}""", ApiErrorKind.Conflict, "Taken")]
    [InlineData(400, """{"error":"  ","code":"invalid"}""", ApiErrorKind.Invalid, ApiException.InvalidRequestDefaultMessage)]
    public void UnknownCodesFallBackToTheStatus(int status, string body, ApiErrorKind kind, string? message)
    {
        var error = ApiException.FromResponse(status, body);
        Assert.Equal(kind, error.Kind);
        if (message != null)
        {
            Assert.Equal(message, error.Message);
        }
    }

    [Fact]
    public void MessagesReadLikeTheMacApp()
    {
        Assert.Equal("Username is taken", ApiException.Invalid("Username is taken").Message);
        Assert.Equal("Wait 5 minutes", ApiException.RateLimited("Wait 5 minutes").Message);
        Assert.Equal("Too many attempts. Try again in a few minutes.", ApiException.RateLimited(null).Message);
        Assert.Equal("Incorrect username or password.", ApiException.InvalidCredentials().Message);
        Assert.Equal("Your session has ended. Please sign in again.", ApiException.Unauthorized().Message);
        Assert.Equal("Only an admin can do that.", ApiException.Forbidden().Message);
        Assert.Equal("That couldn't be found on your Marquee server.", ApiException.NotFound().Message);
        Assert.Equal("Setup has already been completed on this server. Please sign in instead.", ApiException.SetupComplete().Message);
        Assert.Equal("A service connected to your Marquee server didn't respond.", ApiException.Upstream(null).Message);
        Assert.Equal("Your Marquee server ran into a problem. Try again in a moment.", ApiException.Server(null).Message);
        Assert.Equal("Your Marquee server took too long to respond.", ApiException.Network(NetworkFailure.Timeout).Message);
        Assert.Equal("Couldn't reach your Marquee server. Check that it's running and on your network.", ApiException.Network(NetworkFailure.Refused).Message);
        Assert.Equal("The request was cancelled.", ApiException.Network(NetworkFailure.Cancelled).Message);
        Assert.Equal("Couldn't reach your Marquee server: certificate rejected", ApiException.Network(NetworkFailure.Other, "certificate rejected").Message);
        Assert.Contains(ServerInfo.MinimumServerVersion, ApiException.NotMarquee().Message);
    }

    [Fact]
    public void SonarrUnresolvableDetection()
    {
        Assert.True(ApiException.Conflict(ApiException.SonarrUnresolvableMessage).IsSonarrUnresolvable);
        Assert.False(ApiException.Conflict("Request was already reviewed.").IsSonarrUnresolvable);
        Assert.False(ApiException.Upstream(ApiException.SonarrUnresolvableMessage).IsSonarrUnresolvable);
    }

    [Fact]
    public void WrappingTransportFailures()
    {
        var refused = ApiException.Wrap(StubHttpMessageHandler.ConnectionRefused());
        Assert.Equal(ApiErrorKind.Network, refused.Kind);
        Assert.Equal(NetworkFailure.Refused, refused.Failure);
        Assert.True(refused.IsConnectivityFailure);

        Assert.Equal(NetworkFailure.UnknownHost, ApiException.Wrap(StubHttpMessageHandler.UnknownHost()).Failure);
        Assert.Same(refused, ApiException.Wrap(refused));

        using var cancelled = new CancellationTokenSource();
        cancelled.Cancel();
        Assert.True(ApiException.Wrap(new OperationCanceledException(), cancelled.Token).IsCancellation);
        Assert.Equal(NetworkFailure.Timeout, ApiException.Wrap(new OperationCanceledException()).Failure);
        Assert.False(ApiException.Unauthorized().IsConnectivityFailure);
    }

    // MARK: The 401 rule

    [Fact]
    public async Task ServerRejectedTokenAwaitsTheCallbackBeforeThrowing()
    {
        var fired = false;
        stub.AnswerJson(401, """{"error":"Token revoked","code":"unauthorized"}""");
        var error = await Throws(() => Client(onUnauthorized: () =>
        {
            fired = true;
            return Task.CompletedTask;
        }).GetAsync<Me>("/me"));
        Assert.Equal(ApiErrorKind.Unauthorized, error.Kind);
        Assert.True(error.IsRejectedToken);
        Assert.True(fired);
    }

    [Fact]
    public async Task ProxyJson401WithoutTheApiHeaderIsNotARejectedToken()
    {
        var fired = false;
        stub.AnswerJson(401, """{"error":"Unauthorized","code":"unauthorized"}""", apiHeader: false);
        var error = await Throws(() => Client(onUnauthorized: () =>
        {
            fired = true;
            return Task.CompletedTask;
        }).GetAsync<Me>("/me"));
        Assert.Equal(ApiErrorKind.Unauthorized, error.Kind);
        Assert.False(error.IsRejectedToken);
        Assert.False(fired);
    }

    [Fact]
    public async Task A401WithoutATokenDoesNotFireTheCallback()
    {
        var fired = false;
        stub.AnswerJson(401, """{"error":"Unauthorized","code":"unauthorized"}""");
        var error = await Throws(() => Client(token: null, onUnauthorized: () =>
        {
            fired = true;
            return Task.CompletedTask;
        }).GetAsync<Me>("/me"));
        Assert.Equal(ApiErrorKind.Unauthorized, error.Kind);
        Assert.False(fired);
    }

    // MARK: Bodies

    [Fact]
    public async Task UnreadableBodyIsAServerError()
    {
        stub.AnswerJson(200, """{"nope": """);
        var error = await Throws(() => Client().GetAsync<Me>("/me"));
        Assert.Equal(ApiErrorKind.Server, error.Kind);
        Assert.Equal(ApiException.UnreadableResponseMessage, error.Message);

        stub.AnswerJson(200, "null");
        Assert.Equal(ApiErrorKind.Server, (await Throws(() => Client().GetAsync<Me>("/me"))).Kind);

        // A wrong shape (a required field missing) is just as unreadable.
        stub.AnswerJson(200, """{"id":"54caac33-73d6-4864-8e12-1ea6b212d2f1"}""");
        Assert.Equal(ApiErrorKind.Server, (await Throws(() => Client().GetAsync<User>("/me"))).Kind);

        // So is a null where the contract says a string is always there:
        // it fails here, not as a NullReferenceException in a view model.
        stub.AnswerJson(200, """{"id":"54caac33-73d6-4864-8e12-1ea6b212d2f1","username":null,"displayName":null,"role":"member","libraryOwnerId":"54caac33-73d6-4864-8e12-1ea6b212d2f1"}""");
        var error2 = await Throws(() => Client().GetAsync<User>("/me"));
        Assert.Equal(ApiErrorKind.Server, error2.Kind);
        Assert.Equal(ApiException.UnreadableResponseMessage, error2.Message);
    }

    [Fact]
    public async Task OversizeBodiesAreRefusedInsteadOfBuffered()
    {
        // Whatever is listening at a saved address could stream forever; the
        // transport gives up at the cap rather than holding it all in memory.
        stub.Answer(() =>
        {
            var response = StubHttpMessageHandler.Json(200, "");
            response.Content = new ByteArrayContent(new byte[ApiClient.MaxResponseBytes + 1]);
            response.Content.Headers.ContentType = new MediaTypeHeaderValue("application/json");
            return response;
        });
        var error = await Throws(() => Client().GetAsync<Me>("/me"));
        Assert.Equal(ApiErrorKind.Network, error.Kind);
        Assert.True(error.IsConnectivityFailure);
        Assert.Single(stub.Requests);
    }

    [Fact]
    public async Task EmptyBodyDecodesOnlyToEmptyResponse()
    {
        stub.Answer(() => StubHttpMessageHandler.Empty(204));
        await Client().PostAsync<EmptyResponse>("/auth/logout");

        // A body the caller doesn't care about is fine too.
        stub.AnswerFixture("ok");
        await Client().PostAsync<EmptyResponse>("/auth/logout");

        stub.Answer(() => StubHttpMessageHandler.Empty(200));
        var error = await Throws(() => Client().PostAsync<OK>("/auth/logout"));
        Assert.Equal(ApiErrorKind.Server, error.Kind);
    }

    // MARK: Timeouts and cancellation

    [Fact]
    public async Task NoAnswerWithinTheTimeoutIsANetworkTimeout()
    {
        stub.Hang();
        var error = await Throws(() => Client().GetAsync<Me>("/me", timeout: TimeSpan.FromMilliseconds(50)));
        Assert.Equal(ApiErrorKind.Network, error.Kind);
        Assert.Equal(NetworkFailure.Timeout, error.Failure);
        Assert.False(error.IsCancellation);
    }

    [Fact]
    public async Task CallerCancellationIsReportedAsSuch()
    {
        stub.Hang();
        using var cancellation = new CancellationTokenSource(TimeSpan.FromMilliseconds(20));
        var error = await Throws(() => Client().GetAsync<Me>("/me", ct: cancellation.Token));
        Assert.Equal(NetworkFailure.Cancelled, error.Failure);
        Assert.True(error.IsCancellation);
    }

    [Fact]
    public async Task ConnectionRefusedIsANetworkFailure()
    {
        stub.Fail(StubHttpMessageHandler.ConnectionRefused());
        var error = await Throws(() => Client().GetAsync<Me>("/me"));
        Assert.Equal(ApiErrorKind.Network, error.Kind);
        Assert.Equal(NetworkFailure.Refused, error.Failure);
    }
}

public class TokenShapeTests
{
    [Theory]
    [InlineData("mqt_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ", true)]
    [InlineData("mqt_abc", false)]
    [InlineData("mqt_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN\r\nP", false)]
    [InlineData("xyz_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ", false)]
    [InlineData(null, false)]
    public void RecognizesTheContractShape(string? token, bool expected) =>
        Assert.Equal(expected, Marquee.Core.Api.ApiClient.IsWellFormedToken(token));

    [Fact]
    public void GridStopsAtTheLastRepresentableDay()
    {
        var month = System.Text.Json.JsonSerializer.Deserialize<Marquee.Core.Models.CalendarMonthResponse>(
            """{"configured":true,"month":"9999-12","gridStart":"9999-12-31","gridEnd":"9999-12-31","today":"9999-12-31","prevMonth":"9999-11","nextMonth":"9999-12","timeZone":"UTC","entries":[]}""",
            Marquee.Core.Models.Json.Options);
        Assert.Single(month!.GridDays);
    }
}
