import AppKit
import ImageIO
import UniformTypeIdentifiers

/// Profile photos (`GET /users/{id}/avatar`), fetched with the session's
/// token and kept in memory by their `avatarUrl`. That URL carries a `?v=`
/// that changes with the photo, so an entry never goes stale; the store is
/// emptied on sign-out.
@MainActor
final class AvatarImageStore {
    private var images: [String: NSImage] = [:]
    /// One request per URL, however many avatars are waiting on it.
    private var loading: [String: Task<Data?, Never>] = [:]

    func cachedImage(for avatarUrl: String) -> NSImage? {
        images[avatarUrl]
    }

    /// nil when there's no photo to show (a 404, or it couldn't be read):
    /// the initials stay.
    func image(for avatarUrl: String, api: MarqueeAPI) async -> NSImage? {
        if let image = images[avatarUrl] { return image }
        let task: Task<Data?, Never>
        if let running = loading[avatarUrl] {
            task = running
        } else {
            task = Task { try? await api.users.avatar(at: avatarUrl) }
            loading[avatarUrl] = task
        }
        let data = await task.value
        loading[avatarUrl] = nil
        if let cached = images[avatarUrl] { return cached }
        guard let data, let image = NSImage(data: data) else { return nil }
        images[avatarUrl] = image
        return image
    }

    func clear() {
        for task in loading.values { task.cancel() }
        loading = [:]
        images = [:]
    }
}

/// The edit sheet's photo, made ready to upload (the website's
/// `prepareUpload` in app/settings/household-members-list.tsx): decoded here,
/// HEIC included (the server can't read it), turned upright, shrunk to at
/// most 1600 on the long side and re-encoded as JPEG at 0.9. That also drops
/// the file's metadata. A file this Mac can't decode goes up as it is, and
/// the server has the final say.
enum AvatarUpload {
    static let maxPixelSize = 1600
    static let jpegQuality = 0.9
    /// The server's limit.
    static let maxBytes = 15 * 1024 * 1024

    struct Prepared: Sendable {
        let data: Data
        let contentType: String
    }

    /// Reads a file the user picked (a security-scoped URL from the importer).
    @concurrent
    static func prepare(fileAt url: URL) async throws -> Prepared {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let original: Data
        do {
            original = try Data(contentsOf: url)
        } catch {
            throw APIError.invalid("Couldn't open that file.")
        }
        if let jpeg = jpegData(from: original) {
            return Prepared(data: jpeg, contentType: "image/jpeg")
        }
        guard original.count <= maxBytes else {
            throw APIError.invalid("That photo is too big. Pick one under 15 MB.")
        }
        let type = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        return Prepared(data: original, contentType: type)
    }

    /// nil when ImageIO can't decode `data`.
    nonisolated static func jpegData(from data: Data) -> Data? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              CGImageSourceGetCount(source) > 0,
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? Int,
              let height = properties[kCGImagePropertyPixelHeight] as? Int
        else { return nil }

        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            // Applies the EXIF orientation, so the pixels come out upright.
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: min(maxPixelSize, max(width, height)),
            kCGImageSourceShouldCacheImmediately: true,
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }

        let output = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(output, UTType.jpeg.identifier as CFString, 1, nil) else {
            return nil
        }
        CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: jpegQuality] as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { return nil }
        return output as Data
    }
}
