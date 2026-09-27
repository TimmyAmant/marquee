using Marquee.Core.Localization;

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
        MenuPosition.Right => Loc.Get("Model_MenuPositionRight"),
        MenuPosition.Top => Loc.Get("Model_MenuPositionTop"),
        MenuPosition.Bottom => Loc.Get("Model_MenuPositionBottom"),
        _ => Loc.Get("Model_MenuPositionLeft"),
    };

    /// <summary>Top and bottom lay the bar's items out in a row.</summary>
    public static bool IsHorizontal(this MenuPosition position) => position is MenuPosition.Top or MenuPosition.Bottom;

    public static MenuPosition Read(ISettingsStore store) => Parse(store.GetString(Key));

    public static void Write(ISettingsStore store, MenuPosition position) => store.SetString(Key, position.StoredValue());
}

/// <summary>
/// Settings › Account › This PC › "Show menu labels": the section names
/// beside the rail's icons (a rail at the left or right widens for them; a
/// bar along the top or bottom stays icons only) and the server's version at
/// its foot. This PC's choice, like the position.
/// </summary>
public static class MenuLabelsSetting
{
    /// <summary>The key in <see cref="ISettingsStore"/>.</summary>
    public const string Key = "menuLabels";

    /// <summary>The labeled rail's width, border to border.</summary>
    public const double RailWidth = 200;

    /// <summary>On only for "on"; anything else (nothing stored, a hand-edited file) is off.</summary>
    public static bool Parse(string? stored) => string.Equals(stored?.Trim(), "on", StringComparison.OrdinalIgnoreCase);

    public static bool Read(ISettingsStore store) => Parse(store.GetString(Key));

    /// <summary>Off removes the key.</summary>
    public static void Write(ISettingsStore store, bool on) => store.SetString(Key, on ? "on" : null);

    /// <summary>Whether the rail shows its names: labels on, and the rail at the left or right.</summary>
    public static bool IsLabeled(bool on, MenuPosition position) => on && !position.IsHorizontal();

    /// <summary>How far the page keeps clear of a rail at the left or right: its 16 inset, its width, 16 more.</summary>
    public static double Clearance(bool labeled) => labeled ? 16 + RailWidth + 16 : 72;
}

