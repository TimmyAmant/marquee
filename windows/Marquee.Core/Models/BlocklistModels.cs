namespace Marquee.Core.Models;

// The request blocklist (api-v1.md section 7, "Request blocklist (0.41+)"):
// single titles and TMDb keywords/genres nobody may request. An older server
// leaves the title's viewer.blocked out and answers 404 for
// /settings/blocklist; the app then shows none of this.

/// <summary>
/// <c>viewer.blocked</c> (0.41+): the title is on the admin's blocklist, so
/// <c>canRequest</c>, <c>canRequestSeasons</c> and <c>fourK.canRequest</c>
/// are already false. <see cref="Keyword"/> is set when a keyword or genre
/// did it (then it can only be unblocked from Settings).
/// </summary>
public sealed record TitleBlock
{
    /// <summary>The admin's reason, shown to whoever asks; null when none was given.</summary>
    public string? Reason { get; init; }

    /// <summary>The TMDb keyword or genre that blocked it, lower-case; null when the title itself is blocked.</summary>
    public string? Keyword { get; init; }

    /// <summary>A member's pill (components/add-to-library-button.tsx): "Requests are closed for this title — Already on Max."</summary>
    public string MemberLine =>
        Reason.NonBlank() is { } reason ? $"Requests are closed for this title — {reason}" : "Requests are closed for this title";

    /// <summary>The admin's pill when a keyword did it: "Requests blocked by “anime”"; null for a title blocked directly.</summary>
    public string? KeywordLine => Keyword.NonBlank() is { } keyword ? $"Requests blocked by “{keyword}”" : null;
}

public readonly record struct BlocklistKind(string Value) : IOpenEnum<BlocklistKind>
{
    public static readonly BlocklistKind Title = new("title");
    public static readonly BlocklistKind Keyword = new("keyword");

    public static IReadOnlyList<BlocklistKind> Known { get; } = [Title, Keyword];
    public static BlocklistKind FromValue(string value) => new(value);
    public bool IsKnown => Known.Contains(this);
    public override string ToString() => Value;
}

/// <summary>One row of <c>GET /settings/blocklist</c> (admin): keywords first, then titles.</summary>
public sealed record BlocklistEntry
{
    public required Guid Id { get; init; }
    public required BlocklistKind Kind { get; init; }

    /// <summary>A title's type and id; null for a keyword.</summary>
    public MediaType? MediaType { get; init; }
    public int? TmdbId { get; init; }

    /// <summary>A title's name as it was when blocked.</summary>
    public string? Title { get; init; }

    /// <summary>A TMDb keyword or genre, lower-case.</summary>
    public string? Keyword { get; init; }

    public string? Reason { get; init; }
    public required DateTimeOffset CreatedAt { get; init; }

    /// <summary>The title this row links to; null for a keyword (or a title row missing its id).</summary>
    public TitleId? TitleId =>
        Kind == BlocklistKind.Title && MediaType is { } type && TmdbId is { } id ? new TitleId(type, id) : null;

    /// <summary>What the website's list prints: the title's name (or "#438631"), else "Keyword: anime".</summary>
    public string Label
    {
        get
        {
            if (TitleId is { } title)
            {
                return Title.NonBlank() ?? $"#{title.TmdbId}";
            }
            return $"Keyword: {Keyword}";
        }
    }
}

/// <summary><c>POST /titles/{type}/{tmdbId}/block</c> body; without a reason no body is sent.</summary>
public sealed record BlockTitleBody(string Reason);

/// <summary><c>POST /settings/blocklist</c> body; a blank reason is left out.</summary>
public sealed record BlockKeywordBody(string Keyword, string? Reason = null);
