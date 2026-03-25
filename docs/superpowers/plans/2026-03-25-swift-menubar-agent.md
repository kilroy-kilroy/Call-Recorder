# Swift Menubar Agent — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a minimal macOS menubar app that captures system audio and uploads it to the Meeting Transcript Hub web app.

**Architecture:** A Swift/SwiftUI menubar-only app (no dock icon, no window) using ScreenCaptureKit for system audio capture. Audio is recorded to a local AAC file, then uploaded via multipart POST to the web app's `/api/upload` endpoint. Settings (server URL + API key) are stored in macOS Keychain.

**Tech Stack:** Swift 5.9+, SwiftUI, ScreenCaptureKit, AVFoundation, Xcode

**Spec:** `docs/superpowers/specs/2026-03-24-meeting-transcript-hub-design.md` (Component 1)

**Upload endpoint:** `https://web-one-neon-43.vercel.app/api/upload`
- Method: `POST`
- Auth: `x-api-key` header
- Body: multipart form data with fields `audio` (file), `recorded_at` (ISO string), `duration_seconds` (integer)

---

## File Structure

```
agent/                                      # New directory at repo root
├── MeetingRecorder/
│   ├── Package.swift                       # Swift Package Manager config
│   ├── MeetingRecorder/
│   │   ├── MeetingRecorderApp.swift        # App entry point, menubar setup, no dock icon
│   │   ├── MenuBarView.swift               # SwiftUI menu content (record/stop, status, settings)
│   │   ├── AudioRecorder.swift             # ScreenCaptureKit audio capture → AAC file
│   │   ├── Uploader.swift                  # Multipart upload with retry logic
│   │   ├── KeychainHelper.swift            # Read/write API key and server URL
│   │   ├── AppState.swift                  # Observable state: idle/recording/uploading/done/error
│   │   ├── SetupView.swift                 # First-launch config: server URL + API key
│   │   ├── Assets.xcassets/                # Menubar icons (mic idle, mic recording, uploading)
│   │   ├── Info.plist                      # LSUIElement=true (no dock icon)
│   │   └── MeetingRecorder.entitlements    # com.apple.security.audio-input, screen-capture
│   └── MeetingRecorderTests/
│       ├── UploaderTests.swift             # Upload request formatting, retry logic
│       └── KeychainHelperTests.swift       # Keychain read/write
```

---

## Task 1: Xcode Project Setup

**Files:**
- Create: `agent/MeetingRecorder/` (Xcode project via Xcode CLI or manually)
- Create: `agent/MeetingRecorder/MeetingRecorder/MeetingRecorderApp.swift`
- Create: `agent/MeetingRecorder/MeetingRecorder/Info.plist`
- Create: `agent/MeetingRecorder/MeetingRecorder/MeetingRecorder.entitlements`

- [ ] **Step 1: Create the Xcode project directory structure**

```bash
mkdir -p agent/MeetingRecorder/MeetingRecorder
mkdir -p agent/MeetingRecorder/MeetingRecorderTests
```

- [ ] **Step 2: Create the Swift Package / project config**

Create `agent/MeetingRecorder/Package.swift`:
```swift
// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "MeetingRecorder",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "MeetingRecorder",
            path: "MeetingRecorder"
        ),
        .testTarget(
            name: "MeetingRecorderTests",
            dependencies: ["MeetingRecorder"],
            path: "MeetingRecorderTests"
        ),
    ]
)
```

Using Swift Package Manager instead of Xcode project files — simpler, no `.xcodeproj` to manage, builds from command line with `swift build`.

- [ ] **Step 3: Create the app entry point**

Create `agent/MeetingRecorder/MeetingRecorder/MeetingRecorderApp.swift`:
```swift
import SwiftUI

@main
struct MeetingRecorderApp: App {
    @StateObject private var appState = AppState()

    var body: some Scene {
        MenuBarExtra("Meeting Recorder", systemImage: appState.menuBarIcon) {
            MenuBarView()
                .environmentObject(appState)
        }
    }
}
```

