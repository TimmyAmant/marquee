using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// Per-member permissions (0.48+): decoding with and without the
// `permissions` object, the fallback to the role for an older server, the
// presets and "Custom", the admin's editor and the PATCH body it builds, and
// the "Everyone's requests" list for someone who may see but not review.

public sealed class PermissionsTests
{
    // Windows checkouts can turn the fixtures' line endings into \r\n.
    private static string Fixture(string name) => Fixtures.Read(name).Replace("\r\n", "\n", StringComparison.Ordinal);

    /// <summary>The fixture with its <c>"permissions": {…}</c> object taken out, as an older server sends it.</summary>
    private static string WithoutPermissions(string json)
    {
        var start = json.IndexOf("\"permissions\": {", StringComparison.Ordinal);
        Assert.True(start > 0);
        var end = json.IndexOf('}', start);
        var after = json.IndexOf('"', end);
        return json[..start] + json[after..];
    }

    // MARK: Decoding

    [Fact]
    public void HouseholdMemberDecodesItsPermissions()
    {
        var member = Fixtures.Decode<HouseholdMember>("household-member");

        Assert.True(member.SupportsPermissions);
        var expected = Permissions.MemberPreset with { AutoApproveTv = true, AutoApprove4kTv = true };
        Assert.Equal(expected, member.Permissions);
        Assert.Equal(expected, member.Can);
        Assert.Equal(PermissionPreset.Custom, member.Can.Preset);
        Assert.Equal("Custom", member.PresetTag);
    }

    [Fact]
    public void MeDecodesTheAdminsPermissions()
    {
        var me = Fixtures.Decode<Me>("me");

        Assert.Equal(Permissions.All, me.Permissions);
        Assert.Equal(Permissions.All, me.Can);
        Assert.True(me.ReviewsRequests);
        Assert.Equal(Permissions.All, me.User.Can);
    }

    [Fact]
    public void UserListAndUpdateResultCarryPermissions()
    {
        Assert.NotNull(Assert.Single(Fixtures.Decode<ListResponse<HouseholdMember>>("users").Results).Permissions);
        Assert.NotNull(Fixtures.Decode<UpdateUserResult>("user-update").User.Permissions);
    }

    [Fact]
    public void MissingKeysAreOffAndUnknownOnesIgnored()
    {
        var permissions = Json.Decode<Permissions>("""{ "requestMovies": true, "teleport": true }""");

        Assert.Equal(Permissions.None with { RequestMovies = true }, permissions);
    }

    [Fact]
    public void OlderServerMemberFallsBackToTheRole()
    {
        var member = Json.Decode<HouseholdMember>(WithoutPermissions(Fixture("household-member")));

        Assert.Null(member.Permissions);
        Assert.False(member.SupportsPermissions);
        // A member: the Member preset plus their auto-approval, 4K following the regular one.
        Assert.Equal(Permissions.MemberPreset with { AutoApproveTv = true, AutoApprove4kTv = true }, member.Can);
        // No custom mix before permissions: the role decides the tag.
        Assert.Equal("", member.PresetTag);
    }

    [Fact]
    public void OlderServerTrustedMemberHasEverythingButTheBlocklist()
    {
        var json = WithoutPermissions(Fixture("household-member"))
            .Replace("\"role\": \"member\"", "\"role\": \"trusted\"", StringComparison.Ordinal);
        var member = Json.Decode<HouseholdMember>(json);

        Assert.Equal(Permissions.TrustedPreset, member.Can);
        Assert.False(member.Can.ManageBlocklist);
        Assert.True(member.Can.ReviewRequests);
        Assert.Equal("Trusted", member.PresetTag);
    }

