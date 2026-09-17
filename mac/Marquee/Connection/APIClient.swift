import Foundation
import OSLog

/// JSON client for one Marquee server's `/api/v1` (Docs/API_V1_CORE.md).
/// A value type: `ServerSession` hands out a fresh one carrying the current
/// token, so an in-flight request never picks up a token that changed under it.
///
/// Every method throws `APIError`, and only `APIError`.
struct APIClient: Sendable {
    static let apiHeader = "X-Marquee-API"
    static let basePath = "/api/v1"
    static let requestTimeout: TimeInterval = 15

    let baseURL: URL
    let token: String?
    /// Awaited before `.unauthorized` is thrown from a call that sent a token,
    /// so the session can drop back to sign-in wherever the 401 came from.
    let onUnauthorized: (@Sendable () async -> Void)?
    private let session: URLSession

    private static let logger = Logger(subsystem: "com.timmyamant.Marquee", category: "api")

    /// Cookie-less and uncached: the bearer token is the only credential, and
    /// every screen wants fresh data.
    static let defaultSession: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = requestTimeout
        // Per-request idle timeouts do the real limiting; this cap only has to
        // let the long calls finish (Plex's first sync, "Run now").
        configuration.timeoutIntervalForResource = 900
        configuration.waitsForConnectivity = false
        configuration.httpShouldSetCookies = false
        configuration.httpCookieAcceptPolicy = .never
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.httpAdditionalHeaders = ["User-Agent": "Marquee-macOS/\(AppInfo.version)"]
        return URLSession(configuration: configuration)
    }()

    init(
        baseURL: URL,
        token: String? = nil,
        session: URLSession = APIClient.defaultSession,
        onUnauthorized: (@Sendable () async -> Void)? = nil
    ) {
        self.baseURL = baseURL
        self.token = token
        self.session = session
        self.onUnauthorized = onUnauthorized
    }

    // MARK: Verbs

    func get<Response: Decodable>(
        _ path: String,
        query: [String: String?] = [:],
        as type: Response.Type = Response.self
    ) async throws -> Response {
        try await send(.get, path, query: query, as: type)
    }

    func post<Response: Decodable>(
        _ path: String,
        body: some Encodable,
        as type: Response.Type = Response.self
    ) async throws -> Response {
        try await send(.post, path, body: try Self.encode(body), as: type)
    }

    func post<Response: Decodable>(_ path: String, as type: Response.Type = Response.self) async throws -> Response {
        try await send(.post, path, as: type)
    }

    func put<Response: Decodable>(
        _ path: String,
        body: some Encodable,
        as type: Response.Type = Response.self
    ) async throws -> Response {
        try await send(.put, path, body: try Self.encode(body), as: type)
    }

    func patch<Response: Decodable>(
        _ path: String,
        body: some Encodable,
        as type: Response.Type = Response.self
    ) async throws -> Response {
        try await send(.patch, path, body: try Self.encode(body), as: type)
    }

    func delete<Response: Decodable>(
        _ path: String,
        query: [String: String?] = [:],
        as type: Response.Type = Response.self
    ) async throws -> Response {
        try await send(.delete, path, query: query, as: type)
    }

    // MARK: Transport

    /// - Parameter path: Relative to `/api/v1`, e.g. `"/me"`.
    func send<Response: Decodable>(
        _ method: HTTPMethod,
        _ path: String,
        query: [String: String?] = [:],
        body: Data? = nil,
        timeout: TimeInterval = requestTimeout,
        as type: Response.Type = Response.self
    ) async throws -> Response {
        let normalizedPath = path.hasPrefix("/") ? path : "/" + path
        guard let url = HTTPRequest.url(base: baseURL.absoluteString, path: Self.basePath + normalizedPath, query: query) else {
            throw APIError.invalid("Invalid request path: \(path)")
        }

        var request = URLRequest(url: url, timeoutInterval: timeout)
        request.httpMethod = method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.wrapping(error)
        }
        guard let http = response as? HTTPURLResponse else { throw APIError.notMarquee }

        let hasAPIHeader = http.value(forHTTPHeaderField: Self.apiHeader) != nil
        let isJSON = http.mimeType?.lowercased().contains("json") == true
        guard hasAPIHeader || isJSON else {
            // A reverse proxy's "bad gateway" page means the server is down,
            // not that it's the wrong kind of server.
            if (502...504).contains(http.statusCode) {
                throw APIError.network(URLError(.cannotConnectToHost))
            }
            throw APIError.notMarquee
        }
        if !hasAPIHeader {
            Self.logger.warning("\(method.rawValue, privacy: .public) \(normalizedPath, privacy: .public) answered without \(Self.apiHeader, privacy: .public)")
        }

        guard (200..<300).contains(http.statusCode) else {
            let error = APIError.from(statusCode: http.statusCode, body: data)
            if error == .unauthorized, token != nil, let onUnauthorized {
                await onUnauthorized()
            }
            throw error
        }

        if data.isEmpty, let empty = EmptyResponse() as? Response {
            return empty
        }
        do {
            return try Self.decoder.decode(Response.self, from: data)
        } catch {
            Self.logger.error("Decoding \(normalizedPath, privacy: .public) failed: \(String(describing: error), privacy: .public)")
            throw APIError.server("Your Marquee server sent a response this version of the app couldn't read.")
        }
    }

    // MARK: JSON

    static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let string = try container.decode(String.self)
            guard let date = parseDate(string) else {
                throw DecodingError.dataCorruptedError(in: container, debugDescription: "Expected an ISO-8601 date, got \(string)")
            }
            return date
        }
        return decoder
    }()

    static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .custom { date, encoder in
            var container = encoder.singleValueContainer()
            try container.encode(date.formatted(fractionalISO8601))
        }
        return encoder
    }()

    private static let fractionalISO8601 = Date.ISO8601FormatStyle(includingFractionalSeconds: true)
    private static let wholeSecondISO8601 = Date.ISO8601FormatStyle()
    private static let calendarDate = Date.ISO8601FormatStyle().year().month().day()

    /// `2026-09-17T12:00:00.000Z` as the contract specifies, tolerating
    /// timestamps without milliseconds and bare `YYYY-MM-DD` dates (UTC midnight).
    static func parseDate(_ string: String) -> Date? {
        if let date = try? fractionalISO8601.parse(string) { return date }
        if let date = try? wholeSecondISO8601.parse(string) { return date }
        if let date = try? calendarDate.parse(string) { return date }
        return nil
    }

    private static func encode(_ body: some Encodable) throws -> Data {
        do {
            return try encoder.encode(body)
        } catch {
            throw APIError.invalid("Couldn't encode the request: \(error.localizedDescription)")
        }
    }
}
