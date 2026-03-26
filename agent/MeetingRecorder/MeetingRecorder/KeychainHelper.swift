import Foundation

/// Stores settings in a simple JSON file in Application Support
/// instead of Keychain to avoid macOS authorization dialogs.
class KeychainHelper {
    private let configURL: URL

    init(service: String = "com.meetingrecorder.app") {
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let dir = appSupport.appendingPathComponent("MeetingRecorder")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        configURL = dir.appendingPathComponent("config.json")
    }

    func getServerURL() -> String? { readConfig()["serverURL"] }
    func setServerURL(_ url: String) { update(key: "serverURL", value: url) }
    func deleteServerURL() { remove(key: "serverURL") }

    func getAPIKey() -> String? { readConfig()["apiKey"] }
    func setAPIKey(_ key: String) { update(key: "apiKey", value: key) }
    func deleteAPIKey() { remove(key: "apiKey") }

    private func update(key: String, value: String) {
        var config = readConfig()
        config[key] = value
        writeConfig(config)
    }

    private func remove(key: String) {
        var config = readConfig()
        config.removeValue(forKey: key)
        writeConfig(config)
    }

    private func readConfig() -> [String: String] {
        guard let data = try? Data(contentsOf: configURL),
              let config = try? JSONDecoder().decode([String: String].self, from: data)
        else { return [:] }
        return config
    }

    private func writeConfig(_ config: [String: String]) {
        guard let data = try? JSONEncoder().encode(config) else { return }
        try? data.write(to: configURL, options: .atomic)
    }
}
