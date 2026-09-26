using Marquee.Core.Models;

namespace Marquee.Core.Api;

/// <summary>
/// components/comment-thread.tsx's CommentPanel without the controls: one
/// request's or problem report's conversation, loaded when it's opened,
/// reloaded after every change made through it. The view model wraps it and
/// raises its own change notifications; this class holds the state and the
/// rules, so they can be tested without the UI.
///
/// Awaits resume on the caller's context (no <c>ConfigureAwait(false)</c>):
/// the view model calls it from the UI thread and reads the state after.
/// </summary>
public sealed class CommentThreadModel
{
    private readonly Func<MarqueeApi> api;

    /// <param name="api">The session's API, read at each call (a sign-in swaps it).</param>
    /// <param name="count">The list's <c>commentCount</c>, shown until the thread has loaded.</param>
    public CommentThreadModel(Func<MarqueeApi> api, CommentSubject subject, Guid id, int count)
    {
        this.api = api;
        Subject = subject;
        Id = id;
        Count = count;
    }

    public CommentSubject Subject { get; }
    public Guid Id { get; }

    /// <summary>The real comments: the list's count until the thread has loaded, then the thread's.</summary>
    public int Count { get; private set; }

    /// <summary>Null until the first load succeeds.</summary>
    public CommentThread? Thread { get; private set; }

    /// <summary>The last load's failure, while there's no thread to show.</summary>
    public string? LoadError { get; private set; }

    public bool IsLoaded => Thread != null;

    /// <summary>The viewer may write in it (false until loaded).</summary>
    public bool CanComment => Thread?.CanComment == true;

    public int MaxLength => Thread?.MaxLength ?? CommentText.DefaultMaxLength;

    public IReadOnlyList<Comment> Comments => Thread?.Results ?? [];

    private CommentsEndpoints Endpoints => api().Comments(Subject);

    /// <summary>
    /// A fresh <c>commentCount</c> from a list reload: taken while the thread
    /// hasn't loaded (once it has, its own count is newer).
    /// </summary>
    public void UpdateCount(int count)
    {
        if (!IsLoaded)
        {
            Count = count;
        }
    }

    /// <summary>
    /// <c>GET …/comments</c>. A failure keeps an already loaded thread (and
    /// says so only when there's nothing to show); cancellation changes nothing.
    /// </summary>
    public async Task LoadAsync(CancellationToken ct = default)
    {
        try
        {
            var fresh = await Endpoints.ListAsync(Id, ct);
            Thread = fresh;
            Count = fresh.CommentCount;
            LoadError = null;
        }
        catch (ApiException error) when (!error.IsCancellation)
        {
            if (Thread == null)
            {
                LoadError = LifecycleErrors.ForThread(error);
            }
        }
    }

    /// <summary>
    /// "Send": the draft as <see cref="CommentText.Prepare"/> makes it, then
    /// the thread again. Returns the message to show under the box, or null
    /// once it's posted (the caller then clears the box).
    /// </summary>
    public async Task<string?> SendAsync(string? draft, CancellationToken ct = default)
    {
        var (body, error) = CommentText.Prepare(draft, MaxLength);
        if (body == null)
        {
            return error;
        }
        try
        {
            await Endpoints.AddAsync(Id, body, ct);
        }
        catch (ApiException failure)
        {
            return failure.Message;
        }
        await LoadAsync(ct);
        return null;
    }

    /// <summary>A comment's "Save": the new text, then the thread again. Null once saved.</summary>
    public async Task<string?> EditAsync(string commentId, string? draft, CancellationToken ct = default)
    {
        var (body, error) = CommentText.Prepare(draft, MaxLength);
        if (body == null)
        {
            return error;
        }
        try
        {
            await Endpoints.EditAsync(Id, commentId, body, ct);
        }
        catch (ApiException failure)
        {
            return LifecycleErrors.ForComment(failure);
        }
        await LoadAsync(ct);
        return null;
    }

    /// <summary>A comment's "Delete", then the thread again. A comment that's already gone just reloads. Null once done.</summary>
    public async Task<string?> DeleteAsync(string commentId, CancellationToken ct = default)
    {
        try
        {
            await Endpoints.DeleteAsync(Id, commentId, ct);
        }
        catch (ApiException failure)
        {
            if (failure.Kind != ApiErrorKind.NotFound)
            {
                return LifecycleErrors.ForComment(failure);
            }
        }
        await LoadAsync(ct);
        return null;
    }
}
