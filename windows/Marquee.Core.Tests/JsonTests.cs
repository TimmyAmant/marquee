using System.Text.Json;
using System.Text.Json.Nodes;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// The value types DTOs are built from: dates, open enums, image refs, and
// the shared options' behaviour (required fields, nulls, omitted nulls).

public sealed class JsonTests
{
    /// <summary>The shape of a title page: strings and lists the contract never leaves null, and one it may.</summary>
    private sealed record Detail
    {
        public required string Name { get; init; }
        public required IReadOnlyList<string> Credits { get; init; }
        public string? Tagline { get; init; }
    }

    private sealed record WithNullableItems
    {
        public required IReadOnlyList<string?> Items { get; init; }
    }

    private sealed record Holder
    {
        public required MediaType Type { get; init; }
        public LibraryStatus? Status { get; init; }
        public DateOnly? Day { get; init; }
    }

    private sealed record RequiredDay
    {
        public required DateOnly Day { get; init; }
    }

    private sealed record Payload(DateTimeOffset At);

    private sealed record WithList
    {
        public IReadOnlyList<string> Items { get; init; } = [];
        public string? Reason { get; init; }
    }

    private sealed record Body(string? A, int B);

    // MARK: Dates

    [Fact]
    public void DatesWithAndWithoutMilliseconds()
    {
        var withMillis = Json.ParseDate("2026-09-17T12:00:00.000Z");
        var withoutMillis = Json.ParseDate("2026-09-17T12:00:00Z");
        Assert.NotNull(withMillis);
        Assert.Equal(withMillis, withoutMillis);
        Assert.Equal(TimeSpan.Zero, withMillis.Value.Offset);

        var fraction = Json.ParseDate("2026-09-17T12:00:00.250Z");
        Assert.NotNull(fraction);
        Assert.Equal(TimeSpan.FromMilliseconds(250), fraction.Value - withMillis.Value);

        var midnight = Json.ParseDate("2026-09-17");
        Assert.NotNull(midnight);
        Assert.Equal(TimeSpan.FromHours(12), withMillis.Value - midnight.Value);

        var offset = Json.ParseDate("2026-09-17T14:00:00+02:00");
        Assert.Equal(withMillis, offset);

        Assert.Null(Json.ParseDate("next tuesday"));
        Assert.Null(Json.ParseDate("2026-9-17"));
    }

    [Fact]
    public void EncoderWritesMilliseconds()
    {
        var date = Json.ParseDate("2026-09-17T12:00:00.000Z");
        Assert.NotNull(date);
        Assert.Equal("""{"at":"2026-09-17T12:00:00.000Z"}""", Json.EncodeBodyToString(new Payload(date.Value)));

        var local = new DateTimeOffset(2026, 9, 17, 14, 0, 0, TimeSpan.FromHours(2));
        Assert.Equal("""{"at":"2026-09-17T12:00:00.000Z"}""", Json.EncodeBodyToString(new Payload(local)));
    }

    [Fact]
    public void BadTimestampsFailDecoding()
    {
        Assert.Throws<JsonException>(() => Json.Decode<Payload>("""{"at":"yesterday"}"""));
        Assert.Throws<JsonException>(() => Json.Decode<Payload>("""{"at":12}"""));
    }

    // MARK: Auth shapes

    [Fact]
    public void DecodesLoginResponse()
    {
        const string json = """
            {"token":"mqt_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ","expiresAt":"2026-12-16T12:00:00.000Z",
            "user":{"id":"6f1c2a4e-8b1d-4c3e-9f0a-2b7d5e8c1a90","username":"timmy","displayName":"Timmy","role":"admin",
            "libraryOwnerId":"6f1c2a4e-8b1d-4c3e-9f0a-2b7d5e8c1a90"}}
            """;
        var response = Json.Decode<AuthResponse>(json);
        Assert.StartsWith("mqt_", response.Token);
        Assert.Equal(Guid.Parse("6F1C2A4E-8B1D-4C3E-9F0A-2B7D5E8C1A90"), response.User.Id);
        Assert.True(response.User.IsAdmin);
        Assert.Equal(Json.ParseDate("2026-12-16T12:00:00Z"), response.ExpiresAt);
        Assert.Equal(response.User.Id, response.User.LibraryOwnerId);
        Assert.Equal("Timmy", response.User.Label);
    }

