import Foundation
import Observation
import OSLog

/// What a token store can answer. `unavailable` is deliberately separate from
/// `missing`: a Keychain that can't be read right now (locked, an ACL race) is
/// not the same as an account that was signed out, and treating the two alike
/// drops a perfectly good session.
enum TokenLookup: Equatable, Sendable {
    case found(String)
    case missing
    case unavailable
    /// A token is saved, but by another build of Marquee (before an update),
    /// and macOS won't let this one read it without asking for the login
    /// keychain password. Sign in again.
    case earlierBuild
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

/// The login Keychain: service `com.timmyamant.Marquee.api`, one item per
/// server and build of Marquee.
///
/// macOS lets only the build that created an item read it back (see
/// `Keychain`), and every update is a new build. So each item is marked
/// (`comment`) with the code identity of the build that created it, and this
/// build reads only its own: another build's item is `.earlierBuild`, never a
/// "wants to use your confidential information" prompt. Saving after that
/// creates this build's own item beside the old one (named "<server> #<tag>"),
/// since the old one can't be deleted without asking; its token is blanked.
struct KeychainTokenStore: TokenStore {
    static let service = "com.timmyamant.Marquee.api"
    /// A read that fails is retried before the session gives up on it.
    static let readAttempts = 3
    private static let logger = Logger(subsystem: "com.timmyamant.Marquee", category: "session")

    /// This build's code identity; nil (unknown) reads the plain item as
    /// before, prompt and all.
    var identity: String? = CodeIdentity.current

    enum ReadPlan: Equatable {
        case read(account: String)
        case earlierBuild
        case missing
    }

    enum SavePlan: Equatable {
        case update(account: String)
        case add(account: String)
    }

    /// "<server>", or "<server> #<tag>" for an item a later build added.
    static func belongs(_ account: String, to server: String) -> Bool {
        account == server || account.hasPrefix(server + " #")
    }

    static func readPlan(_ items: [Keychain.Item], server: String, identity: String?) -> ReadPlan {
        let saved = items.filter { belongs($0.account, to: server) }
        guard !saved.isEmpty else { return .missing }
        guard let identity else {
            return saved.contains { $0.account == server } ? .read(account: server) : .missing
        }
        if let mine = saved.first(where: { $0.comment == identity }) { return .read(account: mine.account) }
        return .earlierBuild
    }

    static func savePlan(_ items: [Keychain.Item], server: String, identity: String?) -> SavePlan {
        let saved = items.filter { belongs($0.account, to: server) }
        guard let identity else {
            return saved.contains { $0.account == server } ? .update(account: server) : .add(account: server)
        }
        if let mine = saved.first(where: { $0.comment == identity }) { return .update(account: mine.account) }
        let taken = Set(items.map(\.account))
        guard taken.contains(server) else { return .add(account: server) }
        let tagged = "\(server) #\(CodeIdentity.tag(identity))"
        return taken.contains(tagged) ? .update(account: tagged) : .add(account: tagged)
    }

