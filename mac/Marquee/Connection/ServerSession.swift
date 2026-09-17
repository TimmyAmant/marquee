import Foundation
import Observation
import OSLog

/// What a token store can answer. `unavailable` is deliberately separate from
/// `missing`: a Keychain that can't be read right now (locked, an ACL race, a
/// freshly re-signed binary) is not the same as an account that was signed
/// out, and treating the two alike drops a perfectly good session.
enum TokenLookup: Equatable, Sendable {
    case found(String)
    case missing
    case unavailable
}

/// Where bearer tokens live, keyed by server base URL.
protocol TokenStore {
    func token(for server: String) -> String?
    /// Distinguishes "nothing saved" from "couldn't read"; the default maps a
    /// nil `token(for:)` to `.missing`, which is right for in-memory stores.
    func lookup(for server: String) -> TokenLookup
    @discardableResult func save(_ token: String, for server: String) -> Bool
    func delete(for server: String)
}

extension TokenStore {
    func lookup(for server: String) -> TokenLookup {
        token(for: server).map(TokenLookup.found) ?? .missing
    }
}

/// The login Keychain: service `com.timmyamant.Marquee.api`, one item per server.
struct KeychainTokenStore: TokenStore {
    static let service = "com.timmyamant.Marquee.api"
    /// A read that fails is retried before the session gives up on it.
    static let readAttempts = 3
    private static let logger = Logger(subsystem: "com.timmyamant.Marquee", category: "session")

    func lookup(for server: String) -> TokenLookup {
        var lastStatus: OSStatus = errSecSuccess
        for attempt in 1...Self.readAttempts {
            switch Keychain.read(service: Self.service, account: server) {
            case let .found(data):
                guard let token = String(data: data, encoding: .utf8) else { return .missing }
                return .found(token)
            case .notFound:
                return .missing
            case let .error(status):
                lastStatus = status
                Self.logger.error(
                    "Keychain read for \(server, privacy: .public) failed (\(status)), attempt \(attempt) of \(Self.readAttempts)"
                )
            }
        }
        Self.logger.error("Giving up on the Keychain for \(server, privacy: .public) (\(lastStatus)) — not treating it as signed out")
        return .unavailable
    }

    func token(for server: String) -> String? {
        if case let .found(token) = lookup(for: server) { return token }
        return nil
    }

    func save(_ token: String, for server: String) -> Bool {
        Keychain.add(Data(token.utf8), service: Self.service, account: server, label: "Marquee server session")
    }

    func delete(for server: String) {
        Keychain.delete(service: Self.service, account: server)
    }
}

/// Tokens that last until quit, for tests (and as the fallback when the
/// Keychain refuses a write).
final class InMemoryTokenStore: TokenStore {
    private var tokens: [String: String] = [:]

    init(_ tokens: [String: String] = [:]) {
        self.tokens = tokens
    }

    func token(for server: String) -> String? { tokens[server] }

    @discardableResult
    func save(_ token: String, for server: String) -> Bool {
        tokens[server] = token
        return true
    }

    func delete(for server: String) {
        tokens[server] = nil
    }
}

/// A launch-time pin to one server, for automated UI runs.
///
/// With `MARQUEE_PINNED_SERVER` set in the environment (or the
/// `-marquee.server.pinned` launch argument), the session ignores the saved
/// server, keeps its token in memory instead of the Keychain, and refuses to
/// talk to any other host. A stray click in an automated run then can't reach
/// — or sign out of — the real server this Mac normally uses.
struct PinnedServer: Sendable, Equatable {
    static let defaultsKey = "marquee.server.pinned"
    static let environmentKey = "MARQUEE_PINNED_SERVER"
    /// An optional pre-issued token, so a run doesn't need to type a password.
    static let tokenEnvironmentKey = "MARQUEE_PINNED_TOKEN"

    let address: ServerAddress
    let token: String?