    [Fact]
    public void MemberWithoutDisplayName()
    {
        const string json = """{"id":"0a2d3c4b-5e6f-4a1b-8c9d-0e1f2a3b4c5d","username":"sam","displayName":null,"role":"member","libraryOwnerId":"6f1c2a4e-8b1d-4c3e-9f0a-2b7d5e8c1a90"}""";
        var user = Json.Decode<User>(json);
        Assert.Null(user.DisplayName);
        Assert.Equal(UserRole.Member, user.Role);
        Assert.Equal("sam", user.Label);
        Assert.False(user.IsAdmin);
    }

    [Fact]
    public void UserWithUnknownRoleStillDecodes()
    {
        const string json = """{"id":"0a2d3c4b-5e6f-4a1b-8c9d-0e1f2a3b4c5d","username":"sam","displayName":null,"role":"guest","libraryOwnerId":"6f1c2a4e-8b1d-4c3e-9f0a-2b7d5e8c1a90"}""";
        var user = Json.Decode<User>(json);
        Assert.Equal(UserRole.FromValue("guest"), user.Role);
        Assert.False(user.Role.IsKnown);
        Assert.False(user.IsAdmin);
        Assert.Equal("Guest", user.Role.Label);
    }

    [Fact]
    public void MissingRequiredFieldFailsDecoding()
    {
        const string json = """{"id":"0a2d3c4b-5e6f-4a1b-8c9d-0e1f2a3b4c5d","displayName":null,"role":"member","libraryOwnerId":"6f1c2a4e-8b1d-4c3e-9f0a-2b7d5e8c1a90"}""";
        Assert.Throws<JsonException>(() => Json.Decode<User>(json));
    }

    // MARK: Nulls where the contract has none

    [Fact]
    public void NullForARequiredMemberFailsLikeAMissingKey()
    {
        // .NET 8's `required` only checks that the key is there; a null would
        // otherwise land in a non-nullable string or list and blow up later.
        Assert.Throws<JsonException>(() => Json.Decode<Detail>("""{"name":null,"credits":[]}"""));
        Assert.Throws<JsonException>(() => Json.Decode<Detail>("""{"name":"The Matrix","credits":null}"""));

        var detail = Json.Decode<Detail>("""{"name":"The Matrix","credits":[],"tagline":null}""");
        Assert.Null(detail.Tagline);
        Assert.Empty(detail.Credits);
    }

    [Fact]
    public void NullCreditsOnATitlePageAreUnreadable()
    {
        // The doc's own example with one field nulled, as a buggy server might send it.
        var body = JsonNode.Parse(Fixtures.Read("title-detail"))!;
        body["credits"] = null;
        Assert.Throws<JsonException>(() => Json.Decode<TitleDetail>(body.ToJsonString()));

        body = JsonNode.Parse(Fixtures.Read("title-detail"))!;
        body["name"] = null;
        Assert.Throws<JsonException>(() => Json.Decode<TitleDetail>(body.ToJsonString()));
    }

    [Fact]
    public void NullForAnOptionalMemberKeepsItsDefault()
    {
        // The Mac's decodeIfPresent(...) ?? default treats null and absent alike.
        var value = Json.Decode<WithList>("""{"items":null,"reason":null}""");
        Assert.Empty(value.Items);
        Assert.Null(value.Reason);

        var info = Json.Decode<ServerInfo>("""{"app":"marquee","apiVersion":1,"version":null,"status":null,"setupComplete":null}""");
        Assert.Equal("unknown", info.Version);
        Assert.Equal("ok", info.Status);
        Assert.Null(info.SetupComplete);
    }

