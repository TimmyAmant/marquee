using System.Globalization;

namespace Marquee.Core.Updates;

/// <summary>
/// A dotted version ("0.29.0", or a release tag's "v0.29.0"), compared
/// numerically part by part, so 0.29.10 is newer than 0.29.9 and 1.0 equals
/// 1.0.0. A pre-release suffix ("-beta.1") or build metadata ("+abc") is
/// ignored. The Mac app's <c>AppVersion</c>, case for case.
/// </summary>
public sealed class AppVersion : IComparable<AppVersion>, IEquatable<AppVersion>
{
    private readonly int[] components;

    private AppVersion(int[] components, string text)
    {
        this.components = components;
        Text = text;
    }

    /// <summary>The numbers, most significant first.</summary>
    public IReadOnlyList<int> Components => components;

    /// <summary>As given, without the tag's "v": "0.30.0".</summary>
    public string Text { get; }

    /// <summary>This build's version (<see cref="AppInfo.Version"/>); null only if the build carries no readable one.</summary>
    public static AppVersion? Current => Parse(AppInfo.Version);

    /// <summary>Null for anything that isn't a dotted run of whole numbers ("latest", "", "1..0").</summary>
    public static AppVersion? Parse(string? text)
    {
        if (text == null)
        {
            return null;
        }
        var trimmed = text.Trim();
        if (trimmed.StartsWith('v') || trimmed.StartsWith('V'))
        {
            trimmed = trimmed[1..];
        }
        var end = trimmed.IndexOfAny(['-', '+']);
        var core = end >= 0 ? trimmed[..end] : trimmed;

        var parts = core.Split('.');
        var numbers = new int[parts.Length];
        for (var index = 0; index < parts.Length; index++)
        {
            var part = parts[index];
            if (part.Length == 0
                || !part.All(char.IsAsciiDigit)
                || !int.TryParse(part, NumberStyles.None, CultureInfo.InvariantCulture, out numbers[index]))
            {
                return null;
            }
        }
        return new AppVersion(numbers, trimmed);
    }

    /// <summary>Part by part, a missing part counting as 0; null sorts before any version.</summary>
    public static int Compare(AppVersion? left, AppVersion? right)
    {
        if (left is null || right is null)
        {
            return left is null ? (right is null ? 0 : -1) : 1;
        }
        var count = Math.Max(left.components.Length, right.components.Length);
        for (var index = 0; index < count; index++)
        {
            var a = index < left.components.Length ? left.components[index] : 0;
            var b = index < right.components.Length ? right.components[index] : 0;
            if (a != b)
            {
                return a < b ? -1 : 1;
            }
        }
        return 0;
    }

    public int CompareTo(AppVersion? other) => Compare(this, other);

    public bool Equals(AppVersion? other) => other is not null && Compare(this, other) == 0;

    public override bool Equals(object? obj) => obj is AppVersion other && Equals(other);

    /// <summary>Trailing zeros don't count, so 1.0 and 1.0.0 hash alike, as they compare equal.</summary>
    public override int GetHashCode()
    {
        var hash = new HashCode();
        var length = components.Length;
        while (length > 0 && components[length - 1] == 0)
        {
            length--;
        }
        for (var index = 0; index < length; index++)
        {
            hash.Add(components[index]);
        }
        return hash.ToHashCode();
    }

    public override string ToString() => Text;

    public static bool operator ==(AppVersion? left, AppVersion? right) => Compare(left, right) == 0;

    public static bool operator !=(AppVersion? left, AppVersion? right) => Compare(left, right) != 0;

    public static bool operator <(AppVersion? left, AppVersion? right) => Compare(left, right) < 0;

    public static bool operator >(AppVersion? left, AppVersion? right) => Compare(left, right) > 0;

    public static bool operator <=(AppVersion? left, AppVersion? right) => Compare(left, right) <= 0;

    public static bool operator >=(AppVersion? left, AppVersion? right) => Compare(left, right) >= 0;
}
