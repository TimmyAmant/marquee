import Foundation
import Observation

/// Which link "Share a link" hands out.
enum ShareLinkKind: String, CaseIterable, Identifiable, Hashable, Sendable {
    /// The Marquee page itself: people need an account to open it.
    case marquee
    /// TMDb's page: anyone can open it.
    case tmdb
    /// IMDb's page, when the title has an IMDb id.
    case imdb

    var id: Self { self }

    /// The picker's wording (the website's).
    var label: String {
        switch self {
        case .marquee: return "Marquee — they'll need to sign in"
        case .tmdb: return "TMDb — anyone can open it"
        case .imdb: return "IMDb"
        }
    }
}

/// The links a title or person can be shared as outside Marquee. The Marquee
/// link is built on the server's public address when one is set, else on the
/// address this Mac is connected to (api-v1.md "Sharing outside the household").
struct ShareLinks: Hashable, Sendable {
    /// Marquee's own page, e.g. `title/movie/603` or `person/6384`.
    let marqueePath: String
    /// TMDb's, e.g. `movie/603` or `person/6384`.
    let tmdbPath: String
    let imdbId: String?
    /// `publicUrl`, else the connected server; nil when neither is known.
    let base: URL?

    static func title(_ id: API.TitleID, imdbId: String?, publicUrl: String?, server: URL?) -> ShareLinks {
        let type = MarqueeAPI.segment(id.mediaType)
        return ShareLinks(
            marqueePath: "title/\(type)/\(id.tmdbId)",
            tmdbPath: "\(type)/\(id.tmdbId)",
            imdbId: imdbId.nonBlank,
            base: base(publicUrl: publicUrl, server: server)
        )
    }

    static func person(_ tmdbId: Int, publicUrl: String? = nil, server: URL?) -> ShareLinks {
        ShareLinks(
            marqueePath: "person/\(tmdbId)",
            tmdbPath: "person/\(tmdbId)",
            imdbId: nil,
            base: base(publicUrl: publicUrl, server: server)
        )
    }

    /// The public address when it's a usable http(s) URL, else the server's.
    static func base(publicUrl: String?, server: URL?) -> URL? {
        if let publicUrl = publicUrl.nonBlank?.trimmingCharacters(in: .whitespacesAndNewlines),
           let url = URL(string: publicUrl), let scheme = url.scheme?.lowercased(),
           scheme == "http" || scheme == "https", url.host != nil {
            return url
        }
        return server
    }

    /// The kinds this title offers, in the picker's order (IMDb only with an id;
    /// Marquee only with an address to build it on).
    var kinds: [ShareLinkKind] {
        ShareLinkKind.allCases.filter { url(for: $0) != nil }
    }

    func url(for kind: ShareLinkKind) -> URL? {
        switch kind {
        case .marquee:
            return base?.appending(path: marqueePath)
        case .tmdb:
            return URL(string: "https://www.themoviedb.org/\(tmdbPath)")
        case .imdb:
            guard let imdbId, let segment = imdbId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) else { return nil }
            return URL(string: "https://www.imdb.com/title/\(segment)/")
        }
    }
}

/// The Share dialog's state, apart from the view so it's testable: who in the
/// household to send the title to, an optional note, and which link to share
/// outside Marquee.
@MainActor
@Observable
final class ShareTitleModel {
    enum Members: Equatable {
        case loading
        case loaded([API.ShareableUser])
        /// The list couldn't load; sending is off, links still work.
        case unavailable(String)
    }

    enum SendState: Equatable {
        case idle
        case sending
        /// "Sent to Kid." / "Sent to 3 people."
        case sent(String)
        /// The server's own message.
        case failed(String)
    }

    let titleID: API.TitleID
    let titleName: String
    let imdbId: String?
    /// The address this Mac is connected to, for the Marquee link when the
    /// server has no public address.
    let serverURL: URL?