- [ ] **Step 4: Create placeholder AppState**

Create `agent/MeetingRecorder/MeetingRecorder/AppState.swift`:
```swift
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
```

- [ ] **Step 5: Create placeholder MenuBarView**

Create `agent/MeetingRecorder/MeetingRecorder/MenuBarView.swift`:
```swift
import SwiftUI

struct MenuBarView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        VStack {
            Text("Meeting Recorder")
                .font(.headline)
            Divider()
            Text("Status: \(appState.state.rawValue)")
            Divider()
            Button("Quit") {
                NSApplication.shared.terminate(nil)
            }
            .keyboardShortcut("q")
        }
        .padding(8)
    }
}
```

- [ ] **Step 6: Create Info.plist to hide dock icon**

Create `agent/MeetingRecorder/MeetingRecorder/Info.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>LSUIElement</key>
    <true/>
</dict>
</plist>
```

- [ ] **Step 7: Create entitlements file**

Create `agent/MeetingRecorder/MeetingRecorder/MeetingRecorder.entitlements`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.app-sandbox</key>
    <false/>
</dict>
</plist>
```

Note: We disable app sandbox because ScreenCaptureKit needs system-level audio access. The app will request Screen Recording permission at runtime.

- [ ] **Step 8: Verify project builds**

```bash
cd agent/MeetingRecorder
swift build
```

Expected: Build succeeds (may have warnings about unused placeholders — that's fine).

- [ ] **Step 9: Commit**

```bash
cd /Users/timkilroy/Projects/Call-Recorder
git add agent/
git commit -m "feat: scaffold Swift menubar agent with SwiftUI and SPM"
```

---

## Task 2: Keychain Helper

**Files:**
- Create: `agent/MeetingRecorder/MeetingRecorder/KeychainHelper.swift`
- Test: `agent/MeetingRecorder/MeetingRecorderTests/KeychainHelperTests.swift`

- [ ] **Step 1: Write failing test**

Create `agent/MeetingRecorder/MeetingRecorderTests/KeychainHelperTests.swift`:
```swift
import Testing
@testable import MeetingRecorder

@Suite("KeychainHelper Tests")
struct KeychainHelperTests {
    let helper = KeychainHelper(service: "com.meetingrecorder.test")

    @Test("Save and retrieve server URL")
    func saveAndGetServerURL() {
        helper.setServerURL("https://example.com")
        let url = helper.getServerURL()
        #expect(url == "https://example.com")
        helper.deleteServerURL()
    }

    @Test("Save and retrieve API key")
    func saveAndGetAPIKey() {
        helper.setAPIKey("test-key-123")
        let key = helper.getAPIKey()
        #expect(key == "test-key-123")
        helper.deleteAPIKey()
    }

