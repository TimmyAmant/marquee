using System.Globalization;
using System.Text;
using System.Text.Json;
using Marquee.Core.Connection;
using Marquee.Core.Models;

namespace Marquee.Core.Updates;

// "What's new in Marquee 0.45.3" after an upgrade: components/whats-new.tsx,
// with the rules of lib/whats-new.ts, and the Mac app's App/WhatsNew.swift
// case for case. Server and app updates are separate events: a newer server
// shows its changelog entries (as on the website and the Mac), a newer
// Windows app shows its own, read from the lib/changelog.ts it was built
// with (embedded in this assembly). Both at once: one dialog, each version once.

/// <summary>The versions this PC last showed notes for, on one server.</summary>
public sealed record WhatsNewSeen(string? Server, string? App)
{
    public static readonly WhatsNewSeen Nothing = new(null, null);
}

/// <summary>What changed since <see cref="WhatsNewSeen"/>.</summary>
/// <param name="ServerSince">The server was upgraded from this version.</param>
/// <param name="AppSince">This app was updated from this version.</param>
public sealed record WhatsNewPending(AppVersion? ServerSince, AppVersion? AppSince);

/// <summary>The dialog.</summary>
public sealed record WhatsNewContent
{
    /// <summary>The title's "What's new in Marquee 0.45.3": the newest version that changed.</summary>
    public required string Version { get; init; }

    /// <summary>Newest first, at most <see cref="WhatsNew.Cap"/>, from the server and this app, each version once.</summary>
    public required IReadOnlyList<ChangelogEntry> Entries { get; init; }

    /// <summary>More releases than the cap fall in the range.</summary>
    public required bool HasMore { get; init; }

    /// <summary>This app was updated to a version whose notes it doesn't have: say it's installed, and link to the release.</summary>
    public string? InstalledAppVersion { get; init; }

    /// <summary>The GitHub release for <see cref="InstalledAppVersion"/>.</summary>
    public Uri? ReleaseNotesUrl =>
        InstalledAppVersion is { } version ? new Uri($"https://github.com/TimmyAmant/marquee/releases/tag/v{version}") : null;

    /// <summary>"What's new in Marquee 0.45.3".</summary>
    public string Title => $"What's new in Marquee {Version}";
}

public static class WhatsNew
{
    /// <summary>How many releases the dialog lists; "See all changes" has the rest.</summary>
    public const int Cap = 10;

    /// <summary>
    /// Null when there's nothing to show: the first run on this PC (nothing
    /// remembered: remember, don't greet a new install with a wall of notes),
    /// the same versions, or a downgrade. Something unreadable remembered
    /// counts as nothing.
    /// </summary>
    public static WhatsNewPending? Pending(WhatsNewSeen seen, AppVersion? server, AppVersion? app)
    {
        var lastServer = AppVersion.Parse(seen.Server);
        var lastApp = AppVersion.Parse(seen.App);
        var serverSince = lastServer is not null && server is not null && server > lastServer ? lastServer : null;
        var appSince = lastApp is not null && app is not null && app > lastApp ? lastApp : null;
        return serverSince is null && appSince is null ? null : new WhatsNewPending(serverSince, appSince);
    }

    /// <summary>
    /// What to remember after showing (or finding nothing to show): the newer
    /// of what was seen and what's current, each on its own, so a downgrade
    /// doesn't bring the same notes back after the next upgrade.
    /// </summary>
    public static WhatsNewSeen Remembered(WhatsNewSeen seen, AppVersion? server, AppVersion? app)
    {
        static string? Newer(string? stored, AppVersion? current)
        {
            if (current is null)
            {
                return stored;
            }
            return AppVersion.Parse(stored) is { } last && last >= current ? stored : current.Text;
        }
        return new WhatsNewSeen(Newer(seen.Server, server), Newer(seen.App, app));
    }

    /// <summary>The releases newer than <paramref name="since"/>, up to and including <paramref name="upTo"/>.</summary>
    public static IEnumerable<ChangelogEntry> Between(IEnumerable<ChangelogEntry> changelog, AppVersion since, AppVersion upTo) =>
        changelog.Where(entry => AppVersion.Parse(entry.Version) is { } version && version > since && version <= upTo);

    /// <summary>Null when there's nothing to say: remember the versions and move on.</summary>
    public static WhatsNewContent? Content(
        WhatsNewPending pending,
        AppVersion? server,
        AppVersion? app,
        IReadOnlyList<ChangelogEntry> serverChangelog,
        IReadOnlyList<ChangelogEntry> appChangelog,
        int cap = Cap)
    {
        var merged = new List<ChangelogEntry>();
        void Add(IEnumerable<ChangelogEntry> list)
        {
            foreach (var entry in list)
            {
                if (!merged.Any(existing => AppVersion.Parse(existing.Version) == AppVersion.Parse(entry.Version)))
                {
                    merged.Add(entry);
                }
            }
        }

        AppVersion? newest = null;
        if (pending.ServerSince is { } serverSince && server is not null)
        {
            // The server's text first: it's what the website shows.
            Add(Between(serverChangelog, serverSince, server));
            newest = server;
        }
        string? installed = null;
        if (pending.AppSince is { } appSince && app is not null)
        {
            Add(Between(appChangelog, appSince, app));
            if (!merged.Any(entry => AppVersion.Parse(entry.Version) == app))
            {
                installed = app.Text;
            }
            if (newest is null || app > newest)
            {
                newest = app;
            }
        }
        if (newest is null || (merged.Count == 0 && installed == null))
        {
            return null;
        }
        var sorted = merged.OrderByDescending(entry => AppVersion.Parse(entry.Version) ?? newest).ToList();
        return new WhatsNewContent
        {
            Version = newest.Text,
            Entries = sorted.Take(cap).ToList(),
            HasMore = sorted.Count > cap,
            InstalledAppVersion = installed,
        };
    }
}

