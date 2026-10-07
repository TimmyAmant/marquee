import Foundation

/// The one check for links a server hands the app to open (a Radarr page,
/// "Play on Plex", the Telegram bot, a sign-in page), so a server, or
/// something pretending to be one, can't open a file, another app's URL
/// scheme or a script. The same rules as Windows (`ExternalLinks`,
/// `SignInWeb.Allows`).
enum SafeLink {
    /// The media servers' own app schemes the server sends as a play link's
    /// `appUrl` (lib/media-servers/play-links.ts: `plex://preplay/…`).
    static let mediaAppSchemes: Set<String> = ["plex", "jellyfin", "emby"]

    /// An absolute http or https URL with a host and no user name in it: a
    /// web page somewhere (Radarr on the LAN is often plain http).
    static func web(_ string: String?) -> URL? {
        guard let url = absolute(string), let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https", url.host?.isEmpty == false
        else { return nil }
        return url
    }

    /// An absolute https URL only (the Telegram bot's t.me link).
    static func https(_ string: String?) -> URL? {
        guard let url = web(string), url.scheme?.lowercased() == "https" else { return nil }
        return url
    }

    /// A media server app's link (`plex://…`), or nil for any other scheme.
    static func mediaApp(_ string: String?) -> URL? {
        guard let url = absolute(string), let scheme = url.scheme?.lowercased(),
              mediaAppSchemes.contains(scheme)
        else { return nil }
        return url
    }

    /// A sign-in page (Plex, single sign-on): any https page, or an http(s)
    /// one on `server`'s own scheme, host and port, which may be plain http
    /// on a home network. Windows' `SignInWeb.Allows`.
    static func allowsSignInPage(_ url: URL, server: URL?) -> Bool {
        guard url.user == nil, url.password == nil, let scheme = url.scheme?.lowercased() else { return false }
        if scheme == "https" { return url.host?.isEmpty == false }
        guard scheme == "http", let server, let serverScheme = server.scheme?.lowercased() else { return false }
        return scheme == serverScheme
            && url.host?.lowercased() == server.host?.lowercased()
            && effectivePort(url) == effectivePort(server)
    }

    private static func absolute(_ string: String?) -> URL? {
        guard let text = string?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty,
              let url = URL(string: text), url.scheme != nil,
              url.user == nil, url.password == nil
        else { return nil }
        return url
    }

    private static func effectivePort(_ url: URL) -> Int? {
        url.port ?? (url.scheme?.lowercased() == "https" ? 443 : 80)
    }
}

/// A YouTube trailer key (`links.trailerYoutubeKey`), checked before it's
/// put into a URL: YouTube's ids are letters, digits, `-` and `_`. Anything
/// else is refused, not escaped.
enum YouTubeTrailer {
    static func isValidKey(_ key: String?) -> Bool {
        guard let key, (6...20).contains(key.count) else { return false }
        return key.unicodeScalars.allSatisfy { scalar in
            scalar.isASCII && (CharacterSet.alphanumerics.contains(scalar) || scalar == "-" || scalar == "_")
        }
    }

    /// `https://www.youtube.com/watch?v={key}`.
    static func watchURL(_ key: String?) -> URL? {
        guard let key, isValidKey(key) else { return nil }
        var components = URLComponents()
        components.scheme = "https"
        components.host = "www.youtube.com"
        components.path = "/watch"
        components.queryItems = [URLQueryItem(name: "v", value: key)]
        return components.url
    }

    /// The privacy-enhanced embed player, playing straight away.
    static func embedURL(_ key: String?) -> URL? {
        guard let key, isValidKey(key) else { return nil }
        var components = URLComponents()
        components.scheme = "https"
        components.host = "www.youtube-nocookie.com"
        components.path = "/embed/\(key)"
        components.queryItems = [URLQueryItem(name: "autoplay", value: "1"), URLQueryItem(name: "playsinline", value: "1")]
        return components.url
    }
}