    @Test("Returns nil when not set")
    func returnsNilWhenEmpty() {
        helper.deleteServerURL()
        helper.deleteAPIKey()
        #expect(helper.getServerURL() == nil)
        #expect(helper.getAPIKey() == nil)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd agent/MeetingRecorder
swift test --filter KeychainHelperTests
```

Expected: FAIL — `KeychainHelper` not found.

- [ ] **Step 3: Implement KeychainHelper**

Create `agent/MeetingRecorder/MeetingRecorder/KeychainHelper.swift`:
```swift
import Foundation
import Security

class KeychainHelper {
    private let service: String

    init(service: String = "com.meetingrecorder.app") {
        self.service = service
    }

    // MARK: - Server URL

    func getServerURL() -> String? {
        read(account: "serverURL")
    }

    func setServerURL(_ url: String) {
        save(account: "serverURL", value: url)
    }

    func deleteServerURL() {
        delete(account: "serverURL")
    }

    // MARK: - API Key

    func getAPIKey() -> String? {
        read(account: "apiKey")
    }

    func setAPIKey(_ key: String) {
        save(account: "apiKey", value: key)
    }

    func deleteAPIKey() {
        delete(account: "apiKey")
    }

    // MARK: - Private

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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd agent/MeetingRecorder
swift test --filter KeychainHelperTests
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/timkilroy/Projects/Call-Recorder
git add agent/
git commit -m "feat: add Keychain helper for storing server URL and API key"
```

---

## Task 3: Setup View (First-Launch Config)

**Files:**
- Create: `agent/MeetingRecorder/MeetingRecorder/SetupView.swift`
- Modify: `agent/MeetingRecorder/MeetingRecorder/MenuBarView.swift`

- [ ] **Step 1: Create SetupView**

Create `agent/MeetingRecorder/MeetingRecorder/SetupView.swift`:
```swift
import SwiftUI

struct SetupView: View {
    @EnvironmentObject var appState: AppState
    @State private var serverURL = ""
    @State private var apiKey = ""
    @State private var saved = false

    private let keychain = KeychainHelper()

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Setup")
                .font(.headline)

            TextField("Server URL", text: $serverURL)
                .textFieldStyle(.roundedBorder)
                .font(.system(.body, design: .monospaced))

            SecureField("API Key", text: $apiKey)
                .textFieldStyle(.roundedBorder)
                .font(.system(.body, design: .monospaced))

            HStack {
                Button("Save") {
                    keychain.setServerURL(serverURL)
                    keychain.setAPIKey(apiKey)
                    saved = true
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                        saved = false
                    }
                }
                .disabled(serverURL.isEmpty || apiKey.isEmpty)

                if saved {
                    Text("Saved!")
                        .foregroundStyle(.green)
                        .font(.caption)
                }
            }
        }
        .padding()
        .frame(width: 350)
        .onAppear {
            serverURL = keychain.getServerURL() ?? "https://web-one-neon-43.vercel.app"
            apiKey = keychain.getAPIKey() ?? ""
        }
    }
}
```

- [ ] **Step 2: Update MenuBarView to show setup when not configured**

Replace `agent/MeetingRecorder/MeetingRecorder/MenuBarView.swift`:
```swift
import SwiftUI

struct MenuBarView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        VStack(spacing: 0) {
            if !appState.isConfigured {
                SetupView()
                    .environmentObject(appState)
            } else {
                recordingControls
            }

            Divider()

            Button("Settings...") {
                appState.showSettings.toggle()
            }

            if appState.showSettings {
                SetupView()
                    .environmentObject(appState)
            }

            Divider()

            Button("Quit") {
                NSApplication.shared.terminate(nil)
            }
            .keyboardShortcut("q")
        }
        .padding(8)
    }

    @ViewBuilder
    private var recordingControls: some View {
        switch appState.state {
        case .idle:
            Button("Start Recording") {
                // Will be implemented in Task 4
            }
        case .recording:
            VStack(spacing: 4) {
                Text("Recording...")
                    .foregroundStyle(.red)
                Text(formatDuration(appState.recordingDuration))
                    .font(.system(.body, design: .monospaced))
                Button("Stop Recording") {
                    // Will be implemented in Task 4
                }
            }
        case .uploading:
            VStack(spacing: 4) {
                Text("Uploading...")
                ProgressView()
                    .scaleEffect(0.8)
            }
        case .done:
            Text("Upload complete!")
                .foregroundStyle(.green)
        case .error:
            VStack(spacing: 4) {
                Text("Error")
                    .foregroundStyle(.red)
                if let msg = appState.errorMessage {
                    Text(msg)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Button("Dismiss") {
                    appState.state = .idle
                    appState.errorMessage = nil
                }
            }
        }
    }

    private func formatDuration(_ seconds: TimeInterval) -> String {
        let m = Int(seconds) / 60
        let s = Int(seconds) % 60
        return String(format: "%d:%02d", m, s)
    }
}
```

- [ ] **Step 3: Add showSettings to AppState**

Add to `agent/MeetingRecorder/MeetingRecorder/AppState.swift`, inside the class:
```swift
@Published var showSettings = false
```

- [ ] **Step 4: Verify build**

```bash
cd agent/MeetingRecorder
swift build
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
cd /Users/timkilroy/Projects/Call-Recorder
git add agent/
git commit -m "feat: add setup view and recording controls UI"
```

---

## Task 4: Audio Recorder (ScreenCaptureKit)

**Files:**
- Create: `agent/MeetingRecorder/MeetingRecorder/AudioRecorder.swift`
- Modify: `agent/MeetingRecorder/MeetingRecorder/MenuBarView.swift` (wire up buttons)

- [ ] **Step 1: Implement AudioRecorder**

Create `agent/MeetingRecorder/MeetingRecorder/AudioRecorder.swift`:
```swift
import Foundation
import ScreenCaptureKit
import AVFoundation

