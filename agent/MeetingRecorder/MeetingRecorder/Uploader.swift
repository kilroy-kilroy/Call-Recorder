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

struct MPUCreateResult: Decodable {
    let key: String
    let uploadId: String
}

struct MPUPartResult: Decodable {
    let etag: String
}

struct MPUCompleteResult: Decodable {
    let url: String
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
    private static let partSize = 8 * 1024 * 1024 // 8 MB
    private static let maxConcurrentParts = 6

    init(serverURL: String, apiKey: String) {
        self.serverURL = serverURL
        self.apiKey = apiKey
    }

    // MARK: - Step 1: Request meeting ID + Blob client token

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

    // MARK: - Step 2: Multipart upload directly to Vercel Blob

    private func extractStoreId(from clientToken: String) -> String? {
        // Token format: vercel_blob_client_<storeId>_<base64payload>
        let parts = clientToken.split(separator: "_")
        guard parts.count >= 4 else { return nil }
        return String(parts[3])
    }

    private func makeRequestId(storeId: String) -> String {
        let timestamp = Int(Date().timeIntervalSince1970 * 1000)
        let random = UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(12)
        return "\(storeId):\(timestamp):\(random)"
    }

    private func blobHeaders(clientToken: String, storeId: String) -> [String: String] {
        [
            "authorization": "Bearer \(clientToken)",
            "x-api-version": "12",
            "x-api-blob-request-id": makeRequestId(storeId: storeId),
            "x-api-blob-request-attempt": "0",
        ]
    }

    private func uploadToBlob(
        fileURL: URL,
        pathname: String,
        clientToken: String,
        onProgress: (@Sendable (Double) -> Void)?
    ) async throws -> String {
        guard let storeId = extractStoreId(from: clientToken) else {
            throw UploaderError.invalidResponse
        }

        let fileData = try Data(contentsOf: fileURL)

        // Always use multipart upload to avoid body size limits on simple PUT
        return try await multipartUpload(
            fileData: fileData,
            pathname: pathname,
            clientToken: clientToken,
            storeId: storeId,
            onProgress: onProgress
        )
    }

    private func multipartUpload(
        fileData: Data,
        pathname: String,
        clientToken: String,
        storeId: String,
        onProgress: (@Sendable (Double) -> Void)?
    ) async throws -> String {
        let encodedPathname = pathname.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? pathname
        let mpuBase = "\(Self.blobAPIBase)/mpu?pathname=\(encodedPathname)"

        // 1. Create multipart upload
        guard let createURL = URL(string: mpuBase) else {
            throw UploaderError.invalidURL
        }

        var createRequest = URLRequest(url: createURL)
        createRequest.httpMethod = "POST"
        for (key, value) in blobHeaders(clientToken: clientToken, storeId: storeId) {
            createRequest.setValue(value, forHTTPHeaderField: key)
        }
        createRequest.setValue("create", forHTTPHeaderField: "x-mpu-action")
        createRequest.setValue("public", forHTTPHeaderField: "x-vercel-blob-access")
        createRequest.setValue("audio/mp4", forHTTPHeaderField: "x-content-type")

        let (createData, createResponse) = try await URLSession.shared.data(for: createRequest)

        guard let createHTTP = createResponse as? HTTPURLResponse,
              (200...299).contains(createHTTP.statusCode) else {
            let code = (createResponse as? HTTPURLResponse)?.statusCode ?? 0
            throw UploaderError.serverError(statusCode: code, body: String(data: createData, encoding: .utf8))
        }

        let mpu = try JSONDecoder().decode(MPUCreateResult.self, from: createData)

        // 2. Upload parts concurrently
        let totalParts = (fileData.count + Self.partSize - 1) / Self.partSize
        let partsCompleted = SendableCounter()

        let partResults: [(Int, String)] = try await withThrowingTaskGroup(of: (Int, String).self) { group in
            var results: [(Int, String)] = []
            var partsQueued = 0

            for partNumber in 1...totalParts {
                // Limit concurrency
                if partsQueued >= Self.maxConcurrentParts {
                    if let result = try await group.next() {
                        results.append(result)
                    }
                }

                let start = (partNumber - 1) * Self.partSize
                let end = min(start + Self.partSize, fileData.count)
                let partData = fileData[start..<end]

                group.addTask { [self] in
                    let etag = try await self.uploadPart(
                        mpuBase: mpuBase,
                        key: mpu.key,
                        uploadId: mpu.uploadId,
                        partNumber: partNumber,
                        partData: Data(partData),
                        clientToken: clientToken,
                        storeId: storeId
                    )

                    let completed = partsCompleted.increment()
                    // Progress: 0.1 (start) to 0.8 (all parts done)
                    let progress = 0.1 + 0.7 * (Double(completed) / Double(totalParts))
                    onProgress?(progress)

                    return (partNumber, etag)
                }
                partsQueued += 1
            }

            // Collect remaining results
            for try await result in group {
                results.append(result)
            }

            return results
        }

        // 3. Complete multipart upload
        let sortedParts = partResults.sorted { $0.0 < $1.0 }
        let completionBody = sortedParts.map { ["partNumber": $0.0, "etag": $0.1] as [String: Any] }

        guard let completeURL = URL(string: mpuBase) else {
            throw UploaderError.invalidURL
        }

        var completeRequest = URLRequest(url: completeURL)
        completeRequest.httpMethod = "POST"
        completeRequest.httpBody = try JSONSerialization.data(withJSONObject: completionBody)

        for (key, value) in blobHeaders(clientToken: clientToken, storeId: storeId) {
            completeRequest.setValue(value, forHTTPHeaderField: key)
        }
        completeRequest.setValue("complete", forHTTPHeaderField: "x-mpu-action")
        completeRequest.setValue(mpu.uploadId, forHTTPHeaderField: "x-mpu-upload-id")
        completeRequest.setValue(mpu.key.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? mpu.key, forHTTPHeaderField: "x-mpu-key")
        completeRequest.setValue("public", forHTTPHeaderField: "x-vercel-blob-access")
        completeRequest.setValue("application/json", forHTTPHeaderField: "content-type")

        let (completeData, completeResponse) = try await URLSession.shared.data(for: completeRequest)

        guard let completeHTTP = completeResponse as? HTTPURLResponse,
              (200...299).contains(completeHTTP.statusCode) else {
            let code = (completeResponse as? HTTPURLResponse)?.statusCode ?? 0
            throw UploaderError.serverError(statusCode: code, body: String(data: completeData, encoding: .utf8))
        }

        let result = try JSONDecoder().decode(MPUCompleteResult.self, from: completeData)
        return result.url
    }

