using System.Globalization;
using System.Text;
using System.Text.Json;
using Marquee.Core.Connection;

namespace Marquee.Core.Models;

/// <summary>
/// lib/search/recent.ts, the Mac's RecentSearches: the last few things
/// searched for on this PC, newest first, shown under the search panel's
/// empty box to search again with a click. Kept in the app's local
/// settings per server and account (like the website, which keys them by
/// user id), so someone else signing in here never sees them, and wiped on
/// signing out.
/// </summary>
public static class RecentSearches
{
    public const int Limit = 8;

    /// <summary>
    /// The prefix in <see cref="ISettingsStore"/>; each account's list is
    /// <c>"recentSearches:&lt;server&gt;|&lt;user id&gt;"</c>. Before 0.76 one
    /// list under the bare prefix served the whole PC.
    /// </summary>
    public const string Key = "recentSearches";

    /// <param name="account">"server|user id", as <c>AppModel.AccountIdentity</c>.</param>
    public static string KeyFor(string account) => $"{Key}:{account}";

    /// <summary>
    /// The query added to the front; the same query typed differently
    /// ("Wall-E" and "wall-e") is moved up rather than kept twice. Blank is
    /// ignored. Pure.
    /// </summary>
    public static IReadOnlyList<string> Add(IReadOnlyList<string> list, string? query)
    {
        var trimmed = query?.Trim() ?? "";
        if (trimmed.Length == 0)
        {
            return list;
        }
        var key = MatchKey(trimmed);
        return list.Where(item => MatchKey(item) != key).Prepend(trimmed).Take(Limit).ToList();
    }

    public static IReadOnlyList<string> Remove(IReadOnlyList<string> list, string query) =>
        list.Where(item => item != query).ToList();

    /// <summary>
    /// lib/search/rank.ts's <c>normalizeName</c>: no accents or case, &amp; and
    /// + as words, anything else between letters and digits a single space.
    /// Lowercased as typed when that leaves nothing ("!!!").
    /// </summary>
    public static string MatchKey(string text)
    {
        var folded = new StringBuilder();
        foreach (var c in text.Normalize(NormalizationForm.FormD))
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
            {
                folded.Append(c);
            }
        }
        var spaced = folded.ToString().ToLowerInvariant().Replace("&", " and ").Replace("+", " plus ");
        var words = new StringBuilder();
        var gap = false;
        foreach (var c in spaced)
        {
            if (char.IsLetterOrDigit(c))
            {
                if (gap && words.Length > 0)
                {
                    words.Append(' ');
                }
                words.Append(c);
                gap = false;
            }
            else
            {
                gap = true;
            }
        }
        return words.Length > 0 ? words.ToString() : text.ToLowerInvariant();
    }

    /// <summary>What's stored, or none for nothing or anything that isn't a list of strings; blanks and anything past the limit dropped.</summary>
    public static IReadOnlyList<string> Parse(string? stored)
    {
        if (string.IsNullOrWhiteSpace(stored))
        {
            return [];
        }
        try
        {
            using var document = JsonDocument.Parse(stored);
            if (document.RootElement.ValueKind != JsonValueKind.Array)
            {
                return [];
            }
            return document.RootElement.EnumerateArray()
                .Where(item => item.ValueKind == JsonValueKind.String)
                .Select(item => item.GetString()!)
                .Where(item => !string.IsNullOrWhiteSpace(item))
                .Take(Limit)
                .ToList();
        }
        catch (JsonException)
        {
            return [];
        }
    }

    /// <summary>The account's list; none before anyone has signed in.</summary>
    public static IReadOnlyList<string> Read(ISettingsStore store, string? account)
    {
        // The old per-PC list isn't anyone's to show.
        if (store.GetString(Key) != null)
        {
            store.SetString(Key, null);
        }
        return account == null ? [] : Parse(store.GetString(KeyFor(account)));
    }

    /// <summary>None removes the key; nothing is kept without an account.</summary>
    public static void Write(ISettingsStore store, string? account, IReadOnlyList<string> list)
    {
        if (account != null)
        {
            store.SetString(KeyFor(account), list.Count == 0 ? null : JsonSerializer.Serialize(list));
        }
    }

    /// <summary>Adds a search to the account's recent searches; the list as it now is.</summary>
    public static IReadOnlyList<string> Remember(ISettingsStore store, string? account, string? query)
    {
        var next = Add(Read(store, account), query);
        Write(store, account, next);
        return next;
    }

    /// <summary>Signing out: the account's searches leave with it.</summary>
    public static void Clear(ISettingsStore store, string account)
    {
        store.SetString(KeyFor(account), null);
        store.SetString(Key, null);
    }
}
