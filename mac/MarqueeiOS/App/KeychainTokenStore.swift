import Foundation
import Security

/// The iPhone app's session tokens, one generic-password Keychain item per
/// server base URL. Unlike the Mac (see `FileTokenStore`), an iOS app's
/// Keychain items belong to its bundle, so updates keep them and nothing
/// prompts. Readable after the first unlock, so a background refresh could
/// use them; never synced to other devices (a token is this device's own).
struct KeychainTokenStore: TokenStore {
    static let defaultService = "com.timmyamant.Marquee.ios.session"

    let service: String

    init(service: String = KeychainTokenStore.defaultService) {
        self.service = service
    }

    private func query(for server: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: server,
        ]
    }

    func lookup(for server: String) -> TokenLookup {
        var request = query(for: server)
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        let status = SecItemCopyMatching(request as CFDictionary, &result)
        switch status {
        case errSecSuccess:
            guard let data = result as? Data, let token = String(data: data, encoding: .utf8), !token.isEmpty else {
                return .missing
            }
            return .found(token)
        case errSecItemNotFound:
            return .missing
        default:
            // Locked (before the first unlock after a restart) or another
            // failure: not the same as signed out.
            return .unavailable
        }
    }

    func token(for server: String) -> String? {
        if case let .found(token) = lookup(for: server) { return token }
        return nil
    }

    @discardableResult
    func save(_ token: String, for server: String) -> Bool {
        let data = Data(token.utf8)
        let update: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        let status = SecItemUpdate(query(for: server) as CFDictionary, update as CFDictionary)
        if status == errSecSuccess { return true }
        guard status == errSecItemNotFound else { return false }
        var add = query(for: server)
        add.merge(update) { _, new in new }
        return SecItemAdd(add as CFDictionary, nil) == errSecSuccess
    }

    func delete(for server: String) {
        SecItemDelete(query(for: server) as CFDictionary)
    }
}