    [Fact]
    public void NullListElementsFollowTheElementAnnotation()
    {
        Assert.Throws<JsonException>(() => Json.Decode<Detail>("""{"name":"The Matrix","credits":["Keanu Reeves",null]}"""));
        Assert.Throws<JsonException>(() => Json.Decode<WithList>("""{"items":[null]}"""));
        Assert.Throws<JsonException>(() => Json.Decode<ListResponse<CountResponse>>("""{"results":[null]}"""));
        Assert.Throws<JsonException>(() => Json.Decode<Paginated<TitleCard>>("""{"page":1,"totalPages":1,"totalResults":1,"results":[null]}"""));

        // A list declared with nullable elements keeps them.
        Assert.Null(Assert.Single(Json.Decode<WithNullableItems>("""{"items":[null]}""").Items));
    }

    [Fact]
    public void KeysAreCaseSensitiveAndCamelCase()
    {
        Assert.Throws<JsonException>(() => Json.Decode<OK>("""{"OK":true}"""));
        Assert.True(Json.Decode<OK>("""{"ok":true}""").Ok);
    }

    [Fact]
    public void ServerInfoDefaultsMatchTheMac()
    {
        var info = Json.Decode<ServerInfo>("""{"app":"marquee","apiVersion":1}""");
        Assert.Equal("unknown", info.Version);
        Assert.Equal("ok", info.Status);
        Assert.Null(info.SetupComplete);
        Assert.Throws<JsonException>(() => Json.Decode<ServerInfo>("""{"status":"ok","version":"10.2.3"}"""));
    }

    // MARK: Lenient shapes

    [Fact]
    public void MissingListsDefaultToEmptyAndMissingNullablesToNull()
    {
        var value = Json.Decode<WithList>("{}");
        Assert.Empty(value.Items);
        Assert.Null(value.Reason);
        var full = Json.Decode<WithList>("""{"items":["a"],"reason":"Not now"}""");
        Assert.Equal(["a"], full.Items);
        Assert.Equal("Not now", full.Reason);
    }

    [Fact]
    public void RequestBodiesOmitNullsButResponsesKeepThem()
    {
        Assert.Equal("""{"b":1}""", Json.EncodeBodyToString(new Body(null, 1)));
        var holder = new Holder { Type = MediaType.Tv };
        Assert.Contains("\"status\":null", JsonSerializer.Serialize(holder, Json.Options));
        Assert.Contains("\"day\":null", JsonSerializer.Serialize(holder, Json.Options));
    }

    [Fact]
    public void ComputedPropertiesNeverReachTheWire()
    {
        var user = Json.Decode<User>("""{"id":"0a2d3c4b-5e6f-4a1b-8c9d-0e1f2a3b4c5d","username":"sam","displayName":null,"role":"member","libraryOwnerId":"6f1c2a4e-8b1d-4c3e-9f0a-2b7d5e8c1a90"}""");
        var encoded = Json.EncodeBodyToString(user);
        Assert.DoesNotContain("isAdmin", encoded);
        Assert.DoesNotContain("label", encoded);
        Assert.Contains("\"username\":\"sam\"", encoded);
        Assert.Throws<NotSupportedException>(() => Json.EncodeBodyToString(new { Username = "sam" }));
    }

    // MARK: Open enums

    [Fact]
    public void OpenEnumsKeepUnknownValues()
    {
        var holder = Json.Decode<Holder>("""{"type":"music","status":"archived","day":"2026-09-17"}""");
        Assert.Equal(MediaType.FromValue("music"), holder.Type);
        Assert.False(holder.Type.IsKnown);
        Assert.Equal(LibraryStatus.FromValue("archived"), holder.Status);
        Assert.Equal(new DateOnly(2026, 9, 17), holder.Day);

        var encoded = JsonSerializer.Serialize(holder, Json.Options);
        Assert.Contains("\"type\":\"music\"", encoded);
        Assert.Contains("\"status\":\"archived\"", encoded);
        Assert.Contains("\"day\":\"2026-09-17\"", encoded);

        Assert.Equal(LibraryStatus.TrackedDownloading, LibraryStatus.FromValue("tracked_downloading"));
        Assert.Equal(NotificationEventType.RequestApproved, NotificationEventType.FromValue("request_approved"));
        Assert.Equal(ResolutionTier.FullHd, ResolutionTier.FromValue("1080p"));
        Assert.True(UserRole.FromValue("admin").IsKnown);
        foreach (var type in ActivityEventType.Known)
        {
            Assert.Equal(type, ActivityEventType.FromValue(type.Value));
        }
        Assert.Equal("Music", MediaType.FromValue("music").Label);
        Assert.Equal("Coming_Soon", OpenEnum.Capitalized("coming_soon"));
    }

