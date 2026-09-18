import SwiftUI
import AppKit

/// Memory + disk cached image loading for TMDb/TVDB artwork.
actor ImagePipeline {
    static let shared = ImagePipeline()

    // NSCache is internally synchronized, so the nonisolated fast path is safe.
    nonisolated(unsafe) private let memory = NSCache<NSURL, NSImage>()
    private var inFlight: [URL: Task<NSImage?, Never>] = [:]
    private let session: URLSession

    /// Decoded bytes kept in memory. A w342 poster is ~0.5 MB decoded and a
    /// w1280 backdrop ~3.5 MB, so the count limit alone let a few backdrops
    /// and a long browse session grow without bound.
    static let memoryCostLimit = 200 * 1024 * 1024

    init() {
        memory.countLimit = 600
        memory.totalCostLimit = Self.memoryCostLimit
        let configuration = URLSessionConfiguration.default
        configuration.urlCache = URLCache(memoryCapacity: 64 * 1024 * 1024, diskCapacity: 512 * 1024 * 1024)
        configuration.requestCachePolicy = .returnCacheDataElseLoad
        configuration.timeoutIntervalForRequest = 20
        session = URLSession(configuration: configuration)
    }

    nonisolated func cached(_ url: URL) -> NSImage? {
        memory.object(forKey: url as NSURL)
    }

    func image(for url: URL) async -> NSImage? {
        if let hit = memory.object(forKey: url as NSURL) { return hit }
        if let task = inFlight[url] { return await task.value }

        let session = self.session
        let task = Task<NSImage?, Never> {
            guard let result = try? await session.data(from: url),
                  let http = result.1 as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { return nil }
            return NSImage(data: result.0)
        }
        inFlight[url] = task
        let image = await task.value
        inFlight[url] = nil
        if let image { memory.setObject(image, forKey: url as NSURL, cost: Self.decodedByteCost(of: image)) }
        return image
    }

    /// Roughly what the image costs once drawn: its largest bitmap at 4 bytes
    /// a pixel (the compressed JPEG is a small fraction of that).
    nonisolated static func decodedByteCost(of image: NSImage) -> Int {
        let pixels = image.representations.map { $0.pixelsWide * $0.pixelsHigh }.max() ?? 0
        let fallback = Int(image.size.width * image.size.height)
        return max(pixels, fallback) * 4
    }
}

/// Shimmer placeholder until the artwork arrives, then a fade-in —
/// components/media-image.tsx.
struct RemoteImage: View {
    let url: URL?
    var contentMode: ContentMode = .fill
    var showsShimmer = true

    @State private var image: NSImage?
    @State private var failed = false

    init(url: URL?, contentMode: ContentMode = .fill, showsShimmer: Bool = true) {
        self.url = url
        self.contentMode = contentMode
        self.showsShimmer = showsShimmer
    }

    /// An artwork path straight from the API (`posterPath`, `logoPath`, …).
    init(_ ref: API.ImageRef?, size: API.ImageRef.Size = .w500, contentMode: ContentMode = .fill, showsShimmer: Bool = true) {
        self.init(url: ref.url(size), contentMode: contentMode, showsShimmer: showsShimmer)
    }

    var body: some View {
        ZStack {
            if let image {
                Image(nsImage: image)
                    .resizable()
                    .interpolation(.high)
                    .aspectRatio(contentMode: contentMode)
                    .transition(.opacity)
            } else if showsShimmer && !failed && url != nil {
                ShimmerView()
            }
        }
        .animation(.easeOut(duration: 0.45), value: image != nil)
        .task(id: url) {
            guard let url else {
                image = nil
                return
            }
            if let cached = ImagePipeline.shared.cached(url) {
                image = cached
                return
            }
            image = nil
            failed = false
            let loaded = await ImagePipeline.shared.image(for: url)
            if Task.isCancelled { return }
            image = loaded
            failed = loaded == nil
        }
    }
}

struct ShimmerView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var phase: CGFloat = -1

    var body: some View {
        GeometryReader { proxy in
            Theme.bg2
                .overlay {
                    if !reduceMotion {
                        LinearGradient(
                            colors: [.clear, Theme.bg3, .clear],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                        .frame(width: proxy.size.width)
                        .offset(x: phase * proxy.size.width * 1.5)
                    }
                }
                .clipped()
        }
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 1.6).repeatForever(autoreverses: false)) {
                phase = 1
            }
        }
    }
}
