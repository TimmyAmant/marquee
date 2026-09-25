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
}
