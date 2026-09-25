using System.Collections.Concurrent;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// GET /notifications/stream against a stubbed server: what the client sends,
// the events it raises, and when it reconnects or gives up. The stub answers
// each connection with a whole body and then ends it, which the client
// reads as a dropped connection.

public sealed class NotificationStreamTests
{
    private const string Token = "mqt_testtesttesttesttesttesttesttesttesttesttes";
    private static readonly Uri Base = new("http://127.0.0.1:3000");
    private static readonly TimeSpan Patience = TimeSpan.FromSeconds(10);

    private const string NotificationJson =
        """{"id":"a23f7682-41ae-4e8a-8b17-14d903ab017a","mediaType":"movie","tmdbId":27205,"title":"Inception","eventType":"request_rejected","message":"\"Inception\" was declined: Already available on a streaming service we have","read":false,"createdAt":"2026-09-25T11:25:16.885Z"}""";

    private readonly StubHttpMessageHandler stub = new();
    private readonly ConcurrentQueue<TimeSpan> waits = new();
    private int unauthorizedCalls;

    private NotificationStream Stream() => new(
        () => new ApiClient(Base, Token, stub, () =>
        {
            Interlocked.Increment(ref unauthorizedCalls);
            return Task.CompletedTask;
        }),
        delay: (wait, _) =>
        {
            waits.Enqueue(wait);
            return Task.CompletedTask;
        });

    private static HttpResponseMessage EventStream(string body) =>
        StubHttpMessageHandler.Text(200, body, "text/event-stream", apiHeader: true);

    private static async Task Within(Task task)
    {
        // The stream didn't get there in time if the delay finished first.
        var finished = await Task.WhenAny(task, Task.Delay(Patience));
        Assert.Same(task, finished);
        await task;
    }

    [Fact]
    public async Task ConnectsWithTheTokenAndRaisesEachEvent()
    {
        stub.Answer(() => EventStream(
            "retry: 5000\n\nevent: ready\ndata: {}\n\n"
            + $"event: notification\nid: a23f7682-41ae-4e8a-8b17-14d903ab017a\ndata: {NotificationJson}\n\n"
            + ": keep-alive\n\n"
            + "event: signed-out\ndata: {}\n\n"));
        using var stream = Stream();
        var connected = 0;
        var received = new ConcurrentQueue<NotificationItem>();
        var signedOut = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        stream.Connected += (_, _) => Interlocked.Increment(ref connected);
        stream.NotificationReceived += (_, item) => received.Enqueue(item);
        stream.SignedOut += (_, _) => signedOut.TrySetResult();

        stream.Start();
        await Within(signedOut.Task);

        var request = Assert.Single(stub.Requests);
        Assert.Equal(HttpMethod.Get, request.Method);
        Assert.Equal("/api/v1/notifications/stream", request.Path);
        Assert.Equal("text/event-stream", request.Header("Accept"));
        Assert.Equal($"Bearer {Token}", request.Authorization);

        Assert.Equal(1, connected);
        var item = Assert.Single(received);
        Assert.Equal(Guid.Parse("a23f7682-41ae-4e8a-8b17-14d903ab017a"), item.Id);
        Assert.Equal(new TitleId(MediaType.Movie, 27205), item.TitleId);
        Assert.Equal(NotificationEventType.RequestRejected, item.EventType);
        Assert.Equal("Request declined", item.EventType.NotificationTitle);

        // Signed out is final: no reconnect, nothing left running.
        Assert.Empty(waits);
        Assert.False(stream.IsRunning);
    }

    [Fact]
    public async Task ReconnectsAfterADropAndConnectsAgain()
    {
        stub.Answer(request => stub.Requests.Count == 1
            ? EventStream("retry: 3000\n\nevent: ready\ndata: {}\n\n")
            : EventStream("event: ready\ndata: {}\n\nevent: signed-out\ndata: {}\n\n"));
        using var stream = Stream();
        var connected = 0;
        var signedOut = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        stream.Connected += (_, _) => Interlocked.Increment(ref connected);
        stream.SignedOut += (_, _) => signedOut.TrySetResult();

        stream.Start();
        await Within(signedOut.Task);

        Assert.Equal(2, stub.Requests.Count);
        Assert.Equal(2, connected);
        // A drop after "ready" waits the server's own retry, once.
        Assert.Equal([TimeSpan.FromMilliseconds(3000)], waits);
    }