    private(set) var members: Members = .loading
    /// From `GET /users/shareable`; nil until it answers (or when none is set).
    private(set) var publicUrl: String?
    private(set) var selected: Set<UUID> = []
    /// Cut to `API.ShareTitleRequest.maxNoteLength` characters as it's typed.
    var note = "" {
        didSet {
            let clamped = Self.clamp(note)
            if clamped != note { note = clamped }
        }
    }
    var linkKind: ShareLinkKind = .marquee
    private(set) var sendState: SendState = .idle

    init(titleID: API.TitleID, titleName: String, imdbId: String?, serverURL: URL?) {
        self.titleID = titleID
        self.titleName = titleName
        self.imdbId = imdbId
        self.serverURL = serverURL
    }

    // MARK: Links

    var links: ShareLinks {
        .title(titleID, imdbId: imdbId, publicUrl: publicUrl, server: serverURL)
    }

    var linkKinds: [ShareLinkKind] { links.kinds }

    /// The picked link, falling back to the first one on offer.
    var linkURL: URL? {
        let kinds = linkKinds
        let kind = kinds.contains(linkKind) ? linkKind : kinds.first
        return kind.flatMap { links.url(for: $0) }
    }

    // MARK: Sending

    var isSelectable: Bool {
        if case .loaded = members { return sendState != .sending }
        return false
    }

    func isSelected(_ user: API.ShareableUser) -> Bool {
        selected.contains(user.userId)
    }

    func toggle(_ user: API.ShareableUser) {
        guard sendState != .sending else { return }
        if selected.contains(user.userId) {
            selected.remove(user.userId)
        } else if selected.count < API.ShareTitleRequest.maxRecipients {
            selected.insert(user.userId)
        }
    }

    /// The note as sent: trimmed, nil when blank (the server tidies the rest).
    var trimmedNote: String? {
        note.nonBlank?.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// "240/280", once the note is close to the limit.
    var noteCountLabel: String? {
        let count = note.unicodeScalars.count
        let limit = API.ShareTitleRequest.maxNoteLength
        return count >= limit - 40 ? "\(count)/\(limit)" : nil
    }

    var canSend: Bool {
        isSelectable && !selected.isEmpty
    }

    /// The people picked, in the list's order.
    var recipients: [API.ShareableUser] {
        guard case let .loaded(users) = members else { return [] }
        return users.filter { selected.contains($0.userId) }
    }

    func load(_ api: MarqueeAPI) async {
        do {
            let answer = try await api.users.shareable()
            if Task.isCancelled { return }
            publicUrl = answer.publicUrl.nonBlank
            members = .loaded(answer.results)
            // Someone who left since doesn't stay picked.
            selected.formIntersection(answer.results.map(\.userId))
        } catch let failure as APIError where failure.isCancellation {
            return
        } catch APIError.notFound {
            members = .unavailable("Your Marquee server needs updating before titles can be sent to people here.")
        } catch {
            members = .unavailable(error.localizedDescription)
        }
    }

    func send(_ api: MarqueeAPI) async {
        guard canSend else { return }
        let recipients = self.recipients
        sendState = .sending
        do {
            let request = API.ShareTitleRequest(userIds: recipients.map(\.userId), note: trimmedNote)
            let result = try await api.titles.share(titleID.mediaType, id: titleID.tmdbId, request)
            sendState = .sent(Self.sentMessage(recipients: recipients, count: result.sharedWith))
            selected = []
            note = ""
        } catch {
            sendState = .failed(error.localizedDescription)
        }
    }

    /// "Sent to Kid." for one person, else "Sent to 3 people."
    nonisolated static func sentMessage(recipients: [API.ShareableUser], count: Int) -> String {
        if count == 1, recipients.count == 1, let only = recipients.first {
            return "Sent to \(only.label)."
        }
        return count == 1 ? "Sent to 1 person." : "Sent to \(count) people."
    }

    /// At most `maxNoteLength` characters, counted the server's way (code points).
    nonisolated static func clamp(_ note: String) -> String {
        let scalars = note.unicodeScalars
        let limit = API.ShareTitleRequest.maxNoteLength
        guard scalars.count > limit else { return note }
        return String(String.UnicodeScalarView(scalars.prefix(limit)))
    }
}
