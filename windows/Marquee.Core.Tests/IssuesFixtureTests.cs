using System.Text.Json.Nodes;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// Problem reports (0.38+): the doc's examples decode, the fields an older
// server leaves out read as "nothing to report", and the Report form turns
// what was filled in into the documented body.

public sealed class IssuesFixtureTests
{
    [Fact]
    public void IssuesFixtureDecodes()
    {
        var response = Fixtures.Decode<IssuesResponse>("issues");
        var issue = Assert.Single(response.Results);
        Assert.Equal(Guid.Parse("83bedf64-c5d8-4f43-98a0-bb615c4b9897"), issue.Id);
        Assert.Equal(new TitleId(MediaType.Tv, 1396), issue.TitleId);
        Assert.Equal("Breaking Bad", issue.Title);
        Assert.Equal(2, issue.SeasonNumber);
        Assert.Equal(5, issue.EpisodeNumber);
        Assert.Equal("S2 E5", issue.EpisodeLabel);
        Assert.Equal(IssueKind.Audio, issue.Kind);
        Assert.Equal("Audio problem", issue.KindText);
        Assert.Equal("Out of sync after 20 minutes", issue.Message);
        Assert.Equal(IssueStatus.Open, issue.Status);
        Assert.True(issue.IsOpen);
        Assert.Null(issue.Resolution);
        Assert.Equal("", issue.FixedLine);
        Assert.Equal("Member", issue.ReportedBy.Label);
        Assert.Equal("member", issue.ReportedBy.Username);
        Assert.False(issue.IsMine);
        Assert.Equal(Json.ParseDate("2026-09-26T02:40:11.000Z"), issue.CreatedAt);
        Assert.Null(issue.ResolvedAt);
        Assert.Single(response.Open);
        Assert.Empty(response.Fixed);

        Assert.Equal(IssueKind.Known, response.Kinds.Select(kind => kind.Id).ToList());
        Assert.All(response.Kinds, kind => Assert.Equal(kind.Id.Label, kind.Label));
    }

    [Fact]
    public void AFixedIssueSaysSo()
    {
        var body = JsonNode.Parse(Fixtures.Read("issues"))!;
        var node = body["results"]![0]!;
        node["status"] = "resolved";
        node["resolution"] = "Replaced the file";
        node["resolvedAt"] = "2026-09-27T10:00:00.000Z";
        body.AsObject().Remove("kinds");

        var response = Json.Decode<IssuesResponse>(body.ToJsonString());
        var issue = Assert.Single(response.Fixed);
        Assert.True(issue.IsResolved);
        Assert.Equal("Fixed: Replaced the file", issue.FixedLine);
        Assert.Equal("Fixed", (issue with { Resolution = null }).FixedLine);
        Assert.Empty(response.Open);
        Assert.Empty(response.Kinds);
    }

    [Fact]
    public void AnUnknownKindOrStatusStillDecodes()
    {
        var body = JsonNode.Parse(Fixtures.Read("issues"))!;
        body["results"]![0]!["kind"] = "smell";
        body["results"]![0]!["status"] = "snoozed";
        body["results"]![0]!["kindLabel"] = "";
        var issue = Json.Decode<IssuesResponse>(body.ToJsonString()).Results[0];
        Assert.False(issue.Kind.IsKnown);
        Assert.Equal("Smell", issue.KindText);
        Assert.False(issue.IsOpen);
        Assert.False(issue.IsResolved);
    }

    [Fact]
    public void ReportBodyFixtureMatchesTheEncodedBody()
    {
        var body = new ReportIssueBody(IssueKind.Audio, "Out of sync after 20 minutes", 2, 5);
        var encoded = JsonNode.Parse(Json.EncodeBodyToString(body));
        Assert.True(JsonNode.DeepEquals(JsonNode.Parse(Fixtures.Read("issue-report-body")), encoded), encoded?.ToJsonString());
    }

    [Fact]
    public void TitleViewerCarriesTheReportFields()
    {
        var detail = Fixtures.Decode<TitleDetail>("title-detail");
        Assert.False(detail.Viewer.CanReport);
        Assert.Equal(0, detail.Viewer.OpenReports);
        var status = Fixtures.Decode<TitleStatus>("title-status");
        Assert.False(status.Viewer.CanReport);
        Assert.Equal(0, status.Viewer.OpenReports);

        var body = JsonNode.Parse(Fixtures.Read("title-detail"))!;
        body["viewer"]!["canReport"] = true;
        body["viewer"]!["openReports"] = 2;
        var reported = Json.Decode<TitleDetail>(body.ToJsonString()).Viewer;
        Assert.True(reported.CanReport);
        Assert.Equal(2, reported.OpenReports);
    }

