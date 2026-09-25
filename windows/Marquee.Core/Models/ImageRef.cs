using System.Text.Json;
using System.Text.Json.Serialization;

namespace Marquee.Core.Models;

/// <summary>
/// TMDb's image widths. Posters: w92 to w780; profiles: w45, w185, h632;
/// backdrops: w300, w780, w1280; logos: w45 to w500; stills: w92 to w300.
/// </summary>
public enum ImageSize
{
    W45,
    W92,
    W154,
    W185,
    W300,
    W342,
    W500,
    W780,
    W1280,
    H632,
    Original,
}

public static class ImageSizeExtensions
{
    /// <summary>The path segment TMDb expects: <c>w500</c>, <c>original</c>.</summary>
    public static string Segment(this ImageSize size) => size.ToString().ToLowerInvariant();
}

/// <summary>
/// An artwork path from the API (<c>posterPath</c>, <c>backdropPath</c>,
/// <c>profilePath</c>, <c>logoPath</c>, <c>stillPath</c>). Usually a TMDb
/// path (<c>"/abc.jpg"</c>), but a poster or backdrop can be a full
/// <c>https://</c> URL (a TheTVDB fallback). <see cref="Url"/> handles both,
/// like the website's <c>tmdbImageUrl</c> (api-v1.md deviation 1).
/// </summary>
[JsonConverter(typeof(ImageRefConverter))]
public readonly record struct ImageRef(string Path)
{
    public const string TmdbBase = "https://image.tmdb.org/t/p/";

    /// <summary>Already a full URL; a size doesn't apply.</summary>
    public bool IsAbsolute => IsAbsolutePath(Path);

    /// <summary>The image at <paramref name="size"/>; null for an empty path.</summary>
    public Uri? Url(ImageSize size = ImageSize.W500) => UrlFor(Path, size);

    /// <summary>The same rule for a plain string (or null).</summary>
    public static Uri? UrlFor(string? path, ImageSize size = ImageSize.W500)
    {
        if (string.IsNullOrEmpty(path))
        {
            return null;
        }
        if (IsAbsolutePath(path))
        {
            return Uri.TryCreate(path, UriKind.Absolute, out var absolute) ? absolute : null;
        }
        var relative = path.StartsWith('/') ? path : "/" + path;
        return Uri.TryCreate(TmdbBase + size.Segment() + relative, UriKind.Absolute, out var built) ? built : null;
    }

    public override string ToString() => Path;

    public static implicit operator ImageRef(string path) => new(path);

    private static bool IsAbsolutePath(string path) =>
        path.StartsWith("https://", StringComparison.Ordinal) || path.StartsWith("http://", StringComparison.Ordinal);
}

public static class ImageRefExtensions
{
    /// <summary><c>card.PosterPath.Url(ImageSize.W342)</c> without unwrapping first.</summary>
    public static Uri? Url(this ImageRef? image, ImageSize size = ImageSize.W500) => image?.Url(size);
}

/// <summary>An <see cref="ImageRef"/> is a bare string on the wire.</summary>
public sealed class ImageRefConverter : JsonConverter<ImageRef>
{
    public override ImageRef Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType != JsonTokenType.String)
        {
            throw new JsonException($"Expected an image path string, got {reader.TokenType}.");
        }
        return new ImageRef(reader.GetString()!);
    }

    public override void Write(Utf8JsonWriter writer, ImageRef value, JsonSerializerOptions options) =>
        writer.WriteStringValue(value.Path);
}
