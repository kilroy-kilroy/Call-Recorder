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

    func buildUploadRequest(
        fileURL: URL,
        recordedAt: String,
        durationSeconds: Int
    ) throws -> URLRequest {
        let boundary = "Boundary-\(UUID().uuidString)"
        guard let url = URL(string: "\(serverURL)/api/upload") else {
            throw UploaderError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")

        var body = Data()

        // recorded_at field
        body.appendMultipartField(name: "recorded_at", value: recordedAt, boundary: boundary)

        // duration_seconds field
        body.appendMultipartField(name: "duration_seconds", value: "\(durationSeconds)", boundary: boundary)

        // audio file
        let fileData = try Data(contentsOf: fileURL)
        body.appendMultipartFile(
            name: "audio",
            filename: fileURL.lastPathComponent,
            mimeType: "audio/mp4",
            data: fileData,
            boundary: boundary
        )

        // closing boundary
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        request.httpBody = body
        return request
    }

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
                let request = try buildUploadRequest(
                    fileURL: fileURL,
                    recordedAt: recordedAt,
                    durationSeconds: durationSeconds
                )

                onProgress?(0.1)

                let (data, response) = try await URLSession.shared.data(for: request)

                guard let httpResponse = response as? HTTPURLResponse else {
                    throw UploaderError.invalidResponse
                }

                onProgress?(0.9)

                guard (200...299).contains(httpResponse.statusCode) else {
                    throw UploaderError.serverError(statusCode: httpResponse.statusCode)
                }

                let decoder = JSONDecoder()
                decoder.keyDecodingStrategy = .convertFromSnakeCase
                let result = try decoder.decode(UploadResult.self, from: data)

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
    case invalidResponse
    case serverError(statusCode: Int)
    case unknownError

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid server URL"
        case .invalidResponse: return "Invalid response from server"
        case .serverError(let code): return "Server error (HTTP \(code))"
        case .unknownError: return "Unknown upload error"
        }
    }
}

extension Data {
    mutating func appendMultipartField(name: String, value: String, boundary: String) {
        var fieldString = "--\(boundary)\r\n"
        fieldString += "Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n"
        fieldString += "\(value)\r\n"
        append(fieldString.data(using: .utf8)!)
    }

    mutating func appendMultipartFile(name: String, filename: String, mimeType: String, data: Data, boundary: String) {
        var header = "--\(boundary)\r\n"
        header += "Content-Disposition: form-data; name=\"\(name)\"; filename=\"\(filename)\"\r\n"
        header += "Content-Type: \(mimeType)\r\n\r\n"
        append(header.data(using: .utf8)!)
        append(data)
        append("\r\n".data(using: .utf8)!)
    }
}