    [Fact]
    public void OlderServerMeFallsBackToTheRole()
    {
        var json = WithoutPermissions(Fixture("me"));

        var admin = Json.Decode<Me>(json);
        Assert.Null(admin.Permissions);
        Assert.Equal(Permissions.All, admin.Can);

        var member = Json.Decode<Me>(json.Replace("\"role\": \"admin\"", "\"role\": \"member\"", StringComparison.Ordinal));
        Assert.Equal(Permissions.MemberPreset with
        {
            AutoApproveMovies = true,
            AutoApprove4kMovies = true,
            AutoApproveTv = true,
            AutoApprove4kTv = true,
        }, member.Can);
        Assert.False(member.ReviewsRequests);
        // The same through the User the app keeps.
        Assert.Equal(member.Can, member.User.Can);
    }

    [Fact]
    public void LoginUserWithoutPermissionsGoesByTheRole()
    {
        var fixture = Fixtures.Decode<AuthResponse>("auth-login");
        // 0.48+ sends the switches on the login user too (all on for the admin).
        Assert.Equal(Permissions.All, fixture.User.Permissions);
        // An older server's login user has none: the role decides.
        var login = fixture with { User = fixture.User with { Permissions = null } };
        Assert.Equal(Permissions.All, login.User.Can);

        var member = login.User with { Role = UserRole.Member };
        Assert.Equal(Permissions.MemberPreset, member.Can);
        Assert.False(member.ReviewsRequests);

        var guest = login.User with { Role = UserRole.FromValue("guest") };
        Assert.Equal(Permissions.MemberPreset, guest.Can);
    }

    [Fact]
    public void TheAdminHasEverythingWhateverIsSent()
    {
        var admin = Fixtures.Decode<AuthResponse>("auth-login").User with { Permissions = Permissions.None };

        Assert.Equal(Permissions.All, admin.Can);
    }

    [Fact]
    public void ReviewingBringsSeeing()
    {
        var user = Fixtures.Decode<AuthResponse>("auth-login").User with
        {
            Role = UserRole.Member,
            Permissions = Permissions.MemberPreset with { ReviewRequests = true },
        };

        Assert.True(user.Can.ViewRequests);
        Assert.True(user.Can.SeesEveryonesRequests);
        Assert.True(user.ReviewsRequests);
        Assert.True((Permissions.None with { ReviewRequests = true }).SeesEveryonesRequests);
        Assert.True((Permissions.None with { ViewRequests = true }).SeesEveryonesRequests);
        Assert.False(Permissions.MemberPreset.SeesEveryonesRequests);
    }

    [Fact]
    public void ViewerGatesFollowTheSwitches()
    {
        var user = Fixtures.Decode<AuthResponse>("auth-login").User with
        {
            Role = UserRole.Member,
            Permissions = Permissions.None with { ViewRequests = true, ManageBlocklist = true, AdvancedRequests = true },
        };

        Assert.False(user.IsAdmin);
        Assert.False(user.ReviewsRequests);
        Assert.True(user.Can.SeesEveryonesRequests);
        Assert.True(user.Can.ManageBlocklist);
        Assert.True(user.Can.AdvancedRequests);
        Assert.False(user.Can.ManageIssues);
        Assert.False(user.Can.ReportIssues);
    }

    // MARK: Presets

    [Fact]
    public void PresetsAreTheServersLists()
    {
        Assert.Equal(
            [PermissionKey.RequestMovies, PermissionKey.RequestTv, PermissionKey.Request4kMovies, PermissionKey.Request4kTv, PermissionKey.ReportIssues],
            Enum.GetValues<PermissionKey>().Where(Permissions.MemberPreset.Get));
        Assert.Equal(
            Enum.GetValues<PermissionKey>().Where(key => key != PermissionKey.ManageBlocklist),
            Enum.GetValues<PermissionKey>().Where(Permissions.TrustedPreset.Get));
        Assert.All(Enum.GetValues<PermissionKey>(), key => Assert.True(Permissions.All.Get(key)));
        Assert.All(Enum.GetValues<PermissionKey>(), key => Assert.False(Permissions.None.Get(key)));
    }

