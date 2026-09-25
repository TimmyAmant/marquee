using System.Text;
using Marquee.Core.Api;
using Marquee.Core.Connection;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// Server-info classification (the Mac's ServerProbeClassificationTests) plus
// the probe's own redirect handling, which the Mac gets from URLSession.

public sealed class ServerProbeTests
{
    private const string LegacyLoginPage =
        "<!DOCTYPE html><html lang=\"en\" class=\"dark\"><head><meta charSet=\"utf-8\"/>"
        + "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"/>"
        + "<title>Marquee</title><meta name=\"description\" content=\"Search any actor, studio, or catalog\"/>"
        + "</head><body><main>Sign in</main></body></html>";

    private static readonly ServerAddress Address = new("192.168.1.20");

    private static ServerInfo Info(string version, bool? setupComplete, int apiVersion = 1, string status = "ok") =>
        new() { App = "marquee", ApiVersion = apiVersion, Version = version, SetupComplete = setupComplete, Status = status };

    private static ProbeOutcome Classify(int status, string body, string? contentType = "application/json", bool apiHeader = true) =>
        ServerProbe.Classify(status, contentType, apiHeader, Encoding.UTF8.GetBytes(body));

    // MARK: Classification

    [Fact]
    public void CurrentServer()
    {
        var outcome = Classify(200, """{"app":"marquee","apiVersion":1,"version":"0.22.0","setupComplete":true,"status":"ok"}""");
        Assert.Equal(new ProbeOutcome.Marquee(Info("0.22.0", true)), outcome);
        Assert.True(outcome.ServerInfo?.SetupComplete);
        Assert.Null(outcome.ProblemMessage(Address));
    }

    [Fact]
    public void FreshAndDegradedServers()
    {
        var fresh = Classify(200, """{"app":"marquee","apiVersion":1,"version":"0.22.1","setupComplete":false,"status":"ok"}""");
        Assert.False(fresh.ServerInfo?.SetupComplete);

        var degraded = Classify(200, """{"app":"marquee","apiVersion":1,"version":"0.22.0","setupComplete":null,"status":"degraded"}""");
        Assert.NotNull(degraded.ServerInfo);
        Assert.Null(degraded.ServerInfo.SetupComplete);
        Assert.True(degraded.ServerInfo.IsDegraded);
    }

    [Fact]
    public void NewerApiVersionIsIncompatible()
    {
        var outcome = Classify(200, """{"app":"marquee","apiVersion":2,"version":"1.0.0","setupComplete":true,"status":"ok"}""");
        var incompatible = Assert.IsType<ProbeOutcome.Incompatible>(outcome);
        Assert.Equal("1.0.0", incompatible.Info.Version);
        Assert.Null(outcome.ServerInfo);
    }

    [Fact]
    public void LegacyServerHtmlAfterLoginRedirect()
    {
        Assert.Equal(new ProbeOutcome.Legacy(), Classify(200, LegacyLoginPage, contentType: "text/html; charset=utf-8", apiHeader: false));
        // Even without a content type, the HTML itself is enough.
        Assert.Equal(new ProbeOutcome.Legacy(), Classify(200, LegacyLoginPage, contentType: null, apiHeader: false));
        var message = new ProbeOutcome.Legacy().ProblemMessage(new ServerAddress("tower.local"));
        Assert.NotNull(message);
        Assert.Contains(ServerInfo.MinimumServerVersion, message);
    }

    [Fact]
    public void NonMarqueeJson()
    {
        Assert.Equal(new ProbeOutcome.NotMarquee(), Classify(200, """{"status":"ok","version":"10.2.3"}""", apiHeader: false));
        Assert.Equal(new ProbeOutcome.NotMarquee(), Classify(200, """{"app":"grafana","apiVersion":1,"version":"10.2.3"}""", apiHeader: false));
        Assert.Equal(new ProbeOutcome.NotMarquee(), Classify(404, """{"message":"Not Found"}""", apiHeader: false));
    }

