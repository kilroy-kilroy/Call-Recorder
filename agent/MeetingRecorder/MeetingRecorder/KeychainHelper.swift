import Foundation
import Security

class KeychainHelper {
    private let service: String

    init(service: String = "com.meetingrecorder.app") {
        self.service = service
    }

    func getServerURL() -> String? { read(account: "serverURL") }
    func setServerURL(_ url: String) { save(account: "serverURL", value: url) }
    func deleteServerURL() { delete(account: "serverURL") }

    func getAPIKey() -> String? { read(account: "apiKey") }
    func setAPIKey(_ key: String) { save(account: "apiKey", value: key) }
    func deleteAPIKey() { delete(account: "apiKey") }

    private func save(account: String, value: String) {
        delete(account: account)
        let data = value.data(using: .utf8)!
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: data,
        ]
        SecItemAdd(query as CFDictionary, nil)
    }

    private func read(account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func delete(account: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
