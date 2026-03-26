import SwiftUI

struct SetupView: View {
    @EnvironmentObject var appState: AppState
    @State private var serverURL: String = "https://web-one-neon-43.vercel.app"
    @State private var apiKey: String = ""
    @State private var showSaved: Bool = false

    private let keychain = KeychainHelper()

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Setup")
                .font(.headline)

            TextField("Server URL", text: $serverURL)
                .textFieldStyle(.roundedBorder)

            SecureField("API Key", text: $apiKey)
                .textFieldStyle(.roundedBorder)

            HStack {
                Button("Save") {
                    keychain.setServerURL(serverURL)
                    keychain.setAPIKey(apiKey)
                    showSaved = true
                    appState.objectWillChange.send()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                        showSaved = false
                    }
                }
                .disabled(serverURL.isEmpty || apiKey.isEmpty)

                if showSaved {
                    Text("Saved!")
                        .foregroundColor(.green)
                        .font(.caption)
                }
            }
        }
        .onAppear {
            if let url = keychain.getServerURL() {
                serverURL = url
            }
            if let key = keychain.getAPIKey() {
                apiKey = key
            }
        }
    }
}
