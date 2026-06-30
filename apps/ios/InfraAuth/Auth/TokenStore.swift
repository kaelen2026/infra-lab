import Foundation
import Security

/// Pluggable token storage — mirrors the SDK's `TokenStore`. Native platforms
/// back this with the Keychain; previews/tests use the in-memory variant.
protocol TokenStore: AnyObject {
    func load() -> AuthTokens?
    func save(_ tokens: AuthTokens)
    func clear()
}

/// In-memory store for SwiftUI previews and unit tests (no Keychain entitlement
/// needed). Never used by the running app.
final class InMemoryTokenStore: TokenStore {
    private var tokens: AuthTokens?
    init(_ tokens: AuthTokens? = nil) { self.tokens = tokens }
    func load() -> AuthTokens? { tokens }
    func save(_ tokens: AuthTokens) { self.tokens = tokens }
    func clear() { tokens = nil }
}

/// Keychain-backed token storage. The encoded ``AuthTokens`` blob lives under a
/// single generic-password item, accessible after first unlock so a background
/// refresh can run without the device being unlocked.
final class KeychainTokenStore: TokenStore {
    private let service: String
    private let account: String

    init(service: String = "ai.deeplang.infra.ios", account: String = "infra.session.tokens") {
        self.service = service
        self.account = account
    }

    private var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    func load() -> AuthTokens? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else { return nil }
        return try? JSONDecoder().decode(AuthTokens.self, from: data)
    }

    func save(_ tokens: AuthTokens) {
        guard let data = try? JSONEncoder().encode(tokens) else { return }

        // Upsert: try to update an existing item, otherwise add a fresh one.
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]
        let updateStatus = SecItemUpdate(baseQuery as CFDictionary, attributes as CFDictionary)
        if updateStatus == errSecItemNotFound {
            var addQuery = baseQuery
            addQuery.merge(attributes) { _, new in new }
            SecItemAdd(addQuery as CFDictionary, nil)
        }
    }

    func clear() {
        SecItemDelete(baseQuery as CFDictionary)
    }
}
