import Foundation

/// `GET /api/v1/server-info`, the public discovery endpoint (Docs/API_V1_CORE.md).
struct ServerInfo: Codable, Equatable, Hashable, Sendable {
    /// Always `"marquee"`; anything else isn't one of ours.
    let app: String
    let apiVersion: Int
    /// The server's package.json version, e.g. `"0.22.0"`.
    let version: String
    /// Nil when the server can't reach its database (`status == "degraded"`).
    let setupComplete: Bool?
    let status: String

    static let supportedAPIVersion = 1
    /// The first server release with the v1 API — what "Update required" asks for.
    static let minimumServerVersion = "0.22.0"

    var isDegraded: Bool { status == "degraded" }

    init(app: String = "marquee", apiVersion: Int = supportedAPIVersion, version: String, setupComplete: Bool?, status: String = "ok") {
        self.app = app
        self.apiVersion = apiVersion
        self.version = version
        self.setupComplete = setupComplete
        self.status = status
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        app = try container.decode(String.self, forKey: .app)
        apiVersion = try container.decode(Int.self, forKey: .apiVersion)
        version = try container.decodeIfPresent(String.self, forKey: .version) ?? "unknown"
        setupComplete = try container.decodeIfPresent(Bool.self, forKey: .setupComplete)
        status = try container.decodeIfPresent(String.self, forKey: .status) ?? "ok"
    }
}

/// Why a server couldn't be reached — each gets its own explanation in the UI.
enum UnreachableReason: Equatable, Hashable, Sendable {
    /// Connection refused: the computer is there, but nothing listens on that port.
    case refused
    /// Timed out, or the host is down.
    case noResponse
    /// The host name didn't resolve (e.g. `tower.local` isn't on this network).
    case unknownHost
    /// macOS blocked the connection: Marquee lacks Local Network access.
    case localNetworkDenied
    /// Anything else (TLS failure, …), with the system's message.
    case failed(String)
}

/// What answered at an address.
enum ProbeOutcome: Equatable, Hashable, Sendable {
    /// A Marquee server with the API version this app speaks.
    case marquee(ServerInfo)
    /// A Marquee server older than 0.22.0: no v1 API, so `/api/v1/server-info`
    /// redirected to the `/login` HTML page.
    case legacy
    /// A Marquee server speaking an API version this app doesn't know.
    case incompatible(ServerInfo)
    /// Something answered, but it isn't Marquee.
    case notMarquee
    case unreachable(UnreachableReason)

    var serverInfo: ServerInfo? {
        if case let .marquee(info) = self { return info }
        return nil
    }

    /// The inline error for manual entry and saved-server checks; nil for a usable server.
    func problemMessage(for address: ServerAddress) -> String? {
        let name = address.displayName
        switch self {
        case .marquee:
            return nil
        case .legacy:
            return "Found Marquee at \(name), but the server needs updating to \(ServerInfo.minimumServerVersion) or later to work with the Mac app."
        case let .incompatible(info):
            return "The server at \(name) runs Marquee \(info.version), which is newer than this app supports. Update Marquee for Mac."
        case .notMarquee:
            return "\(name) responded, but it isn't a Marquee server. Check the address and port."
        case let .unreachable(reason):
            switch reason {
            case .refused:
                return "Nothing is answering on port \(address.effectivePort) at \(address.host). Check the port and that Marquee is running."
            case .noResponse:
                return "Couldn't reach \(name). Check the address and that the server is on."
            case .unknownHost:
                return "Couldn't find \(address.host) on your network. Try its IP address instead."
            case .localNetworkDenied:
                return "Marquee doesn't have Local Network access. Turn it on in System Settings › Privacy & Security › Local Network."
            case let .failed(message):
                return "Couldn't connect to \(name): \(message)"
            }
        }
    }
}

/// Identifies whatever is listening at an address by asking for
/// `/api/v1/server-info`, the same check discovery runs on every open port.
enum ServerProbe {
    static let infoPath = "/api/v1/server-info"

