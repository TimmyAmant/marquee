using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// The lines Settings › Integrations prints about a connection (the Mac's
// summaryLine, lastSyncedLine and the Trakt import message).

public sealed class IntegrationsSummaryTests
{
    private static readonly DateTimeOffset Now = Json.ParseDate("2026-09-17T16:05:03.412Z")!.Value;

    [Fact]
    public void PlexSummaryNamesTheServerAndCountsTheLibrary()
    {
        var plex = Fixtures.Decode<IntegrationsOverview>("integrations").Plex;

        Assert.Equal("Basement · 812 movies · 143 TV shows · 8.3 TB", plex.SummaryLine);
        Assert.Equal("Last synced 5m ago · kept in sync automatically.", plex.LastSyncedLine(Now));
    }

    [Fact]
    public void SummaryLeavesOutMissingNamesAndAnEmptySize()
    {
        IReadOnlyList<SyncedServer> servers = [new SyncedServer { Name = "  " }, new SyncedServer { Name = "Attic" }, new SyncedServer { Name = "Den" }];

        Assert.Equal("Attic, Den · 3 movies · 1 TV shows", LibrarySummary.Line(servers, 3, 1, 0));
        Assert.Equal("0 movies · 0 TV shows", LibrarySummary.Line([], 0, 0, 0));
    }

    [Fact]
    public void LastSyncedUsesTheMostRecentServer()
    {
        IReadOnlyList<SyncedServer> servers =
        [
            new SyncedServer { Name = "A", LastSyncedAt = Now.AddDays(-2) },
            new SyncedServer { Name = "B", LastSyncedAt = Now.AddHours(-3) },
            new SyncedServer { Name = "C" },
        ];

        Assert.Equal("Last synced 3h ago · kept in sync automatically.", LibrarySummary.LastSynced(servers, Now));
        Assert.Equal("Your library is kept in sync automatically.", LibrarySummary.LastSynced([new SyncedServer { Name = "C" }], Now));
    }

    [Fact]
    public void JellyfinConnectedNameWaitsForASyncedServer()
    {
        const string Rest = "\"hasApiKey\":true,\"movieCount\":0,\"tvCount\":0,\"totalBytes\":0";
        var synced = Json.Decode<JellyfinSettings>($"{{\"connected\":true,\"name\":\"Emby\",\"servers\":[{{\"name\":\"Den\"}}],{Rest}}}");
        var unsynced = Json.Decode<JellyfinSettings>($"{{\"connected\":true,\"name\":\"Emby\",\"servers\":[],{Rest}}}");
        var disconnected = Json.Decode<JellyfinSettings>($"{{\"connected\":false,\"servers\":[{{\"name\":\"Den\"}}],{Rest}}}");

        Assert.Equal("Emby", synced.ConnectedName);
        Assert.Equal("Den · 0 movies · 0 TV shows", synced.SummaryLine);
        Assert.Null(unsynced.ConnectedName);
        Assert.Null(disconnected.ConnectedName);
    }

    [Fact]
    public void TraktImportSummary()
    {
        Assert.Equal("Imported 12 titles (3 skipped — already owned or requested).", new TraktImportResult { Ok = true, ImportedCount = 12, SkippedCount = 3 }.Summary);
        Assert.Equal("Imported 1 title.", new TraktImportResult { Ok = true, ImportedCount = 1, SkippedCount = 0 }.Summary);
        Assert.Equal("Imported 0 titles.", new TraktImportResult { Ok = true, ImportedCount = 0, SkippedCount = 0 }.Summary);
    }
}
