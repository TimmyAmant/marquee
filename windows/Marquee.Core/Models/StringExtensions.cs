namespace Marquee.Core.Models;

public static class StringExtensions
{
    /// <summary>Null for null, empty or whitespace-only, so "display name, else username" is one <c>??</c>.</summary>
    public static string? NonBlank(this string? value) => string.IsNullOrWhiteSpace(value) ? null : value;
}