    /// Ephemeral and cookie-less, so a web session cookie never changes what
    /// the server answers, and nothing is cached between probes.
    private static let session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 6
        configuration.timeoutIntervalForResource = 10
        configuration.waitsForConnectivity = false
        configuration.httpShouldSetCookies = false
        configuration.httpCookieAcceptPolicy = .never
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.httpAdditionalHeaders = ["User-Agent": "Marquee-macOS/\(AppInfo.version)"]
        return URLSession(configuration: configuration)
    }()

    /// Full check for a single address (manual entry, saved server): a TCP
    /// connect first, which tells "refused", "no response" and "Local Network
    /// denied" apart, then the HTTP request.
    @concurrent
    static func probe(
        _ address: ServerAddress,
        connectTimeout: Duration = .seconds(4),
        requestTimeout: TimeInterval = 6
    ) async -> ProbeOutcome {
        switch await TCPProbe.check(host: address.host, port: address.effectivePort, timeout: connectTimeout, ipv4Only: false) {
        case .open:
            return await fetchInfo(address, timeout: requestTimeout)
        case .refused:
            return .unreachable(.refused)
        case .noResponse:
            return .unreachable(.noResponse)
        case .unknownHost:
            return .unreachable(.unknownHost)
        case .localNetworkDenied:
            return .unreachable(.localNetworkDenied)
        }
    }

    /// Just the HTTP half, for callers that already know the port is open.
    @concurrent
    static func fetchInfo(_ address: ServerAddress, timeout: TimeInterval) async -> ProbeOutcome {
        guard let url = URL(string: address.baseURLString + infoPath) else { return .notMarquee }
        var request = URLRequest(url: url, timeoutInterval: timeout)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else { return .notMarquee }
            return classify(
                statusCode: http.statusCode,
                contentType: http.value(forHTTPHeaderField: "Content-Type"),
                apiHeader: http.value(forHTTPHeaderField: APIClient.apiHeader),
                body: data
            )
        } catch {
            return .unreachable(unreachableReason(for: error))
        }
    }

    /// Pure classification of a server-info response, so it's unit-testable
    /// from canned bodies.
    static func classify(statusCode: Int, contentType: String?, apiHeader: String?, body: Data) -> ProbeOutcome {
        if (200..<300).contains(statusCode),
           let info = try? JSONDecoder().decode(ServerInfo.self, from: body),
           info.app == "marquee" {
            return info.apiVersion == ServerInfo.supportedAPIVersion ? .marquee(info) : .incompatible(info)
        }
        if isLegacyMarqueePage(contentType: contentType, body: body) {
            return .legacy
        }
        if apiHeader != nil {
            // A v1 server that failed to answer server-info (it's meant to
            // return 200 even when degraded) — it's ours, but not usable now.
            return .unreachable(.failed("the server returned an error (\(statusCode))."))
        }
        return .notMarquee
    }

    /// Legacy servers answer every unknown route with the web app's HTML,
    /// whose root layout sets `<title>Marquee</title>` (app/layout.tsx).
    static func isLegacyMarqueePage(contentType: String?, body: Data) -> Bool {
        let head = String(decoding: body.prefix(256_000), as: UTF8.self)
        let looksLikeHTML = contentType?.lowercased().contains("html") == true
            || head.range(of: "<html", options: .caseInsensitive) != nil
        guard looksLikeHTML else { return false }
        return head.range(of: #"<title[^>]*>\s*Marquee\s*</title>"#, options: [.regularExpression, .caseInsensitive]) != nil
    }

    static func unreachableReason(for error: Error) -> UnreachableReason {
        guard let urlError = error as? URLError else {
            return .failed(error.localizedDescription)
        }
        switch urlError.code {
        case .cannotConnectToHost:
            return .refused
        case .timedOut, .networkConnectionLost, .notConnectedToInternet:
            return .noResponse
        case .cannotFindHost, .dnsLookupFailed:
            return .unknownHost
        default:
            return .failed(urlError.localizedDescription)
        }
    }
}