    [Fact]
    public void OtherHtmlAndPlainText()
    {
        const string grafana = "<!doctype html><html><head><title>Grafana</title></head><body></body></html>";
        Assert.Equal(new ProbeOutcome.NotMarquee(), Classify(200, grafana, contentType: "text/html", apiHeader: false));
        Assert.Equal(new ProbeOutcome.NotMarquee(), Classify(404, "404 page not found", contentType: "text/plain", apiHeader: false));
        // A title that merely mentions Marquee isn't the web app's layout.
        const string lookalike = "<html><head><title>Marquee Lights Co.</title></head></html>";
        Assert.Equal(new ProbeOutcome.NotMarquee(), Classify(200, lookalike, contentType: "text/html", apiHeader: false));
    }

    [Fact]
    public void V1ServerErrorIsNotMistakenForAnotherApp()
    {
        var outcome = Classify(500, """{"error":"boom","code":"internal"}""");
        var unreachable = Assert.IsType<ProbeOutcome.Unreachable>(outcome);
        Assert.Equal(UnreachableReasonKind.Failed, unreachable.Reason.Kind);
        Assert.Contains("500", unreachable.Reason.Detail);
    }

    [Fact]
    public void UnreachableReasonsFromNetworkFailures()
    {
        Assert.Equal(UnreachableReason.Refused, ServerProbe.UnreachableReasonFor(ApiException.Network(NetworkFailure.Refused)));
        Assert.Equal(UnreachableReason.NoResponse, ServerProbe.UnreachableReasonFor(ApiException.Network(NetworkFailure.Timeout)));
        Assert.Equal(UnreachableReason.NoResponse, ServerProbe.UnreachableReasonFor(ApiException.Network(NetworkFailure.ConnectionLost)));
        Assert.Equal(UnreachableReason.UnknownHost, ServerProbe.UnreachableReasonFor(ApiException.Network(NetworkFailure.UnknownHost)));
        Assert.Equal(UnreachableReason.LocalNetworkDenied, ServerProbe.UnreachableReasonFor(ApiException.Network(NetworkFailure.AccessDenied)));
        // TLS failures keep the system message.
        var tls = ServerProbe.UnreachableReasonFor(ApiException.Network(NetworkFailure.Other, "certificate rejected"));
        Assert.Equal(UnreachableReasonKind.Failed, tls.Kind);
        Assert.Contains("certificate rejected", tls.Detail);
    }

    [Fact]
    public void ProblemMessages()
    {
        ProbeOutcome[] outcomes =
        [
            new ProbeOutcome.Legacy(),
            new ProbeOutcome.NotMarquee(),
            new ProbeOutcome.Incompatible(Info("1.0.0", true, apiVersion: 2)),
            new ProbeOutcome.Unreachable(UnreachableReason.Refused),
            new ProbeOutcome.Unreachable(UnreachableReason.NoResponse),
            new ProbeOutcome.Unreachable(UnreachableReason.UnknownHost),
            new ProbeOutcome.Unreachable(UnreachableReason.LocalNetworkDenied),
            new ProbeOutcome.Unreachable(UnreachableReason.Failed("TLS")),
        ];
        foreach (var outcome in outcomes)
        {
            Assert.NotNull(outcome.ProblemMessage(Address));
        }
        Assert.Contains("port 3000", new ProbeOutcome.Unreachable(UnreachableReason.Refused).ProblemMessage(Address));
        Assert.Contains("local network", new ProbeOutcome.Unreachable(UnreachableReason.LocalNetworkDenied).ProblemMessage(Address));
        Assert.Contains("1.0.0", new ProbeOutcome.Incompatible(Info("1.0.0", true, apiVersion: 2)).ProblemMessage(Address));
        Assert.Contains("TLS", new ProbeOutcome.Unreachable(UnreachableReason.Failed("TLS")).ProblemMessage(Address));
    }

