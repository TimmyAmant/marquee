using System.Text.Json.Nodes;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// The request lifecycle (0.46+, deviation 16): the new fields on the request
// lists, problem reports, badges and the title's viewer, decoded from the
// doc's examples and from an older server that leaves them out; the edit
// options and comment thread payloads; and the rules behind the edit dialog,
// the conversation and "Couldn't add" (components/request-lifecycle.tsx,
// components/comment-thread.tsx, components/couldnt-add-section.tsx).

public sealed class RequestLifecycleTests
{
    private static readonly Guid MatrixId = Guid.Parse("28713d50-27f2-4230-9c95-c1e6a000f6c0");
    private static readonly Guid SeveranceId = Guid.Parse("5b0f1d8e-8a8c-4f5e-9d51-1f0c7a0e2b44");

    private static readonly string[] RequestKeys = ["canEdit", "canCancel", "editedAt", "commentCount", "addFailed"];

    /// <summary>The fixture with the 0.46 keys taken out of every result, as an older server sends it.</summary>
    private static string WithoutNewKeys(string fixture, params string[] keys)
    {
        var root = JsonNode.Parse(Fixtures.Read(fixture))!.AsObject();
        foreach (var result in root["results"]!.AsArray())
        {
            foreach (var key in keys)
            {
                result!.AsObject().Remove(key);
            }
        }
        return root.ToJsonString();
    }

    // MARK: Request lists

    [Fact]
    public void MyRequestsCarryTheLifecycleFields()
    {
        var mine = Fixtures.Decode<ListResponse<MyRequest>>("requests-mine").Results;

        var approved = mine[0];
        Assert.False(approved.CanEdit);
        Assert.False(approved.CanCancel);
        Assert.Null(approved.EditedAt);
        Assert.Equal(2, approved.CommentCount);
        Assert.True(approved.HasConversation);
        Assert.Equal("Need a change? Ask in its comments.", approved.ChangeHint);

        var pending = mine[1];
        Assert.Equal(SeveranceId, pending.Id);
        Assert.Equal(RequestStatus.Pending, pending.Status);
        Assert.True(pending.CanEdit);
        Assert.True(pending.CanCancel);
        Assert.Equal(Json.ParseDate("2026-09-17T17:20:40.310Z"), pending.EditedAt);
        Assert.Equal(0, pending.CommentCount);
        Assert.True(pending.HasConversation);
        Assert.Null(pending.ChangeHint);
        Assert.Equal("Season 2", pending.DetailText);
    }

    [Fact]
    public void AnOlderServersRequestsHaveNoLifecycle()
    {
        var mine = Json.Decode<ListResponse<MyRequest>>(WithoutNewKeys("requests-mine", RequestKeys)).Results;
        Assert.All(mine, request =>
        {
            Assert.False(request.CanEdit);
            Assert.False(request.CanCancel);
            Assert.Null(request.EditedAt);
            Assert.Equal(0, request.CommentCount);
            Assert.False(request.HasConversation);
            // No conversation to ask in: no hint either.
            Assert.Null(request.ChangeHint);
        });

        var pending = Json.Decode<PendingRequests>(WithoutNewKeys("requests-pending", RequestKeys)).Results;
        Assert.All(pending, request =>
        {
            Assert.Null(request.EditedAt);
            Assert.False(request.WasEdited);
            Assert.Equal(0, request.CommentCount);
            Assert.False(request.HasConversation);
        });

        var history = Json.Decode<ListResponse<ReviewedRequest>>(WithoutNewKeys("requests-history", RequestKeys)).Results;
        Assert.All(history, request =>
        {
            Assert.Null(request.AddFailed);
            Assert.False(request.IsAddFailed);
            Assert.Equal(0, request.CommentCount);
            Assert.False(request.HasConversation);
        });
        Assert.Empty(RequestHistory.CouldntAdd(history));
        Assert.Equal(history.Count, RequestHistory.Past(history).Count);
    }

