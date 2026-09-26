using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// The section 8 examples decoded as the Mac's APIFixtureTests decodes them
// (the notifications part of testRequestsAndNotifications), plus the
// website's relative-time wording that NotificationItem.TimeAgo reproduces.

public sealed class NotificationsFixtureTests
{
    private static readonly Guid NotificationId = Guid.Parse("bedcb20b-fa30-4683-b000-42affc320087");
    private static readonly Guid SharedId = Guid.Parse("5d1e0c37-2a4b-4f9e-9a51-7c3f0b6e8d21");

    [Fact]
    public void NotificationListDecodes()
    {
        var list = Fixtures.Decode<NotificationList>("notifications");

        Assert.Equal(1, list.UnreadCount);
        // A decline, (0.46+) a comment on a request, then a share.
        Assert.Equal(3, list.Results.Count);
        var item = list.Results[0];
        Assert.Equal(NotificationId, item.Id);
        Assert.Equal(MediaType.Movie, item.MediaType);
        Assert.Equal(603, item.TmdbId);
        Assert.Equal("The Matrix", item.Title);
        Assert.Equal(NotificationEventType.RequestRejected, item.EventType);
        Assert.Equal("👎", item.EventType.Emoji);
        Assert.Equal("\"The Matrix\" was declined: Not enough space on the server right now", item.Message);
        Assert.False(item.Read);
        Assert.Equal(Json.ParseDate("2026-09-17T17:12:41.470Z"), item.CreatedAt);
        Assert.Equal(new TitleId(MediaType.Movie, 603), item.TitleId);
        Assert.Equal("marquee://title/movie/603", item.TitleId.Route.AbsoluteUri);
        // Present and null on every kind but title_shared.
        Assert.Null(item.SharedBy);
        Assert.Null(item.Note);
        // 0.46+: present and null on kinds that aren't about a request or report.
        Assert.Null(item.RequestId);
        Assert.Null(item.IssueId);
    }

    [Fact]
    public void RequestCommentCarriesItsRequest()
    {
        var item = Fixtures.Decode<NotificationList>("notifications").Results[1];

        Assert.Equal(NotificationEventType.RequestComment, item.EventType);
        Assert.True(item.EventType.IsKnown);
        Assert.Equal("💬", item.EventType.Emoji);
        Assert.Equal("New comment", item.EventType.NotificationTitle);
        Assert.Equal(Guid.Parse("5b0f1d8e-8a8c-4f5e-9d51-1f0c7a0e2b44"), item.RequestId);
        Assert.Null(item.IssueId);
        Assert.Equal(new TitleId(MediaType.Tv, 95396), item.TitleId);

        Assert.Equal("💬", NotificationEventType.IssueComment.Emoji);
        Assert.Equal("New comment", NotificationEventType.IssueComment.NotificationTitle);
        Assert.Equal(NotificationEventType.IssueComment, Json.Decode<NotificationEventType>("\"issue_comment\""));
    }

    [Fact]
    public void TitleSharedCarriesWhoAndTheirNote()
    {
        var item = Fixtures.Decode<NotificationList>("notifications").Results[2];

        Assert.Equal(SharedId, item.Id);
        Assert.Equal(new TitleId(MediaType.Movie, 425), item.TitleId);
        Assert.Equal("Ice Age", item.Title);
        Assert.Equal(NotificationEventType.TitleShared, item.EventType);
        Assert.True(item.EventType.IsKnown);
        Assert.Equal("📨", item.EventType.Emoji);
        Assert.Equal("Shared with you", item.EventType.NotificationTitle);
        Assert.Equal("Susan shared “Ice Age” with you: You'd love this one", item.Message);
        Assert.True(item.Read);
        Assert.Equal("You'd love this one", item.Note);

        var sender = Assert.IsType<ShareableUser>(item.SharedBy);
        Assert.Equal(Guid.Parse("83c55a49-6153-4cb9-ae22-4a42d48f4cf3"), sender.UserId);
        Assert.Equal("Susan", sender.DisplayName);
        Assert.Equal("susan", sender.Username);
        Assert.Equal("Susan", sender.Label);
        Assert.Equal("/api/v1/users/83c55a49-6153-4cb9-ae22-4a42d48f4cf3/avatar?v=1758220800000", sender.AvatarUrl);
    }

