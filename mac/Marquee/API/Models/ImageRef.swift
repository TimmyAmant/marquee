import Foundation

extension API {
    /// An artwork path from the API (`posterPath`, `backdropPath`,
    /// `profilePath`, `logoPath`, `stillPath`). Usually a TMDb path
    /// (`"/abc.jpg"`), but a poster or backdrop can be a full `https://` URL
    /// (a TheTVDB fallback) — `url(_:)` handles both, like the website's
    /// `tmdbImageUrl` (api-v1.md deviation 1).
    struct ImageRef: Codable, Hashable, Sendable, CustomStringConvertible, ExpressibleByStringLiteral {
        /// TMDb's image widths. Posters: w92–w780; profiles: w45, w185, h632;
        /// backdrops: w300, w780, w1280; logos: w45–w500; stills: w92–w300.
        enum Size: String, Sendable, CaseIterable {
            case w45, w92, w154, w185, w300, w342, w500, w780, w1280, h632, original
        }

        /// The raw value as the server sent it.
        let path: String

        init(_ path: String) {
            self.path = path
        }

        init(stringLiteral value: String) {
            self.init(value)
        }

        init(from decoder: Decoder) throws {
            path = try decoder.singleValueContainer().decode(String.self)
        }

        func encode(to encoder: Encoder) throws {
            var container = encoder.singleValueContainer()
            try container.encode(path)
        }

        var description: String { path }

        /// Already a full URL; `size` doesn't apply.
        var isAbsolute: Bool {
            path.hasPrefix("https://") || path.hasPrefix("http://")
        }

        /// The image at `size`; nil for an empty path.
        func url(_ size: Size = .w500) -> URL? {
            Self.url(path, size: size)
        }

        /// The same rule for a plain string (or nil).
        static func url(_ path: String?, size: Size = .w500) -> URL? {
            guard let path, !path.isEmpty else { return nil }
            if path.hasPrefix("https://") || path.hasPrefix("http://") { return URL(string: path) }
            return URL(string: "https://image.tmdb.org/t/p/\(size.rawValue)\(path.hasPrefix("/") ? path : "/" + path)")
        }
    }
}

extension Optional where Wrapped == API.ImageRef {
    /// `card.posterPath.url(.w342)` without unwrapping first.
    func url(_ size: API.ImageRef.Size = .w500) -> URL? {
        self?.url(size)
    }
}
