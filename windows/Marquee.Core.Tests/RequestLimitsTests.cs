using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// Request limits and the trusted role (0.39+): /me's requestLimits and the
// member's line on the Requests page (app/requests/page.tsx quotaLine), the
// household member's quota fields, the admin's Role / Request limits form
// as PATCH /users/{id} sends it, who reviews requests (lib/users/roles.ts),
// and an older server's answers without any of it.

public sealed class RequestLimitsTests
{
    private static readonly TimeZoneInfo Utc = TimeZoneInfo.Utc;

    private static RequestLimit Limit(int limit, int days, int used, DateTimeOffset? next = null) => new()
    {
        Limit = limit,
        Days = days,
        Used = used,
        Remaining = Math.Max(0, limit - used),
        NextSlotAt = next,
    };

    // MARK: /me

    [Fact]
    public void MeFixtureHasNoLimitsForTheAdmin()
    {
        var me = Fixtures.Decode<Me>("me");

        Assert.NotNull(me.RequestLimits);
        Assert.Null(me.RequestLimits!.Movie);
        Assert.Null(me.RequestLimits.Tv);
        Assert.Null(me.RequestLimits.Summary(Utc));
        Assert.True(me.ReviewsRequests);
    }

    [Fact]
    public void MeDecodesALimit()
    {
        var json = Fixtures.Read("me")
            .Replace("\"role\": \"admin\"", "\"role\": \"member\"", StringComparison.Ordinal)
            .Replace("\"movie\": null", """
                "movie": { "limit": 5, "days": 7, "used": 5, "remaining": 0, "nextSlotAt": "2026-10-03T02:53:36.305Z" }
                """, StringComparison.Ordinal);
        var me = Json.Decode<Me>(json);

        var movie = Assert.IsType<RequestLimit>(me.RequestLimits?.Movie);
        Assert.Equal(5, movie.Limit);
        Assert.Equal(7, movie.Days);
        Assert.Equal(5, movie.Used);
        Assert.Equal(0, movie.Remaining);
        Assert.Equal(Json.ParseDate("2026-10-03T02:53:36.305Z"), movie.NextSlotAt);
        Assert.Null(me.RequestLimits!.Tv);
        Assert.False(me.ReviewsRequests);
        Assert.Equal("Movies: none left until Oct 3", me.RequestLimits.Summary(Utc));
    }

    [Fact]
    public void OlderServerMeHasNoLimits()
    {
        // Windows checkouts can turn the fixture's line endings into \r\n.
        var json = Fixtures.Read("me").Replace("\r\n", "\n", StringComparison.Ordinal);
        var start = json.IndexOf(",\n  \"requestLimits\"", StringComparison.Ordinal);
        Assert.True(start > 0);
        var older = json[..start] + "\n}";
        var me = Json.Decode<Me>(older);

        Assert.Null(me.RequestLimits);
        Assert.Equal("Timmy", me.Label);
    }

    // MARK: The member's line

    [Fact]
    public void LineWithRequestsLeft() =>
        Assert.Equal("Movies: 3 of 5 requests left (every 7 days)", Limit(5, 7, 2).Line("Movies", Utc));

    [Fact]
    public void LineWithNoneLeft() =>
        Assert.Equal("TV: none left until Oct 3",
            Limit(5, 7, 5, Json.ParseDate("2026-10-03T02:53:36.305Z")).Line("TV", Utc));

    [Fact]
    public void LineWithNoneLeftAndNoDate() =>
        Assert.Equal("Movies: none left", Limit(5, 7, 5).Line("Movies", Utc));

    [Fact]
    public void LineDateIsLocal()
    {
        var west = TimeZoneInfo.CreateCustomTimeZone("west", TimeSpan.FromHours(-5), "west", "west");
        Assert.Equal("Movies: none left until Oct 2",
            Limit(5, 7, 5, Json.ParseDate("2026-10-03T02:53:36.305Z")).Line("Movies", west));
    }

    [Fact]
    public void SummaryJoinsBothTypes()
    {
        var limits = new RequestLimits
        {
            Movie = Limit(5, 7, 2),
            Tv = Limit(2, 30, 2, Json.ParseDate("2026-10-03T12:00:00Z")),
        };
        Assert.Equal("Movies: 3 of 5 requests left (every 7 days) · TV: none left until Oct 3", limits.Summary(Utc));
        Assert.Equal("TV: none left until Oct 3", (limits with { Movie = null }).Summary(Utc));
    }

    // MARK: Roles

    [Fact]
    public void WhoReviewsRequests()
    {
        Assert.True(UserRole.Admin.ReviewsRequests);
        Assert.True(UserRole.Trusted.ReviewsRequests);
        Assert.False(UserRole.Member.ReviewsRequests);
        // An unknown role acts as a member.
        Assert.False(UserRole.FromValue("guest").ReviewsRequests);
        Assert.True(UserRole.Trusted.IsKnown);
        Assert.Equal("Trusted", UserRole.Trusted.Label);
    }