    [Fact]
    public void PendingRequestsSayWhenTheyChanged()
    {
        var pending = Fixtures.Decode<PendingRequests>("requests-pending").Results;

        Assert.Null(pending[0].EditedAt);
        Assert.False(pending[0].WasEdited);
        Assert.Equal(1, pending[0].CommentCount);
        Assert.True(pending[0].HasConversation);

        Assert.Equal(Json.ParseDate("2026-09-17T17:20:40.310Z"), pending[1].EditedAt);
        Assert.True(pending[1].WasEdited);
        Assert.Equal(0, pending[1].CommentCount);
        Assert.Equal("Changed since asking", RequestLifecycle.ChangedSinceAsking);
    }

    [Fact]
    public void HistoryListsCouldntAddFirstAndApart()
    {
        var history = Fixtures.Decode<ListResponse<ReviewedRequest>>("requests-history").Results;

        var failed = history[0];
        Assert.Equal("Blade Runner", failed.Title);
        Assert.Equal(RequestStatus.Approved, failed.Status);
        Assert.NotNull(failed.AddFailed);
        Assert.Equal("Couldn't add this movie to Radarr.", failed.AddFailed.Error);
        Assert.Equal(Json.ParseDate("2026-09-17T19:02:00.000Z"), failed.AddFailed.Since);
        Assert.True(failed.IsAddFailed);
        Assert.Null(failed.AddedTo);
        Assert.Equal(0, failed.CommentCount);

        Assert.Null(history[1].AddFailed);
        Assert.Equal(1, history[1].CommentCount);
        Assert.Null(history[2].AddFailed);

        var couldntAdd = RequestHistory.CouldntAdd(history);
        Assert.Equal(["Blade Runner"], couldntAdd.Select(request => request.Title));
        var past = RequestHistory.Past(history);
        Assert.Equal(["The Matrix", "Dune"], past.Select(request => request.Title));

        Assert.Equal(
            "member1 · approved Sep 17, 2026 · last tried Sep 17, 2026 7:02 PM",
            failed.CouldntAddLine("Sep 17, 2026", "Sep 17, 2026 7:02 PM"));
    }

    [Fact]
    public void OnlyAnApprovedRequestIsUnderCouldntAdd()
    {
        var failed = Fixtures.Decode<ListResponse<ReviewedRequest>>("requests-history").Results[0];
        var declined = failed with { Status = RequestStatus.Rejected };
        Assert.False(declined.IsAddFailed);
        Assert.Equal([declined], RequestHistory.Past([declined]));
    }

    // MARK: Problem reports, badges, notifications, title

    [Fact]
    public void IssuesCarryTheirCommentCount()
    {
        var issue = Assert.Single(Fixtures.Decode<IssuesResponse>("issues").Results);
        Assert.Equal(1, issue.CommentCount);
        Assert.True(issue.HasConversation);

        var older = Json.Decode<IssuesResponse>(WithoutNewKeys("issues", "commentCount"));
        Assert.Equal(0, older.Results[0].CommentCount);
        Assert.False(older.Results[0].HasConversation);
    }

    [Fact]
    public void BadgesCountCouldntAdd()
    {
        var badges = Fixtures.Decode<Badges>("badges");
        Assert.Equal(0, badges.FailedRequests);
        Assert.Equal(badges.PendingRequests + badges.OpenIssues + badges.NotFoundRequests + badges.FailedRequests, badges.RequestsBadge);

        var failing = Json.Decode<Badges>("""{"unreadNotifications":0,"pendingRequests":1,"openIssues":1,"notFoundRequests":1,"failedRequests":2}""");
        Assert.Equal(2, failing.FailedRequests);
        Assert.Equal(5, failing.RequestsBadge);

        var older = Json.Decode<Badges>("""{"unreadNotifications":2,"pendingRequests":3,"openIssues":1,"notFoundRequests":1}""");
        Assert.Equal(0, older.FailedRequests);
        Assert.Equal(5, older.RequestsBadge);
    }