    [Fact]
    public void PresetDetection()
    {
        Assert.Equal(PermissionPreset.Member, Permissions.MemberPreset.Preset);
        Assert.Equal(PermissionPreset.Trusted, Permissions.TrustedPreset.Preset);
        Assert.Equal(PermissionPreset.Custom, Permissions.All.Preset);
        Assert.Equal(PermissionPreset.Custom, Permissions.None.Preset);
        Assert.Equal(PermissionPreset.Custom, (Permissions.MemberPreset with { BypassLimits = true }).Preset);
        // Trusted without the view switch is still Trusted: reviewing brings it.
        Assert.Equal(PermissionPreset.Trusted, (Permissions.TrustedPreset with { ViewRequests = false }).Preset);
    }

    [Fact]
    public void WithAndGetCoverEverySwitch()
    {
        foreach (var key in Enum.GetValues<PermissionKey>())
        {
            var on = Permissions.None.With(key, true);
            Assert.True(on.Get(key));
            Assert.Single(Enum.GetValues<PermissionKey>(), on.Get);
            Assert.Equal(Permissions.None, on.With(key, false));
        }
    }

    [Fact]
    public void PresetTags()
    {
        var member = Fixtures.Decode<HouseholdMember>("household-member");

        Assert.Equal("", (member with { Permissions = Permissions.MemberPreset }).PresetTag);
        Assert.Equal("Trusted", (member with { Permissions = Permissions.TrustedPreset }).PresetTag);
        Assert.Equal("Custom", (member with { Permissions = Permissions.All }).PresetTag);
        Assert.Equal("", (member with { Role = UserRole.Admin, Permissions = Permissions.All }).PresetTag);
    }

    [Fact]
    public void EncodesEverySwitchByItsWireName()
    {
        var json = Json.EncodeBodyToString(Permissions.MemberPreset);

        Assert.Equal(
            """{"requestMovies":true,"requestTv":true,"request4kMovies":true,"request4kTv":true,"autoApproveMovies":false,"autoApproveTv":false,"autoApprove4kMovies":false,"autoApprove4kTv":false,"advancedRequests":false,"viewRequests":false,"reviewRequests":false,"manageIssues":false,"reportIssues":true,"manageBlocklist":false,"bypassLimits":false}""",
            json);
    }

    // MARK: The editor

    [Fact]
    public void EditorStartsFromTheMembersSwitches()
    {
        var editor = new MemberPermissionsEditor(Permissions.MemberPreset);

        Assert.Equal(PermissionPreset.Member, editor.Preset);
        Assert.Equal(0, editor.PresetIndex);
        Assert.False(editor.IsCustom);
        Assert.Equal(["Requests", "Approved straight away", "Helping run things"], editor.Groups.Select(group => group.Title));
        Assert.Equal(15, editor.Toggles.Count());
        Assert.Equal(Enum.GetValues<PermissionKey>().Order(), editor.Toggles.Select(toggle => toggle.Key).Order());
        Assert.True(editor.Toggle(PermissionKey.RequestMovies).IsOn);
        Assert.False(editor.Toggle(PermissionKey.ReviewRequests).IsOn);
        Assert.Equal(
            [MemberPermissionsEditor.MemberChoice, MemberPermissionsEditor.TrustedChoice, MemberPermissionsEditor.CustomChoice],
            MemberPermissionsEditor.PresetChoices);
        Assert.Equal("Member — requests, and reports problems", MemberPermissionsEditor.MemberChoice);
        Assert.Equal("Trusted — also reviews requests and problem reports", MemberPermissionsEditor.TrustedChoice);
    }

    [Fact]
    public void WordingMatchesTheWebsite()
    {
        var editor = new MemberPermissionsEditor(Permissions.None);

        var toggle = editor.Toggle(PermissionKey.AdvancedRequests);
        Assert.Equal("Advanced request options", toggle.Label);
        Assert.Equal("Pick the server, quality profile, folder and tags when asking for or approving a title.", toggle.Note);
        Assert.Equal("4K TV", editor.Toggle(PermissionKey.AutoApprove4kTv).Label);
        Assert.Equal("Their 4K TV requests skip the review queue.", editor.Toggle(PermissionKey.AutoApprove4kTv).Description);
        Assert.Equal("Manage the blocklist", editor.Toggle(PermissionKey.ManageBlocklist).Label);
        Assert.Equal("Settings, integrations, household accounts, API keys and sign-in stay yours alone.", MemberPermissionsEditor.Footer);
    }