    [Fact]
    public void TrustedUserReviewsButIsNotAdmin()
    {
        var json = Fixtures.Read("me").Replace("\"role\": \"admin\"", "\"role\": \"trusted\"", StringComparison.Ordinal);
        var user = Json.Decode<Me>(json).User;

        Assert.Equal(UserRole.Trusted, user.Role);
        Assert.True(user.ReviewsRequests);
        Assert.False(user.IsAdmin);
    }

    // MARK: Household member

    [Fact]
    public void HouseholdMemberDecodesQuotas()
    {
        var member = Fixtures.Decode<HouseholdMember>("household-member");

        Assert.Equal(5, member.MovieQuotaLimit);
        Assert.Equal(7, member.MovieQuotaDays);
        Assert.Null(member.TvQuotaLimit);
        Assert.Equal(7, member.TvQuotaDays);
        Assert.True(member.SupportsRequestLimits);
        Assert.False(member.IsTrusted);
        Assert.Equal(UserRole.Member, MemberAccessForm.InitialRole(member));
        Assert.Equal("5", MemberAccessForm.LimitText(member.MovieQuotaLimit));
        Assert.Equal("", MemberAccessForm.LimitText(member.TvQuotaLimit));
        Assert.Equal("7", MemberAccessForm.DaysText(member.TvQuotaDays));
    }

    [Fact]
    public void TrustedMemberDecodes()
    {
        var json = Fixtures.Read("household-member").Replace("\"role\": \"member\"", "\"role\": \"trusted\"", StringComparison.Ordinal);
        var member = Json.Decode<HouseholdMember>(json);

        Assert.True(member.IsTrusted);
        Assert.False(member.IsAdmin);
        Assert.Equal(UserRole.Trusted, MemberAccessForm.InitialRole(member));
    }

    [Fact]
    public void OlderServerMemberHasNoQuotaFields()
    {
        var json = Fixtures.Read("household-member").Replace("\r\n", "\n", StringComparison.Ordinal);
        var start = json.IndexOf(",\n  \"movieQuotaLimit\"", StringComparison.Ordinal);
        Assert.True(start > 0);
        var member = Json.Decode<HouseholdMember>(json[..start] + "\n}");

        Assert.Null(member.MovieQuotaLimit);
        Assert.Null(member.MovieQuotaDays);
        Assert.False(member.SupportsRequestLimits);
        Assert.Equal("7", MemberAccessForm.DaysText(member.MovieQuotaDays));
    }

    [Fact]
    public void UpdateResultCarriesQuotas()
    {
        var update = Fixtures.Decode<UpdateUserResult>("user-update");
        Assert.Equal(5, update.User.MovieQuotaLimit);
        Assert.Null(update.User.TvQuotaLimit);
    }

    // MARK: PATCH body

    [Fact]
    public void AccessFormSendsRoleAndLimits()
    {
        var (request, error) = MemberAccessForm.Apply(new UpdateUserRequest("kid"), trusted: true, " 5 ", "7", "", "30");

        Assert.Null(error);
        Assert.Equal(
            """{"username":"kid","role":"trusted","movieQuotaLimit":5,"movieQuotaDays":7,"tvQuotaLimit":null,"tvQuotaDays":30}""",
            Json.EncodeBodyToString(request!));
    }

    [Fact]
    public void AccessFormBlankDaysAreLeftOut()
    {
        var (request, error) = MemberAccessForm.Apply(new UpdateUserRequest("kid"), trusted: false, "", "", "", " ");

        Assert.Null(error);
        Assert.Equal(
            """{"username":"kid","role":"member","movieQuotaLimit":null,"tvQuotaLimit":null}""",
            Json.EncodeBodyToString(request!));
    }

    [Theory]
    [InlineData("0", "7", "", "7", "The movie limit is a number from 1 to 1000, or blank for no limit.")]
    [InlineData("1001", "7", "", "7", "The movie limit is a number from 1 to 1000, or blank for no limit.")]
    [InlineData("", "7", "two", "7", "The TV limit is a number from 1 to 1000, or blank for no limit.")]
    [InlineData("5", "366", "", "7", "The number of days is from 1 to 365.")]
    [InlineData("5", "7", "", "-1", "The number of days is from 1 to 365.")]
    public void AccessFormRefusesBadValues(string movieLimit, string movieDays, string tvLimit, string tvDays, string message)
    {
        var (request, error) = MemberAccessForm.Apply(new UpdateUserRequest("kid"), false, movieLimit, movieDays, tvLimit, tvDays);

        Assert.Null(request);
        Assert.Equal(message, error);
    }

    [Fact]
    public void UpdateBodyWithoutAccessFieldsIsUnchanged() =>
        Assert.Equal("""{"username":"kid"}""", Json.EncodeBodyToString(new UpdateUserRequest("kid")));

    [Fact]
    public void QuotaLimitRoundTrips()
    {
        Assert.Equal("null", Json.EncodeBodyToString(QuotaLimit.None));
        Assert.Equal("12", Json.EncodeBodyToString(new QuotaLimit(12)));
    }
}
