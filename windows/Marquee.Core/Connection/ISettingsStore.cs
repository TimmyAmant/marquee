namespace Marquee.Core.Connection;

/// <summary>
/// The small, non-secret preferences the session needs (the saved server's
/// base URL). The app backs it with its local settings container; tests use
/// <see cref="InMemorySettingsStore"/>. Secrets never go here; see
/// <see cref="ITokenStore"/>.
/// </summary>
public interface ISettingsStore
{
    string? GetString(string key);

    /// <summary>Null removes the key.</summary>
    void SetString(string key, string? value);
}

public sealed class InMemorySettingsStore : ISettingsStore
{
    private readonly Dictionary<string, string> values = [];
    private readonly object gate = new();

    public string? GetString(string key)
    {
        lock (gate)
        {
            return values.GetValueOrDefault(key);
        }
    }

    public void SetString(string key, string? value)
    {
        lock (gate)
        {
            if (value == null)
            {
                values.Remove(key);
            }
            else
            {
                values[key] = value;
            }
        }
    }
}
