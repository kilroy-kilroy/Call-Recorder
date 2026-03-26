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

    private var recorder: AudioRecorder?
    private var recordingStartTime: Date?

    var isConfigured: Bool {
        let helper = KeychainHelper()
        return helper.getServerURL() != nil && helper.getAPIKey() != nil
    }

    func startRecording() async {
        do {
            let rec = AudioRecorder()
            rec.onDurationUpdate = { [weak self] duration in
                Task { @MainActor in
                    self?.recordingDuration = duration
                }
            }
            try await rec.startRecording()
            recorder = rec
            recordingStartTime = Date()
            recordingDuration = 0
            state = .recording
        } catch {
            state = .error
            errorMessage = error.localizedDescription
        }
    }

    func stopRecording() async {
        do {
            guard let rec = recorder else { return }
            let fileURL = try await rec.stopRecording()
            recorder = nil
            state = .uploading
            await upload(fileURL: fileURL)
        } catch {
            state = .error
            errorMessage = error.localizedDescription
        }
    }

    private func upload(fileURL: URL) async {
        // Placeholder — will be implemented with Uploader in Task 5
        state = .done
        try? await Task.sleep(nanoseconds: 3_000_000_000)
        state = .idle
    }
}
