import SwiftUI

enum RecorderState: String {
    case idle
    case recording
    case uploading
    case done
    case error
}

@MainActor
class AppState: ObservableObject {
    @Published var state: RecorderState = .idle
    @Published var errorMessage: String?
    @Published var recordingDuration: TimeInterval = 0
    @Published var uploadProgress: Double = 0
    @Published var showSettings = false

    var menuBarIcon: String {
        switch state {
        case .idle: return "mic"
        case .recording: return "mic.fill"
        case .uploading: return "arrow.up.circle"
        case .done: return "checkmark.circle"
        case .error: return "exclamationmark.triangle"
        }
    }

    var isConfigured: Bool {
        let helper = KeychainHelper()
        return helper.getServerURL() != nil && helper.getAPIKey() != nil
    }

    func startRecording() async {
        // Placeholder — will be implemented with AudioRecorder
        state = .recording
    }

    func stopRecording() async {
        // Placeholder — will be implemented with AudioRecorder
        state = .uploading
        await upload(fileURL: URL(fileURLWithPath: "/tmp/placeholder.m4a"))
    }

    private func upload(fileURL: URL) async {
        // Placeholder — will be implemented with Uploader
        state = .done
        try? await Task.sleep(nanoseconds: 3_000_000_000)
        state = .idle
    }
}
