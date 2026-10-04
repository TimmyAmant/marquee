using System.Globalization;
using System.Text;
using System.Text.Json;
using Marquee.Core.Connection;

namespace Marquee.Core.Models;

/// <summary>
/// lib/search/recent.ts, the Mac's RecentSearches: the last few things
/// searched for on this PC, newest first, shown under the search panel's
/// empty box to search again with a click. A per-device list: kept in the
/// app's local settings, not on the server.
/// </summary>
public static class RecentSearches
{
    public const int Limit = 8;

    /// <summary>The key in <see cref="ISettingsStore"/>.</summary>
    public const string Key = "recentSearches";

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

    public static IReadOnlyList<string> Read(ISettingsStore store) => Parse(store.GetString(Key));

    /// <summary>None removes the key.</summary>
    public static void Write(ISettingsStore store, IReadOnlyList<string> list) =>
        store.SetString(Key, list.Count == 0 ? null : JsonSerializer.Serialize(list));

    /// <summary>Adds a search to this PC's recent searches; the list as it now is.</summary>
    public static IReadOnlyList<string> Remember(ISettingsStore store, string? query)
    {
        var next = Add(Read(store), query);
        Write(store, next);
        return next;
    }
}
