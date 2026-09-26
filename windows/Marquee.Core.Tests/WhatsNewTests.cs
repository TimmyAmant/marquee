using Marquee.Core.Connection;
using Marquee.Core.Models;
using Marquee.Core.Updates;

namespace Marquee.Core.Tests;

// "What's new" after an upgrade: lib/whats-new.test.ts's cases and the Mac's
// WhatsNewTests, with server and app updates as separate events.

public sealed class WhatsNewTests
{
    private static AppVersion V(string text) => AppVersion.Parse(text)!;

    private static ChangelogEntry Entry(string version) =>
        new() { Version = version, Date = new DateOnly(2026, 9, 26), Changes = [$"Change in {version}"] };

    private static List<ChangelogEntry> Entries(params string[] versions) => versions.Select(Entry).ToList();

    private static string[] Versions(WhatsNewContent? content) =>
        content?.Entries.Select(entry => entry.Version).ToArray() ?? [];

    [Fact]
    public void VersionsCompareNumericallyAndIgnorePreReleases()
    {
        Assert.True(V("0.45.10") > V("0.45.9"));
        Assert.True(V("0.46.0-beta.1") == V("0.46.0"));
        Assert.True(V("0.46.0-beta.1") > V("0.45.3"));
        Assert.Null(AppVersion.Parse("garbage"));
    }

    [Fact]
    public void FirstRunShowsNothing()
    {
        Assert.Null(WhatsNew.Pending(WhatsNewSeen.Nothing, V("0.45.3"), V("0.45.3")));
        Assert.Null(WhatsNew.Pending(new WhatsNewSeen("junk", null), V("0.45.3"), V("0.45.3")));
        Assert.Equal(new WhatsNewSeen("0.45.3", "0.45.2"), WhatsNew.Remembered(WhatsNewSeen.Nothing, V("0.45.3"), V("0.45.2")));
    }

    [Fact]
    public void SameVersionsOrADowngradeShowNothing()
    {
        var seen = new WhatsNewSeen("0.45.3", "0.45.3");
        Assert.Null(WhatsNew.Pending(seen, V("0.45.3"), V("0.45.3")));
        Assert.Null(WhatsNew.Pending(seen, V("0.45.1"), V("0.45.2")));
        Assert.Equal(seen, WhatsNew.Remembered(seen, V("0.45.1"), V("0.45.2")));
    }

    [Fact]
    public void AServerOnlyUpdateShowsTheServersEntries()
    {
        var seen = new WhatsNewSeen("0.45.1", "0.45.3");
        var pending = WhatsNew.Pending(seen, V("0.45.3"), V("0.45.3"));
        Assert.NotNull(pending);
        Assert.Equal(V("0.45.1"), pending.ServerSince);
        Assert.Null(pending.AppSince);
        var content = WhatsNew.Content(pending, V("0.45.3"), V("0.45.3"), Entries("0.45.3", "0.45.2", "0.45.1", "0.45.0"), []);
        Assert.Equal("0.45.3", content?.Version);
        Assert.Equal("What's new in Marquee 0.45.3", content?.Title);
        Assert.Equal(["0.45.3", "0.45.2"], Versions(content));
        Assert.Null(content?.InstalledAppVersion);
    }

    [Fact]
    public void AnAppOnlyUpdateShowsOnlyTheAppsEntries()
    {
        var seen = new WhatsNewSeen("0.45.3", "0.45.3");
        var pending = WhatsNew.Pending(seen, V("0.45.3"), V("0.46.1"));
        Assert.NotNull(pending);
        Assert.Null(pending.ServerSince);
        Assert.Equal(V("0.45.3"), pending.AppSince);
        var content = WhatsNew.Content(
            pending, V("0.45.3"), V("0.46.1"), Entries("0.45.3", "0.45.2"), Entries("0.46.1", "0.46.0", "0.45.3", "0.45.2"));
        Assert.Equal("0.46.1", content?.Version);
        Assert.Equal(["0.46.1", "0.46.0"], Versions(content));
    }

