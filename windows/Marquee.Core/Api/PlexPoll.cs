namespace Marquee.Core.Api;

/// <summary>
/// The Plex PIN poll shared by sign-in (<c>/auth/plex/poll</c>) and linking
/// (<c>/me/links/plex/poll</c>): 202 while the person is still in the
/// browser, 200 once Plex said yes, 403 when the server refuses that Plex
/// account, 410 once the PIN is gone. The Mac app's <c>PlexPoll</c>.
/// </summary>
public static class PlexPoll
{
    /// <summary>The server's poll interval.</summary>
    public static readonly TimeSpan Interval = TimeSpan.FromSeconds(2);

    /// <summary>Statuses a poll answers with that aren't failures of the call itself.</summary>
    public static readonly IReadOnlyCollection<int> Answers = [202, 403, 410];

    /// <summary>
    /// This PC's clock and the server's can disagree: never give up sooner
    /// than this after starting, whatever <c>expiresAt</c> says (the
    /// server's 410 ends it anyway).
    /// </summary>
    public static readonly TimeSpan MinimumWindow = TimeSpan.FromMinutes(2);

    /// <summary>
    /// One answer: null while pending (202), the answer itself once done;
    /// throws Forbidden with the server's reason for 403 and Expired for 410.
    /// </summary>
    public static ApiClient.RawResponse? Step(ApiClient.RawResponse raw) => raw.StatusCode switch
    {
        202 => null,
        403 => throw ApiException.RefusedFromResponse(raw.StatusCode, raw.BodyText, raw.HasApiHeader),
        410 => throw ApiException.PlexSignInExpired(raw.StatusCode, raw.HasApiHeader),
        _ => raw,
    };

    /// <summary>
    /// Calls <paramref name="poll"/> every <paramref name="interval"/> until
    /// it returns a value, it throws, <paramref name="ct"/> is cancelled (a
    /// Network/Cancelled <see cref="ApiException"/>), or <paramref name="expiresAt"/>
    /// passes (Expired).
    /// </summary>
    public static async Task<T> RunAsync<T>(
        DateTimeOffset expiresAt,
        Func<CancellationToken, Task<T?>> poll,
        TimeSpan? interval = null,
        Func<DateTimeOffset>? now = null,
        CancellationToken ct = default)
        where T : class
    {
        var clock = now ?? (() => DateTimeOffset.UtcNow);
        var start = clock();
        var deadline = expiresAt > start + MinimumWindow ? expiresAt : start + MinimumWindow;
        while (true)
        {
            try
            {
                await Task.Delay(interval ?? Interval, ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException error)
            {
                throw ApiException.Wrap(error, ct);
            }
            if (await poll(ct).ConfigureAwait(false) is { } result)
            {
                return result;
            }
            if (clock() >= deadline)
            {
                throw ApiException.PlexSignInExpired();
            }
        }
    }

    /// <summary><see cref="RunAsync{T}"/> for a poll that only says whether it's done (linking).</summary>
    public static Task UntilAsync(
        DateTimeOffset expiresAt,
        Func<CancellationToken, Task<bool>> poll,
        TimeSpan? interval = null,
        Func<DateTimeOffset>? now = null,
        CancellationToken ct = default) =>
        RunAsync<object>(
            expiresAt,
            async token => await poll(token).ConfigureAwait(false) ? Done : null,
            interval,
            now,
            ct);

    private static readonly object Done = new();
}
