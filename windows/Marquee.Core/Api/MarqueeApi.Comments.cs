using Marquee.Core.Models;

namespace Marquee.Core.Api;

// Conversations (api-v1.md section 7, "Conversations (0.46+)"): a request's
// or a problem report's thread between whoever asked and the reviewers. The
// two live under /requests/{id}/comments and /issues/{id}/comments and behave
// the same, so one class serves both. Nothing is recorded as a change: the
// open thread reloads itself, and a Requests reload would rebuild every row
// (folding the thread being written in) for a count only it shows.

public sealed partial class MarqueeApi
{
    /// <summary>A request's conversation (<c>/requests/{id}/comments</c>).</summary>
    public CommentsEndpoints RequestComments => new(transport, CommentSubject.Request);

    /// <summary>A problem report's conversation (<c>/issues/{id}/comments</c>).</summary>
    public CommentsEndpoints IssueComments => new(transport, CommentSubject.Issue);

    /// <summary>The conversation of either kind.</summary>
    public CommentsEndpoints Comments(CommentSubject subject) => new(transport, subject);
}

public sealed class CommentsEndpoints(MarqueeApi.Transport transport, CommentSubject subject)
{
    public CommentSubject Subject { get; } = subject;

    private string Path(Guid id) => $"/{Subject.PathSegment()}/{MarqueeApi.Segment(id)}/comments";

    private string Path(Guid id, string commentId) => $"{Path(id)}/{MarqueeApi.Segment(commentId)}";

    /// <summary>
    /// <c>GET …/{id}/comments</c>: oldest first, with whether the viewer may
    /// add to it. NotFound for anyone who isn't part of it (and on an older server).
    /// </summary>
    public Task<CommentThread> ListAsync(Guid id, CancellationToken ct = default) =>
        transport.GetAsync<CommentThread>(Path(id), ct: ct);

    /// <summary>
    /// <c>POST …/{id}/comments</c> with <c>{"body": …}</c>; returns the new
    /// comment's id. Invalid "Write something first." / "Keep it under 2000
    /// characters.", Conflict "This conversation is full.", RateLimited.
    /// </summary>
    public async Task<string?> AddAsync(Guid id, string body, CancellationToken ct = default)
    {
        var result = await transport.MutateAsync<AddCommentResult>(HttpMethod.Post, Path(id), body: new CommentBody(body), ct: ct)
            .ConfigureAwait(false);
        return result.CommentId;
    }

    /// <summary>
    /// <c>PATCH …/{id}/comments/{commentId}</c>: your own, within 15 minutes.
    /// Forbidden "You can only edit your own comments." / "Comments can only
    /// be changed for 15 minutes after posting.", NotFound "Comment not found."
    /// </summary>
    public Task EditAsync(Guid id, string commentId, string body, CancellationToken ct = default) =>
        transport.MutateAsync<OK>(HttpMethod.Patch, Path(id, commentId), body: new CommentBody(body), ct: ct);

    /// <summary><c>DELETE …/{id}/comments/{commentId}</c>: your own within 15 minutes, or (the admin) any.</summary>
    public Task DeleteAsync(Guid id, string commentId, CancellationToken ct = default) =>
        transport.MutateAsync<OK>(HttpMethod.Delete, Path(id, commentId), ct: ct);
}