    [Fact]
    public void BothUpdatedShowOneMergedListOnce()
    {
        var seen = new WhatsNewSeen("0.45.1", "0.45.2");
        var pending = WhatsNew.Pending(seen, V("0.45.3"), V("0.46.0"));
        Assert.NotNull(pending);
        var content = WhatsNew.Content(
            pending, V("0.45.3"), V("0.46.0"), Entries("0.45.3", "0.45.2", "0.45.1"), Entries("0.46.0", "0.45.3", "0.45.2", "0.45.1"));
        Assert.Equal("0.46.0", content?.Version);
        Assert.Equal(["0.46.0", "0.45.3", "0.45.2"], Versions(content));
        Assert.Equal(new WhatsNewSeen("0.45.3", "0.46.0"), WhatsNew.Remembered(seen, V("0.45.3"), V("0.46.0")));
    }

    [Fact]
    public void AnAppUpdateWithoutItsNotesSaysItsInstalled()
    {
        var content = WhatsNew.Content(new WhatsNewPending(null, V("0.45.3")), V("0.45.3"), V("0.46.0"), [], []);
        Assert.NotNull(content);
        Assert.Equal("0.46.0", content.InstalledAppVersion);
        Assert.Equal("https://github.com/TimmyAmant/marquee/releases/tag/v0.46.0", content.ReleaseNotesUrl?.ToString());
        Assert.Empty(content.Entries);
    }

    [Fact]
    public void TheListIsCapped()
    {
        var many = Enumerable.Range(0, 15).Select(i => Entry($"0.30.{i}")).ToList();
        var content = WhatsNew.Content(new WhatsNewPending(V("0.29.0"), null), V("0.30.14"), null, many, []);
        Assert.NotNull(content);
        Assert.Equal(WhatsNew.Cap, content.Entries.Count);
        Assert.Equal("0.30.14", content.Entries[0].Version);
        Assert.True(content.HasMore);
    }

    [Fact]
    public void NothingInRangeShowsNothing()
    {
        Assert.Null(WhatsNew.Content(new WhatsNewPending(V("0.45.1"), null), V("0.45.3"), null, Entries("0.45.1"), []));
    }

    [Fact]
    public void TheStoreIsPerServer()
    {
        var settings = new InMemorySettingsStore();
        var store = new WhatsNewStore(settings);
        Assert.Equal(WhatsNewSeen.Nothing, store.Seen("http://a:3000"));
        store.Save(new WhatsNewSeen("0.45.3", "0.45.2"), "http://a:3000");
        Assert.Equal(new WhatsNewSeen("0.45.3", "0.45.2"), store.Seen("http://a:3000"));
        Assert.Equal(WhatsNewSeen.Nothing, store.Seen("http://b:3000"));
        Assert.Equal("0.45.3", settings.GetString("marquee.whatsNew.server.http://a:3000"));
    }

    [Fact]
    public void TheEmbeddedChangelogParses()
    {
        var entries = BundledChangelog.Load();
        Assert.NotEmpty(entries);
        Assert.NotNull(AppVersion.Parse(entries[0].Version));
        Assert.NotEmpty(entries[0].Changes);
        Assert.Contains(entries, entry => entry.Version == "0.45.3");
    }

    [Fact]
    public void TheScannerReadsEscapesAndComments()
    {
        // Built with \n and then \r\n, as a Windows checkout may have it.
        var source = string.Join("\n",
            "export type ChangelogEntry = { version: string; date: string; changes: string[] };",
            "/** Newest first. [not an array] */",
            "export const CHANGELOG: ChangelogEntry[] = [",
            "  {",
            "    version: \"0.2.0\",",
            "    date: \"2026-09-26\",",
            "    // a comment with \"quotes\"",
            "    changes: [",
            "      \"A \\\"quoted\\\" word…\",",
            "      \"Two\",",
            "    ],",
            "  },",
            "  { version: \"0.1.0\", date: \"2026-09-01\", changes: [\"First\"] },",
            "];");
        foreach (var text in new[] { source, source.Replace("\n", "\r\n") })
        {
            var entries = BundledChangelog.Parse(text);
            Assert.NotNull(entries);
            Assert.Equal(["0.2.0", "0.1.0"], entries.Select(entry => entry.Version).ToArray());
            Assert.Equal(["A \"quoted\" word…", "Two"], entries[0].Changes);
            Assert.Equal(new DateOnly(2026, 9, 1), entries[1].Date);
        }
        Assert.Null(BundledChangelog.Parse("nothing here"));
    }
}