    [Fact]
    public void PickingAPresetFillsTheSwitches()
    {
        var editor = new MemberPermissionsEditor(Permissions.MemberPreset);
        var changed = new List<string?>();
        editor.PropertyChanged += (_, e) => changed.Add(e.PropertyName);
        var reviewChanged = 0;
        editor.Toggle(PermissionKey.ReviewRequests).PropertyChanged += (_, e) =>
        {
            if (e.PropertyName == nameof(PermissionToggle.IsOn))
            {
                reviewChanged++;
            }
        };

        editor.PresetIndex = (int)PermissionPreset.Trusted;

        Assert.Equal(Permissions.TrustedPreset, editor.Current);
        Assert.Equal(PermissionPreset.Trusted, editor.Preset);
        Assert.Contains(nameof(MemberPermissionsEditor.PresetIndex), changed);
        Assert.Equal(1, reviewChanged);
        Assert.True(editor.Toggle(PermissionKey.ReviewRequests).IsOn);

        editor.PresetIndex = (int)PermissionPreset.Member;
        Assert.Equal(Permissions.MemberPreset, editor.Current);
    }

    [Fact]
    public void CustomCanNotBePicked()
    {
        var editor = new MemberPermissionsEditor(Permissions.MemberPreset);
        var changed = new List<string?>();
        editor.PropertyChanged += (_, e) => changed.Add(e.PropertyName);

        editor.PresetIndex = (int)PermissionPreset.Custom;

        Assert.Equal(Permissions.MemberPreset, editor.Current);
        Assert.Equal(0, editor.PresetIndex);
        // The picker is told to snap back.
        Assert.Equal([nameof(MemberPermissionsEditor.PresetIndex)], changed);
    }

    [Fact]
    public void ChangingASwitchReadsCustom()
    {
        var editor = new MemberPermissionsEditor(Permissions.MemberPreset);

        editor.Toggle(PermissionKey.BypassLimits).IsOn = true;

        Assert.Equal(PermissionPreset.Custom, editor.Preset);
        Assert.Equal(2, editor.PresetIndex);
        Assert.True(editor.IsCustom);
        Assert.True(editor.Current.BypassLimits);

        // Back to exactly the preset: Member again.
        editor.Toggle(PermissionKey.BypassLimits).IsOn = false;
        Assert.Equal(PermissionPreset.Member, editor.Preset);
    }

    [Fact]
    public void ReviewTurnsViewOnAndLocksIt()
    {
        var editor = new MemberPermissionsEditor(Permissions.MemberPreset);
        var view = editor.Toggle(PermissionKey.ViewRequests);
        Assert.True(view.IsEnabled);
        Assert.Equal("The Requests page lists what everyone has asked for.", view.Note);

        editor.Toggle(PermissionKey.ReviewRequests).IsOn = true;

        Assert.True(editor.Current.ViewRequests);
        Assert.True(view.IsOn);
        Assert.True(view.IsLocked);
        Assert.False(view.IsEnabled);
        Assert.Equal("Comes with reviewing requests.", view.Note);

        // Locked: turning it off does nothing, and the box is told to snap back.
        var snapped = false;
        view.PropertyChanged += (_, e) => snapped |= e.PropertyName == nameof(PermissionToggle.IsOn);
        view.IsOn = false;
        Assert.True(snapped);
        Assert.True(editor.Current.ViewRequests);

        // Reviewing off again: seeing stays on, and can be turned off now.
        editor.Toggle(PermissionKey.ReviewRequests).IsOn = false;
        Assert.True(view.IsOn);
        Assert.True(view.IsEnabled);
        view.IsOn = false;
        Assert.False(editor.Current.ViewRequests);
        Assert.Equal(Permissions.MemberPreset, editor.Current);
    }

