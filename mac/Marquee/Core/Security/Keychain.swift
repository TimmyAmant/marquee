import Foundation
import Security

/// The login Keychain, where `ServerSession` keeps this Mac's bearer token for
/// each server it has signed in to.
///
/// Items land in the file-based login keychain, whose access list trusts the
/// exact code that created each item. For an ad-hoc signed Marquee that's one
/// build: the next build (every update) reading it gets macOS's "Marquee
/// wants to use your confidential information… enter the login keychain
/// password" prompt. It can still see the item's attributes, and update its
/// data, without asking; it can't read or delete it. `KeychainTokenStore`
/// works around that with `comment` (see there).
enum Keychain {
    enum ReadResult {
        case found(Data)
        case notFound
        case error(OSStatus)
    }

    /// An item's attributes: listing them never asks the user, whichever
    /// build wrote the item.
    struct Item: Equatable, Sendable {
        let account: String
        let comment: String?
    }

    enum ListResult {
        case found([Item])
        case error(OSStatus)
    }

    static func items(service: String) -> ListResult {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecReturnAttributes as String: true,
            kSecMatchLimit as String: kSecMatchLimitAll,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        switch status {
        case errSecSuccess:
            let rows = result as? [[String: Any]] ?? []
            return .found(rows.compactMap { row in
                (row[kSecAttrAccount as String] as? String).map {
                    Item(account: $0, comment: row[kSecAttrComment as String] as? String)
                }
            })
        case errSecItemNotFound:
            return .found([])
        default:
            return .error(status)
        }
    }

    /// Replaces an existing item's data (allowed without asking even when
    /// another build created it).
    @discardableResult
    static func update(_ data: Data, service: String, account: String) -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        return SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary) == errSecSuccess
    }

    static func read(service: String, account: String) -> ReadResult {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        switch status {
        case errSecSuccess:
            guard let data = result as? Data else { return .error(errSecDecode) }
            return .found(data)
        case errSecItemNotFound:
            return .notFound
        default:
            return .error(status)
        }
    }

    /// Adds a new item, updating in place if one already exists — never deletes first.
    @discardableResult
    static func add(
        _ data: Data,
        service: String,
        account: String,
        label: String = "Marquee server session",
        comment: String? = nil
    ) -> Bool {
        let base: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        var attributes = base
        attributes[kSecValueData as String] = data
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        attributes[kSecAttrLabel as String] = label
        if let comment { attributes[kSecAttrComment as String] = comment }

        let status = SecItemAdd(attributes as CFDictionary, nil)
        if status == errSecDuplicateItem {
            let update: [String: Any] = [kSecValueData as String: data]
            return SecItemUpdate(base as CFDictionary, update as CFDictionary) == errSecSuccess
        }
        return status == errSecSuccess
    }

    /// Removes an item; a missing item counts as success.
    @discardableResult
    static func delete(service: String, account: String) -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        let status = SecItemDelete(query as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }
}
