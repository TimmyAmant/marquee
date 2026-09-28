import SwiftUI
#if os(iOS)
import AuthenticationServices
import UIKit
#endif

/// Where the sign-ins that finish on a web page (Plex, single sign-on) open
/// it. The app polls the server for the result either way (`PlexPoll`), so
/// the page only has to be shown: on the Mac in the default browser; on iOS
/// in a sheet over the app (ASWebAuthenticationSession, sharing Safari's
/// cookies), which closes by itself once the poll has signed in.
@MainActor
final class SignInBrowser {
    #if os(iOS)
    private var session: ASWebAuthenticationSession?
    private let anchor = PresentationAnchor()
    #endif

    func open(_ url: URL, openURL: OpenURLAction) {
        #if os(iOS)
        close()
        // The server's page never redirects to marquee://, so the sheet stays
        // until `close()` (or the person closes it, which changes nothing:
        // the poll carries on until Cancel).
        let session = ASWebAuthenticationSession(url: url, callback: .customScheme("marquee")) { _, _ in }
        session.presentationContextProvider = anchor
        session.prefersEphemeralWebBrowserSession = false
        if session.start() {
            self.session = session
        } else {
            openURL(url)
        }
        #else
        openURL(url)
        #endif
    }

    /// The sign-in finished, failed or was cancelled.
    func close() {
        #if os(iOS)
        session?.cancel()
        session = nil
        #endif
    }
}

#if os(iOS)
private final class PresentationAnchor: NSObject, ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            if let window = scenes.flatMap(\.windows).first(where: \.isKeyWindow) { return window }
            // Only reached with no window on screen, which a sign-in can't be.
            return ASPresentationAnchor(windowScene: scenes[0])
        }
    }
}
#endif
