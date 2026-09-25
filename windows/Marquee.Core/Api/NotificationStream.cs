using System.Text;
using System.Text.Json;
using Marquee.Core.Models;

namespace Marquee.Core.Api;

/// <summary>
/// <c>GET /notifications/stream</c> (api-v1.md section 8): the live
/// notifications of the signed-in account, straight from the Marquee server,
/// with no outside push service. Keeps one connection open, raises
/// <see cref="NotificationReceived"/> for each new notification, and
/// reconnects when it drops: after the server's <c>retry</c> delay (5 s),
/// then doubling up to a minute while the server stays out of reach. Every
/// (re)connection raises <see cref="Connected"/> once the server says
/// <c>ready</c>; that is the moment to catch up on anything missed with
/// <c>GET /notifications</c>.
///
/// Stops for good, raising <see cref="SignedOut"/>, when the server revokes
/// the token (<c>event: signed-out</c>, or a 401 on reconnecting), and
/// raising <see cref="Unsupported"/> on a server without the stream (404,
/// from before the stream, 0.29.0 or older).
///
/// Events are raised on a background thread.
/// </summary>
public sealed class NotificationStream : IDisposable
{
    public const string StreamPath = "/notifications/stream";
    public const string EventStreamMediaType = "text/event-stream";

    /// <summary>Until the server's own <c>retry</c> arrives; the server sends 5000.</summary>
    public static readonly TimeSpan DefaultRetryDelay = TimeSpan.FromSeconds(5);

    /// <summary>The longest wait between attempts while the server can't be reached.</summary>
    public static readonly TimeSpan MaxRetryDelay = TimeSpan.FromSeconds(60);

    /// <summary>
    /// The server writes a keep-alive every 25 seconds; this long without a
    /// single line means the connection is gone even if TCP hasn't noticed
    /// (a laptop that slept, a proxy that dropped it quietly).
    /// </summary>
    public static readonly TimeSpan DefaultIdleTimeout = TimeSpan.FromSeconds(70);

    /// <summary>How long a connection attempt may take to get the response headers.</summary>
    public static readonly TimeSpan ConnectTimeout = TimeSpan.FromSeconds(15);

    private readonly Func<ApiClient?> clientProvider;
    private readonly TimeSpan idleTimeout;
    private readonly Func<TimeSpan, CancellationToken, Task> delay;
    private readonly object gate = new();
    private CancellationTokenSource? running;

    /// <param name="clientProvider">
    /// The session's current client, asked again for every connection so a
    /// reconnect carries the current token; null (signed out) stops the stream.
    /// </param>
    /// <param name="idleTimeout">Defaults to <see cref="DefaultIdleTimeout"/>; tests shorten it.</param>
    /// <param name="delay">Waits between attempts; tests pass one that doesn't wait.</param>
    public NotificationStream(
        Func<ApiClient?> clientProvider,
        TimeSpan? idleTimeout = null,
        Func<TimeSpan, CancellationToken, Task>? delay = null)
    {
        this.clientProvider = clientProvider;
        this.idleTimeout = idleTimeout ?? DefaultIdleTimeout;
        this.delay = delay ?? WaitAsync;
    }

    private static Task WaitAsync(TimeSpan wait, CancellationToken ct) => Task.Delay(wait, ct);

    /// <summary>The server said <c>ready</c>: connected (again). Catch up now.</summary>
    public event EventHandler? Connected;

    /// <summary>A notification the server just created for this account.</summary>
    public event EventHandler<NotificationItem>? NotificationReceived;

    /// <summary>The token was revoked (Sign out elsewhere, a password change). The stream has stopped; sign in again.</summary>
    public event EventHandler? SignedOut;

    /// <summary>The server has no stream (0.29.0 or older answers 404). The stream has stopped.</summary>
    public event EventHandler? Unsupported;

    public bool IsRunning
    {
        get
        {
            lock (gate)
            {
                return running != null;
            }
        }
    }

    /// <summary>Connects in the background, and keeps reconnecting until <see cref="Stop"/>. A no-op while running.</summary>
    public void Start()
    {
        lock (gate)
        {
            if (running != null)
            {
                return;
            }
            var cancellation = new CancellationTokenSource();
            running = cancellation;
            _ = Task.Run(() => RunAsync(cancellation));
        }
    }

    /// <summary>Closes the connection and stops reconnecting. Nothing is raised after this returns, except an event already being delivered.</summary>
    public void Stop()
    {
        lock (gate)
        {
            running?.Cancel();
            running = null;
        }
    }

    public void Dispose() => Stop();

    private enum Outcome
    {
        /// <summary>The connection failed or ended before <c>ready</c>.</summary>
        Failed,

        /// <summary>The connection ended after <c>ready</c>: reconnect after the plain retry delay.</summary>
        Dropped,

        SignedOut,
        Unsupported,
        Stopped,
    }

