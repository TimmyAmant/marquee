using Marquee.Core.Models;

namespace Marquee.Core.Api;

/// <summary>
/// Settings › Integrations › "API keys" (0.47+) without the controls: the
/// keys, the create form's rules and "Act as" choices, the secret shown once
/// after creating one, and Revoke. The view model wraps it and raises its
/// own change notifications; this class holds the state and the rules, so
/// they can be tested without the UI.
///
/// Awaits resume on the caller's context (no <c>ConfigureAwait(false)</c>):
/// the view model calls it from the UI thread and reads the state after.
/// </summary>
public sealed class ApiKeysModel
{
    private readonly Func<MarqueeApi> api;

    /// <param name="api">The session's API, read at each call (a sign-in swaps it).</param>
    public ApiKeysModel(Func<MarqueeApi> api)
    {
        this.api = api;
    }

    /// <summary>
    /// The card shows: <c>GET /settings/api-keys</c> answered. Never on a
    /// server older than 0.47 (404) or for a member (403).
    /// </summary>
    public bool IsAvailable { get; private set; }

    /// <summary>Every key, oldest first.</summary>
    public IReadOnlyList<ApiKey> Keys { get; private set; } = [];

    /// <summary>"Admin (you)", then the household's other accounts once <c>GET /users</c> answered.</summary>
    public IReadOnlyList<ApiKeyActAsChoice> ActAsChoices { get; private set; } = [ApiKeyActAsChoice.Admin];

    /// <summary>The secret of the key just created, until <see cref="Done"/>; never shown again after that.</summary>
    public string? NewKey { get; private set; }

    public static IReadOnlyList<ApiKeyExpiryChoice> ExpiryChoices => ApiKeyLabels.ExpiryChoices;

    /// <summary>The create form's scope choices, in order: Read-only, Full access.</summary>
    public static IReadOnlyList<ApiKeyScope> ScopeChoices { get; } = [ApiKeyScope.Read, ApiKeyScope.Full];

    /// <summary>
    /// <c>GET /settings/api-keys</c>, then (once it answered) <c>GET /users</c>
    /// for the "Act as" choices. A 404 or 403 hides the card; any other
    /// failure keeps what's shown, and a failed member list keeps the
    /// choices it had.
    /// </summary>
    public async Task LoadAsync(CancellationToken ct = default)
    {
        try
        {
            var keys = await api().ApiKeys.ListAsync(ct);
            if (ct.IsCancellationRequested)
            {
                return;
            }
            if (keys == null)
            {
                Hide();
                return;
            }
            Keys = keys;
            IsAvailable = true;
        }
        catch (ApiException error) when (error.Kind == ApiErrorKind.Forbidden && !ct.IsCancellationRequested)
        {
            Hide();
            return;
        }
        catch (ApiException)
        {
            // Cancelled, or it failed: keep what's shown.
            return;
        }

        try
        {
            var members = await api().Users.ListAsync(ct);
            if (!ct.IsCancellationRequested)
            {
                ActAsChoices = ApiKeyActAsChoice.For(members);
            }
        }
        catch (ApiException)
        {
            // Keep the choices there are: "Admin (you)" at least.
        }
    }

    private void Hide()
    {
        IsAvailable = false;
        Keys = [];
        NewKey = null;
    }

    /// <summary>
    /// "Create key" (<c>POST /settings/api-keys</c>). A blank name is
    /// refused here, without asking the server. On success the key joins the
    /// list and its secret is <see cref="NewKey"/>. Returns the message to
    /// show, or null once it's created (the caller then clears the form).
    /// </summary>
    /// <param name="actAs">Null or <see cref="ApiKeyActAsChoice.Admin"/> for the admin.</param>
    /// <param name="expiry">Null or "Never" for a key that never expires.</param>
    public async Task<string?> CreateAsync(
        string? name,
        ApiKeyScope scope,
        ApiKeyActAsChoice? actAs = null,
        ApiKeyExpiryChoice? expiry = null,
        CancellationToken ct = default)
    {
        if (name.NonBlank() is not { } trimmed)
        {
            return ApiKeyLabels.BlankNameMessage;
        }
        CreatedApiKey created;
        try
        {
            created = await api().ApiKeys.CreateAsync(
                new CreateApiKeyRequest(trimmed.Trim(), scope, actAs?.UserId, expiry?.Days), ct);
        }
        catch (ApiException failure)
        {
            return failure.Kind switch
            {
                ApiErrorKind.NotFound => ApiKeyLabels.MemberGoneMessage,
                _ => MessageFor(failure),
            };
        }
        Keys = [.. Keys.Where(key => key.Id != created.ApiKey.Id), created.ApiKey];
        NewKey = created.Key;
        return null;
    }

    /// <summary>"Done" under the new key: its secret is gone for good.</summary>
    public void Done() => NewKey = null;

    /// <summary>
    /// "Revoke" (<c>DELETE /settings/api-keys/{id}</c>): the key leaves the
    /// list. One that's already gone just leaves it too. Returns the message
    /// to show, or null once it's revoked.
    /// </summary>
    public async Task<string?> RevokeAsync(Guid id, CancellationToken ct = default)
    {
        try
        {
            await api().ApiKeys.RevokeAsync(id, ct);
        }
        catch (ApiException failure)
        {
            // "That API key doesn't exist any more." means it's gone already.
            if (failure.Kind != ApiErrorKind.NotFound)
            {
                return MessageFor(failure);
            }
        }
        Keys = [.. Keys.Where(key => key.Id != id)];
        return null;
    }

    /// <summary>A refusal in the server's words ("Only the admin can manage API keys."); every other failure keeps its message.</summary>
    private static string MessageFor(ApiException failure) =>
        failure.Kind == ApiErrorKind.Forbidden ? ApiKeyLabels.OnlyTheAdminMessage : failure.Message;
}
