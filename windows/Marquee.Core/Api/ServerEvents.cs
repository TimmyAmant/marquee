namespace Marquee.Core.Api;

/// <summary>
/// The areas of server state a call can change. A screen reloads for the
/// areas it shows, so approving a request refreshes the queue and the
/// library badges without also re-fetching Settings.
/// </summary>
[Flags]
public enum ServerChange
{
    None = 0,

    /// <summary>Library status, Sonarr/Radarr tracking, synced libraries: poster badges, title pages, the calendar, Discover's Recently added.</summary>
    Library = 1 << 0,

    Requests = 1 << 1,
    Notifications = 1 << 2,
    Favorites = 1 << 3,

    /// <summary>Household accounts.</summary>
    Users = 1 << 4,

    /// <summary>Connections, keys and webhooks under Settings, and what browse lists are built from (TMDb, Plex, Sonarr).</summary>
    Integrations = 1 << 5,

    Jobs = 1 << 6,

    All = Library | Requests | Notifications | Favorites | Users | Integrations | Jobs,
}

public enum ServerChangeSource
{
    /// <summary>This app changed something (a <see cref="MarqueeApi"/> mutation).</summary>
    Mutation,

    /// <summary>Polling noticed the server's state moved on its own.</summary>
    Server,
}

public sealed class ServerChangedEventArgs(ServerChange change, ServerChangeSource source) : EventArgs
{
    public ServerChange Change { get; } = change;
    public ServerChangeSource Source { get; } = source;
}

/// <summary>
/// Change counters screens key their reloads off. Every successful mutation
/// through <see cref="MarqueeApi"/> bumps the areas it touches; the badge
/// poller bumps <see cref="ServerChange.Notifications"/> and
/// <see cref="ServerChange.Requests"/> when it sees the counts move on the
/// server (a download finished, a member requested something from the
/// website).
///
/// Thread-safe: a mutation completes on whatever thread the transport
/// resumed on. <see cref="Changed"/> is raised on that thread too, so a view
/// model dispatches to the UI thread itself.
/// </summary>
public sealed class ServerEvents
{
    private static readonly ServerChange[] Areas =
    [
        ServerChange.Library,
        ServerChange.Requests,
        ServerChange.Notifications,
        ServerChange.Favorites,
        ServerChange.Users,
        ServerChange.Integrations,
        ServerChange.Jobs,
    ];

    private readonly object gate = new();
    private readonly int[] revisions = new int[Areas.Length];
    private readonly int[] remoteRevisions = new int[Areas.Length];

    /// <summary>Raised after a non-empty change is recorded, from either source.</summary>
    public event EventHandler<ServerChangedEventArgs>? Changed;

    public void Record(ServerChange change, ServerChangeSource source = ServerChangeSource.Mutation)
    {
        if (change == ServerChange.None)
        {
            return;
        }
        lock (gate)
        {
            for (var index = 0; index < Areas.Length; index++)
            {
                if (change.HasFlag(Areas[index]))
                {
                    revisions[index]++;
                    if (source == ServerChangeSource.Server)
                    {
                        remoteRevisions[index]++;
                    }
                }
            }
        }
        Changed?.Invoke(this, new ServerChangedEventArgs(change, source));
    }

    /// <summary>
    /// One value that moves whenever any of <paramref name="areas"/> does,
    /// from either source. Use it on a screen whose list should rebuild
    /// after the viewer's own action (Favorites losing a card, the request
    /// queue losing a row); use <see cref="RemoteRevision"/> on a screen
    /// that updates in place.
    /// </summary>
    public int Revision(ServerChange areas) => Sum(revisions, areas);

    /// <summary>
    /// Moves only when the server's own state changed under us, never for a
    /// mutation this app made, so acting on a title never re-renders (and
    /// re-scrolls) the page you acted on.
    /// </summary>
    public int RemoteRevision(ServerChange areas) => Sum(remoteRevisions, areas);

    private int Sum(int[] counters, ServerChange areas)
    {
        lock (gate)
        {
            var total = 0;
            for (var index = 0; index < Areas.Length; index++)
            {
                if (areas.HasFlag(Areas[index]))
                {
                    total += counters[index];
                }
            }
            return total;
        }
    }
}
