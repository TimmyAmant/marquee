using System.Diagnostics;
using System.Text.Json;
using Marquee.Core.Connection;

namespace Marquee.Windows.Services;

/// <summary>
/// The app's non-secret preferences (today: the saved server's base URL) as
/// a small JSON file under <c>%LocalAppData%\Marquee\settings.json</c>.
///
/// A file rather than <c>ApplicationData.LocalSettings</c> because the app
/// is unpackaged: without a package identity there is no per-app settings
/// container, and the registry-backed fallback would leave state behind on
/// uninstall. A file the user can find and delete is the honest option.
/// </summary>
public sealed class JsonSettingsStore : ISettingsStore
{
    private static readonly JsonSerializerOptions FileOptions = new() { WriteIndented = true };

    private readonly string path;
    private readonly object gate = new();
    private Dictionary<string, string>? values;

    /// <param name="path">Tests pass a temporary file; the app uses <see cref="DefaultPath"/>.</param>
    public JsonSettingsStore(string? path = null)
    {
        this.path = path ?? DefaultPath;
    }

    public static string DefaultPath =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Marquee", "settings.json");

    public string? GetString(string key)
    {
        lock (gate)
        {
            return Load().GetValueOrDefault(key);
        }
    }

    public void SetString(string key, string? value)
    {
        lock (gate)
        {
            var current = Load();
            if (value == null)
            {
                if (!current.Remove(key))
                {
                    return;
                }
            }
            else
            {
                if (current.TryGetValue(key, out var existing) && existing == value)
                {
                    return;
                }
                current[key] = value;
            }
            Persist(current);
        }
    }

    /// <summary>
    /// Read once, then kept in memory. A file that can't be read (missing,
    /// locked, hand-edited into invalid JSON) counts as a fresh install: the
    /// only thing lost is the saved server, which the connect screen asks
    /// for again.
    /// </summary>
    private Dictionary<string, string> Load()
    {
        if (values != null)
        {
            return values;
        }
        var loaded = new Dictionary<string, string>();
        try
        {
            if (File.Exists(path))
            {
                var saved = JsonSerializer.Deserialize<Dictionary<string, string>>(File.ReadAllText(path));
                if (saved != null)
                {
                    loaded = saved;
                }
            }
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or JsonException)
        {
            Debug.WriteLine($"Settings file unreadable, starting empty: {error.Message}");
        }
        values = loaded;
        return values;
    }

    /// <summary>
    /// Written to a sibling file first and then moved into place, so a crash
    /// mid-write leaves the previous settings intact rather than a truncated file.
    /// </summary>
    private void Persist(Dictionary<string, string> current)
    {
        try
        {
            var directory = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(directory))
            {
                Directory.CreateDirectory(directory);
            }
            var temporary = path + ".tmp";
            File.WriteAllText(temporary, JsonSerializer.Serialize(current, FileOptions));
            File.Move(temporary, path, overwrite: true);
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException)
        {
            // The in-memory copy still holds the value for this run.
            Debug.WriteLine($"Couldn't save settings: {error.Message}");
        }
    }
}
