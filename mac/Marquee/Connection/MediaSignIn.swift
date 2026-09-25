import Foundation

/// How a Plex or Jellyfin sign-in (or account link) can end short of success,
/// beyond the ordinary `APIError`s.
enum MediaSignInError: LocalizedError, Equatable, Sendable {
    /// 403: the server refused this Plex/Jellyfin account, with its reason
    /// ("This Plex account doesn't have access to this server.", "Ask the
    /// admin to add you first.").
    case refused(String)
    /// 410, or the sign-in outlived its `expiresAt`.
    case expired

    static let expiredMessage = "The Plex sign-in expired. Try again."
    static let refusedFallback = "This account can't sign in to this Marquee server."

    var errorDescription: String? {
        switch self {
        case let .refused(message): message
        case .expired: Self.expiredMessage
        }
    }

    /// A 403 body's `error`, as the server worded it.
    static func refusal(from body: Data) -> MediaSignInError {
        let message = (try? JSONDecoder().decode(APIError.Body.self, from: body))?.error?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return .refused(message.nonBlank ?? refusedFallback)
    }
}

/// The Plex PIN poll shared by sign-in (`/auth/plex/poll`) and linking
/// (`/me/links/plex/poll`): 202 while the person is still in the browser,
/// 200 once Plex said yes, 403 when the server refuses that Plex account,
/// 410 once the PIN is gone.
enum PlexPoll {
    /// The server's poll interval.
    static let interval: Duration = .seconds(2)
    /// Statuses a poll answers with that aren't failures of the call itself.
    static let answers: Set<Int> = [202, 403, 410]
    /// The Mac's clock and the server's can disagree: never give up sooner
    /// than this after starting, whatever `expiresAt` says (the server's 410
    /// ends it anyway).
    static let minimumWindow: TimeInterval = 120

    /// One answer: nil while pending, the body once done; throws for 403/410.
    static func step(status: Int, body: Data) throws -> Data? {
        switch status {
        case 202: return nil
        case 403: throw MediaSignInError.refusal(from: body)
        case 410: throw MediaSignInError.expired
        default: return body
        }
    }

    /// Calls `poll` every `interval` until it returns a value, it throws, the
    /// task is cancelled (`CancellationError`), or `expiresAt` passes
    /// (`MediaSignInError.expired`).
    static func run<Result: Sendable>(
        expiresAt: Date,
        interval: Duration = interval,
        now: @Sendable () -> Date = { Date() },
        poll: () async throws -> Result?
    ) async throws -> Result {
        let deadline = max(expiresAt, now().addingTimeInterval(minimumWindow))
        while true {
            try await Task.sleep(for: interval)
            if let result = try await poll() { return result }
            if now() >= deadline { throw MediaSignInError.expired }
        }
    }

    /// True for the ways a poll ends that the person chose (Cancel, closing
    /// the window), which need no message.
    static func isCancellation(_ error: Error) -> Bool {
        if error is CancellationError { return true }
        if let apiError = error as? APIError { return apiError.isCancellation }
        return false
    }
}
