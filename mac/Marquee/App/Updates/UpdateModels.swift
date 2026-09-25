import Foundation

/// A dotted version ("0.29.0", or a release tag's "v0.29.0"), compared
/// numerically part by part, so 0.29.10 is newer than 0.29.9 and 1.0 equals
/// 1.0.0. A pre-release suffix ("-beta.1") is ignored.
struct AppVersion: Comparable, CustomStringConvertible, Sendable {
    let components: [Int]
    /// As given, without the tag's "v".
    let description: String

    init?(_ text: String) {
        var trimmed = Substring(text.trimmingCharacters(in: .whitespacesAndNewlines))
        if trimmed.first == "v" || trimmed.first == "V" { trimmed = trimmed.dropFirst() }
        let core = trimmed.split(separator: "-", maxSplits: 1).first ?? ""
        let parts = core.split(separator: ".", omittingEmptySubsequences: false).map { Int($0) }
        guard !parts.isEmpty, parts.allSatisfy({ ($0 ?? -1) >= 0 }) else { return nil }
        components = parts.compactMap { $0 }
        description = String(trimmed)
    }

    /// This app's `CFBundleShortVersionString`.
    static var current: AppVersion? { AppVersion(AppInfo.version) }

    static func == (lhs: AppVersion, rhs: AppVersion) -> Bool {
        compare(lhs, rhs) == 0
    }

    static func < (lhs: AppVersion, rhs: AppVersion) -> Bool {
        compare(lhs, rhs) < 0
    }

    private static func compare(_ lhs: AppVersion, _ rhs: AppVersion) -> Int {
        for index in 0..<max(lhs.components.count, rhs.components.count) {
            let left = index < lhs.components.count ? lhs.components[index] : 0
            let right = index < rhs.components.count ? rhs.components[index] : 0
            if left != right { return left < right ? -1 : 1 }
        }
        return 0
    }
}

/// `GET /repos/TimmyAmant/marquee/releases/latest`, the parts the updater reads.
struct GitHubRelease: Decodable, Sendable {
    struct Asset: Decodable, Sendable {
        let name: String
        let browserDownloadUrl: URL
        let size: Int
        /// "sha256:<hex>"; GitHub adds it to assets uploaded since mid-2025.
        let digest: String?
    }

    let tagName: String
    /// The release page: "What's new", and "Download manually".
    let htmlUrl: URL
    let assets: [Asset]

    static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }()
}

/// A release newer than this app, with a Mac download
/// (.github/workflows/apps.yml attaches `Marquee-mac.zip` and its `.sha256`).
struct AvailableUpdate: Equatable, Sendable {
    static let assetName = "Marquee-mac.zip"
    static let checksumAssetName = "Marquee-mac.zip.sha256"

    let version: AppVersion
    let releasePage: URL
    let download: URL
    /// The zip's size in bytes, as GitHub lists it.
    let size: Int
    /// Lowercase hex, from the asset's `digest`; nil when GitHub didn't give
    /// one, and `checksumFile` has it instead.
    let sha256: String?
    let checksumFile: URL?

    /// nil when the release has no usable Mac download (or its tag isn't a version).
    init?(release: GitHubRelease) {
        guard let version = AppVersion(release.tagName),
              let zip = release.assets.first(where: { $0.name == Self.assetName }),
              zip.size > 0
        else { return nil }
        let checksumFile = release.assets.first(where: { $0.name == Self.checksumAssetName })?.browserDownloadUrl
        let sha256 = zip.digest.flatMap(Self.sha256(fromDigest:))
        guard sha256 != nil || checksumFile != nil else { return nil }
        self.version = version
        releasePage = release.htmlUrl
        download = zip.browserDownloadUrl
        size = zip.size
        self.sha256 = sha256
        self.checksumFile = checksumFile
    }

    /// "sha256:<64 hex>" → the hex, lowercased; nil for any other algorithm or shape.
    static func sha256(fromDigest digest: String) -> String? {
        let parts = digest.split(separator: ":", maxSplits: 1)
        guard parts.count == 2, parts[0].lowercased() == "sha256" else { return nil }
        return validHex(String(parts[1]))
    }

    /// A `shasum -a 256` line ("<hex>  Marquee-mac.zip") → the hex.
    static func sha256(fromChecksumFile text: String) -> String? {
        text.split(whereSeparator: \.isWhitespace).first.flatMap { validHex(String($0)) }
    }

    private static func validHex(_ text: String) -> String? {
        let hex = text.lowercased()
        guard hex.count == 64, hex.allSatisfy({ $0.isHexDigit }) else { return nil }
        return hex
    }

    static func == (lhs: AvailableUpdate, rhs: AvailableUpdate) -> Bool {
        lhs.version == rhs.version && lhs.download == rhs.download
    }
}

/// Every way an update can fail, in words for the person using the app.
enum UpdateError: LocalizedError, Equatable {
    case unreachable
    case unreadableRelease
    case noDownload
    case downloadFailed
    case untrustedHost(String)
    case sizeMismatch
    case checksumMismatch
    case unzipFailed
    case invalidApp(String)
    /// The running copy can't be replaced where it is.
    case cannotReplace
    case launchFailed

    var errorDescription: String? {
        switch self {
        case .unreachable:
            return "Couldn't reach GitHub to check for updates. Check your internet connection and try again."
        case .unreadableRelease:
            return "GitHub's answer about the latest release couldn't be read. Try again later."
        case .noDownload:
            return "The newest release doesn't have a Mac download yet. Try again in a few minutes."
        case .downloadFailed:
            return "The download didn't finish. Check your internet connection and try again."
        case let .untrustedHost(host):
            return "The download was sent somewhere unexpected (\(host)), so Marquee stopped it."
        case .sizeMismatch, .checksumMismatch:
            return "The download didn't match what GitHub says it should be, so Marquee didn't install it."
        case .unzipFailed:
            return "Marquee couldn't unpack the download."
        case let .invalidApp(reason):
            return "The download isn't a Marquee app this Mac can trust (\(reason)), so it wasn't installed."
        case .cannotReplace:
            return "Move Marquee to your Applications folder (or another folder you can write to), then try again."
        case .launchFailed:
            return "Marquee couldn't start its installer."
        }
    }
}
