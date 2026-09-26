import Foundation
import Security

/// The login Keychain, where earlier versions of Marquee kept each server's
/// session token. Only `KeychainSessionMigration` uses it now, to move this
/// build's own item into `FileTokenStore`.
///
/// Items land in the file-based login keychain, whose access list trusts the
/// exact code that created each item. For an ad-hoc signed Marquee that's one
/// build: another build reading (or changing) the item gets macOS's "Marquee
/// wants to use your confidential information… enter the login keychain
/// password" prompt. Listing attributes never asks. So only attributes are
/// listed, and only an item this build wrote is read or deleted.
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
