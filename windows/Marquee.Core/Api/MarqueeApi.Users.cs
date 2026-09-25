using Marquee.Core.Models;

namespace Marquee.Core.Api;

// Household accounts (api-v1.md section 11): the member list under
// Settings > Account, "Add a household member", the edit form and "Remove".

public sealed partial class MarqueeApi
{
    public UsersEndpoints Users => new(transport);
}

public sealed class UsersEndpoints(MarqueeApi.Transport transport)
{
    /// <summary><c>GET /users</c>: every account, oldest first (admin); only your own (member).</summary>
    public Task<IReadOnlyList<HouseholdMember>> ListAsync(CancellationToken ct = default) =>
        transport.GetListAsync<HouseholdMember>("/users", ct: ct);

    /// <summary>
    /// <c>POST /users</c> (admin): "Add a household member", answered with
    /// the new row (201). Errors: Invalid (the validation message), Conflict
    /// "An account with that username already exists", Forbidden for a
    /// member.
    /// </summary>
    public Task<HouseholdMember> CreateAsync(CreateUserRequest request, CancellationToken ct = default) =>
        transport.MutateAsync<HouseholdMember>(HttpMethod.Post, "/users", body: request, changes: ServerChange.Users, ct: ct);

    /// <summary>
    /// <c>PATCH /users/{id}</c>: yourself, or anyone (admin). When the
    /// result's <c>TokensRevoked</c> is true and it's your own account, this
    /// PC is signed out (deviation 5). Errors: Forbidden "You can only edit
    /// your own account.", NotFound, Invalid, Conflict for a taken username.
    /// </summary>
    public Task<UpdateUserResult> UpdateAsync(Guid id, UpdateUserRequest request, CancellationToken ct = default) =>
        transport.MutateAsync<UpdateUserResult>(
            HttpMethod.Patch, $"/users/{MarqueeApi.Segment(id)}",
            body: request, changes: ServerChange.Users, ct: ct);

    /// <summary>
    /// <c>DELETE /users/{id}</c> (admin): removes a member and everything of
    /// theirs (favorites, requests, tokens), which is why the request queue
    /// and notifications reload too. Errors: Forbidden for your own account,
    /// the admin account or a member calling it; NotFound.
    /// </summary>
    public Task RemoveAsync(Guid id, CancellationToken ct = default) =>
        transport.MutateAsync<OK>(
            HttpMethod.Delete, $"/users/{MarqueeApi.Segment(id)}",
            changes: ServerChange.Users | ServerChange.Requests | ServerChange.Notifications, ct: ct);

    // MARK: Profile photo

    /// <summary>The server's upload cap; a bigger photo is refused here, before it's sent.</summary>
    public const int MaxAvatarBytes = 15 * 1024 * 1024;

    /// <summary>The server's words for a photo over <see cref="MaxAvatarBytes"/>.</summary>
    public const string AvatarTooBigMessage = "That photo is too big. Pick one under 15 MB.";

    /// <summary>
    /// <c>PUT /users/{id}/avatar</c>: yourself, or anyone (admin). The body
    /// is the image file itself (JPEG, PNG, WebP, GIF or AVIF) with its own
    /// content type; the server turns it upright, crops a square, re-encodes
    /// it as JPEG and drops its metadata. Answers the new <c>avatarUrl</c>.
    /// Errors: Invalid ("That file isn't a photo Marquee can read…", HEIC
    /// included, or too big), Forbidden, NotFound.
    /// </summary>
    public Task<AvatarResult> SetAvatarAsync(Guid id, byte[] image, string contentType, CancellationToken ct = default)
    {
        if (image.Length > MaxAvatarBytes)
        {
            return Task.FromException<AvatarResult>(ApiException.Invalid(AvatarTooBigMessage));
        }
        return transport.MutateBytesAsync<AvatarResult>(
            HttpMethod.Put, AvatarPath(id), image, contentType,
            timeout: MarqueeApi.Timeouts.Upload, changes: ServerChange.Users, ct: ct);
    }

    /// <summary>
    /// <see cref="SetAvatarAsync(Guid, byte[], string, CancellationToken)"/>
    /// from a stream, read here (up to the cap) before anything is sent.
    /// </summary>
    public async Task<AvatarResult> SetAvatarAsync(Guid id, Stream image, string contentType, CancellationToken ct = default)
    {
        using var buffer = new MemoryStream();
        var chunk = new byte[81920];
        while (true)
        {
            int read;
            try
            {
                read = await image.ReadAsync(chunk, ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException error)
            {
                throw ApiException.Wrap(error, ct);
            }
            catch (Exception error) when (error is IOException or NotSupportedException or ObjectDisposedException)
            {
                throw ApiException.Invalid($"Couldn't read the photo: {error.Message}");
            }
            if (read == 0)
            {
                break;
            }
            if (buffer.Length + read > MaxAvatarBytes)
            {
                throw ApiException.Invalid(AvatarTooBigMessage);
            }
            buffer.Write(chunk, 0, read);
        }
        return await SetAvatarAsync(id, buffer.ToArray(), contentType, ct).ConfigureAwait(false);
    }

    /// <summary><c>DELETE /users/{id}/avatar</c>: back to initials (fine when there was no photo). Answers a null <c>avatarUrl</c>.</summary>
    public Task<AvatarResult> RemoveAvatarAsync(Guid id, CancellationToken ct = default) =>
        transport.MutateAsync<AvatarResult>(HttpMethod.Delete, AvatarPath(id), changes: ServerChange.Users, ct: ct);

    private static string AvatarPath(Guid id) => $"/users/{MarqueeApi.Segment(id)}/avatar";

    // MARK: Plex / Jellyfin members

    /// <summary>
    /// <c>GET /users/import/{plex|jellyfin}</c> (admin): the Plex users the
    /// server is shared with, or the Jellyfin users, each marked when
    /// already a member.
    /// </summary>
    public Task<IReadOnlyList<ImportCandidate>> ImportCandidatesAsync(MediaServerKind server, CancellationToken ct = default) =>
        transport.GetListAsync<ImportCandidate>(ImportPath(server), timeout: MarqueeApi.Timeouts.Integrations, ct: ct);

    /// <summary><c>POST /users/import/{plex|jellyfin}</c> (admin): creates linked member accounts for <paramref name="ids"/>.</summary>
    public Task<ImportUsersResult> ImportAsync(MediaServerKind server, IReadOnlyList<ExternalId> ids, CancellationToken ct = default) =>
        transport.MutateAsync<ImportUsersResult>(
            HttpMethod.Post, ImportPath(server), body: new ImportUsersRequest(ids),
            timeout: MarqueeApi.Timeouts.Integrations, changes: ServerChange.Users, ct: ct);

    /// <summary><c>GET /settings/sign-in</c> (admin). NotFound from servers without Plex/Jellyfin sign-in.</summary>
    public Task<SignInSettings> SignInSettingsAsync(CancellationToken ct = default) =>
        transport.GetAsync<SignInSettings>("/settings/sign-in", ct: ct);

    /// <summary><c>PUT /settings/sign-in</c> (admin). The answer's body isn't needed.</summary>
    public Task SaveSignInSettingsAsync(SignInSettings settings, CancellationToken ct = default) =>
        transport.MutateAsync<EmptyResponse>(HttpMethod.Put, "/settings/sign-in", body: settings, changes: ServerChange.Users, ct: ct);

    private static string ImportPath(MediaServerKind server) => $"/users/import/{MarqueeApi.Segment(server.WireValue())}";
}
