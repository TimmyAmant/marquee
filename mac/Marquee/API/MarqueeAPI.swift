import Foundation

// MARK: - The typed /api/v1 layer
//
// `MarqueeAPI` is a Sendable facade over `APIClient` with one typed async
// method per endpoint in docs/api-v1.md (all 121), namespaced by area:
//
//     let detail = try await model.api.titles.detail(.movie, id: 603)
//     try await model.api.requests.approve(request.id)
//     let pin = try await model.api.integrations.plex.startPin()
//
// Views reach it through `@Environment(AppModel.self)` as `model.api`, which
// carries the current token and records mutations in `model.events`. Every
// method throws `APIError` (401s also sign the session out, as before).
// `{"results": [...]}` lists come back as plain arrays and `{"ok": true}`
// actions as `Void`.
//
// MARK: Naming decision: everything server-shaped lives in `API.*`
//
// DTOs and enums are nested in the caseless `API` namespace (`API.TitleCard`,
// `API.MediaType`, `API.LibraryStatus`, …), which is the app's only model
// layer: there is no local database and no second set of domain types.
//
// - The API enums are open (`OpenEnum`: an `.unknown(String)` fallback), so a
//   newer server can add a case without breaking decoding here. A view that
//   renders one checks `isKnown` rather than printing a raw wire value.
// - `API.` at a call site says "this came from the server".
//
// The core contract types (`User`, `ServerInfo`, `AuthTokenResponse`,
// `Paginated`) live top-level in Connection/ and are aliased into `API`
// (`User.role` is already the open `API.UserRole`).

/// Namespace for every /api/v1 request and response shape.
enum API {}

struct MarqueeAPI: Sendable {
    /// Per-request idle timeouts. The URL session allows a request up to 15
    /// minutes in total, so the long-running ones can actually finish.
    enum Timeout {
        static let standard: TimeInterval = APIClient.requestTimeout
        /// TMDb-backed pages: a cold cache fans out to many TMDb calls.
        static let tmdb: TimeInterval = 45
        /// Calls that test or sync a connected service before answering.
        static let integrations: TimeInterval = 60
        /// Plex's first sync, "Run now", "Sync now", "Approve all".
        static let longRunning: TimeInterval = 600
    }

    let transport: Transport

    /// - Parameters:
    ///   - client: nil when no server is selected; every call then throws `.unauthorized`.
    ///   - events: bumped after each successful mutation (nil: nothing to notify).
    init(client: APIClient?, events: ServerEvents? = nil) {
        transport = Transport(client: client, events: events)
    }

    // MARK: Namespaces

    var auth: AuthEndpoints { AuthEndpoints(transport: transport) }
    var discover: DiscoverEndpoints { DiscoverEndpoints(transport: transport) }
    var browse: BrowseEndpoints { BrowseEndpoints(transport: transport) }
    var search: SearchEndpoints { SearchEndpoints(transport: transport) }
    var titles: TitlesEndpoints { TitlesEndpoints(transport: transport) }
    var people: PeopleEndpoints { PeopleEndpoints(transport: transport) }
    var companies: CompaniesEndpoints { CompaniesEndpoints(transport: transport) }
    var favorites: FavoritesEndpoints { FavoritesEndpoints(transport: transport) }
    var requests: RequestsEndpoints { RequestsEndpoints(transport: transport) }
    var issues: IssuesEndpoints { IssuesEndpoints(transport: transport) }
    var comments: CommentsEndpoints { CommentsEndpoints(transport: transport) }
    var blocklist: BlocklistEndpoints { BlocklistEndpoints(transport: transport) }
    var notifications: NotificationsEndpoints { NotificationsEndpoints(transport: transport) }
    var calendar: CalendarEndpoints { CalendarEndpoints(transport: transport) }
    var activity: ActivityEndpoints { ActivityEndpoints(transport: transport) }
    var users: UsersEndpoints { UsersEndpoints(transport: transport) }
    var links: LinksEndpoints { LinksEndpoints(transport: transport) }
    var plexWatchlist: PlexWatchlistEndpoints { PlexWatchlistEndpoints(transport: transport) }
    var integrations: IntegrationsEndpoints { IntegrationsEndpoints(transport: transport) }
    var jobs: JobsEndpoints { JobsEndpoints(transport: transport) }
    var about: AboutEndpoints { AboutEndpoints(transport: transport) }
    var help: HelpEndpoints { HelpEndpoints(transport: transport) }

    // MARK: Transport

    /// Sends through the session's `APIClient` off the main actor, and records
    /// mutations once they've succeeded.
    struct Transport: Sendable {
        let client: APIClient?
        let events: ServerEvents?

