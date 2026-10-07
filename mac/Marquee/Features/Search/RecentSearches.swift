import Foundation

/// lib/search/recent.ts: the last few things searched for on this Mac (or
/// iPhone), newest first, shown under an empty search field to search again
/// with a click. Kept per server and account in UserDefaults (like the
/// website, which keys them by user id), so someone else signing in here
/// never sees them, and wiped on signing out. The Mac's search panel and the
/// iPhone's Search tab share them.
enum RecentSearches {
    static let limit = 8
    /// The prefix; each account's list is `"<prefix>:<server>|<user id>"`.
    /// Before 0.76 one list under the bare prefix served the whole device.
    static let storageKey = "marquee.recentSearches"

    /// - Parameter account: `AppModel.accountIdentity`, "server|user id".
    static func key(account: String) -> String { "\(storageKey):\(account)" }

    /// The query added to the front; the same query typed differently
    /// ("Wall-E" and "wall-e") is moved up rather than kept twice. Blank is
    /// ignored. Pure; unit tested.
    static func adding(_ query: String, to list: [String]) -> [String] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return list }
        let key = matchKey(trimmed)
        let rest = list.filter { matchKey($0) != key }
        return Array(([trimmed] + rest).prefix(limit))
    }

    static func removing(_ query: String, from list: [String]) -> [String] {
        list.filter { $0 != query }
    }

    /// lib/search/rank.ts's `normalizeName`: no accents or case, & and + as
    /// words, anything else between letters and digits a single space.
    /// Lowercased as typed when that leaves nothing ("!!!").
    static func matchKey(_ text: String) -> String {
        let folded = text
            .folding(options: .diacriticInsensitive, locale: nil)
            .lowercased()
            .replacingOccurrences(of: "&", with: " and ")
            .replacingOccurrences(of: "+", with: " plus ")
        let words = folded.split { !$0.isLetter && !$0.isNumber }.joined(separator: " ")
        return words.isEmpty ? text.lowercased() : words
    }

    // MARK: Stored

    /// The account's list, or none (and none before anyone has signed in);
    /// blanks and anything past the limit dropped.
    static func load(account: String?, defaults: UserDefaults = .standard) -> [String] {
        // The old per-device list isn't anyone's to show.
        defaults.removeObject(forKey: storageKey)
        guard let account else { return [] }
        let stored = defaults.stringArray(forKey: key(account: account)) ?? []
        return Array(stored.filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }.prefix(limit))
    }

    static func save(_ list: [String], account: String?, defaults: UserDefaults = .standard) {
        guard let account else { return }
        if list.isEmpty {
            defaults.removeObject(forKey: key(account: account))
        } else {
            defaults.set(list, forKey: key(account: account))
        }
    }

    /// Adds a search to the account's recent searches; the list as it now is.
    @discardableResult
    static func remember(_ query: String, account: String?, defaults: UserDefaults = .standard) -> [String] {
        let next = adding(query, to: load(account: account, defaults: defaults))
        save(next, account: account, defaults: defaults)
        return next
    }

    /// Signing out: the account's searches leave with it.
    static func clear(account: String, defaults: UserDefaults = .standard) {
        defaults.removeObject(forKey: key(account: account))
        defaults.removeObject(forKey: storageKey)
    }
}
