using System.Diagnostics;
using System.Runtime.InteropServices;
using Windows.Graphics.Imaging;
using Windows.Storage;
using Windows.Storage.Streams;

namespace Marquee.Windows.Services;

/// <summary>A photo ready for <c>PUT /users/{id}/avatar</c>: its bytes and their content type.</summary>
internal sealed record PreparedPhoto(byte[] Bytes, string ContentType);

/// <summary>
/// Gets a picked photo ready to upload. Windows decodes it (turned upright
/// from its EXIF orientation), it's scaled down so the longest side is at
/// most 1600 pixels, and it goes up as a JPEG: a phone's 12-megapixel photo
/// leaves this PC as a few hundred kilobytes rather than several megabytes,
/// and a format the server doesn't read (HEIC, when Windows has the HEIF
/// extension) arrives as one it does. When Windows can't decode the file
/// itself, the original bytes go up unchanged and the server says whether
/// it can use them.
/// </summary>
internal static class PhotoPreparation
{
    public const uint MaxSide = 1600;

    /// <summary>What the file picker offers: the server's formats, plus the ones Windows can often convert.</summary>
    public static readonly IReadOnlyList<string> PickerExtensions =
    [
        ".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".heic", ".heif", ".bmp", ".tif", ".tiff",
    ];

    public static async Task<PreparedPhoto> PrepareAsync(StorageFile file)
    {
        var original = await ReadAllAsync(file);
        try
        {
            return new PreparedPhoto(await ReencodeAsync(original), "image/jpeg");
        }
        catch (Exception error) when (error is COMException or ArgumentException or InvalidOperationException or NotSupportedException or OverflowException)
        {
            // No codec for it on this PC (HEIC without the HEIF extension),
            // or not an image at all: let the server have the last word.
            Debug.WriteLine($"Sending {file.Name} as it is: {error.Message}");
            return new PreparedPhoto(original, ContentTypeOf(file));
        }
    }

    private static async Task<byte[]> ReadAllAsync(StorageFile file)
    {
        using var input = await file.OpenReadAsync();
        using var stream = input.AsStreamForRead();
        using var copy = new MemoryStream();
        await stream.CopyToAsync(copy);
        return copy.ToArray();
    }

    private static async Task<byte[]> ReencodeAsync(byte[] original)
    {
        using var source = new MemoryStream(original);
        var decoder = await BitmapDecoder.CreateAsync(source.AsRandomAccessStream());

        // The same factor on both sides, so it doesn't matter that the EXIF
        // rotation is applied after the scaling.
        var longest = Math.Max(decoder.PixelWidth, decoder.PixelHeight);
        var scale = longest > MaxSide ? (double)MaxSide / longest : 1.0;
        var transform = new BitmapTransform
        {
            ScaledWidth = (uint)Math.Max(1, Math.Round(decoder.PixelWidth * scale)),
            ScaledHeight = (uint)Math.Max(1, Math.Round(decoder.PixelHeight * scale)),
            InterpolationMode = BitmapInterpolationMode.Fant,
        };
        using var bitmap = await decoder.GetSoftwareBitmapAsync(
            BitmapPixelFormat.Bgra8,
            BitmapAlphaMode.Premultiplied,
            transform,
            ExifOrientationMode.RespectExifOrientation,
            ColorManagementMode.ColorManageToSRgb);

        using var output = new InMemoryRandomAccessStream();
        var options = new BitmapPropertySet
        {
            ["ImageQuality"] = new BitmapTypedValue(0.88f, global::Windows.Foundation.PropertyType.Single),
        };
        var encoder = await BitmapEncoder.CreateAsync(BitmapEncoder.JpegEncoderId, output, options);
        encoder.SetSoftwareBitmap(bitmap);
        await encoder.FlushAsync();

        var bytes = new byte[output.Size];
        using var reader = new DataReader(output.GetInputStreamAt(0));
        await reader.LoadAsync((uint)output.Size);
        reader.ReadBytes(bytes);
        return bytes;
    }

    /// <summary>The picked file's own type, else one guessed from its extension.</summary>
    private static string ContentTypeOf(StorageFile file)
    {
        if (!string.IsNullOrWhiteSpace(file.ContentType) && file.ContentType.Contains('/'))
        {
            return file.ContentType;
        }
        return Path.GetExtension(file.Name).ToLowerInvariant() switch
        {
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".webp" => "image/webp",
            ".gif" => "image/gif",
            ".avif" => "image/avif",
            ".heic" => "image/heic",
            ".heif" => "image/heif",
            ".bmp" => "image/bmp",
            ".tif" or ".tiff" => "image/tiff",
            _ => "application/octet-stream",
        };
    }
}