@MainActor
class AudioRecorder: ObservableObject {
    private var stream: SCStream?
    private var audioFile: AVAudioFile?
    private var outputURL: URL?
    private var startTime: Date?
    private var timer: Timer?
    private let delegate = AudioStreamDelegate()

    var onDurationUpdate: ((TimeInterval) -> Void)?

    var recordingURL: URL? { outputURL }
    var duration: TimeInterval {
        guard let start = startTime else { return 0 }
        return Date().timeIntervalSince(start)
    }

    func startRecording() async throws {
        // Get available content
        let content = try await SCShareableContent.excludingDesktopWindows(
            false, onScreenWindowsOnly: false
        )

        guard let display = content.displays.first else {
            throw RecorderError.noDisplay
        }

        // Configure stream for audio only
        let config = SCStreamConfiguration()
        config.capturesAudio = true
        config.excludesCurrentProcessAudio = true
        config.sampleRate = 48000
        config.channelCount = 2

        // We don't need video, but SCStream requires a display
        config.width = 2
        config.height = 2
        config.minimumFrameInterval = CMTime(value: 1, timescale: 1) // 1 fps minimum

        let filter = SCContentFilter(display: display, excludingWindows: [])

        // Set up output file
        let tempDir = FileManager.default.temporaryDirectory
        let filename = "recording-\(Int(Date().timeIntervalSince1970)).m4a"
        outputURL = tempDir.appendingPathComponent(filename)

        // Configure audio file writer
        let audioSettings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: 48000,
            AVNumberOfChannelsKey: 2,
            AVEncoderBitRateKey: 128000,
        ]

        delegate.audioSettings = audioSettings
        delegate.outputURL = outputURL

        // Create and start stream
        stream = SCStream(filter: filter, configuration: config, delegate: nil)
        try stream?.addStreamOutput(delegate, type: .audio, sampleHandlerQueue: .global())
        try await stream?.startCapture()

        startTime = Date()

        // Start duration timer
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self = self else { return }
                self.onDurationUpdate?(self.duration)
            }
        }
    }

    func stopRecording() async throws -> URL {
        timer?.invalidate()
        timer = nil

        try await stream?.stopCapture()
        stream = nil
        delegate.closeFile()

        guard let url = outputURL else {
            throw RecorderError.noOutput
        }

        return url
    }

    enum RecorderError: LocalizedError {
        case noDisplay
        case noOutput

        var errorDescription: String? {
            switch self {
            case .noDisplay: return "No display found for audio capture"
            case .noOutput: return "No recording output file"
            }
        }
    }
}

class AudioStreamDelegate: NSObject, SCStreamOutput {
    var audioSettings: [String: Any]?
    var outputURL: URL?
    private var audioFile: AVAudioFile?
    private let lock = NSLock()

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .audio else { return }
        guard let formatDesc = sampleBuffer.formatDescription else { return }

        lock.lock()
        defer { lock.unlock() }

        if audioFile == nil, let url = outputURL {
            let audioFormat = AVAudioFormat(cmAudioFormatDescription: formatDesc)
            do {
                audioFile = try AVAudioFile(
                    forWriting: url,
                    settings: audioSettings ?? [:],
                    commonFormat: audioFormat.commonFormat,
                    interleaved: audioFormat.isInterleaved
                )
            } catch {
                print("Failed to create audio file: \(error)")
                return
            }
        }

        guard let audioFile = audioFile else { return }

