import SwiftUI

struct MenuBarView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Meeting Recorder")
                .font(.headline)
            Divider()

            if !appState.isConfigured || appState.showSettings {
                SetupView()
                    .environmentObject(appState)
                Divider()
            }

            switch appState.state {
            case .idle:
                Button("Start Recording") {
                    Task { await appState.startRecording() }
                }

            case .recording:
                HStack {
                    Circle()
                        .fill(.red)
                        .frame(width: 8, height: 8)
                    Text("Recording: \(formattedDuration)")
                        .monospacedDigit()
                }
                Button("Stop Recording") {
                    Task { await appState.stopRecording() }
                }

            case .uploading:
                HStack {
                    ProgressView()
                        .controlSize(.small)
                    Text("Uploading...")
                }
                if appState.uploadProgress > 0 {
                    ProgressView(value: appState.uploadProgress)
                }

            case .done:
                Label("Upload Complete", systemImage: "checkmark.circle.fill")
                    .foregroundColor(.green)

            case .error:
                Label(appState.errorMessage ?? "An error occurred", systemImage: "exclamationmark.triangle.fill")
                    .foregroundColor(.red)
                Button("Dismiss") {
                    appState.state = .idle
                    appState.errorMessage = nil
                }
            }

            Divider()

            Toggle("Settings", isOn: $appState.showSettings)

            Button("Quit") {
                NSApplication.shared.terminate(nil)
            }
            .keyboardShortcut("q")
        }
        .padding(8)
        .frame(width: 260)
    }

    private var formattedDuration: String {
        let total = Int(appState.recordingDuration)
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let seconds = total % 60
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, seconds)
        }
        return String(format: "%02d:%02d", minutes, seconds)
    }
}