    static func resolve(
        environment: [String: String] = ProcessInfo.processInfo.environment,
        defaults: UserDefaults = .standard
    ) -> PinnedServer? {
        let raw = environment[environmentKey] ?? defaults.string(forKey: defaultsKey)
        guard let raw, let address = try? ServerAddress.parse(raw) else { return nil }
        let token = environment[tokenEnvironmentKey].flatMap { $0.isEmpty ? nil : $0 }
        return PinnedServer(address: address, token: token)
    }
}

/// The connection to one Marquee server: which server (UserDefaults), the
/// bearer token (Keychain), and who's signed in. The native counterpart of the
/// web app's session cookie, minus the cookie.
@MainActor
@Observable
final class ServerSession {
    enum RestoreResult: Equatable {
        case signedIn(User)
        /// No token, or the server rejected it (401). Sign in again.
        case signedOut
        /// The server couldn't be used; the outcome says why.
        case unreachable(ProbeOutcome)
    }

    static let serverDefaultsKey = "marquee.server.baseURL"
    static let restoreTimeout: TimeInterval = 6

    /// Non-nil when this launch is pinned to one server (automated runs).
    let pinned: PinnedServer?

    private(set) var server: ServerAddress?
    /// The last successful `server-info`: version and whether setup is done.
    private(set) var serverInfo: ServerInfo?
    private(set) var user: User?
    /// The token store couldn't be read on the last attempt. A caller that
    /// finds no token should say so rather than silently asking for a password
    /// again, and may retry — nothing about the failure is cached.
    private(set) var tokenUnavailable = false

    /// Called after any authenticated call is answered with 401 `unauthorized`
    /// and the token has been dropped.
    @ObservationIgnored var onUnauthorized: (() -> Void)?

    /// Shown in the server's device list; `name` on the token row.
    @ObservationIgnored private(set) lazy var deviceName: String = Host.current().localizedName ?? "Mac"

    @ObservationIgnored private var token: String?
    @ObservationIgnored private var tokenLoaded = false
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let tokenStore: TokenStore
    @ObservationIgnored private let fallbackTokens = InMemoryTokenStore()
    @ObservationIgnored private let urlSession: URLSession

    private static let logger = Logger(subsystem: "com.timmyamant.Marquee", category: "session")

    init(
        defaults: UserDefaults = .standard,
        tokenStore: TokenStore = KeychainTokenStore(),
        urlSession: URLSession = APIClient.defaultSession,
        deviceName: String? = nil,
        pinned: PinnedServer? = PinnedServer.resolve()
    ) {
        self.defaults = defaults
        self.urlSession = urlSession
        self.pinned = pinned
        if let pinned {
            // Pinned runs never read or write the Keychain, and never read the
            // saved server: the real session on this Mac stays untouched.
            let memory = InMemoryTokenStore()
            if let token = pinned.token {
                memory.save(token, for: pinned.address.baseURLString)
            }
            self.tokenStore = memory
            server = pinned.address
            Self.logger.notice("Pinned to \(pinned.address.baseURLString, privacy: .public); the saved server and Keychain are off limits")
        } else {
            self.tokenStore = tokenStore
            if let saved = defaults.string(forKey: Self.serverDefaultsKey) {
                server = ServerAddress(baseURLString: saved)
            }
        }
        if let deviceName {
            self.deviceName = deviceName
        }
    }

    var isSignedIn: Bool { user != nil }

    /// Whether a token is saved for the current server (reads the Keychain once).
    var hasToken: Bool { currentToken() != nil }

    /// An authenticated client for data calls. A 401 from any call made with
    /// it signs the session out and fires `onUnauthorized`.
    var client: APIClient? {
        guard let server else { return nil }
        let token = currentToken()
        return APIClient(baseURL: server.baseURL, token: token, session: urlSession) { [weak self] in
            guard let token else { return }
            await self?.handleUnauthorized(token: token)
        }
    }

