using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// The section 11 examples decoded as the Mac's APIFixtureTests decodes them
// (the user-update part of testSettingsShapes and testUserWithUnknownRole),
// plus the two request bodies encoded the way the website's forms send
// them: optional fields left out, never null.

public sealed class UsersFixtureTests
{
    private static readonly Guid MemberId = Guid.Parse("83c55a49-6153-4cb9-ae22-4a42d48f4cf3");

    [Fact]
    public void HouseholdMemberDecodes()
    {
        var member = Fixtures.Decode<HouseholdMember>("household-member");

        Assert.Equal(MemberId, member.Id);
        Assert.Equal("member1", member.Username);
        Assert.Equal("Kid", member.DisplayName);
        Assert.Equal(UserRole.Member, member.Role);
        Assert.False(member.IsAdmin);
        Assert.False(member.AutoApproveMovies);
        Assert.True(member.AutoApproveTv);
        Assert.Equal(Json.ParseDate("2026-09-17T17:12:40.991Z"), member.CreatedAt);
        Assert.False(member.IsCurrentUser);
        Assert.Equal("Kid", member.Label);
    }

    [Fact]
    public void UserListDecodes()
    {
        var members = Fixtures.Decode<ListResponse<HouseholdMember>>("users").Results;
        var member = Assert.Single(members);

        Assert.Equal(MemberId, member.Id);
        Assert.Equal("Kid", member.Label);
        Assert.Equal(member, Fixtures.Decode<HouseholdMember>("household-member"));
    }

    [Fact]
    public void UpdateResultDecodes()
    {
        var update = Fixtures.Decode<UpdateUserResult>("user-update");

        Assert.True(update.Ok);
        Assert.True(update.TokensRevoked);
        Assert.Equal("Kid", update.User.Label);
        Assert.Equal(MemberId, update.User.Id);
    }

    [Fact]
    public void LabelFallsBackToTheUsername()
    {
        var member = Fixtures.Decode<HouseholdMember>("household-member");

        Assert.Equal("member1", (member with { DisplayName = null }).Label);
        Assert.Equal("member1", (member with { DisplayName = "" }).Label);
        Assert.Equal("member1", (member with { DisplayName = "   " }).Label);
    }

    [Fact]
    public void AdminRowDecodes()
    {
        var json = Fixtures.Read("household-member")
            .Replace("\"role\": \"member\"", "\"role\": \"admin\"", StringComparison.Ordinal)
            .Replace("\"isCurrentUser\": false", "\"isCurrentUser\": true", StringComparison.Ordinal);
        var admin = Json.Decode<HouseholdMember>(json);

        Assert.True(admin.IsAdmin);
        Assert.True(admin.IsCurrentUser);
    }

    [Fact]
    public void UnknownRoleStillDecodes()
    {
        var json = Fixtures.Read("household-member").Replace("\"role\": \"member\"", "\"role\": \"guest\"", StringComparison.Ordinal);
        var guest = Json.Decode<HouseholdMember>(json);

        Assert.Equal("guest", guest.Role.Value);
        Assert.False(guest.Role.IsKnown);
        Assert.False(guest.IsAdmin);
        Assert.Equal("Kid", guest.Label);
    }

    [Fact]
    public void CreateBodyLeavesOutAMissingDisplayName()
    {
        Assert.Equal("""{"username":"kid","password":"correct-horse"}""",
            Json.EncodeBodyToString(new CreateUserRequest("kid", "correct-horse")));
        Assert.Equal("""{"username":"kid","password":"correct-horse","displayName":"Kid"}""",
            Json.EncodeBodyToString(new CreateUserRequest("kid", "correct-horse", "Kid")));
    }

    [Fact]
    public void UpdateBodyCarriesOnlyWhatTheFormFilled()
    {
        // "Omitted or empty = unchanged" on the server: a null here must be
        // absent, not an explicit null the server might act on.
        Assert.Equal("""{"username":"kid"}""",
            Json.EncodeBodyToString(new UpdateUserRequest("kid")));
        Assert.Equal("""{"username":"kid","autoApproveTv":true}""",
            Json.EncodeBodyToString(new UpdateUserRequest("kid", AutoApproveTv: true)));
        Assert.Equal("""{"username":"kid","autoApproveMovies":false}""",
            Json.EncodeBodyToString(new UpdateUserRequest("kid", AutoApproveMovies: false)));
        Assert.Equal("""{"username":"kid","displayName":"Kid","password":"correct-horse-battery","autoApproveMovies":true,"autoApproveTv":false}""",
            Json.EncodeBodyToString(new UpdateUserRequest("kid", "Kid", "correct-horse-battery", true, false)));
    }
}