    private async Task RunAsync(CancellationTokenSource cancellation)
    {
        var ct = cancellation.Token;
        var retry = DefaultRetryDelay;
        var failures = 0;
        try
        {
            while (!ct.IsCancellationRequested)
            {
                var (outcome, serverRetry) = await ConnectOnceAsync(ct).ConfigureAwait(false);
                if (serverRetry is { } milliseconds)
                {
                    retry = TimeSpan.FromMilliseconds(Math.Clamp(milliseconds, 1000, (int)MaxRetryDelay.TotalMilliseconds));
                }
                if (ct.IsCancellationRequested)
                {
                    return;
                }
                switch (outcome)
                {
                    case Outcome.SignedOut:
                        StopFor(cancellation);
                        SignedOut?.Invoke(this, EventArgs.Empty);
                        return;
                    case Outcome.Unsupported:
                        StopFor(cancellation);
                        Unsupported?.Invoke(this, EventArgs.Empty);
                        return;
                    case Outcome.Stopped:
                        return;
                    case Outcome.Dropped:
                        failures = 0;
                        break;
                    default:
                        failures++;
                        break;
                }

                var wait = failures == 0 ? retry : Backoff(retry, failures);
                try
                {
                    await delay(wait, ct).ConfigureAwait(false);
                }
                catch (OperationCanceledException)
                {
                    return;
                }
            }
        }
        finally
        {
            StopFor(cancellation);
        }
    }

    /// <summary>The retry delay, doubled for each failure after the first, capped at <see cref="MaxRetryDelay"/>: 5, 10, 20, 40, 60, 60 s.</summary>
    internal static TimeSpan Backoff(TimeSpan retry, int failures)
    {
        var factor = Math.Pow(2, Math.Min(failures - 1, 16));
        var milliseconds = Math.Min(retry.TotalMilliseconds * factor, MaxRetryDelay.TotalMilliseconds);
        return TimeSpan.FromMilliseconds(Math.Max(milliseconds, retry.TotalMilliseconds));
    }

    /// <summary>Forgets <paramref name="cancellation"/> as the running loop, unless a newer <see cref="Start"/> replaced it.</summary>
    private void StopFor(CancellationTokenSource cancellation)
    {
        lock (gate)
        {
            if (ReferenceEquals(running, cancellation))
            {
                running = null;
            }
        }
    }

    /// <summary>One connection, read until it ends. Also answers the last <c>retry</c> the server sent, if any.</summary>
    private async Task<(Outcome Outcome, int? Retry)> ConnectOnceAsync(CancellationToken ct)
    {
        var client = clientProvider();
        if (client?.Token == null)
        {
            // Signed out on this side already: nothing to connect as.
            return (Outcome.Stopped, null);
        }

        ApiClient.StreamingResponse response;
        try
        {
            response = await client.OpenStreamAsync(StreamPath, EventStreamMediaType, ConnectTimeout, ct).ConfigureAwait(false);
        }
        catch (ApiException error)
        {
            if (ct.IsCancellationRequested || error.IsCancellation)
            {
                return (Outcome.Stopped, null);
            }
            if (error.IsRejectedToken)
            {
                // The client's OnUnauthorized has already dropped the token.
                return (Outcome.SignedOut, null);
            }
            if (error.Kind == ApiErrorKind.NotFound)
            {
                return (Outcome.Unsupported, null);
            }
            return (Outcome.Failed, null);
        }

        var parser = new ServerSentEventParser();
        var ready = false;
        using (response)
        using (var idle = CancellationTokenSource.CreateLinkedTokenSource(ct))
        using (var reader = new StreamReader(response.Body, Encoding.UTF8))
        {
            idle.CancelAfter(idleTimeout);
            try
            {
                while (true)
                {
                    var line = await reader.ReadLineAsync(idle.Token).ConfigureAwait(false);
                    if (line == null)
                    {
                        break;
                    }
                    idle.CancelAfter(idleTimeout);
                    if (parser.Feed(line) is not { } message)
                    {
                        continue;
                    }
                    switch (message.Type)
                    {
                        case "ready":
                            ready = true;
                            Connected?.Invoke(this, EventArgs.Empty);
                            break;
                        case "notification":
                            if (DecodeNotification(message.Data) is { } item)
                            {
                                NotificationReceived?.Invoke(this, item);
                            }
                            break;
                        case "signed-out":
                            return (Outcome.SignedOut, parser.RetryMilliseconds);
                    }
                }
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                return (Outcome.Stopped, parser.RetryMilliseconds);
            }
            catch (Exception error) when (error is OperationCanceledException or IOException or HttpRequestException or ObjectDisposedException)
            {
                // The idle timeout, or the connection dropping mid-read.
            }
        }
        return (ready ? Outcome.Dropped : Outcome.Failed, parser.RetryMilliseconds);
    }

    /// <summary>One <c>notification</c> event's data; null for one this version can't read, which is skipped rather than ending the stream.</summary>
    internal static NotificationItem? DecodeNotification(string data)
    {
        try
        {
            return Json.Decode<NotificationItem>(data);
        }
        catch (Exception error) when (error is JsonException or NotSupportedException)
        {
            return null;
        }
    }
}
