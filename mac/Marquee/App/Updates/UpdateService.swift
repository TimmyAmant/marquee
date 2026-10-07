import CryptoKit
import Foundation

/// GitHub's side of updating: which release is newest, and its Mac download,
/// fetched over HTTPS from GitHub's own hosts only and checked against the
/// size and SHA-256 GitHub lists before anything is unpacked.
struct UpdateService: Sendable {
    static let latestReleaseURL = URL(string: "https://api.github.com/repos/TimmyAmant/marquee/releases/latest")!

    let session: URLSession

    init(session: URLSession = UpdateService.defaultSession) {
        self.session = session
    }

    static let defaultSession: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 30
        configuration.timeoutIntervalForResource = 30 * 60
        configuration.httpShouldSetCookies = false
        configuration.httpCookieAcceptPolicy = .never
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.httpAdditionalHeaders = ["User-Agent": "Marquee-macOS/\(AppInfo.version)"]
        return URLSession(configuration: configuration)
    }()

    /// github.com, api.github.com and *.githubusercontent.com (where release
    /// downloads redirect to), over HTTPS.
    static func isAllowed(_ url: URL?) -> Bool {
        guard let url, url.scheme?.lowercased() == "https", let host = url.host?.lowercased() else { return false }
        return host == "github.com" || host == "api.github.com" || host.hasSuffix(".githubusercontent.com")
    }

    // MARK: Checking

    @concurrent
    func latestRelease() async throws -> GitHubRelease {
        var request = URLRequest(url: Self.latestReleaseURL)
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept") // i18n-ignore
        request.setValue("2022-11-28", forHTTPHeaderField: "X-GitHub-Api-Version")
        let (data, response) = try await fetch(request)
        guard response.statusCode == 200 else {
            // 404: no published release yet.
            throw response.statusCode == 404 ? UpdateError.noDownload : UpdateError.unreachable
        }
        do {
            return try GitHubRelease.decoder.decode(GitHubRelease.self, from: data)
        } catch {
            throw UpdateError.unreadableRelease
        }
    }

    /// The expected SHA-256: the asset's `digest`, or else its `.sha256` file.
    @concurrent
    func expectedSHA256(for update: AvailableUpdate) async throws -> String {
        if let sha256 = update.sha256 { return sha256 }
        guard let file = update.checksumFile else { throw UpdateError.noDownload }
        let (data, response) = try await fetch(URLRequest(url: file))
        guard response.statusCode == 200,
              let hex = AvailableUpdate.sha256(fromChecksumFile: String(decoding: data, as: UTF8.self))
        else { throw UpdateError.noDownload }
        return hex
    }

    // MARK: Downloading

    /// Downloads the zip into `directory`, then refuses it unless its size
    /// and SHA-256 match.
    @concurrent
    func download(
        _ update: AvailableUpdate,
        sha256 expected: String,
        into directory: URL,
        progress: @escaping @Sendable (Double) -> Void
    ) async throws -> URL {
        guard Self.isAllowed(update.download) else {
            throw UpdateError.untrustedHost(update.download.host ?? update.download.absoluteString)
        }
        let delegate = RedirectGuard()
        // URLSession writes the download to a file of its own; this only
        // reports how far it's got, and stops one that's bigger than promised
        // rather than let it fill the disk.
        let monitor = Task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(200))
                guard let received = delegate.bytesReceived, received > 0 else { continue }
                if received > update.size {
                    delegate.cancelOversized()
                    return
                }
                progress(Double(received) / Double(update.size))
            }
        }
        defer { monitor.cancel() }

        let temporary: URL
        let response: URLResponse
        do {
            (temporary, response) = try await session.download(for: URLRequest(url: update.download), delegate: delegate)
        } catch {
            if let host = delegate.refusedHost { throw UpdateError.untrustedHost(host) }
            if delegate.wasOversized { throw UpdateError.sizeMismatch }
            throw UpdateError.downloadFailed
        }
        defer { try? FileManager.default.removeItem(at: temporary) }
        if let host = delegate.refusedHost { throw UpdateError.untrustedHost(host) }
        // Where the redirects ended up.
        guard Self.isAllowed(response.url) else {
            throw UpdateError.untrustedHost(response.url?.host ?? String(localized: "an unknown host"))
        }
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw UpdateError.downloadFailed }

        let file = directory.appendingPathComponent(AvailableUpdate.assetName)
        do {
            try? FileManager.default.removeItem(at: file)
            try FileManager.default.moveItem(at: temporary, to: file)
        } catch {
            throw UpdateError.downloadFailed
        }
        let size = (try? FileManager.default.attributesOfItem(atPath: file.path)[.size] as? NSNumber)?.intValue
        guard size == update.size else { throw UpdateError.sizeMismatch }
        progress(1)

        let actual: String
        do {
            actual = try Self.sha256(of: file)
        } catch {
            throw UpdateError.downloadFailed
        }
        guard actual == expected.lowercased() else { throw UpdateError.checksumMismatch }
        return file
    }

    private static let chunkSize = 256 * 1024

    /// The file's SHA-256 as lowercase hex, read a chunk at a time.
    static func sha256(of file: URL) throws -> String {
        let handle = try FileHandle(forReadingFrom: file)
        defer { try? handle.close() }
        var hasher = SHA256()
        while let chunk = try handle.read(upToCount: chunkSize), !chunk.isEmpty {
            hasher.update(data: chunk)
        }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }

    private func fetch(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let delegate = RedirectGuard()
        do {
            let (data, response) = try await session.data(for: request, delegate: delegate)
            if let host = delegate.refusedHost { throw UpdateError.untrustedHost(host) }
            guard Self.isAllowed(response.url), let http = response as? HTTPURLResponse else {
                throw UpdateError.untrustedHost(response.url?.host ?? String(localized: "an unknown host"))
            }
            return (data, http)
        } catch let error as UpdateError {
            throw error
        } catch {
            if let host = delegate.refusedHost { throw UpdateError.untrustedHost(host) }
            throw UpdateError.unreachable
        }
    }
}

/// Follows a redirect only to another allowed host over HTTPS, and keeps
/// hold of its task so a download's progress can be read.
private final class RedirectGuard: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    private let lock = NSLock()
    private var refused: String?
    private var task: URLSessionTask?
    private var oversized = false

    var refusedHost: String? { lock.withLock { refused } }
    var wasOversized: Bool { lock.withLock { oversized } }
    var bytesReceived: Int? { lock.withLock { task.map { Int($0.countOfBytesReceived) } } }

    func cancelOversized() {
        let task = lock.withLock {
            oversized = true
            return self.task
        }
        task?.cancel()
    }

    func urlSession(_ session: URLSession, didCreateTask task: URLSessionTask) {
        lock.withLock { self.task = task }
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping @Sendable (URLRequest?) -> Void
    ) {
        if UpdateService.isAllowed(request.url) {
            completionHandler(request)
            return
        }
        lock.withLock { refused = request.url?.host ?? request.url?.absoluteString ?? String(localized: "an unknown host") }
        task.cancel()
        completionHandler(nil)
    }
}