    [Fact]
    public void TitleViewerListsYourRequests()
    {
        var detail = Fixtures.Decode<TitleDetail>("title-detail");
        Assert.Empty(detail.Viewer.MyRequests);

        var root = JsonNode.Parse(Fixtures.Read("title-detail"))!;
        root["viewer"]!.AsObject().Remove("myRequests");
        Assert.Empty(Json.Decode<TitleDetail>(root.ToJsonString()).Viewer.MyRequests);

        root["viewer"]!["myRequests"] = JsonNode.Parse("""
            [{"id":"5b0f1d8e-8a8c-4f5e-9d51-1f0c7a0e2b44","status":"pending","seasons":[2],"seasonsLabel":"Season 2",
              "is4k":false,"canEdit":true,"canCancel":true,"commentCount":0,"createdAt":"2026-09-17T17:10:02.001Z"},
             {"id":"28713d50-27f2-4230-9c95-c1e6a000f6c0","status":"approved","seasons":null,"seasonsLabel":null,
              "is4k":true,"canEdit":false,"canCancel":false,"commentCount":3,"createdAt":"2026-09-16T17:10:02.001Z"}]
            """);
        var mine = Json.Decode<TitleDetail>(root.ToJsonString()).Viewer.MyRequests;
        Assert.Equal(2, mine.Count);

        Assert.Equal(SeveranceId, mine[0].Id);
        Assert.True(mine[0].CanEdit);
        Assert.True(mine[0].CanCancel);
        Assert.Equal([2], mine[0].Seasons!);
        Assert.Equal("Your request (Season 2) is waiting for review", mine[0].Line);
        Assert.Null(mine[0].ChangeHint);
        Assert.Equal(Json.ParseDate("2026-09-17T17:10:02.001Z"), mine[0].CreatedAt);

        Assert.Equal(MatrixId, mine[1].Id);
        Assert.Equal(3, mine[1].CommentCount);
        Assert.Equal("Your request (In 4K) is approved", mine[1].Line);
        Assert.Equal("Need a change? Ask in its comments.", mine[1].ChangeHint);
    }

    [Theory]
    [InlineData("pending", null, "Your request is waiting for review")]
    [InlineData("rejected", "Seasons 1–3", "Your request (Seasons 1–3) is declined")]
    [InlineData("approved", "Specials", "Your request (Specials) is approved")]
    [InlineData("archived", null, "Your request is archived")]
    public void TitleRequestLineMatchesTheWebsite(string status, string? label, string expected)
    {
        var request = new TitleRequestSummary { Id = SeveranceId, Status = new RequestStatus(status), SeasonsLabel = label };
        Assert.Equal(expected, request.Line);
    }

    [Fact]
    public void TitleRequestLineFallsBackToItsOwnSeasonsLabel()
    {
        var request = new TitleRequestSummary { Id = SeveranceId, Status = RequestStatus.Pending, Seasons = [1, 2, 3, 5] };
        Assert.Equal("Your request (Seasons 1–3, 5) is waiting for review", request.Line);
    }

    // MARK: Edit options and the edit dialog

    [Fact]
    public void EditOptionsDecode()
    {
        var options = Fixtures.Decode<RequestEditOptions>("request-edit-options");

        Assert.Equal(SeveranceId, options.RequestId);
        Assert.Equal(MediaType.Tv, options.MediaType);
        Assert.True(options.IsTv);
        Assert.Equal("Severance", options.Title);
        Assert.Equal([2], options.Seasons!);
        Assert.False(options.Is4k);
        Assert.True(options.FourKAvailable);
        Assert.False(options.HasNothingToChange);

        Assert.Equal(2, options.SeasonRows.Count);
        Assert.Equal(2, options.SeasonRows[0].SeasonNumber);
        Assert.Equal("Season 2", options.SeasonRows[0].Name);
        Assert.Equal(10, options.SeasonRows[0].EpisodeCount);
        Assert.Equal(EditSeasonState.Requestable, options.SeasonRows[0].State);
        Assert.Equal(SeasonRequestState.Requestable, options.SeasonRows[0].State.PickerState);
        Assert.Equal(EditSeasonState.Complete, options.SeasonRows[1].State);
        Assert.Equal(SeasonRequestState.InLibrary, options.SeasonRows[1].State.PickerState);
        Assert.Equal("In library", options.SeasonRows[1].State.PickerState.Tag());
    }

