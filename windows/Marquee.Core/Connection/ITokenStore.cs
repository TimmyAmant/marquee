namespace Marquee.Core.Connection;

public enum TokenLookupKind
{
    Found,
    Missing,

    /// <summary>The store couldn't be read right now; nothing is known about the token.</summary>
    Unavailable,
}

/// <summary>
/// What a token store can answer. <see cref="TokenLookupKind.Unavailable"/> is
/// deliberately separate from <see cref="TokenLookupKind.Missing"/>: a
/// credential store that can't be read right now (locked, a transient
/// error) is not the same as an account that was signed out, and treating
/// the two alike drops a perfectly good session.
/// </summary>
public readonly record struct TokenLookup(TokenLookupKind Kind, string? Token)
{
    public static TokenLookup Found(string token) => new(TokenLookupKind.Found, token);
    public static readonly TokenLookup Missing = new(TokenLookupKind.Missing, null);
    public static readonly TokenLookup Unavailable = new(TokenLookupKind.Unavailable, null);
}

/// <summary>
/// Where bearer tokens live, keyed by server base URL
/// (<see cref="ServerAddress.BaseUrlString"/>). The app backs it with the
/// Windows credential store; tests use <see cref="InMemoryTokenStore"/>.
/// </summary>
public interface ITokenStore
{
    TokenLookup Lookup(string server);

    /// <summary>False when the store refused the write; the session then keeps the token in memory until the app quits.</summary>
    bool Save(string token, string server);

    void Delete(string server);
}

public static class TokenStoreExtensions
{
    /// <summary>The token, or null whether it's missing or the store is unavailable.</summary>
    public static string? Token(this ITokenStore store, string server) =>
        store.Lookup(server) is { Kind: TokenLookupKind.Found, Token: { } token } ? token : null;
}

/// <summary>Tokens that last until quit, for tests (and as the fallback when the credential store refuses a write).</summary>
public sealed class InMemoryTokenStore : ITokenStore
{
    private readonly Dictionary<string, string> tokens;
    private readonly object gate = new();

    public InMemoryTokenStore(IEnumerable<KeyValuePair<string, string>>? tokens = null)
    {
        this.tokens = tokens == null ? [] : new Dictionary<string, string>(tokens);
    }

    public TokenLookup Lookup(string server)
    {
        lock (gate)
        {
            return tokens.TryGetValue(server, out var token) ? TokenLookup.Found(token) : TokenLookup.Missing;
        }
    }

    public bool Save(string token, string server)
    {
        lock (gate)
        {
            tokens[server] = token;
        }
        return true;
    }

    public void Delete(string server)
    {
        lock (gate)
        {
            tokens.Remove(server);
        }
    }
}
