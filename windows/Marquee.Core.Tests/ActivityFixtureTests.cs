using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// The section 10 example decoded as the Mac's APIFixtureTests decodes it
// (the activity part of testRequestsAndNotifications): the row reads as the
// sentence the website renders.

public sealed class ActivityFixtureTests
{
    [Fact]
    public void ActivityDecodes()
    {
        var activity = Fixtures.Decode<ListResponse<ActivityItem>>("activity").Results;
        var item = Assert.Single(activity);

        Assert.Equal(Guid.Parse("44476b7f-d130-4873-8211-e11e17f6b211"), item.Id);
        Assert.Equal(ActivityEventType.RequestRejected, item.EventType);
        Assert.Equal("declined", item.Verb);
        Assert.Equal(MediaType.Movie, item.MediaType);
        Assert.Equal(603, item.TmdbId);
        Assert.Equal("The Matrix", item.Title);
        Assert.Null(item.Actor.UserId);
        Assert.Equal("Timmy", item.Actor.DisplayName);
        Assert.Equal("timmy", item.Actor.Username);
        Assert.Equal("Timmy", item.Actor.Label);
        Assert.Equal(Json.ParseDate("2026-09-17T17:12:41.470Z"), item.CreatedAt);
        Assert.Equal("Timmy declined The Matrix", item.Sentence);
        Assert.Equal(new TitleId(MediaType.Movie, 603), item.TitleId);
    }

    [Fact]
    public void EveryKnownEventTypeRoundTrips()
    {
        foreach (var type in ActivityEventType.Known)
        {
            Assert.Equal(type, ActivityEventType.FromValue(type.Value));
            Assert.True(type.IsKnown);
        }
        Assert.Equal(ActivityEventType.RequestManuallyApproved, ActivityEventType.FromValue("request_manually_approved"));
    }

    [Fact]
    public void UnknownEventTypeStillReadsAsASentence()
    {
        // A newer server pairs a new event with its own verb, so the row
        // still renders; only the type is unknown to this version.
        var json = Fixtures.Read("activity")
            .Replace("\"eventType\": \"request_rejected\"", "\"eventType\": \"request_cancelled\"", StringComparison.Ordinal)
            .Replace("\"verb\": \"declined\"", "\"verb\": \"cancelled\"", StringComparison.Ordinal);
        var item = Assert.Single(Json.Decode<ListResponse<ActivityItem>>(json).Results);

        Assert.Equal("request_cancelled", item.EventType.Value);
        Assert.False(item.EventType.IsKnown);
        Assert.Equal("Timmy cancelled The Matrix", item.Sentence);
    }

    [Fact]
    public void ActorWithoutADisplayNameUsesTheUsername()
    {
        var json = Fixtures.Read("activity").Replace("\"displayName\": \"Timmy\"", "\"displayName\": null", StringComparison.Ordinal);
        var item = Assert.Single(Json.Decode<ListResponse<ActivityItem>>(json).Results);

        // Label is what the server printed; the fixture's stays "Timmy"
        // because the server computes it, not the client.
        Assert.Null(item.Actor.DisplayName);
        Assert.Equal("Timmy declined The Matrix", item.Sentence);
    }
}