    [Fact]
    public void AnOlderServersTitleHidesReporting()
    {
        foreach (var name in new[] { "title-detail", "title-status" })
        {
            var body = JsonNode.Parse(Fixtures.Read(name))!;
            var viewer = body["viewer"]!.AsObject();
            viewer.Remove("canReport");
            viewer.Remove("openReports");
            var decoded = name == "title-detail"
                ? Json.Decode<TitleDetail>(body.ToJsonString()).Viewer
                : Json.Decode<TitleStatus>(body.ToJsonString()).Viewer;
            Assert.False(decoded.CanReport);
            Assert.Equal(0, decoded.OpenReports);
        }
    }

    [Fact]
    public void RequestsBadgeCountsOpenIssues()
    {
        var badges = Fixtures.Decode<Badges>("badges");
        Assert.Equal(1, badges.PendingRequests);
        Assert.Equal(1, badges.OpenIssues);
        // 0.46+ counts "Can't find" too.
        Assert.Equal(3, badges.RequestsBadge);

        // Before 0.38 there is no openIssues: the badge is the pending count.
        var older = Json.Decode<Badges>("""{"unreadNotifications":2,"pendingRequests":3}""");
        Assert.Equal(0, older.OpenIssues);
        Assert.Equal(3, older.RequestsBadge);
        Assert.NotEqual(badges, badges with { OpenIssues = 2 });
    }

    [Fact]
    public void NotificationKindsForProblemReports()
    {
        Assert.Equal(NotificationEventType.IssueReported, NotificationEventType.FromValue("issue_reported"));
        Assert.Equal(NotificationEventType.IssueResolved, NotificationEventType.FromValue("issue_resolved"));
        Assert.True(NotificationEventType.IssueReported.IsKnown);
        Assert.True(NotificationEventType.IssueResolved.IsKnown);
        Assert.Equal("⚠️", NotificationEventType.IssueReported.Emoji);
        Assert.Equal("🛠️", NotificationEventType.IssueResolved.Emoji);
        Assert.Equal("Problem reported", NotificationEventType.IssueReported.NotificationTitle);
        Assert.Equal("Problem fixed", NotificationEventType.IssueResolved.NotificationTitle);
    }

    // MARK: The Report form

    [Fact]
    public void SeasonChoicesMatchTheWebsite()
    {
        var choices = IssueReportForm.SeasonChoices([0, 1, 2]);
        Assert.Equal(["Whole show", "Specials", "Season 1", "Season 2"], choices.Select(choice => choice.Label));
        Assert.Equal([null, 0, 1, 2], choices.Select(choice => choice.SeasonNumber));
        Assert.Single(IssueReportForm.SeasonChoices([]));
    }

    [Fact]
    public void MessageHeaderFollowsTheKind()
    {
        Assert.Equal("What's wrong?", IssueReportForm.MessageHeader(IssueKind.Other));
        Assert.Equal("Anything else? (optional)", IssueReportForm.MessageHeader(IssueKind.Video));
        Assert.Equal("Anything else? (optional)", IssueReportForm.MessageHeader(null));
    }

    [Fact]
    public void BuildRefusesWhatTheServerWould()
    {
        Assert.Equal("Pick what's wrong.", IssueReportForm.Build(null, "x", false, null, null).Error);
        Assert.Equal("Say what's wrong.", IssueReportForm.Build(IssueKind.Other, "  ", false, null, null).Error);
        Assert.Equal("Keep it under 1000 characters.", IssueReportForm.Build(IssueKind.Audio, new string('a', 1001), false, null, null).Error);
        Assert.Equal("Season and episode are whole numbers.", IssueReportForm.Build(IssueKind.Audio, null, true, 2, "five").Error);
        Assert.Equal("Season and episode are whole numbers.", IssueReportForm.Build(IssueKind.Audio, null, true, 2, "0").Error);
    }

    [Fact]
    public void BuildShapesTheBody()
    {
        var (tv, error) = IssueReportForm.Build(IssueKind.Audio, " Out of sync after 20 minutes ", true, 2, "5");
        Assert.Null(error);
        Assert.Equal(new ReportIssueBody(IssueKind.Audio, "Out of sync after 20 minutes", 2, 5), tv);

        // No season: the episode is dropped. A movie never sends either.
        Assert.Equal(new ReportIssueBody(IssueKind.Video), IssueReportForm.Build(IssueKind.Video, "", true, null, "5").Body);
        Assert.Equal(new ReportIssueBody(IssueKind.Video), IssueReportForm.Build(IssueKind.Video, null, false, 2, "5").Body);
        Assert.Equal(new ReportIssueBody(IssueKind.Subtitles, null, 0), IssueReportForm.Build(IssueKind.Subtitles, null, true, 0, " ").Body);

        // Nulls stay out of the wire body.
        var encoded = JsonNode.Parse(Json.EncodeBodyToString(new ReportIssueBody(IssueKind.WontPlay)));
        Assert.True(JsonNode.DeepEquals(JsonNode.Parse("""{"kind":"wont_play"}"""), encoded), encoded?.ToJsonString());
    }
}
