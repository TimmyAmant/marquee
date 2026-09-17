import Foundation

/// Where a Marquee server lives: scheme, host and port, normalized so the same
/// server always produces the same base URL (the dedupe key for discovery and
/// the Keychain account for its token).
///
/// Accepts what people actually type or paste: `192.168.1.20`,
/// `192.168.1.20:3000`, `tower.local`, `http://host:port/`, or an `https://`
/// URL behind a reverse proxy. Plain HTTP without a port means the Docker
/// default `APP_PORT` of 3000; HTTPS without a port keeps the scheme's 443.
struct ServerAddress: Hashable, Sendable {
    enum Scheme: String, Sendable {
        case http
        case https

        var defaultPort: Int { self == .https ? 443 : 80 }
    }

    /// Marquee's docker-compose default (`APP_PORT`).
    static let defaultPort = 3000

    let scheme: Scheme
    /// Lowercased host name or IP literal, without IPv6 brackets.
    let host: String
    /// Explicit port, or nil for HTTPS on its default port.
    let port: Int?

    init(scheme: Scheme = .http, host: String, port: Int? = nil) {
        self.scheme = scheme
        self.host = host.lowercased()
        self.port = port ?? (scheme == .http ? Self.defaultPort : nil)
    }

    /// The port a TCP connection actually uses.
    var effectivePort: Int { port ?? scheme.defaultPort }

    var isIPv6Literal: Bool { host.contains(":") }

    private var hostForURL: String { isIPv6Literal ? "[\(host)]" : host }

    /// `http://192.168.1.20:3000`, with no trailing slash.
    var baseURLString: String {
        var value = "\(scheme.rawValue)://\(hostForURL)"
        if let port { value += ":\(port)" }
        return value
    }

    var baseURL: URL {
        // Every component was validated when the address was built.
        URL(string: baseURLString)!
    }

    /// What the UI shows: `192.168.1.20:3000` for plain HTTP, the full URL for HTTPS.
    var displayName: String {
        switch scheme {
        case .http:
            return "\(hostForURL):\(effectivePort)"
        case .https:
            return baseURLString
        }
    }

    var isLoopback: Bool {
        host == "localhost" || host == "::1" || host.hasPrefix("127.")
    }

    /// True for bare IPv4/IPv6 literals, false for names like `tower.local`.
    var isIPLiteral: Bool {
        isIPv6Literal || IPv4.parse(host) != nil
    }

    enum ParseError: LocalizedError, Equatable {
        case empty
        case invalid
        case unsupportedScheme(String)
        case invalidPort

        var errorDescription: String? {
            switch self {
            case .empty:
                return "Enter your server's IP address or URL."
            case .invalid:
                return "That doesn't look like an address. Try something like 192.168.1.20:3000."
            case let .unsupportedScheme(scheme):
                return "Marquee servers use http or https, not \(scheme)."
            case .invalidPort:
                return "The port must be a number between 1 and 65535."
            }
        }
    }

    /// Parses user input. Any path, query or fragment is dropped, since Marquee
    /// always serves from the root, so a pasted `http://tower:3000/discover` works.
    static func parse(_ input: String) throws(ParseError) -> ServerAddress {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw .empty }
        guard !trimmed.contains(where: { $0.isWhitespace }) else { throw .invalid }

        let candidate: String
        if let range = trimmed.range(of: "://") {
            let scheme = trimmed[..<range.lowerBound].lowercased()
            guard Scheme(rawValue: scheme) != nil else { throw .unsupportedScheme(scheme) }
            candidate = scheme + trimmed[range.lowerBound...]
        } else {
            candidate = "http://" + trimmed
        }

        // A non-numeric or out-of-range port makes URLComponents fail outright;
        // check it first so the message is about the port, not the whole address.
        if let portText = explicitPort(in: candidate) {
            guard let port = Int(portText), (1...65_535).contains(port) else { throw .invalidPort }
        }

        guard let components = URLComponents(string: candidate),
              let rawScheme = components.scheme?.lowercased(),
              let scheme = Scheme(rawValue: rawScheme),
              var host = components.host, !host.isEmpty else {
            throw .invalid
        }
        guard components.user == nil, components.password == nil else { throw .invalid }

        if host.hasPrefix("[") && host.hasSuffix("]") {
            host = String(host.dropFirst().dropLast())
        }
        guard isValidHost(host) else { throw .invalid }

        if let port = components.port {
            guard (1...65_535).contains(port) else { throw .invalidPort }
            return ServerAddress(scheme: scheme, host: host, port: port)
        }
        return ServerAddress(scheme: scheme, host: host)
    }

    /// Rebuilds a saved base URL (UserDefaults) without re-applying defaults.
    init?(baseURLString: String) {
        guard let parsed = try? Self.parse(baseURLString) else { return nil }
        self = parsed
    }

    /// The text after the host's colon in `scheme://host:port/…`, if any.
    private static func explicitPort(in url: String) -> Substring? {
        guard let schemeEnd = url.range(of: "://")?.upperBound else { return nil }
        var authority = url[schemeEnd...].prefix { $0 != "/" && $0 != "?" && $0 != "#" }
        if let at = authority.lastIndex(of: "@") {
            authority = authority[authority.index(after: at)...]
        }
        if authority.hasPrefix("[") {
            guard let close = authority.firstIndex(of: "]") else { return nil }
            let rest = authority[authority.index(after: close)...]
            return rest.hasPrefix(":") ? rest.dropFirst() : nil
        }
        guard let colon = authority.lastIndex(of: ":") else { return nil }
        return authority[authority.index(after: colon)...]
    }

    private static func isValidHost(_ host: String) -> Bool {
        if host.contains(":") {
            // IPv6 literal; URLComponents already validated the brackets.
            return host.allSatisfy { $0.isHexDigit || $0 == ":" || $0 == "." || $0 == "%" }
        }
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-._"))
        guard host.unicodeScalars.allSatisfy({ allowed.contains($0) }) else { return false }
        guard !host.hasPrefix("."), !host.hasPrefix("-"), !host.contains("..") else { return false }
        // All-numeric dotted hosts must be a real IPv4 address ("192.168.1" isn't).
        if host.allSatisfy({ $0.isNumber || $0 == "." }) {
            return IPv4.parse(host) != nil
        }
        return true
    }
}

/// IPv4 addresses as host-byte-order integers, so subnet math is plain arithmetic.
enum IPv4 {
    static func parse(_ string: String) -> UInt32? {
        let parts = string.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 4 else { return nil }
        var value: UInt32 = 0
        for part in parts {
            guard !part.isEmpty, part.count <= 3, part.allSatisfy(\.isNumber), let octet = UInt8(part) else { return nil }
            value = value << 8 | UInt32(octet)
        }
        return value
    }

    static func string(_ address: UInt32) -> String {
        "\(address >> 24 & 0xFF).\(address >> 16 & 0xFF).\(address >> 8 & 0xFF).\(address & 0xFF)"
    }
}
