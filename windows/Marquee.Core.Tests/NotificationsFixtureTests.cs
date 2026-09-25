using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// The section 8 examples decoded as the Mac's APIFixtureTests decodes them
// (the notifications part of testRequestsAndNotifications), plus the
// website's relative-time wording that NotificationItem.TimeAgo reproduces.

public sealed class NotificationsFixtureTests
{
    private static readonly Guid NotificationId = Guid.Parse("bedcb20b-fa30-4683-b000-42affc320087");

    [Fact]
    public void NotificationListDecodes()
    {
        var list = Fixtures.Decode<NotificationList>("notifications");

        Assert.Equal(1, list.UnreadCount);
        var item = Assert.Single(list.Results);
        Assert.Equal(NotificationId, item.Id);
        Assert.Equal(MediaType.Movie, item.MediaType);
        Assert.Equal(603, item.TmdbId);
        Assert.Equal("The Matrix", item.Title);
        Assert.Equal(NotificationEventType.RequestRejected, item.EventType);
        Assert.Equal("👎", item.EventType.Emoji);
        Assert.Equal("\"The Matrix\" was declined.", item.Message);
        Assert.False(item.Read);
        Assert.Equal(Json.ParseDate("2026-09-17T17:12:41.470Z"), item.CreatedAt);
        Assert.Equal(new TitleId(MediaType.Movie, 603), item.TitleId);
        Assert.Equal("marquee://title/movie/603", item.TitleId.Route.AbsoluteUri);
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
        var item = Assert.Single(Json.Decode<NotificationList>(json).Results);

        Assert.Equal("upgraded", item.EventType.Value);
        Assert.False(item.EventType.IsKnown);
        Assert.Equal("🔔", item.EventType.Emoji);
    }

    [Fact]
    public void MissingRequiredFieldFailsDecoding()
    {
        // Like Swift's synthesized Decodable: a message the server left out
        // is a broken response, not an empty string.
        var json = Fixtures.Read("notifications").Replace("\"message\": \"\\\"The Matrix\\\" was declined.\",", "", StringComparison.Ordinal);
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
        var item = Assert.Single(Fixtures.Decode<NotificationList>("notifications").Results) with
        {
            CreatedAt = now.AddSeconds(-secondsAgo),
        };

        Assert.Equal(expected, item.TimeAgo(now));
        Assert.Equal(expected, NotificationItem.TimeAgoLabel(item.CreatedAt, now));
    }
}