    [Theory]
    [InlineData("monitored", SeasonRequestState.Monitored)]
    [InlineData("requested", SeasonRequestState.Requested)]
    [InlineData("unavailable", SeasonRequestState.Unavailable)]
    [InlineData("vaulted", SeasonRequestState.Unavailable)]
    public void EditSeasonStatesMapToThePickersTags(string wire, SeasonRequestState expected)
    {
        var state = Json.Decode<EditSeasonState>($"\"{wire}\"");
        Assert.Equal(expected, state.PickerState);
        Assert.Equal(wire != "vaulted", state.IsKnown);
    }

    private static RequestEditOptions Show(IReadOnlyList<int>? seasons, bool is4k = false, bool fourKAvailable = true) => new()
    {
        RequestId = SeveranceId,
        MediaType = MediaType.Tv,
        Title = "Severance",
        Seasons = seasons,
        Is4k = is4k,
        FourKAvailable = fourKAvailable,
        SeasonRows =
        [
            new() { SeasonNumber = 3, Name = "Season 3", EpisodeCount = 10, State = EditSeasonState.Requestable },
            new() { SeasonNumber = 2, Name = "Season 2", EpisodeCount = 10, State = EditSeasonState.Requestable },
            new() { SeasonNumber = 1, Name = "Season 1", EpisodeCount = 9, State = EditSeasonState.Complete },
        ],
    };

    private static RequestEditOptions Movie(bool is4k = false, bool fourKAvailable = true) => new()
    {
        RequestId = MatrixId,
        MediaType = MediaType.Movie,
        Title = "The Matrix",
        Seasons = null,
        Is4k = is4k,
        FourKAvailable = fourKAvailable,
    };

    [Fact]
    public void EditFormStartsFromTheRequest()
    {
        var form = new RequestEditForm(Show([2]));

        Assert.True(form.IsTv);
        Assert.False(form.WholeSeries);
        Assert.False(form.Is4k);
        Assert.Equal([2], form.Selection.Seasons);
        Assert.Equal([3, 2], form.Selection.Requestable);
        Assert.True(form.ListEnabled);
        Assert.True(form.ScopeEnabled);
        Assert.True(form.OffersFourK);
        Assert.Equal("In 4K (always the whole show)", form.FourKLabel);
        Assert.True(form.CanSave);
        Assert.Equal("Change request", RequestEditForm.Heading);
        Assert.Equal("Save changes", RequestEditForm.SubmitTitle(false));
        Assert.Equal("Saving…", RequestEditForm.SubmitTitle(true));

        // A whole-series request starts on "The whole series", nothing ticked.
        var whole = new RequestEditForm(Show(null));
        Assert.True(whole.WholeSeries);
        Assert.False(whole.ListEnabled);
        Assert.Empty(whole.Selection.Seasons);
        Assert.True(whole.CanSave);
    }

    [Fact]
    public void EditFormSendsWhatTheWebsiteSends()
    {
        var form = new RequestEditForm(Show([2]));
        form.Selection.Set(3, true);
        Assert.Equal("""{"seasons":[2,3],"is4k":false}""", form.Edit.ToJson().ToJsonString());

        // Nothing ticked: Save waits.
        form.Selection.Set(2, false);
        form.Selection.Set(3, false);
        Assert.False(form.CanSave);

        // "The whole series": seasons null, whatever is ticked.
        form.WholeSeries = true;
        Assert.True(form.CanSave);
        Assert.Equal("""{"seasons":null,"is4k":false}""", form.Edit.ToJson().ToJsonString());

        // 4K is always the whole show: the scope and the list give way.
        form.WholeSeries = false;
        form.Selection.Set(3, true);
        form.Is4k = true;
        Assert.False(form.ScopeEnabled);
        Assert.False(form.ListEnabled);
        Assert.True(form.CanSave);
        Assert.Equal("""{"seasons":null,"is4k":true}""", form.Edit.ToJson().ToJsonString());
    }

