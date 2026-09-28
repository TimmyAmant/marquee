using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// The 0.58 admin tools' examples (docs/api-v1.md) decoded as the Mac's
// APIFixtureTests decodes them, and the bodies the app sends.

public sealed class AdminToolsFixtureTests
{
    [Fact]
    public void JobSchedulesDecode()
    {
        var jobs = Fixtures.Decode<ListResponse<Job>>("jobs").Results;
        var plex = jobs[0];
        Assert.True(plex.Interval!.SameAs(JobInterval.Hours(2)));
        Assert.True(plex.DefaultInterval!.SameAs(JobInterval.Hours(1)));
        Assert.Equal(Json.ParseDate("2026-09-27T22:00:00.000Z"), plex.NextRunAt);
        Assert.False(plex.Running);
        // Rows without the 0.58 fields still decode, with nothing to change.
        Assert.Null(jobs[^1].Interval);
    }

    [Fact]
    public void AnIntervalGoesOutAsTheServerTakesIt()
    {
        Assert.Equal("""{"interval":{"every":"minutes","count":15}}""", Json.EncodeBodyToString(new JobIntervalBody { Interval = JobInterval.Minutes(15) }));
        Assert.Equal("""{"interval":{"dailyAt":{"hour":4,"minute":15}}}""", Json.EncodeBodyToString(new JobIntervalBody { Interval = JobInterval.Daily(4, 15) }));
        // null, not a missing key: back to the default.
        Assert.Equal("""{"interval":null}""", Json.EncodeBodyToString(new JobIntervalBody()));
        Assert.Equal(12, JobInterval.MenuChoices.Count);
        Assert.Equal("daily", JobInterval.Daily(7, 45).MenuKey);
        Assert.True(JobInterval.Daily(7, 45).SameAs(JobInterval.Daily(7, 45)));
        Assert.False(JobInterval.Daily(7, 45).SameAs(JobInterval.Daily(3, 0)));
    }

    [Fact]
    public void LogsDecode()
    {
        var logs = Fixtures.Decode<LogsResponse>("logs");
        Assert.Equal(42, logs.LatestId);
        Assert.Equal(LogLevel.Error, logs.Results[^1].Level);
        Assert.Equal("arr-sync", logs.Results[^1].Source);
        Assert.Contains("[redacted]", logs.Results[^1].Message, StringComparison.Ordinal);
    }

    [Fact]
    public void OverrideRulesDecodeAndGoOut()
    {
        var rule = Fixtures.Decode<ListResponse<OverrideRule>>("override-rules").Results[0];
        Assert.Equal("Anime to the anime folder", rule.Name);
        Assert.Equal(210024, rule.Keywords[0].Id);
        Assert.Equal([3], rule.Tags);
        Assert.True(rule.HasConditions);

        var body = Json.EncodeBodyToString(OverrideRuleBody.From(rule with { QualityProfileId = null, Tags = [] }));
        // A cleared pick is sent as null, so the server forgets it.
        Assert.Contains("\"qualityProfileId\":null", body, StringComparison.Ordinal);
        Assert.Contains("\"tags\":null", body, StringComparison.Ordinal);
        Assert.DoesNotContain("\"position\"", body, StringComparison.Ordinal);
    }

    [Fact]
    public void AddOptionsStartFromTheRule()
    {
        var options = Fixtures.Decode<AddOptions>("add-options");
        Assert.Equal("Anime to the anime folder", options.Rule!.Name);
        Assert.Equal(options.Rule.ServerId, new AddOverridesSelection(options).Server!.Id);
    }

    [Fact]
    public void RemoveFromArrDecodes()
    {
        var result = Fixtures.Decode<RemoveFromArrResult>("title-remove-from-arr");
        Assert.Equal(["Radarr"], result.RemovedFrom);
        Assert.Empty(result.Failed);
        Assert.Equal(1, result.RequestsMarked);
    }

    [Fact]
    public void NewChannelsAndBlocklistKinds()
    {
        var overview = Fixtures.Decode<IntegrationsOverview>("integrations");
        Assert.True(overview.Gotify!.Connected);
        Assert.Equal(5, overview.Gotify.Priority);
        Assert.False(overview.Slack!.Connected);
        Assert.Null(overview.Pushbullet!.ChannelTag);

        var gotify = NotificationChannelConfig.FromForm(
            NotificationChannelKind.Gotify, "", "", "", "", "", " https://push.example.com ", "token123", "8", "", "");
        Assert.Equal("https://push.example.com", gotify!.Url);
        Assert.Equal(8, gotify.Priority);
        Assert.Null(NotificationChannelConfig.FromForm(NotificationChannelKind.Gotify, "", "", "", "", "", "https://push.example.com", ""));
        var pushbullet = NotificationChannelConfig.FromForm(
            NotificationChannelKind.Pushbullet, "", "", "", "", "", "", accessToken: "o.abc", channelTag: " ");
        Assert.Equal("o.abc", pushbullet!.AccessToken);
        Assert.Null(pushbullet.ChannelTag);

        Assert.True(BlocklistKind.Certification.IsKnown);
        Assert.True(BlocklistKind.Adult.IsKnown);
    }
}