    [Fact]
    public void AnOlderServerWithoutTheShareKeysDecodesThemAsNull()
    {
        // Before 0.45 an item has no sharedBy / note at all.
        var json = """
            {"unreadCount":0,"results":[{"id":"bedcb20b-fa30-4683-b000-42affc320087","mediaType":"movie","tmdbId":603,
            "title":"The Matrix","eventType":"downloaded","message":"\"The Matrix\" is ready to watch","read":true,
            "createdAt":"2026-09-17T17:12:41.470Z"}]}
            """;
        var item = Assert.Single(Json.Decode<NotificationList>(json).Results);

        Assert.Equal(NotificationEventType.Downloaded, item.EventType);
        Assert.Null(item.SharedBy);
        Assert.Null(item.Note);
        // Nor (before 0.46) requestId / issueId.
        Assert.Null(item.RequestId);
        Assert.Null(item.IssueId);
    }

    [Fact]
    public void ARemovedSenderIsNullButTheNoteStays()
    {
        var json = Fixtures.Read("notifications").ReplaceLineEndings("\n");
        var start = json.IndexOf("\"sharedBy\": {", StringComparison.Ordinal);
        var end = json.IndexOf('}', start);
        Assert.True(start > 0 && end > start);
        var removed = json[..start] + "\"sharedBy\": null" + json[(end + 1)..];

        var item = Json.Decode<NotificationList>(removed).Results[2];
        Assert.Equal(NotificationEventType.TitleShared, item.EventType);
        Assert.Null(item.SharedBy);
        Assert.Equal("You'd love this one", item.Note);
    }

    [Fact]
    public void UnreadCountDecodes()
    {
        Assert.Equal(1, Fixtures.Decode<CountResponse>("notifications-unread-count").Count);
    }

    [Fact]
    public void EmptyListIsNoNotificationsYet()
    {
        var list = Json.Decode<NotificationList>("""{"unreadCount":0,"results":[]}""");
        Assert.Equal(0, list.UnreadCount);
        Assert.Empty(list.Results);
    }

    [Fact]
    public void UnknownEventTypeStillDecodesWithTheGenericBell()
    {
        var json = Fixtures.Read("notifications")
            .Replace("\"eventType\": \"request_rejected\"", "\"eventType\": \"upgraded\"", StringComparison.Ordinal);
        var item = Json.Decode<NotificationList>(json).Results[0];

        Assert.Equal("upgraded", item.EventType.Value);
        Assert.False(item.EventType.IsKnown);
        Assert.Equal("🔔", item.EventType.Emoji);
    }

    [Fact]
    public void MissingRequiredFieldFailsDecoding()
    {
        // Like Swift's synthesized Decodable: a message the server left out
        // is a broken response, not an empty string.
        var json = Fixtures.Read("notifications").Replace("\"message\": \"\\\"The Matrix\\\" was declined: Not enough space on the server right now\",", "", StringComparison.Ordinal);
        Assert.Throws<System.Text.Json.JsonException>(() => Json.Decode<NotificationList>(json));
    }

    [Theory]
    [InlineData(0, "just now")]
    [InlineData(59, "just now")]
    [InlineData(60, "1m ago")]
    [InlineData(5 * 60, "5m ago")]
    [InlineData(59 * 60 + 59, "59m ago")]
    [InlineData(60 * 60, "1h ago")]
    [InlineData(3 * 60 * 60, "3h ago")]
    [InlineData(23 * 60 * 60 + 59 * 60, "23h ago")]
    [InlineData(24 * 60 * 60, "1d ago")]
    [InlineData(2 * 24 * 60 * 60 + 5 * 60 * 60, "2d ago")]
    [InlineData(-30, "just now")]
    public void TimeAgoUsesTheWebsitesWording(int secondsAgo, string expected)
    {
        var now = new DateTimeOffset(2026, 9, 17, 18, 0, 0, TimeSpan.Zero);
        var item = Fixtures.Decode<NotificationList>("notifications").Results[0] with
        {
            CreatedAt = now.AddSeconds(-secondsAgo),
        };

        Assert.Equal(expected, item.TimeAgo(now));
        Assert.Equal(expected, NotificationItem.TimeAgoLabel(item.CreatedAt, now));
    }
}
