namespace Marquee.Core.Connection;

/// <summary>
/// Which edge of the window the navigation bar sits on (Settings › Account ›
/// This PC). A per-device preference: kept in the app's local settings, not
/// on the server.
/// </summary>
public enum MenuPosition
{
    /// <summary>The default: a vertical rail floating at the left edge.</summary>
    Left,
    Right,
    Top,
    Bottom,
}

public static class MenuPositionSetting
{
    /// <summary>The key in <see cref="ISettingsStore"/>.</summary>
    public const string Key = "menuPosition";

    /// <summary>Every choice, in the order the setting lists them.</summary>
    public static IReadOnlyList<MenuPosition> All { get; } = [MenuPosition.Left, MenuPosition.Right, MenuPosition.Top, MenuPosition.Bottom];

    /// <summary>A stored value; anything missing or unknown (a newer app's choice, a hand-edited file) is Left.</summary>
    public static MenuPosition Parse(string? stored) => stored?.Trim().ToLowerInvariant() switch
    {
        "right" => MenuPosition.Right,
        "top" => MenuPosition.Top,
        "bottom" => MenuPosition.Bottom,
        _ => MenuPosition.Left,
    };

    /// <summary>What's stored: "left", "right", "top", "bottom".</summary>
    public static string StoredValue(this MenuPosition position) => position switch
    {
        MenuPosition.Right => "right",
        MenuPosition.Top => "top",
        MenuPosition.Bottom => "bottom",
        _ => "left",
    };

    /// <summary>"Left", "Right", "Top", "Bottom".</summary>
    public static string Label(this MenuPosition position) => position switch
    {
        MenuPosition.Right => "Right",
        MenuPosition.Top => "Top",
        MenuPosition.Bottom => "Bottom",
        _ => "Left",
    };

    /// <summary>Top and bottom lay the bar's items out in a row.</summary>
    public static bool IsHorizontal(this MenuPosition position) => position is MenuPosition.Top or MenuPosition.Bottom;

    public static MenuPosition Read(ISettingsStore store) => Parse(store.GetString(Key));

    public static void Write(ISettingsStore store, MenuPosition position) => store.SetString(Key, position.StoredValue());
}