/// <summary>
/// lib/changelog.ts, embedded in this assembly (Marquee.Core.csproj): a small
/// scanner reads its <c>version: "…"</c>, <c>date: "…"</c>, <c>changes: ["…", …]</c>
/// entries. lib/whats-new.test.ts runs the same scanner over the file, so a
/// change to its shape fails the website's tests first.
/// </summary>
public static class BundledChangelog
{
    public const string ResourceName = "Marquee.Core.changelog.ts";

    /// <summary>This app's releases, newest first; empty if the resource is missing or unreadable.</summary>
    public static IReadOnlyList<ChangelogEntry> Load()
    {
        using var stream = typeof(BundledChangelog).Assembly.GetManifestResourceStream(ResourceName);
        if (stream == null)
        {
            return [];
        }
        using var reader = new StreamReader(stream, Encoding.UTF8);
        return Parse(reader.ReadToEnd()) ?? [];
    }

    /// <summary>Null when the source isn't the shape it expects.</summary>
    public static IReadOnlyList<ChangelogEntry>? Parse(string source)
    {
        var declaration = source.IndexOf("export const CHANGELOG", StringComparison.Ordinal);
        if (declaration < 0)
        {
            return null;
        }
        var equals = source.IndexOf('=', declaration);
        var open = equals < 0 ? -1 : source.IndexOf('[', equals);
        if (open < 0)
        {
            return null;
        }

        var entries = new List<ChangelogEntry>();
        string? version = null;
        string? date = null;
        List<string>? changes = null;
        var inEntry = false;
        var inChanges = false;
        var pendingKey = "";
        var index = open + 1;

        while (index < source.Length)
        {
            var c = source[index];
            var next = index + 1 < source.Length ? source[index + 1] : '\0';
            if (c == '/' && next == '/')
            {
                var end = source.IndexOf('\n', index);
                index = end < 0 ? source.Length : end;
                continue;
            }
            if (c == '/' && next == '*')
            {
                var end = source.IndexOf("*/", index + 2, StringComparison.Ordinal);
                if (end < 0)
                {
                    return null;
                }
                index = end + 2;
                continue;
            }
            if (c == '"')
            {
                var end = index + 1;
                while (end < source.Length && source[end] != '"')
                {
                    end += source[end] == '\\' ? 2 : 1;
                }
                if (end >= source.Length || !inEntry)
                {
                    return null;
                }
                string? text;
                try
                {
                    text = JsonSerializer.Deserialize<string>(source.AsSpan(index, end - index + 1));
                }
                catch (JsonException)
                {
                    return null;
                }
                if (text == null)
                {
                    return null;
                }
                if (inChanges)
                {
                    changes?.Add(text);
                }
                else if (pendingKey == "version")
                {
                    version = text;
                }
                else if (pendingKey == "date")
                {
                    date = text;
                }
                pendingKey = "";
                index = end + 1;
                continue;
            }
            if (char.IsAsciiLetter(c) || c == '_')
            {
                var end = index;
                while (end < source.Length && (char.IsAsciiLetterOrDigit(source[end]) || source[end] == '_'))
                {
                    end++;
                }
                pendingKey = source[index..end];
                index = end;
                continue;
            }
            switch (c)
            {
                case '{':
                    inEntry = true;
                    version = null;
                    date = null;
                    changes = null;
                    break;
                case '[' when pendingKey == "changes" && inEntry:
                    changes = [];
                    inChanges = true;
                    break;
                case ']' when inChanges:
                    inChanges = false;
                    break;
                case ']':
                    return entries;
                case '}' when inEntry:
                    if (version == null || changes == null
                        || !DateOnly.TryParseExact(date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day))
                    {
                        return null;
                    }
                    entries.Add(new ChangelogEntry { Version = version, Date = day, Changes = changes });
                    inEntry = false;
                    break;
            }
            index++;
        }
        return null;
    }
}

/// <summary>The settings file, per server: the last server and app versions whose notes this PC showed.</summary>
public sealed class WhatsNewStore(ISettingsStore settings)
{
    public const string ServerKeyPrefix = "marquee.whatsNew.server.";
    public const string AppKeyPrefix = "marquee.whatsNew.app.";

    public WhatsNewSeen Seen(string server) =>
        new(settings.GetString(ServerKeyPrefix + server), settings.GetString(AppKeyPrefix + server));

    public void Save(WhatsNewSeen seen, string server)
    {
        settings.SetString(ServerKeyPrefix + server, seen.Server);
        settings.SetString(AppKeyPrefix + server, seen.App);
    }
}
