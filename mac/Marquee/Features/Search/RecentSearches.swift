import Foundation

/// lib/search/recent.ts: the last few things searched for on this Mac (or
/// iPhone), newest first, shown under an empty search field to search again
/// with a click. Kept per device, in UserDefaults; the Mac's search panel and
/// the iPhone's Search tab share them.
enum RecentSearches {
    static let limit = 8
    static let storageKey = "marquee.recentSearches"

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

    /// What's stored, or none; blanks and anything past the limit dropped.
    static func load(defaults: UserDefaults = .standard) -> [String] {
        let stored = defaults.stringArray(forKey: storageKey) ?? []
        return Array(stored.filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }.prefix(limit))
    }

    static func save(_ list: [String], defaults: UserDefaults = .standard) {
        if list.isEmpty {
            defaults.removeObject(forKey: storageKey)
        } else {
            defaults.set(list, forKey: storageKey)
        }
    }

    /// Adds a search to this device's recent searches; the list as it now is.
    @discardableResult
    static func remember(_ query: String, defaults: UserDefaults = .standard) -> [String] {
        let next = adding(query, to: load(defaults: defaults))
        save(next, defaults: defaults)
        return next
    }
}