    [Fact]
    public void AnInconsistentStartIsNormalized()
    {
        var editor = new MemberPermissionsEditor(Permissions.MemberPreset with { ReviewRequests = true });

        Assert.True(editor.Current.ViewRequests);
        Assert.True(editor.Toggle(PermissionKey.ViewRequests).IsLocked);
    }

    [Fact]
    public void PatchBodySendsTheWholeMapAndNoRole()
    {
        var editor = new MemberPermissionsEditor(Permissions.MemberPreset);
        editor.Toggle(PermissionKey.ManageBlocklist).IsOn = true;

        var request = editor.Apply(new UpdateUserRequest("kid", Role: UserRole.Member, AutoApproveMovies: true, AutoApproveTv: false));

        Assert.Null(request.Role);
        Assert.Null(request.AutoApproveMovies);
        Assert.Null(request.AutoApproveTv);
        Assert.Equal(
            """{"username":"kid","permissions":{"requestMovies":true,"requestTv":true,"request4kMovies":true,"request4kTv":true,"autoApproveMovies":false,"autoApproveTv":false,"autoApprove4kMovies":false,"autoApprove4kTv":false,"advancedRequests":false,"viewRequests":false,"reviewRequests":false,"manageIssues":false,"reportIssues":true,"manageBlocklist":true,"bypassLimits":false}}""",
            Json.EncodeBodyToString(request));
    }

    [Fact]
    public void AccessFormAddsPermissionsAndLimits()
    {
        var editor = new MemberPermissionsEditor(Permissions.TrustedPreset);

        var (request, error) = MemberAccessForm.Apply(new UpdateUserRequest("kid"), editor, "5", "7", "", "7");

        Assert.Null(error);
        Assert.NotNull(request);
        Assert.Equal(Permissions.TrustedPreset, request.Permissions);
        Assert.Null(request.Role);
        Assert.Equal(new QuotaLimit(5), request.MovieQuotaLimit);
        Assert.Equal(QuotaLimit.None, request.TvQuotaLimit);

        var (refused, message) = MemberAccessForm.Apply(new UpdateUserRequest("kid"), editor, "0", "7", "", "7");
        Assert.Null(refused);
        Assert.Equal("The movie limit is a number from 1 to 1000, or blank for no limit.", message);
    }

    [Fact]
    public void AccessFormForAnOlderServerStillSendsTheRole()
    {
        var (request, error) = MemberAccessForm.Apply(new UpdateUserRequest("kid"), trusted: true, "", "7", "", "7");

        Assert.Null(error);
        Assert.Equal(UserRole.Trusted, request!.Role);
        Assert.Null(request.Permissions);
    }

    // MARK: Everyone's requests

    [Fact]
    public void EveryonesRequestsAreOthersNewestFirst()
    {
        var pending = Fixtures.Decode<PendingRequests>("requests-pending").Results;
        var history = Fixtures.Decode<ListResponse<ReviewedRequest>>("requests-history").Results;

        var rows = EveryonesRequests.Rows(pending, history, viewerUsername: "someone-else");

        // Each request once (pending wins), newest first.
        Assert.Equal(rows.Count, rows.Select(row => row.Id).Distinct().Count());
        Assert.Equal(rows.OrderByDescending(row => row.CreatedAt).Select(row => row.Id), rows.Select(row => row.Id));
        var waiting = rows.Where(row => row.Status == RequestStatus.Pending).ToList();
        Assert.Equal(pending.Count, waiting.Count);
        Assert.All(waiting, row => Assert.Equal("Waiting for review", row.StatusLabel));
        Assert.Contains(rows, row => row.StatusLabel == "Approved");
        Assert.All(rows, row => Assert.Equal("member1", row.RequesterLabel));
    }

    [Fact]
    public void EveryonesRequestsLeaveOutTheViewersOwn()
    {
        var pending = Fixtures.Decode<PendingRequests>("requests-pending").Results;
        var history = Fixtures.Decode<ListResponse<ReviewedRequest>>("requests-history").Results;

        Assert.Empty(EveryonesRequests.Rows(pending, history, viewerUsername: "member1"));
    }
}
