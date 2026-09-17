import Foundation

/// Every failure an API call can end in. The server's `{error, code}` body
/// (Docs/API_V1_CORE.md › Conventions) picks the case; the status code is the
/// fallback when a body is missing or unrecognized (a proxy's 502 page, say).
enum APIError: LocalizedError, Equatable, Sendable {
    /// 401 `unauthorized`: missing, expired or revoked token. Back to sign-in.
    case unauthorized
    /// 401 `invalid_credentials`: a failed login.
    case invalidCredentials
    /// 429 `rate_limited`
    case rateLimited(String?)
    /// 403 `forbidden`: a member called an admin-only endpoint.
    case forbidden
    /// 404 `not_found`
    case notFound
    /// 409 `conflict`
    case conflict(String?)
    /// 409 `setup_complete`: first-run setup after accounts already exist.
    case setupComplete
    /// 502 `upstream`: TMDb, Plex, Sonarr… failed; the message names which.
    case upstream(String?)
    /// 400 `invalid`: validation failed; the message is safe to show.
    case invalid(String)
    /// 500 `internal`, or a response this app couldn't read.
    case server(String?)
    /// The request never got a response.
    case network(URLError)
    /// Something answered, but not a Marquee v1 API (no `X-Marquee-API`).
    case notMarquee

    /// The wire format of an error body.
    struct Body: Decodable, Sendable {
        let error: String?
        let code: String?
    }

    static func from(statusCode: Int, body: Data) -> APIError {
        let decoded = try? JSONDecoder().decode(Body.self, from: body)
        let message = decoded?.error?.trimmingCharacters(in: .whitespacesAndNewlines)
        let nonEmptyMessage = message?.isEmpty == false ? message : nil

        switch decoded?.code {
        case "unauthorized": return .unauthorized
        case "invalid_credentials": return .invalidCredentials
        case "rate_limited": return .rateLimited(nonEmptyMessage)
        case "forbidden": return .forbidden
        case "not_found": return .notFound
        case "conflict": return .conflict(nonEmptyMessage)
        case "setup_complete": return .setupComplete
        case "upstream": return .upstream(nonEmptyMessage)
        case "invalid": return .invalid(nonEmptyMessage ?? "The request was invalid.")
        case "internal": return .server(nonEmptyMessage)
        default: break
        }

        switch statusCode {
        case 400: return .invalid(nonEmptyMessage ?? "The request was invalid.")
        case 401: return .unauthorized
        case 403: return .forbidden
        case 404: return .notFound
        case 409: return .conflict(nonEmptyMessage)
        case 429: return .rateLimited(nonEmptyMessage)
        case 502: return .upstream(nonEmptyMessage)
        default: return .server(nonEmptyMessage)
        }
    }

    /// Wraps a transport-level failure.
    static func wrapping(_ error: Error) -> APIError {
        if let apiError = error as? APIError { return apiError }
        if let urlError = error as? URLError { return .network(urlError) }
        return .network(URLError(.unknown, userInfo: [NSLocalizedDescriptionKey: error.localizedDescription]))
    }

    /// True when the server couldn't be reached at all, as opposed to answering with an error.
    var isConnectivityFailure: Bool {
        switch self {
        case .network, .notMarquee: return true
        default: return false
        }
    }

    var isCancellation: Bool {
        if case let .network(error) = self { return error.code == .cancelled }
        return false
    }

    var errorDescription: String? {
        switch self {
        case .unauthorized:
            return "Your session has ended. Please sign in again."
        case .invalidCredentials:
            return "Incorrect username or password."
        case let .rateLimited(message):
            return message ?? "Too many attempts. Try again in a few minutes."
        case .forbidden:
            return "Only an admin can do that."
        case .notFound:
            return "That couldn't be found on your Marquee server."
        case let .conflict(message):
            return message ?? "That conflicts with something already on your server."
        case .setupComplete:
            return "Setup has already been completed on this server. Please sign in instead."
        case let .upstream(message):
            return message ?? "A service connected to your Marquee server didn't respond."
        case let .invalid(message):
            return message
        case let .server(message):
            return message ?? "Your Marquee server ran into a problem. Try again in a moment."
        case let .network(error):
            switch error.code {
            case .timedOut:
                return "Your Marquee server took too long to respond."
            case .cannotConnectToHost, .cannotFindHost, .networkConnectionLost, .notConnectedToInternet, .dnsLookupFailed:
                return "Couldn't reach your Marquee server. Check that it's running and on your network."
            case .cancelled:
                return "The request was cancelled."
            default:
                return "Couldn't reach your Marquee server: \(error.localizedDescription)"
            }
        case .notMarquee:
            return "The server didn't answer like a Marquee server. It may need updating to \(ServerInfo.minimumServerVersion) or later."
        }
    }
}