    [Fact]
    public void OpenEnumLabelsAndHelpers()
    {
        Assert.Equal("Movies", MediaType.Movie.PluralLabel);
        Assert.Equal("Sonarr", MediaType.Tv.ArrName);
        Assert.True(LibraryStatus.ComingSoon.IsInLibrary);
        Assert.False(LibraryStatus.Untracked.IsInLibrary);
        Assert.Equal("Not owned", LibraryStatus.Untracked.CompactLabel);
        Assert.Equal(FavoriteEntityType.Tv, FavoriteEntityType.Of(MediaType.Tv));
        Assert.Equal(MediaType.Movie, SuggestionKind.Movie.MediaType);
        Assert.Null(SuggestionKind.Person.MediaType);
        Assert.Equal(8989, ArrProvider.Sonarr.DefaultPort);
        Assert.Equal(MediaType.Movie, ArrProvider.Radarr.MediaType);
        Assert.Equal("top_rated", BrowseSort.TopRated.Value);
        Assert.Equal("disk-space-snapshot", JobId.DiskSpaceSnapshot.ToString());
        Assert.Equal("TheTVDB", IntegrationProvider.Tvdb.DisplayName);
        Assert.Equal(4, LibraryProvider.Known.Count);
    }

    [Fact]
    public void OpenEnumsWorkAsDictionaryKeys()
    {
        var map = Json.Decode<Dictionary<MediaType, int>>("""{"movie":1,"tv":2,"music":3}""");
        Assert.Equal(1, map[MediaType.Movie]);
        Assert.Equal(3, map[MediaType.FromValue("music")]);
        Assert.Equal("""{"tv":2}""", JsonSerializer.Serialize(new Dictionary<MediaType, int> { [MediaType.Tv] = 2 }, Json.Options));
    }

    // MARK: Calendar dates

    [Theory]
    [InlineData("\"\"")]
    [InlineData("null")]
    [InlineData("\"not a date\"")]
    public void BlankOptionalDaysDecodeAsNull(string value)
    {
        var holder = Json.Decode<Holder>($$"""{"type":"tv","status":null,"day":{{value}}}""");
        Assert.Null(holder.Day);
        Assert.Null(holder.Status);
    }

    [Fact]
    public void RequiredDaysStayStrict()
    {
        Assert.Null(Json.Decode<Holder>("""{"type":"tv"}""").Day);
        Assert.Throws<JsonException>(() => Json.Decode<RequiredDay>("""{"day":""}"""));
        Assert.Throws<JsonException>(() => Json.Decode<RequiredDay>("""{"day":"2026-13-01"}"""));
        Assert.Equal(new DateOnly(2026, 2, 28), Json.Decode<RequiredDay>("""{"day":"2026-02-28"}""").Day);
    }

    [Fact]
    public void CalendarDatesTakeTheDatePartOfATimestamp()
    {
        Assert.Equal(new DateOnly(2026, 9, 17), Json.ParseCalendarDate("2026-09-17T12:00:00.000Z"));
        Assert.Null(Json.ParseCalendarDate("2026-9-17"));
        Assert.Null(Json.ParseCalendarDate("2026-13-01"));
        Assert.Equal("2026-09-17", Json.FormatCalendarDate(new DateOnly(2026, 9, 17)));
    }

    // MARK: Image refs

