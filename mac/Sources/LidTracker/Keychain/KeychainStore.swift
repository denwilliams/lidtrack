import Foundation
import Security

struct AccessCredentials {
    let clientId: String
    let clientSecret: String
    let apiBaseURL: String
}

enum KeychainStore {
    private static let service = "net.denwilliams.lidtracker"

    static func save(_ creds: AccessCredentials) throws {
        try set(creds.clientId,     key: "clientId")
        try set(creds.clientSecret, key: "clientSecret")
        try set(creds.apiBaseURL,   key: "apiBaseURL")
    }

    static func load() -> AccessCredentials? {
        guard let id  = get(key: "clientId"),
              let sec = get(key: "clientSecret"),
              let url = get(key: "apiBaseURL")
        else { return nil }
        return AccessCredentials(clientId: id, clientSecret: sec, apiBaseURL: url)
    }

    static func clear() {
        delete(key: "clientId")
        delete(key: "clientSecret")
        delete(key: "apiBaseURL")
    }

    // MARK: Private

    private static func set(_ value: String, key: String) throws {
        let data = Data(value.utf8)
        var query: [CFString: Any] = [
            kSecClass:       kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: key,
        ]
        SecItemDelete(query as CFDictionary)
        query[kSecValueData] = data
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw NSError(domain: NSOSStatusErrorDomain, code: Int(status))
        }
    }

    private static func get(key: String) -> String? {
        let query: [CFString: Any] = [
            kSecClass:            kSecClassGenericPassword,
            kSecAttrService:      service,
            kSecAttrAccount:      key,
            kSecReturnData:       true,
            kSecMatchLimit:       kSecMatchLimitOne,
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data
        else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private static func delete(key: String) {
        let query: [CFString: Any] = [
            kSecClass:       kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: key,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