    // MARK: Probing

    [Fact]
    public async Task ProbeAsksForServerInfoWithoutCredentials()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerFixture("server-info");
        var outcome = await ServerProbe.ProbeAsync(Address, stub);
        Assert.Equal(new ProbeOutcome.Marquee(Info("0.22.0", true)), outcome);

        var request = Assert.Single(stub.Requests);
        Assert.Equal("/api/v1/server-info", request.Path);
        Assert.Equal("http://192.168.1.20:3000/api/v1/server-info", request.Uri.AbsoluteUri);
        Assert.Null(request.Authorization);
        Assert.Equal("application/json", request.Header("Accept"));
    }

    [Fact]
    public async Task LegacyRedirectToLoginIsFollowedOnceAndCheckedForTheMarqueePage()
    {
        var stub = new StubHttpMessageHandler();
        stub.Answer(request => request.Path == "/login"
            ? StubHttpMessageHandler.Html(200, LegacyLoginPage)
            : StubHttpMessageHandler.Redirect(307, "/login"));

        var outcome = await ServerProbe.ProbeAsync(Address, stub);
        Assert.Equal(new ProbeOutcome.Legacy(), outcome);
        Assert.Equal(2, stub.Requests.Count);
        Assert.Equal("http://192.168.1.20:3000/login", stub.Requests[1].Uri.AbsoluteUri);
    }

    [Fact]
    public async Task RedirectToAnotherAppsLoginIsNotMarquee()
    {
        var stub = new StubHttpMessageHandler();
        stub.Answer(request => request.Path == "/login"
            ? StubHttpMessageHandler.Html(200, "<html><head><title>Grafana</title></head></html>")
            : StubHttpMessageHandler.Redirect(302, "http://192.168.1.20:3000/login"));

        Assert.Equal(new ProbeOutcome.NotMarquee(), await ServerProbe.ProbeAsync(Address, stub));
        Assert.Equal(2, stub.Requests.Count);
    }

    [Fact]
    public async Task RedirectsElsewhereAreNeverFollowed()
    {
        var stub = new StubHttpMessageHandler();
        stub.Answer(() => StubHttpMessageHandler.Redirect(302, "https://accounts.example.com/login"));
        Assert.Equal(new ProbeOutcome.NotMarquee(), await ServerProbe.ProbeAsync(Address, stub));
        Assert.Single(stub.Requests);

        stub.Answer(() => StubHttpMessageHandler.Redirect(302, "/dashboard"));
        Assert.Equal(new ProbeOutcome.NotMarquee(), await ServerProbe.ProbeAsync(Address, stub));
    }

    [Fact]
    public async Task ClosedPortAndSilenceAreUnreachable()
    {
        var stub = new StubHttpMessageHandler();
        stub.Fail(StubHttpMessageHandler.ConnectionRefused());
        Assert.Equal(new ProbeOutcome.Unreachable(UnreachableReason.Refused), await ServerProbe.ProbeAsync(Address, stub));

        stub.Fail(StubHttpMessageHandler.UnknownHost());
        Assert.Equal(new ProbeOutcome.Unreachable(UnreachableReason.UnknownHost), await ServerProbe.ProbeAsync(Address, stub));

        stub.Hang();
        var outcome = await ServerProbe.ProbeAsync(Address, stub, timeout: TimeSpan.FromMilliseconds(50));
        Assert.Equal(new ProbeOutcome.Unreachable(UnreachableReason.NoResponse), outcome);
    }

    [Fact]
    public async Task CancellationPropagates()
    {
        var stub = new StubHttpMessageHandler();
        stub.Hang();
        using var cancellation = new CancellationTokenSource(TimeSpan.FromMilliseconds(20));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => ServerProbe.ProbeAsync(Address, stub, ct: cancellation.Token));
    }
}