    [Fact]
    public void ImageRefs()
    {
        ImageRef tmdb = "/aOIuZAjPaRIE6CMzbazvcHuHXDc.jpg";
        Assert.Equal("https://image.tmdb.org/t/p/w342/aOIuZAjPaRIE6CMzbazvcHuHXDc.jpg", tmdb.Url(ImageSize.W342)?.AbsoluteUri);
        Assert.False(tmdb.IsAbsolute);

        ImageRef tvdb = "https://artworks.thetvdb.com/banners/posters/81189-10.jpg";
        Assert.Equal("https://artworks.thetvdb.com/banners/posters/81189-10.jpg", tvdb.Url(ImageSize.W92)?.AbsoluteUri);
        Assert.True(tvdb.IsAbsolute);

        ImageRef? none = null;
        Assert.Null(none.Url(ImageSize.Original));
        Assert.Null(new ImageRef("").Url());
        Assert.Equal("https://image.tmdb.org/t/p/original/x.png", ImageRef.UrlFor("/x.png", ImageSize.Original)?.AbsoluteUri);
        Assert.Equal("https://image.tmdb.org/t/p/w500/x.png", ImageRef.UrlFor("x.png")?.AbsoluteUri);
        Assert.Null(ImageRef.UrlFor(null));
    }

    [Fact]
    public void ImageRefsAreStringsOnTheWire()
    {
        var card = Json.Decode<Dictionary<string, ImageRef?>>("""{"posterPath":"/abc.jpg","backdropPath":null}""");
        Assert.Equal(new ImageRef("/abc.jpg"), card["posterPath"]);
        Assert.Null(card["backdropPath"]);
        Assert.Equal("\"/abc.jpg\"", JsonSerializer.Serialize(new ImageRef("/abc.jpg"), Json.Options));
    }

    // MARK: Small shapes

    [Fact]
    public void BadgeLabels()
    {
        Assert.Null(Badges.Zero.BellLabel);
        Assert.Equal("9+", new Badges { UnreadNotifications = 12, PendingRequests = 0 }.BellLabel);
        Assert.Equal("12", new Badges { UnreadNotifications = 12, PendingRequests = 0 }.TaskbarLabel);
        Assert.Equal("99+", new Badges { UnreadNotifications = 120, PendingRequests = 0 }.TaskbarLabel);
    }

    [Fact]
    public void TitleIdsAndSegments()
    {
        var id = Json.Decode<TitleId>("""{"mediaType":"tv","tmdbId":1399}""");
        Assert.Equal(new TitleId(MediaType.Tv, 1399), id);
        Assert.Equal("tv:1399", id.ToString());
        Assert.Equal("marquee://title/tv/1399", id.Route.AbsoluteUri);
        Assert.Equal("""{"mediaType":"tv","tmdbId":1399}""", Json.EncodeBodyToString(id));

        Assert.Equal("a%2Fb%3Fc%23d", MarqueeApi.Segment("a/b?c#d"));
        Assert.Equal("28713d50-27f2-4230-9c95-c1e6a000f6c0", MarqueeApi.Segment(Guid.Parse("28713D50-27F2-4230-9C95-C1E6A000F6C0")));
        Assert.Equal("tv", MarqueeApi.Segment(MediaType.Tv));
        Assert.Equal("collection", MarqueeApi.Segment(FavoriteEntityType.Collection));
        Assert.Equal("arr-sync", MarqueeApi.Segment(JobId.ArrSync));
    }

    [Fact]
    public void PaginatedAndListShapes()
    {
        var page = Json.Decode<Paginated<TitleId>>("""{"page":1,"totalPages":3,"totalResults":50,"results":[{"mediaType":"movie","tmdbId":603}]}""");
        Assert.True(page.HasMorePages);
        Assert.Equal(new TitleId(MediaType.Movie, 603), Assert.Single(page.Results));

        var list = Json.Decode<ListResponse<CountResponse>>("""{"results":[{"count":3}]}""");
        Assert.Equal(3, Assert.Single(list.Results).Count);
    }
}