    /// The typed API over `client`, without a refresh signal (AppModel's
    /// `api` adds one for the screens).
    var api: MarqueeAPI {
        MarqueeAPI(client: client)
    }

    // MARK: Server

    /// Makes `address` the server this Mac talks to. Switching servers drops
    /// the signed-in user; the new server's own saved token (if any) is used.
    func select(_ address: ServerAddress, info: ServerInfo?) {
        if let pinned, address != pinned.address {
            Self.logger.warning("Refused a switch to \(address.baseURLString, privacy: .public): this launch is pinned")
            return
        }
        if address != server {
            user = nil
            token = nil
            tokenLoaded = false
        }
        server = address
        if let info { serverInfo = info }
        if pinned == nil {
            defaults.set(address.baseURLString, forKey: Self.serverDefaultsKey)
        }
    }

    /// Re-checks `server-info`, updating `serverInfo` when it's a usable server.
    @discardableResult
    func refreshInfo() async -> ProbeOutcome {
        guard let server else { return .unreachable(.noResponse) }
        let outcome = await ServerProbe.probe(server)
        if server == self.server, case let .marquee(info) = outcome {
            serverInfo = info
        }
        return outcome
    }

    /// Forgets the server and its token (revoking it best-effort), for "Change server".
    func forgetServer() {
        if let server, let token = currentToken() {
            revoke(token, on: server)
        }
        if let server {
            clearToken(for: server)
        }
        user = nil
        serverInfo = nil
        // A pinned run stays on its server, and leaves the saved one alone.
        guard pinned == nil else { return }
        server = nil
        defaults.removeObject(forKey: Self.serverDefaultsKey)
    }

    // MARK: Account

    /// `GET /me` with the saved token. A 401 means signed out; anything that
    /// isn't an answer from the server is re-probed so the caller can say why.
    func restore() async -> RestoreResult {
        guard let server, let token = currentToken() else { return .signedOut }
        let client = APIClient(baseURL: server.baseURL, token: token, session: urlSession)

        let firstError: APIError
        do {
            return adoptRestoredUser(try await fetchMe(client), server: server)
        } catch {
            firstError = APIError.wrapping(error)
        }
        if firstError == .unauthorized {
            clearToken(for: server)
            return .signedOut
        }

        let outcome = await ServerProbe.probe(server, connectTimeout: .seconds(3))
        guard server == self.server else { return .signedOut }
        guard case let .marquee(info) = outcome else { return .unreachable(outcome) }

        // The server is up (it may have just finished booting); try once more.
        serverInfo = info
        do {
            return adoptRestoredUser(try await fetchMe(client), server: server)
        } catch {
            let retryError = APIError.wrapping(error)
            if retryError == .unauthorized {
                clearToken(for: server)
                return .signedOut
            }
            return .unreachable(.unreachable(.failed(retryError.localizedDescription)))
        }
    }

    /// A shorter timeout than data calls: at launch this holds the spinner.
    private func fetchMe(_ client: APIClient) async throws -> User {
        try await client.send(.get, "/me", timeout: Self.restoreTimeout, as: User.self)
    }

    /// `POST /auth/login`.
    func login(username: String, password: String) async throws -> User {
        let username = username.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !username.isEmpty, !password.isEmpty else {
            throw APIError.invalid("Enter your username and password.")
        }
        guard let server else { throw APIError.notMarquee }
        let client = APIClient(baseURL: server.baseURL, session: urlSession)
        let response = try await client.post(
            "/auth/login",
            body: LoginRequest(username: username, password: password, deviceName: deviceName),
            as: AuthTokenResponse.self
        )
        return try adopt(response, from: server)
    }