        @concurrent
        func get<Response: Decodable & Sendable>(
            _ path: String,
            query: [String: String?] = [:],
            timeout: TimeInterval = Timeout.standard,
            as type: Response.Type = Response.self
        ) async throws -> Response {
            try await requireClient().send(.get, path, query: query, timeout: timeout, as: type)
        }

        /// A call that changes server state: `changes` are recorded in `events` after it succeeds.
        @concurrent
        func mutate<Response: Decodable & Sendable>(
            _ method: HTTPMethod,
            _ path: String,
            body: (any Encodable & Sendable)? = nil,
            timeout: TimeInterval = Timeout.standard,
            changes: ServerEvents.Change,
            as type: Response.Type = Response.self
        ) async throws -> Response {
            let client = try requireClient()
            let data = try body.map(Self.encode)
            let response = try await client.send(method, path, body: data, timeout: timeout, as: type)
            if !changes.isEmpty, let events {
                await events.record(changes)
            }
            return response
        }

        /// A POST that reads (`/surprise`) or that the session owns (login): nothing to record.
        @concurrent
        func post<Response: Decodable & Sendable>(
            _ path: String,
            body: (any Encodable & Sendable)? = nil,
            timeout: TimeInterval = Timeout.standard,
            as type: Response.Type = Response.self
        ) async throws -> Response {
            let client = try requireClient()
            let data = try body.map(Self.encode)
            return try await client.send(.post, path, body: data, timeout: timeout, as: type)
        }

        /// A call whose body is a file's own bytes (a profile photo), recorded
        /// like `mutate` once it succeeds.
        @concurrent
        func upload<Response: Decodable & Sendable>(
            _ method: HTTPMethod,
            _ path: String,
            data: Data,
            contentType: String,
            timeout: TimeInterval = Timeout.standard,
            changes: ServerEvents.Change,
            as type: Response.Type = Response.self
        ) async throws -> Response {
            let client = try requireClient()
            let response = try await client.send(method, path, body: data, contentType: contentType, timeout: timeout, as: type)
            if !changes.isEmpty, let events {
                await events.record(changes)
            }
            return response
        }

        /// A call whose statuses carry meaning of their own (a Plex sign-in
        /// poll's 202 / 403 / 410): the raw status and body of any 2xx answer
        /// or one in `accepting`; see `APIClient.exchange`. Nothing is
        /// recorded — the caller records once it knows the call succeeded.
        @concurrent
        func exchange(
            _ method: HTTPMethod,
            _ path: String,
            body: (any Encodable & Sendable)? = nil,
            accepting: Set<Int>,
            timeout: TimeInterval = Timeout.standard
        ) async throws -> (status: Int, body: Data) {
            let client = try requireClient()
            let data = try body.map(Self.encode)
            return try await client.exchange(method, path, body: data, accepting: accepting, timeout: timeout)
        }

        /// Records `changes` after a call made with `exchange` succeeded.
        func record(_ changes: ServerEvents.Change) async {
            if !changes.isEmpty, let events {
                await events.record(changes)
            }
        }

        /// A file rather than JSON, at a server-relative path the server
        /// handed out (`avatarUrl`).
        @concurrent
        func data(at serverPath: String, timeout: TimeInterval = Timeout.standard) async throws -> Data {
            try await requireClient().data(atServerPath: serverPath, timeout: timeout)
        }

        /// A Server-Sent Events stream, until it ends; see `APIClient.events`.
        @concurrent
        func events(
            _ path: String,
            onEvent: @escaping @Sendable (ServerSentEvent) async -> Void
        ) async throws -> Duration? {
            try await requireClient().events(path, onEvent: onEvent)
        }

        private func requireClient() throws -> APIClient {
            guard let client else { throw APIError.unauthorized }
            return client
        }

        private static func encode(_ body: any Encodable & Sendable) throws -> Data {
            do {
                return try APIClient.encoder.encode(body)
            } catch {
                throw APIError.invalid("Couldn't encode the request: \(error.localizedDescription)")
            }
        }
    }

    // MARK: Paths

    /// One percent-encoded path segment (an id or type can't add a `/`).
    static func segment(_ value: String) -> String {
        var allowed = CharacterSet.urlPathAllowed
        allowed.remove(charactersIn: "/?#")
        return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
    }

    /// Lowercase: the server compares some ids as strings (editing your own
    /// account), and `UUID.uuidString` is uppercase.
    static func segment(_ id: UUID) -> String {
        id.uuidString.lowercased()
    }

    static func segment(_ type: API.MediaType) -> String {
        segment(type.rawValue)
    }

    static func segment(_ type: API.FavoriteEntityType) -> String {
        segment(type.rawValue)
    }
}
