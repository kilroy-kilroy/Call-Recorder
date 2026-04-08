import Foundation

struct UploadResult: Decodable {
    let meetingId: String
    let status: String
}

struct StartUploadResult: Decodable {
    let meetingId: String
    let clientToken: String
    let pathname: String
}

struct BlobPutResult: Decodable {
    let url: String
    let downloadUrl: String
    let pathname: String
}

struct PendingUpload: Codable {
    let filePath: String
    let recordedAt: Date
    let durationSeconds: Int
}

final class Uploader: Sendable {
    let serverURL: String
    let apiKey: String

    private static let blobAPIBase = "https://vercel.com/api/blob"

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

                // Step 1: Get upload token from our server (tiny JSON request)
                let start = try await startUpload(
                    recordedAt: recordedAt,
                    durationSeconds: durationSeconds
                )

                onProgress?(0.1)

                // Step 2: PUT file directly to Vercel Blob (bypasses our server entirely)
                let blobUrl = try await putToBlob(
                    fileURL: fileURL,
                    pathname: start.pathname,
                    clientToken: start.clientToken
                )

                onProgress?(0.8)

                // Step 3: Tell our server the upload is done (tiny JSON request)
                let result = try await completeUpload(
                    meetingId: start.meetingId,
                    blobUrl: blobUrl
                )

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

    // MARK: - Step 1: Get client token from our API

    private func startUpload(
        recordedAt: String,
        durationSeconds: Int
    ) async throws -> StartUploadResult {
        guard let url = URL(string: "\(serverURL)/api/upload/start") else {
            throw UploaderError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")

        let payload: [String: Any] = [
            "recordedAt": recordedAt,
            "durationSeconds": durationSeconds
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            throw UploaderError.serverError(statusCode: code, body: String(data: data, encoding: .utf8))
        }

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(StartUploadResult.self, from: data)
    }

    // MARK: - Step 2: Simple PUT directly to Vercel Blob API
    // Matches exactly what @vercel/blob SDK does: PUT to /api/blob/?pathname=...

    private func putToBlob(
        fileURL: URL,
        pathname: String,
        clientToken: String
    ) async throws -> String {
        let encodedPathname = pathname.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? pathname
        guard let url = URL(string: "\(Self.blobAPIBase)/?pathname=\(encodedPathname)") else {
            throw UploaderError.invalidURL
        }

        let fileData = try Data(contentsOf: fileURL)

        let storeId = extractStoreId(from: clientToken) ?? ""
        let requestId = "\(storeId):\(Int(Date().timeIntervalSince1970 * 1000)):\(UUID().uuidString.prefix(12))"

        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.httpBody = fileData
        request.setValue("Bearer \(clientToken)", forHTTPHeaderField: "authorization")
        request.setValue("12", forHTTPHeaderField: "x-api-version")
        request.setValue(requestId, forHTTPHeaderField: "x-api-blob-request-id")
        request.setValue("0", forHTTPHeaderField: "x-api-blob-request-attempt")
        request.setValue("public", forHTTPHeaderField: "x-vercel-blob-access")
        request.setValue("audio/mp4", forHTTPHeaderField: "x-content-type")
        request.setValue(String(fileData.count), forHTTPHeaderField: "x-content-length")

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            throw UploaderError.serverError(statusCode: code, body: String(data: data, encoding: .utf8))
        }

        let result = try JSONDecoder().decode(BlobPutResult.self, from: data)
        return result.url
    }

    private func extractStoreId(from clientToken: String) -> String? {
        let parts = clientToken.split(separator: "_")
        guard parts.count >= 4 else { return nil }
        return String(parts[3])
    }

    // MARK: - Step 3: Notify server upload is complete

    private func completeUpload(
        meetingId: String,
        blobUrl: String
    ) async throws -> UploadResult {
        guard let url = URL(string: "\(serverURL)/api/upload/complete") else {
            throw UploaderError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")

        let payload: [String: Any] = [
            "meetingId": meetingId,
            "blobUrl": blobUrl
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            throw UploaderError.serverError(statusCode: code, body: String(data: data, encoding: .utf8))
        }

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(UploadResult.self, from: data)
    }

    // MARK: - Test helper

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
