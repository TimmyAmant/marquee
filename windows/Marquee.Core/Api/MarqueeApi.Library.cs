using Marquee.Core.Models;

namespace Marquee.Core.Api;

// The Library page (api-v1.md section 17, 0.51+). All four are reads; a
// server older than 0.51 answers NotFound on each, so the section hides.

public sealed partial class MarqueeApi
{
    public LibraryEndpoints Library => new(transport);
}

public sealed class LibraryEndpoints(MarqueeApi.Transport transport)
{
    /// <summary>
    /// <c>GET /library</c>: one page of the library, filtered and sorted.
    /// Continue while <see cref="LibraryPage.HasMorePages"/>. The counts
    /// and filter choices describe the whole library, not the page.
    /// </summary>
    public Task<LibraryPage> PageAsync(LibraryQuery? query = null, int page = 1, CancellationToken ct = default) =>
        transport.GetAsync<LibraryPage>("/library", (query ?? LibraryQuery.Default).ToQuery(page), ct: ct);

    /// <summary>
    /// <c>GET /library/collections-missing</c>: every franchise the library
    /// has part of but not all of, A–Z. TMDb collections are fetched live,
    /// hence the TMDb timeout.
    /// </summary>
    public Task<IReadOnlyList<LibraryCollection>> CollectionsMissingAsync(CancellationToken ct = default) =>
        transport.GetListAsync<LibraryCollection>("/library/collections-missing", timeout: MarqueeApi.Timeouts.Tmdb, ct: ct);

    /// <summary><c>GET /library/duplicates</c> (admin; Forbidden for members): titles in more than one file or on more than one server, A–Z.</summary>
    public Task<IReadOnlyList<LibraryDuplicate>> DuplicatesAsync(CancellationToken ct = default) =>
        transport.GetListAsync<LibraryDuplicate>("/library/duplicates", ct: ct);

    /// <summary><c>GET /library/storage</c>: free space per root folder and the forecast. Asks the servers live, hence the longer timeout.</summary>
    public Task<LibraryStorage> StorageAsync(CancellationToken ct = default) =>
        transport.GetAsync<LibraryStorage>("/library/storage", timeout: MarqueeApi.Timeouts.Integrations, ct: ct);
}