        do {
            let pcmBuffer = try sampleBuffer.asPCMBuffer()
            try audioFile.write(from: pcmBuffer)
        } catch {
            // Silently skip bad buffers
        }
    }

    func closeFile() {
        lock.lock()
        defer { lock.unlock() }
        audioFile = nil
    }
}

extension CMSampleBuffer {
    func asPCMBuffer() throws -> AVAudioPCMBuffer {
        let formatDesc = formatDescription!
        let audioFormat = AVAudioFormat(cmAudioFormatDescription: formatDesc)
        let numSamples = CMSampleBufferGetNumSamples(self)

        guard let pcmBuffer = AVAudioPCMBuffer(pcmFormat: audioFormat, frameCapacity: AVAudioFrameCount(numSamples)) else {
            throw NSError(domain: "AudioRecorder", code: -1, userInfo: [NSLocalizedDescriptionKey: "Failed to create PCM buffer"])
        }

        pcmBuffer.frameLength = AVAudioFrameCount(numSamples)

        try CMSampleBufferCopyPCMDataIntoAudioBufferList(
            self,
            at: 0,
            frameCount: Int32(numSamples),
            into: pcmBuffer.mutableAudioBufferList
        )

        return pcmBuffer
    }
}
```

- [ ] **Step 2: Wire up recording buttons in MenuBarView**

Update the recording controls in `MenuBarView.swift`. Replace the `recordingControls` computed property's `.idle` and `.recording` cases:

```swift
case .idle:
    Button("Start Recording") {
        Task {
            do {
                try await appState.startRecording()
            } catch {
                appState.state = .error
                appState.errorMessage = error.localizedDescription
            }
        }
    }
case .recording:
    VStack(spacing: 4) {
        Text("Recording...")
            .foregroundStyle(.red)
        Text(formatDuration(appState.recordingDuration))
            .font(.system(.body, design: .monospaced))
        Button("Stop Recording") {
            Task {
                do {
                    try await appState.stopRecording()
                } catch {
                    appState.state = .error
                    appState.errorMessage = error.localizedDescription
                }
            }
        }
    }
```

- [ ] **Step 3: Add recorder to AppState**

Add recording methods to `AppState.swift`:
```swift
private let recorder = AudioRecorder()

func startRecording() async throws {
    recorder.onDurationUpdate = { [weak self] duration in
        self?.recordingDuration = duration
    }
    try await recorder.startRecording()
    state = .recording
    recordingDuration = 0
}

func stopRecording() async throws {
    let fileURL = try await recorder.stopRecording()
    state = .uploading
    // Upload will be wired in Task 5
    await upload(fileURL: fileURL)
}

private func upload(fileURL: URL) async {
    // Placeholder — implemented in Task 5
    state = .done
    DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
        self?.state = .idle
    }
}
```

- [ ] **Step 4: Verify build**

```bash
cd agent/MeetingRecorder
swift build
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
cd /Users/timkilroy/Projects/Call-Recorder
git add agent/
git commit -m "feat: add ScreenCaptureKit audio recorder"
```

---

## Task 5: Uploader (Multipart POST with Retry)

**Files:**
- Create: `agent/MeetingRecorder/MeetingRecorder/Uploader.swift`
- Test: `agent/MeetingRecorder/MeetingRecorderTests/UploaderTests.swift`
- Modify: `agent/MeetingRecorder/MeetingRecorder/AppState.swift` (wire up upload)

- [ ] **Step 1: Write failing test**

Create `agent/MeetingRecorder/MeetingRecorderTests/UploaderTests.swift`:
```swift
import Testing
import Foundation
@testable import MeetingRecorder

