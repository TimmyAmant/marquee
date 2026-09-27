using Marquee.Core.Localization;
using Marquee.Core.Models;

namespace Marquee.Core.Api;

/// <summary>
/// What to say when a request-lifecycle or conversation call is refused.
/// Forbidden and NotFound carry the app's generic wording ("Only an admin can
/// do that.", as the Mac's APIError), which reads wrong here: a member may
/// cancel their own request, and a comment's author edits it. These give the
/// server's own words for the case each endpoint documents instead; every
/// other kind keeps its message.
/// </summary>
public static class LifecycleErrors
{
    public static string RequestNotFound => Loc.Get("Api_RequestNotFound");
    public static string OnlyTheRequesterCancels => Loc.Get("Api_OnlyRequesterCancels");
    public static string CommentNotFound => Loc.Get("Api_CommentNotFound");
    public static string CommentTooOld => Loc.Get("Api_CommentTooOld");

    /// <summary>Edit, its options, and Cancel on a request.</summary>
    public static string ForRequestChange(ApiException error) => error.Kind switch
    {
        ApiErrorKind.NotFound => RequestNotFound,
        ApiErrorKind.Forbidden => OnlyTheRequesterCancels,
        _ => error.Message,
    };

    /// <summary>Editing or deleting a comment (only ever offered on one the viewer may change).</summary>
    public static string ForComment(ApiException error) => error.Kind switch
    {
        ApiErrorKind.NotFound => CommentNotFound,
        ApiErrorKind.Forbidden => CommentTooOld,
        _ => error.Message,
    };

    /// <summary>Loading a thread: one the viewer isn't part of (or an older server's 404) can't be read.</summary>
    public static string ForThread(ApiException error) => error.Kind switch
    {
        ApiErrorKind.NotFound or ApiErrorKind.Forbidden => CommentText.LoadFailed,
        _ => error.Message.NonBlank() ?? CommentText.LoadFailed,
    };
}
