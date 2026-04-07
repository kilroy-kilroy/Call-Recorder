import Foundation

struct UploadResult: Decodable {
    let meetingId: String
    let status: String
}

struct PendingUpload: Codable {
    let filePath: String
    let recordedAt: Date
    let durationSeconds: Int
}

final class Uploader: Sendable {
    let serverURL: String
    let apiKey: String

    init(serverURL: String, apiKey: String) {
        self.serverURL = serverURL
        self.apiKey = apiKey
    }

    // MARK: - Public upload entry point

    func upload(
        fileURL: URL,
        recordedAt: String,
        durationSeconds: Int,
        onProgress: (@Sendable (Double) -> Void)? = nil
    ) async throws -> UploadResult {
        let maxRetries = 3
        var lastError: Error?

        for attempt in 0..<maxRetries {
            if attempt > 0 {
                let delay = UInt64(pow(2.0, Double(attempt))) * 1_000_000_000
                try await Task.sleep(nanoseconds: delay)
            }

            do {
                onProgress?(0.05)

                let result = try await uploadFile(
                    fileURL: fileURL,
                    recordedAt: recordedAt,
                    durationSeconds: durationSeconds,
                    onProgress: onProgress
                )

                // Clean up temp file on success
                try? FileManager.default.removeItem(at: fileURL)

                onProgress?(1.0)
                return result
            } catch {
                lastError = error
                continue
            }
        }

        throw lastError ?? UploaderError.unknownError
    }

    // MARK: - Single-request upload via multipart form

    func buildUploadRequest(
        fileURL: URL,
        recordedAt: String,
        durationSeconds: Int
    ) throws -> URLRequest {
        guard let url = URL(string: "\(serverURL)/api/upload") else {
            throw UploaderError.invalidURL
        }

        let fileData = try Data(contentsOf: fileURL)
        let boundary = UUID().uuidString

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")

        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"recording.m4a\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: audio/mp4\r\n\r\n".data(using: .utf8)!)
        body.append(fileData)
        body.append("\r\n".data(using: .utf8)!)
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"recordedAt\"\r\n\r\n".data(using: .utf8)!)
        body.append("\(recordedAt)\r\n".data(using: .utf8)!)
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"durationSeconds\"\r\n\r\n".data(using: .utf8)!)
        body.append("\(durationSeconds)\r\n".data(using: .utf8)!)
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        request.httpBody = body
        return request
    }

    private func uploadFile(
        fileURL: URL,
        recordedAt: String,
        durationSeconds: Int,
        onProgress: (@Sendable (Double) -> Void)?
    ) async throws -> UploadResult {
        guard let url = URL(string: "\(serverURL)/api/upload") else {
            throw UploaderError.invalidURL
        }

        let fileData = try Data(contentsOf: fileURL)
        let boundary = UUID().uuidString

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")

        var body = Data()

        // File field
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"recording.m4a\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: audio/mp4\r\n\r\n".data(using: .utf8)!)
        body.append(fileData)
        body.append("\r\n".data(using: .utf8)!)

        // recordedAt field
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"recordedAt\"\r\n\r\n".data(using: .utf8)!)
        body.append("\(recordedAt)\r\n".data(using: .utf8)!)

        // durationSeconds field
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"durationSeconds\"\r\n\r\n".data(using: .utf8)!)
        body.append("\(durationSeconds)\r\n".data(using: .utf8)!)

        // Close boundary
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        request.httpBody = body

        onProgress?(0.3)

        let (data, response) = try await URLSession.shared.data(for: request)

        onProgress?(0.9)

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            throw UploaderError.serverError(statusCode: code, body: String(data: data, encoding: .utf8))
        }

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(UploadResult.self, from: data)
    }

    // MARK: - Pending uploads

    static var pendingUploadsURL: URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("pending_uploads.json")
    }

    static func savePendingUpload(_ upload: PendingUpload) {
        var uploads = loadPendingUploads()
        uploads.append(upload)
        if let data = try? JSONEncoder().encode(uploads) {
            try? data.write(to: pendingUploadsURL)
        }
    }

    static func loadPendingUploads() -> [PendingUpload] {
        guard let data = try? Data(contentsOf: pendingUploadsURL) else { return [] }
        return (try? JSONDecoder().decode([PendingUpload].self, from: data)) ?? []
    }

    static func clearPendingUploads() {
        try? FileManager.default.removeItem(at: pendingUploadsURL)
    }
}

enum UploaderError: LocalizedError {
    case invalidURL
    case serverError(statusCode: Int, body: String?)
    case unknownError

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid server URL"
        case .serverError(let code, let body):
            if let body = body, !body.isEmpty {
                return "Server error (HTTP \(code)): \(body.prefix(500))"
            }
            return "Server error (HTTP \(code))"
        case .unknownError: return "Unknown upload error"
        }
    }
}