    private func uploadPart(
        mpuBase: String,
        key: String,
        uploadId: String,
        partNumber: Int,
        partData: Data,
        clientToken: String,
        storeId: String
    ) async throws -> String {
        let maxRetries = 3

        for attempt in 0..<maxRetries {
            if attempt > 0 {
                let delay = UInt64(pow(2.0, Double(attempt))) * 500_000_000
                try await Task.sleep(nanoseconds: delay)
            }

            guard let url = URL(string: mpuBase) else {
                throw UploaderError.invalidURL
            }

            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.httpBody = partData

            for (key, value) in blobHeaders(clientToken: clientToken, storeId: storeId) {
                request.setValue(value, forHTTPHeaderField: key)
            }
            request.setValue("upload", forHTTPHeaderField: "x-mpu-action")
            request.setValue(key.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? key, forHTTPHeaderField: "x-mpu-key")
            request.setValue(uploadId, forHTTPHeaderField: "x-mpu-upload-id")
            request.setValue(String(partNumber), forHTTPHeaderField: "x-mpu-part-number")
            request.setValue("public", forHTTPHeaderField: "x-vercel-blob-access")

            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse,
                  (200...299).contains(httpResponse.statusCode) else {
                if attempt == maxRetries - 1 {
                    let code = (response as? HTTPURLResponse)?.statusCode ?? 0
                    throw UploaderError.serverError(statusCode: code, body: String(data: data, encoding: .utf8))
                }
                continue
            }

            let result = try JSONDecoder().decode(MPUPartResult.self, from: data)
            return result.etag
        }

        throw UploaderError.unknownError
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

                // Step 1: Get upload token
                let start = try await startUpload(
                    recordedAt: recordedAt,
                    durationSeconds: durationSeconds
                )

                // Step 2: Upload file directly to Blob (multipart for large files)
                let blobUrl = try await uploadToBlob(
                    fileURL: fileURL,
                    pathname: start.pathname,
                    clientToken: start.clientToken,
                    onProgress: onProgress
                )

                onProgress?(0.85)

                // Step 3: Complete upload, trigger transcription
                let result = try await completeUpload(
                    meetingId: start.meetingId,
                    blobUrl: blobUrl
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

// MARK: - Thread-safe counter for progress tracking

private final class SendableCounter: @unchecked Sendable {
    private var value = 0
    private let lock = NSLock()

    func increment() -> Int {
        lock.lock()
        defer { lock.unlock() }
        value += 1
        return value
    }
}

enum UploaderError: LocalizedError {
    case invalidURL
    case invalidResponse
    case serverError(statusCode: Int, body: String?)
    case unknownError

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid server URL"
        case .invalidResponse: return "Invalid response from server"
        case .serverError(let code, let body):
            if let body = body, !body.isEmpty {
                return "Server error (HTTP \(code)): \(body.prefix(500))"
            }
            return "Server error (HTTP \(code))"
        case .unknownError: return "Unknown upload error"
        }
    }
}
