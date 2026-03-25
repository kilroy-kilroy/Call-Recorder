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
}