    [Fact]
    public void EditFormForAMovieOnlyOffers4K()
    {
        var movie = new RequestEditForm(Movie());
        Assert.False(movie.IsTv);
        Assert.False(movie.ScopeEnabled);
        Assert.False(movie.ListEnabled);
        Assert.Equal("In 4K", movie.FourKLabel);
        Assert.True(movie.CanSave);
        movie.Is4k = true;
        // A movie never sends seasons at all.
        Assert.Equal("""{"is4k":true}""", movie.Edit.ToJson().ToJsonString());

        var without4K = new RequestEditForm(Movie(fourKAvailable: false));
        Assert.True(without4K.HasNothingToChange);
        Assert.False(without4K.CanSave);
        Assert.Equal("There's nothing to change: 4K isn't set up on this server.", RequestEditForm.NothingToChangeMessage);
    }

    [Fact]
    public void RequestEditTellsAbsentFromNullSeasons()
    {
        Assert.Equal("""{"seasons":[1,2,5]}""", RequestEdit.JustSeasons([5, 2, 1, 2]).ToJson().ToJsonString());
        Assert.Equal("""{"seasons":null}""", RequestEdit.WholeSeries().ToJson().ToJsonString());
        Assert.Equal("""{"seasons":null,"is4k":true}""", RequestEdit.WholeSeries(true).ToJson().ToJsonString());
        Assert.Equal("""{"is4k":false}""", RequestEdit.FourK(false).ToJson().ToJsonString());

        var only4K = RequestEdit.FourK(true);
        Assert.False(only4K.ChangesSeasons);
        Assert.False(only4K.ToJson().ContainsKey("seasons"));
        Assert.True(RequestEdit.WholeSeries().ToJson().ContainsKey("seasons"));
    }

    // MARK: Conversations

    [Fact]
    public void CommentThreadDecodes()
    {
        var thread = Fixtures.Decode<CommentThread>("comment-thread");

        Assert.True(thread.CanComment);
        Assert.Equal(2000, thread.MaxLength);
        Assert.Equal(2, thread.Results.Count);
        // The report's own note doesn't count; the one real comment does.
        Assert.Equal(1, thread.CommentCount);

        var note = thread.Results[0];
        Assert.Equal("report:83bedf64-c5d8-4f43-98a0-bb615c4b9897", note.Id);
        Assert.Equal(CommentKind.Report, note.Kind);
        Assert.False(note.IsComment);
        Assert.Equal("Reported", note.Kind.NoteLabel);
        Assert.Equal("2d0b6e1a-8f3c-4a5d-9e7b-1c2d3e4f5a6b", note.Author.UserId);
        Assert.Equal("Member", note.Author.Label);
        Assert.Null(note.Author.AvatarUrl);
        Assert.Equal(CommentRole.Member, note.Author.Role);
        Assert.Null(note.Author.Role?.Tag);
        Assert.Equal("Out of sync after 20 minutes", note.Body);
        Assert.Equal(Json.ParseDate("2026-09-26T02:40:11.000Z"), note.CreatedAt);
        Assert.Null(note.EditedAt);
        Assert.True(note.IsMine);
        Assert.False(note.CanEdit);
        Assert.False(note.CanDelete);
        Assert.Null(note.EditableUntil);
        Assert.Equal("Reported · Sep 26, 2:40 AM", note.MetaLine("Sep 26, 2:40 AM"));

        var comment = thread.Results[1];
        Assert.Equal(CommentKind.Comment, comment.Kind);
        Assert.True(comment.IsComment);
        Assert.Null(comment.Kind.NoteLabel);
        Assert.Equal("Tess", comment.Author.Label);
        Assert.Equal(CommentRole.Reviewer, comment.Author.Role);
        Assert.Equal("Reviewer", comment.Author.Role?.Tag);
        Assert.Equal("/api/v1/users/11111111-2222-4333-8444-555555555555/avatar?v=1758220800000", comment.Author.AvatarUrl);
        Assert.Equal("Which episode?\nI'll swap the file tonight.", comment.BodyText.ReplaceLineEndings("\n"));
        Assert.True(comment.WasEdited);
        Assert.False(comment.IsMine);
        Assert.Equal("Reviewer · Sep 26, 3:02 AM · edited", comment.MetaLine("Sep 26, 3:02 AM"));
    }