@Suite("Uploader Tests")
struct UploaderTests {
    @Test("Builds correct multipart request")
    func buildsMultipartRequest() throws {
        let uploader = Uploader(serverURL: "https://example.com", apiKey: "test-key")

        // Create a tiny test file
        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent("test.m4a")
        try "test audio data".write(to: tempURL, atomically: true, encoding: .utf8)
        defer { try? FileManager.default.removeItem(at: tempURL) }

        let request = try uploader.buildUploadRequest(
            fileURL: tempURL,
            recordedAt: "2026-03-25T10:00:00Z",
            durationSeconds: 3600
        )

        #expect(request.url?.absoluteString == "https://example.com/api/upload")
        #expect(request.httpMethod == "POST")
        #expect(request.value(forHTTPHeaderField: "x-api-key") == "test-key")
        #expect(request.value(forHTTPHeaderField: "Content-Type")?.contains("multipart/form-data") == true)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd agent/MeetingRecorder
swift test --filter UploaderTests
```

Expected: FAIL — `Uploader` not found.

- [ ] **Step 3: Implement Uploader**

Create `agent/MeetingRecorder/MeetingRecorder/Uploader.swift`:
```swift
import Foundation

class Uploader {
    let serverURL: String
    let apiKey: String
    private let maxRetries = 3

    init(serverURL: String, apiKey: String) {
        self.serverURL = serverURL.trimmingCharacters(in: .init(charactersIn: "/"))
        self.apiKey = apiKey
    }

    func buildUploadRequest(
        fileURL: URL,
        recordedAt: String,
        durationSeconds: Int
    ) throws -> URLRequest {
        let boundary = UUID().uuidString
        let url = URL(string: "\(serverURL)/api/upload")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")

        var body = Data()
        let fileData = try Data(contentsOf: fileURL)

        // Audio file field
        body.appendMultipart(boundary: boundary, name: "audio", filename: fileURL.lastPathComponent, mimeType: "audio/mp4", data: fileData)

        // Metadata fields
        body.appendMultipart(boundary: boundary, name: "recorded_at", value: recordedAt)
        body.appendMultipart(boundary: boundary, name: "duration_seconds", value: "\(durationSeconds)")

        // Close boundary
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        request.httpBody = body
        return request
    }

    func upload(
        fileURL: URL,
        recordedAt: Date,
        durationSeconds: Int,
        onProgress: @escaping (Double) -> Void
    ) async throws -> UploadResult {
        let request = try buildUploadRequest(
            fileURL: fileURL,
            recordedAt: ISO8601DateFormatter().string(from: recordedAt),
            durationSeconds: durationSeconds
        )

        var lastError: Error?

        for attempt in 0..<maxRetries {
            if attempt > 0 {
                // Exponential backoff: 2s, 4s
                let delay = pow(2.0, Double(attempt))
                try await Task.sleep(for: .seconds(delay))
            }

            do {
                let (data, response) = try await URLSession.shared.data(for: request)

                guard let httpResponse = response as? HTTPURLResponse else {
                    throw UploadError.invalidResponse
                }

                if httpResponse.statusCode == 200 || httpResponse.statusCode == 201 {
                    let result = try JSONDecoder().decode(UploadResult.self, from: data)
                    // Clean up temp file
                    try? FileManager.default.removeItem(at: fileURL)
                    return result
                } else {
                    let errorBody = String(data: data, encoding: .utf8) ?? "Unknown error"
                    throw UploadError.serverError(status: httpResponse.statusCode, body: errorBody)
                }
            } catch {
                lastError = error
                continue
            }
        }

        throw lastError ?? UploadError.maxRetriesExceeded
    }

    enum UploadError: LocalizedError {
        case invalidResponse
        case serverError(status: Int, body: String)
        case maxRetriesExceeded

        var errorDescription: String? {
            switch self {
            case .invalidResponse: return "Invalid server response"
            case .serverError(let status, let body): return "Server error (\(status)): \(body)"
            case .maxRetriesExceeded: return "Upload failed after 3 attempts"
            }
        }
    }
}

struct UploadResult: Decodable {
    let meetingId: String
    let status: String
}

extension Data {
    mutating func appendMultipart(boundary: String, name: String, filename: String, mimeType: String, data: Data) {
        append("--\(boundary)\r\n".data(using: .utf8)!)
        append("Content-Disposition: form-data; name=\"\(name)\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
        append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
        append(data)
        append("\r\n".data(using: .utf8)!)
    }

    mutating func appendMultipart(boundary: String, name: String, value: String) {
        append("--\(boundary)\r\n".data(using: .utf8)!)
        append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n".data(using: .utf8)!)
        append("\(value)\r\n".data(using: .utf8)!)
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd agent/MeetingRecorder
swift test --filter UploaderTests
```

Expected: PASS

- [ ] **Step 5: Wire up upload in AppState**

Replace the placeholder `upload` method in `AppState.swift`:
```swift
private func upload(fileURL: URL) async {
    let keychain = KeychainHelper()
    guard let serverURL = keychain.getServerURL(),
          let apiKey = keychain.getAPIKey() else {
        state = .error
        errorMessage = "Not configured — open Settings"
        return
    }

    let uploader = Uploader(serverURL: serverURL, apiKey: apiKey)
    let duration = Int(recordingDuration)

    do {
        let _ = try await uploader.upload(
            fileURL: fileURL,
            recordedAt: Date(),
            durationSeconds: duration,
            onProgress: { _ in }
        )
        state = .done
        // Reset to idle after 3 seconds
        try? await Task.sleep(for: .seconds(3))
        state = .idle
    } catch {
        // Save failed upload path so user can retry later
        savePendingUpload(fileURL: fileURL, duration: duration)
        state = .error
        errorMessage = error.localizedDescription
    }
}

/// Saves a failed upload's file path to disk for later retry
private func savePendingUpload(fileURL: URL, duration: Int) {
    let pending = PendingUpload(filePath: fileURL.path, recordedAt: Date(), durationSeconds: duration)
    var existing = loadPendingUploads()
    existing.append(pending)
    let encoder = JSONEncoder()
    if let data = try? encoder.encode(existing) {
        try? data.write(to: pendingUploadsURL)
    }
}

private var pendingUploadsURL: URL {
    FileManager.default.temporaryDirectory.appendingPathComponent("pending-uploads.json")
}

func loadPendingUploads() -> [PendingUpload] {
    guard let data = try? Data(contentsOf: pendingUploadsURL) else { return [] }
    return (try? JSONDecoder().decode([PendingUpload].self, from: data)) ?? []
}

func clearPendingUploads() {
    try? FileManager.default.removeItem(at: pendingUploadsURL)
}
```

Add a `PendingUpload` struct (can go in `AppState.swift` or a separate file):
```swift
struct PendingUpload: Codable {
    let filePath: String
    let recordedAt: Date
    let durationSeconds: Int
}
```

- [ ] **Step 6: Run all tests**

```bash
cd agent/MeetingRecorder
swift test
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
cd /Users/timkilroy/Projects/Call-Recorder
git add agent/
git commit -m "feat: add multipart uploader with retry logic"
```

---

## Task 6: Build & Test End-to-End

**Files:**
- No new files — integration testing

- [ ] **Step 1: Build release binary**

```bash
cd agent/MeetingRecorder
swift build -c release
```

Expected: Builds successfully. Binary at `.build/release/MeetingRecorder`

- [ ] **Step 2: Run the app**

```bash
.build/release/MeetingRecorder
```

Expected: Menubar icon appears (microphone). Clicking shows the setup view (since no API key is configured yet).

- [ ] **Step 3: Configure the app**

Enter in the setup view:
- Server URL: `https://web-one-neon-43.vercel.app`
- API Key: `<your UPLOAD_API_KEY from Vercel env vars>`

Click Save.

- [ ] **Step 4: Test recording**

1. Start a meeting or play audio on your computer
2. Click "Start Recording" in the menubar
3. Wait 10-15 seconds
4. Click "Stop Recording"
5. Watch the upload progress
6. Check the web app dashboard — a new meeting should appear

- [ ] **Step 5: Run all tests one final time**

```bash
cd agent/MeetingRecorder
swift test
```

Expected: All tests pass.

- [ ] **Step 6: Final commit**

```bash
cd /Users/timkilroy/Projects/Call-Recorder
git add agent/
git commit -m "feat: complete Swift menubar agent for meeting recording"
```