    [Fact]
    public async Task BacksOffWhileTheServerIsUnreachable()
    {
        stub.Handler = (_, _) => stub.Requests.Count <= 3
            ? throw StubHttpMessageHandler.ConnectionRefused()
            : Task.FromResult(EventStream("event: ready\ndata: {}\n\nevent: signed-out\ndata: {}\n\n"));
        using var stream = Stream();
        var signedOut = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        stream.SignedOut += (_, _) => signedOut.TrySetResult();

        stream.Start();
        await Within(signedOut.Task);

        Assert.Equal(4, stub.Requests.Count);
        Assert.Equal([TimeSpan.FromSeconds(5), TimeSpan.FromSeconds(10), TimeSpan.FromSeconds(20)], waits);
    }

    [Fact]
    public void BackoffDoublesUpToAMinute()
    {
        var retry = NotificationStream.DefaultRetryDelay;

        Assert.Equal(
            [5.0, 10.0, 20.0, 40.0, 60.0, 60.0, 60.0],
            Enumerable.Range(1, 7).Select(failures => NotificationStream.Backoff(retry, failures).TotalSeconds));
    }

    [Fact]
    public async Task ARejectedTokenSignsOutWithoutRetrying()
    {
        stub.AnswerJson(401, """{"error":"Unauthorized","code":"unauthorized"}""");
        using var stream = Stream();
        var signedOut = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        stream.SignedOut += (_, _) => signedOut.TrySetResult();

        stream.Start();
        await Within(signedOut.Task);

        Assert.Single(stub.Requests);
        Assert.Empty(waits);
        // The session heard about it too, the way any call's 401 reaches it.
        Assert.Equal(1, unauthorizedCalls);
    }

    [Fact]
    public async Task AServerWithoutTheStreamStopsQuietly()
    {
        stub.AnswerJson(404, """{"error":"Not found","code":"not_found"}""");
        using var stream = Stream();
        var unsupported = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var signedOut = false;
        stream.Unsupported += (_, _) => unsupported.TrySetResult();
        stream.SignedOut += (_, _) => signedOut = true;

        stream.Start();
        await Within(unsupported.Task);

        Assert.Single(stub.Requests);
        Assert.False(signedOut);
        Assert.False(stream.IsRunning);
    }

    [Fact]
    public async Task ANonStreamAnswerCountsAsAFailedAttempt()
    {
        // A captive portal's 200 page is not the stream: try again later.
        stub.Handler = (_, _) => Task.FromResult(stub.Requests.Count == 1
            ? StubHttpMessageHandler.Html(200, "<html>Sign in to the Wi-Fi</html>")
            : EventStream("event: ready\ndata: {}\n\nevent: signed-out\ndata: {}\n\n"));
        using var stream = Stream();
        var signedOut = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        stream.SignedOut += (_, _) => signedOut.TrySetResult();

        stream.Start();
        await Within(signedOut.Task);

        Assert.Equal(2, stub.Requests.Count);
        Assert.Equal([TimeSpan.FromSeconds(5)], waits);
    }

    [Fact]
    public async Task AnUnreadableNotificationIsSkipped()
    {
        stub.Answer(() => EventStream(
            "event: ready\ndata: {}\n\n"
            + "event: notification\ndata: {\"id\":\"not a notification\"}\n\n"
            + $"event: notification\ndata: {NotificationJson}\n\n"
            + "event: signed-out\ndata: {}\n\n"));
        using var stream = Stream();
        var received = new ConcurrentQueue<NotificationItem>();
        var signedOut = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        stream.NotificationReceived += (_, item) => received.Enqueue(item);
        stream.SignedOut += (_, _) => signedOut.TrySetResult();

        stream.Start();
        await Within(signedOut.Task);

        Assert.Equal("Inception", Assert.Single(received).Title);
    }

    [Fact]
    public async Task StopEndsTheLoopWithoutEvents()
    {
        stub.Hang();
        using var stream = Stream();
        var raised = false;
        stream.SignedOut += (_, _) => raised = true;
        stream.Unsupported += (_, _) => raised = true;

        stream.Start();
        Assert.True(stream.IsRunning);
        stream.Stop();

        Assert.False(stream.IsRunning);
        await Task.Delay(100);
        Assert.False(raised);
    }
}
