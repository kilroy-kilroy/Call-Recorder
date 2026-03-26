import Testing
import Foundation
@testable import MeetingRecorder

@Suite("Uploader Tests")
struct UploaderTests {
    @Test("Builds correct multipart request")
    func buildsMultipartRequest() throws {
        let uploader = Uploader(serverURL: "https://example.com", apiKey: "test-key")
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