    /// `POST /auth/setup`: the server's first (admin) account.
    func setup(displayName: String, username: String, password: String) async throws -> User {
        guard let server else { throw APIError.notMarquee }
        let client = APIClient(baseURL: server.baseURL, session: urlSession)
        let response = try await client.post(
            "/auth/setup",
            body: SetupRequest(
                username: username.trimmingCharacters(in: .whitespacesAndNewlines),
                password: password,
                displayName: displayName.trimmingCharacters(in: .whitespacesAndNewlines),
                deviceName: deviceName
            ),
            as: AuthTokenResponse.self
        )
        let user = try adopt(response, from: server)
        if let info = serverInfo {
            serverInfo = ServerInfo(app: info.app, apiVersion: info.apiVersion, version: info.version, setupComplete: true, status: info.status)
        }
        return user
    }

    /// Signs out locally right away, then revokes the token on the server
    /// best-effort; an unreachable server can't keep the Mac signed in.
    func logout() async {
        guard let server else { return }
        let token = currentToken()
        clearToken(for: server)
        user = nil
        guard let token else { return }
        let client = APIClient(baseURL: server.baseURL, token: token, session: urlSession)
        _ = try? await client.send(.post, "/auth/logout", timeout: 5, as: EmptyResponse.self)
    }

    /// Re-reads the account (role or display name may have changed on the server).
    @discardableResult
    func refreshUser() async throws -> User {
        guard let client else { throw APIError.unauthorized }
        let fresh = try await client.get("/me", as: User.self)
        if currentToken() != nil { user = fresh }
        return fresh
    }

    // MARK: Token

    /// The token for the current server, read once and then cached.
    ///
    /// A store that answered `.unavailable` is deliberately *not* cached: the
    /// old code latched that failure as "no token" for the rest of the launch,
    /// so one transient Keychain error turned a valid session into the sign-in
    /// card even though the item was still there.
    private func currentToken() -> String? {
        guard let server else { return nil }
        if tokenLoaded { return token }
        switch tokenStore.lookup(for: server.baseURLString) {
        case let .found(value):
            token = value
            tokenLoaded = true
            tokenUnavailable = false
        case .missing:
            // The fallback store holds the token when the Keychain refused the write.
            token = fallbackTokens.token(for: server.baseURLString)
            tokenLoaded = true
            tokenUnavailable = false
        case .unavailable:
            if tokenUnavailable == false { tokenUnavailable = true }
            return fallbackTokens.token(for: server.baseURLString)
        }
        return token
    }

    private func adopt(_ response: AuthTokenResponse, from address: ServerAddress) throws -> User {
        guard address == server else {
            // The server was changed while the request was in flight.
            revoke(response.token, on: address)
            throw APIError.unauthorized
        }
        if !tokenStore.save(response.token, for: address.baseURLString) {
            Self.logger.warning("Keychain refused the session token; it will last until Marquee quits")
            fallbackTokens.save(response.token, for: address.baseURLString)
        }
        token = response.token
        tokenLoaded = true
        user = response.user
        return response.user
    }

    private func adoptRestoredUser(_ restored: User, server address: ServerAddress) -> RestoreResult {
        guard address == server else { return .signedOut }
        user = restored
        return .signedIn(restored)
    }

    private func clearToken(for address: ServerAddress) {
        tokenStore.delete(for: address.baseURLString)
        fallbackTokens.delete(for: address.baseURLString)
        if address == server {
            token = nil
            tokenLoaded = true
            tokenUnavailable = false
        }
    }

    private func handleUnauthorized(token rejected: String) {
        // Ignore a late 401 for a token that's already been replaced.
        guard let server, rejected == currentToken() else { return }
        Self.logger.info("Token rejected by \(server.baseURLString, privacy: .public); signing out")
        clearToken(for: server)
        user = nil
        onUnauthorized?()
    }

    private func revoke(_ token: String, on address: ServerAddress) {
        let client = APIClient(baseURL: address.baseURL, token: token, session: urlSession)
        Task {
            _ = try? await client.send(.post, "/auth/logout", timeout: 5, as: EmptyResponse.self)
        }
    }
}