    func lookup(for server: String) -> TokenLookup {
        var lastStatus: OSStatus = errSecSuccess
        for attempt in 1...Self.readAttempts {
            let items: [Keychain.Item]
            switch Keychain.items(service: Self.service) {
            case let .found(found):
                items = found
            case let .error(status):
                lastStatus = status
                Self.logger.error("Keychain list failed (\(status)), attempt \(attempt) of \(Self.readAttempts)")
                continue
            }

            switch Self.readPlan(items, server: server, identity: identity) {
            case .missing:
                return .missing
            case .earlierBuild:
                Self.logger.notice("The saved sign-in for \(server, privacy: .public) belongs to an earlier build of Marquee")
                return .earlierBuild
            case let .read(account):
                switch Keychain.read(service: Self.service, account: account) {
                case let .found(data):
                    guard let token = String(data: data, encoding: .utf8), !token.isEmpty else { return .missing }
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
        }
        Self.logger.error("Giving up on the Keychain for \(server, privacy: .public) (\(lastStatus)) — not treating it as signed out")
        return .unavailable
    }

    func token(for server: String) -> String? {
        if case let .found(token) = lookup(for: server) { return token }
        return nil
    }

    func save(_ token: String, for server: String) -> Bool {
        guard case let .found(items) = Keychain.items(service: Self.service) else { return false }
        let data = Data(token.utf8)
        let saved: Bool
        switch Self.savePlan(items, server: server, identity: identity) {
        case let .update(account):
            saved = Keychain.update(data, service: Self.service, account: account)
        case let .add(account):
            saved = Keychain.add(data, service: Self.service, account: account, label: "Marquee server session", comment: identity)
        }
        // Earlier builds' tokens for this server: no use to anyone now, so
        // blank them (allowed without asking, unlike deleting them).
        if saved, let identity {
            for item in items where Self.belongs(item.account, to: server) && item.comment != identity {
                Keychain.update(Data(), service: Self.service, account: item.account)
            }
        }
        return saved
    }

    func delete(for server: String) {
        guard let identity, case let .found(items) = Keychain.items(service: Self.service) else {
            Keychain.delete(service: Self.service, account: server)
            return
        }
        // This build's item goes; an earlier build's can't be deleted (macOS
        // refuses, and might ask), so its token is blanked instead.
        for item in items where Self.belongs(item.account, to: server) {
            if item.comment == identity {
                Keychain.delete(service: Self.service, account: item.account)
            } else {
                Keychain.update(Data(), service: Self.service, account: item.account)
            }
        }
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
/// Sign-in couldn't reach the server even after checking it again; the
/// message is what the check found (`ProbeOutcome.problemMessage`).
struct SignInConnectionError: LocalizedError, Equatable {
    let message: String
    var errorDescription: String? { message }
}

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
    /// The saved token belongs to an earlier build of Marquee (this one is an
    /// update), which macOS won't let this build read: sign in again.
    private(set) var savedByEarlierBuild = false

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
    /// `ServerProbe.probe`; tests answer for it.
    @ObservationIgnored private let probe: @Sendable (ServerAddress) async -> ProbeOutcome

    private static let logger = Logger(subsystem: "com.timmyamant.Marquee", category: "session")

    init(
        defaults: UserDefaults = .standard,
        tokenStore: TokenStore = KeychainTokenStore(),
        urlSession: URLSession = APIClient.defaultSession,
        deviceName: String? = nil,
        pinned: PinnedServer? = PinnedServer.resolve(),
        probe: @escaping @Sendable (ServerAddress) async -> ProbeOutcome = { await ServerProbe.probe($0) }
    ) {
        self.defaults = defaults
        self.urlSession = urlSession
        self.probe = probe
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
        let outcome = await probe(server)
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
        let response = try await postAuth(
            "/auth/login",
            body: LoginRequest(username: username, password: password, deviceName: deviceName),
            to: server,
            retries: true
        )
        return try adopt(response, from: server)
    }

    /// `POST /auth/setup`: the server's first (admin) account.
    func setup(displayName: String, username: String, password: String) async throws -> User {
        guard let server else { throw APIError.notMarquee }
        let response = try await postAuth(
            "/auth/setup",
            body: SetupRequest(
                username: username.trimmingCharacters(in: .whitespacesAndNewlines),
                password: password,
                displayName: displayName.trimmingCharacters(in: .whitespacesAndNewlines),
                deviceName: deviceName
            ),
            to: server,
            // Never sent twice: a first attempt that did reach the server
            // would make the second fail as "already set up".
            retries: false
        )
        let user = try adopt(response, from: server)
        if let info = serverInfo {
            serverInfo = ServerInfo(
                app: info.app, apiVersion: info.apiVersion, version: info.version,
                setupComplete: true, status: info.status, signIn: info.signIn
            )
        }
        return user
    }

    /// A sign-in (or setup) POST that survives the sign-in screen having sat
    /// open while the server restarted (a Docker update, say): the pooled
    /// connection is dead by then, and URLSession won't retry a POST on a
    /// fresh one, so it failed as "Couldn't reach your Marquee server" with
    /// the server right there. On a transport failure the server is checked
    /// again and, if it's there, the request goes once more; if it isn't,
    /// the error says what the check found.
    ///
    /// Only failures where the request can't have been handled are retried:
    /// after a timeout the server may already have signed you in (a second
    /// token, a second strike against the login rate limit), so that one is
    /// reported, not resent.
    private func postAuth(_ path: String, body: some Encodable & Sendable, to server: ServerAddress, retries: Bool) async throws -> AuthTokenResponse {
        try await postAuth(path, to: server, retries: retries) { client in
            try await client.post(path, body: body, as: AuthTokenResponse.self)
        }
    }

    private func postAuth(
        _ path: String,
        to server: ServerAddress,
        retries: Bool,
        send: (APIClient) async throws -> AuthTokenResponse
    ) async throws -> AuthTokenResponse {
        let client = APIClient(baseURL: server.baseURL, session: urlSession)
        do {
            return try await send(client)
        } catch let error as APIError {
            guard case let .network(urlError) = error, Self.neverReachedServer.contains(urlError.code) else { throw error }
            Self.logger.info("\(path, privacy: .public) failed to connect (\(error.localizedDescription, privacy: .public)); checking the server")
            let outcome = await refreshInfo()
            if let problem = outcome.problemMessage(for: server) {
                throw SignInConnectionError(message: problem)
            }
            guard retries else { throw error }
            return try await send(client)
        }
    }

    /// Transport failures that mean the request never got to the server: a
    /// dead pooled connection, nothing listening, no route.
    private static let neverReachedServer: Set<URLError.Code> = [
        .networkConnectionLost, .cannotConnectToHost, .cannotFindHost, .notConnectedToInternet, .dnsLookupFailed,
    ]

    // MARK: Plex / Jellyfin sign-in

    /// `POST /auth/plex/start`: the handle to poll with and the plex.tv page
    /// to open in the browser. Offered when `serverInfo.signIn.plex`.
    func startPlexSignIn() async throws -> API.PlexSignInStart {
        guard let server else { throw APIError.notMarquee }
        return try await unauthenticatedAPI(server).auth.plexStart()
    }

    /// Polls `POST /auth/plex/poll` every `interval` (2 s) until Plex says
    /// yes — then stores the token exactly as `login` does — or the server
    /// refuses the account (403: `MediaSignInError.refused` with its
    /// reason), the PIN expires (410 or `expiresAt`: `.expired`), another
    /// error comes back, or the task is cancelled (Cancel, the sign-in card
    /// going away, quitting).
    func finishPlexSignIn(_ start: API.PlexSignInStart, interval: Duration = PlexPoll.interval) async throws -> User {
        guard let server else { throw APIError.notMarquee }
        let auth = unauthenticatedAPI(server).auth
        let deviceName = self.deviceName
        let response = try await PlexPoll.run(expiresAt: start.expiresAt, interval: interval) {
            try await auth.plexPoll(handle: start.handle, deviceName: deviceName)
        }
        return try adopt(response, from: server)
    }

    /// `POST /auth/jellyfin`: a Jellyfin username and password, checked by
    /// the server against its Jellyfin; the token is stored as `login` does.
    /// Offered when `serverInfo.signIn.jellyfin`.
    func loginWithJellyfin(username: String, password: String) async throws -> User {
        let username = username.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !username.isEmpty, !password.isEmpty else {
            throw APIError.invalid("Enter your Jellyfin username and password.")
        }
        guard let server else { throw APIError.notMarquee }
        let deviceName = self.deviceName
        let response = try await postAuth("/auth/jellyfin", to: server, retries: true) { client in
            try await MarqueeAPI(client: client).auth.jellyfin(username: username, password: password, deviceName: deviceName)
        }
        return try adopt(response, from: server)
    }

    private func unauthenticatedAPI(_ server: ServerAddress) -> MarqueeAPI {
        MarqueeAPI(client: APIClient(baseURL: server.baseURL, session: urlSession))
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
        let lookup = tokenStore.lookup(for: server.baseURLString)
        switch lookup {
        case let .found(value):
            token = value
            tokenLoaded = true
            tokenUnavailable = false
            savedByEarlierBuild = false
        case .missing, .earlierBuild:
            // The fallback store holds the token when the Keychain refused the write.
            token = fallbackTokens.token(for: server.baseURLString)
            tokenLoaded = true
            tokenUnavailable = false
            savedByEarlierBuild = token == nil && lookup == .earlierBuild
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
        savedByEarlierBuild = false
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
            savedByEarlierBuild = false
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