    [Fact]
    public void AGoneAuthorAndUnknownKindsStillDecode()
    {
        var comment = Json.Decode<Comment>("""
            {"id":"c1","kind":"pinned","author":{"userId":null,"label":"Someone","avatarUrl":null,"role":null},
             "body":"Hi","createdAt":"2026-09-26T03:02:40.000Z","editedAt":null,"isMine":false,"canEdit":false,
             "canDelete":true,"editableUntil":null}
            """);
        Assert.False(comment.Kind.IsKnown);
        Assert.Null(comment.Kind.NoteLabel);
        Assert.Null(comment.Author.Role);
        Assert.Equal("Someone", comment.Author.Label);
        Assert.True(comment.CanDelete);
        Assert.Equal("5:00 PM", comment.MetaLine("5:00 PM"));

        var admin = comment with { Kind = CommentKind.Declined, Author = comment.Author with { Role = CommentRole.Admin } };
        Assert.Equal("Admin · Declined · 5:00 PM", admin.MetaLine("5:00 PM"));
        Assert.Equal("Marked fixed", CommentKind.Resolution.NoteLabel);
        Assert.Null(new CommentRole("owner").Tag);
    }

    [Theory]
    [InlineData(0, false, "Comment")]
    [InlineData(1, false, "Comments (1)")]
    [InlineData(2, false, "Comments (2)")]
    [InlineData(2, true, "Hide comments")]
    [InlineData(0, true, "Hide comments")]
    public void ToggleLabelMatchesTheWebsite(int count, bool open, string expected)
    {
        Assert.Equal(expected, CommentText.ToggleLabel(count, open));
    }

    [Theory]
    [InlineData(0, 2000, "")]
    [InlineData(1800, 2000, "")]
    [InlineData(1801, 2000, "199 left")]
    [InlineData(2000, 2000, "0 left")]
    public void RemainingShowsNearTheLimit(int length, int max, string expected)
    {
        Assert.Equal(expected, CommentText.RemainingLabel(length, max));
    }

    [Fact]
    public void DraftsAreTrimmedWithPlainLineBreaks()
    {
        Assert.Equal(("Hello\nthere", (string?)null), CommentText.Prepare("  Hello\r\nthere \n"));
        // A WinUI text box breaks lines with a lone \r.
        Assert.Equal(("One\nTwo", (string?)null), CommentText.Prepare("One\rTwo"));
        Assert.Equal(((string?)null, "Write something first."), CommentText.Prepare(" \r\n "));
        Assert.Equal(((string?)null, "Write something first."), CommentText.Prepare(null));
        Assert.Equal(((string?)null, "Keep it under 5 characters."), CommentText.Prepare("123456", 5));
        Assert.Equal(("12345", (string?)null), CommentText.Prepare("12345", 5));
        Assert.False(CommentText.HasText("  "));
        Assert.True(CommentText.HasText(" x "));
    }

    [Fact]
    public void CommentBodyEncodesTheTextOnly()
    {
        Assert.Equal("""{"body":"Could it be the 4K one?"}""", Json.EncodeBodyToString(new CommentBody("Could it be the 4K one?")));
        Assert.Equal("requests", CommentSubject.Request.PathSegment());
        Assert.Equal("issues", CommentSubject.Issue.PathSegment());
    }
}
