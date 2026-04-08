import AVFoundation
import CoreMedia
import ScreenCaptureKit

@MainActor
final class AudioRecorder {
    private var stream: SCStream?
    private var delegate: AudioStreamDelegate?
    private var micEngine: AVAudioEngine?
    private var durationTimer: Timer?
    private var startTime: Date?
    var onDurationUpdate: ((TimeInterval) -> Void)?
    var onStreamError: ((Error) -> Void)?

    func startRecording() async throws {
        // --- System audio via ScreenCaptureKit ---
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
        guard let display = content.displays.first else {
            throw RecorderError.noDisplay
        }

        let filter = SCContentFilter(display: display, excludingWindows: [])

        let config = SCStreamConfiguration()
        config.capturesAudio = true
        config.excludesCurrentProcessAudio = true
        config.sampleRate = 48000
        config.channelCount = 1 // mono for easier mixing
        config.width = 2
        config.height = 2
        config.minimumFrameInterval = CMTime(value: 1, timescale: 1)

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("meeting_\(Int(Date().timeIntervalSince1970)).m4a")

        let audioSettings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: 48000,
            AVNumberOfChannelsKey: 1,
            AVEncoderBitRateKey: 128000,
        ]

        let streamDelegate = AudioStreamDelegate(outputURL: outputURL, audioSettings: audioSettings)
        self.delegate = streamDelegate

        let capturedOnError = onStreamError
        streamDelegate.onStreamError = { error in
            capturedOnError?(error)
        }

        let stream = SCStream(filter: filter, configuration: config, delegate: streamDelegate)
        try stream.addStreamOutput(streamDelegate, type: .audio, sampleHandlerQueue: .global(qos: .userInitiated))
        try await stream.startCapture()
        self.stream = stream

        // --- Microphone via AVAudioEngine ---
        try startMicCapture(delegate: streamDelegate)

        // --- Duration timer ---
        let capturedStart = Date()
        startTime = capturedStart
        let capturedCallback = onDurationUpdate
        durationTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
            let duration = Date().timeIntervalSince(capturedStart)
            capturedCallback?(duration)
        }
    }

    private func startMicCapture(delegate: AudioStreamDelegate) throws {
        let engine = AVAudioEngine()
        let inputNode = engine.inputNode
        let inputFormat = inputNode.outputFormat(forBus: 0)

        // Convert mic audio to match our target format (48kHz mono float32)
        let targetFormat = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 1)!

        let converter = AVAudioConverter(from: inputFormat, to: targetFormat)

        inputNode.installTap(onBus: 0, bufferSize: 4096, format: inputFormat) { [weak delegate] buffer, _ in
            guard let delegate = delegate else { return }

            if let converter = converter {
                let frameCapacity = AVAudioFrameCount(
                    Double(buffer.frameLength) * (48000.0 / inputFormat.sampleRate)
                )
                guard let convertedBuffer = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: frameCapacity) else { return }

                var error: NSError?
                let status = converter.convert(to: convertedBuffer, error: &error) { _, outStatus in
                    outStatus.pointee = .haveData
                    return buffer
                }

                if status == .haveData {
                    delegate.writeMicBuffer(convertedBuffer)
                }
            } else {
                // Formats match, write directly
                delegate.writeMicBuffer(buffer)
            }
        }

        try engine.start()
        self.micEngine = engine
    }

    func stopRecording() async throws -> URL {
        durationTimer?.invalidate()
        durationTimer = nil

        // Stop mic
        micEngine?.inputNode.removeTap(onBus: 0)
        micEngine?.stop()
        micEngine = nil

        // Stop system audio (may already be stopped if permission was revoked)
        if let stream {
            do {
                try await stream.stopCapture()
            } catch {
                print("AudioRecorder: stream.stopCapture failed (likely already stopped): \(error)")
            }
            self.stream = nil
        }

        guard let delegate else {
            throw RecorderError.noRecording
        }

        delegate.finish()
        let url = delegate.outputURL
        self.delegate = nil
        return url
    }
}

enum RecorderError: LocalizedError {
    case noDisplay
    case noRecording
    case audioFileCreationFailed

    var errorDescription: String? {
        switch self {
        case .noDisplay: return "No display found for screen capture"
        case .noRecording: return "No active recording to stop"
        case .audioFileCreationFailed: return "Failed to create audio file"
        }
    }
}

/// Handles writing system audio and microphone audio to separate files,
/// then merging them into a single output file when recording stops.
final class AudioStreamDelegate: NSObject, SCStreamOutput, SCStreamDelegate, @unchecked Sendable {
    let outputURL: URL
    private let audioSettings: [String: Any]

    private let systemLock = NSLock()
    private let micLock = NSLock()
    private var systemFile: AVAudioFile?
    private var micFile: AVAudioFile?
    private var systemStarted = false
    private var micStarted = false

    private let systemURL: URL
    private let micURL: URL

    /// Called on main thread when the stream dies unexpectedly
    var onStreamError: ((Error) -> Void)?
    private(set) var streamFailed = false

    init(outputURL: URL, audioSettings: [String: Any]) {
        self.outputURL = outputURL
        self.audioSettings = audioSettings
        let base = outputURL.deletingLastPathComponent()
        let ts = Int(Date().timeIntervalSince1970)
        self.systemURL = base.appendingPathComponent("system_\(ts).caf")
        self.micURL = base.appendingPathComponent("mic_\(ts).caf")
        super.init()
    }

    // MARK: - SCStreamDelegate (error handling)

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        print("AudioRecorder: stream stopped with error: \(error)")
        streamFailed = true
        onStreamError?(error)
    }

    // MARK: - System audio from ScreenCaptureKit

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .audio else { return }
        guard sampleBuffer.isValid else { return }
        guard let pcmBuffer = sampleBuffer.asPCMBuffer() else { return }

        systemLock.lock()
        defer { systemLock.unlock() }

        if !systemStarted {
            do {
                systemFile = try AVAudioFile(
                    forWriting: systemURL,
                    settings: [AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: 48000, AVNumberOfChannelsKey: 1, AVLinearPCMBitDepthKey: 32, AVLinearPCMIsFloatKey: true],
                    commonFormat: pcmBuffer.format.commonFormat,
                    interleaved: pcmBuffer.format.isInterleaved
                )
                systemStarted = true
                print("AudioRecorder: system audio file created, format: \(pcmBuffer.format)")
            } catch {
                print("AudioRecorder: Failed to create system audio file: \(error)")
                return
            }
        }

        do {
            try systemFile?.write(from: pcmBuffer)
        } catch {
            print("AudioRecorder: system write error: \(error)")
        }
    }

    // MARK: - Microphone audio from AVAudioEngine

    func writeMicBuffer(_ buffer: AVAudioPCMBuffer) {
        micLock.lock()
        defer { micLock.unlock() }

        if !micStarted {
            do {
                micFile = try AVAudioFile(
                    forWriting: micURL,
                    settings: [AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: 48000, AVNumberOfChannelsKey: 1, AVLinearPCMBitDepthKey: 32, AVLinearPCMIsFloatKey: true],
                    commonFormat: buffer.format.commonFormat,
                    interleaved: buffer.format.isInterleaved
                )
                micStarted = true
                print("AudioRecorder: mic audio file created, format: \(buffer.format)")
            } catch {
                print("AudioRecorder: Failed to create mic audio file: \(error)")
                return
            }
        }

        do {
            try micFile?.write(from: buffer)
        } catch {
            print("AudioRecorder: mic write error: \(error)")
        }
    }

    // MARK: - Merge and finish

    func finish() {
        systemLock.lock()
        systemFile = nil
        systemLock.unlock()

        micLock.lock()
        micFile = nil
        micLock.unlock()

        mergeToOutput()

        // Clean up temp files
        try? FileManager.default.removeItem(at: systemURL)
        try? FileManager.default.removeItem(at: micURL)
    }

    private func mergeToOutput() {
        let targetFormat = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 1)!
        let bufferSize: AVAudioFrameCount = 4096

        // Open whichever source files exist
        let systemReader = try? AVAudioFile(forReading: systemURL)
        let micReader = try? AVAudioFile(forReading: micURL)

        if systemReader == nil && micReader == nil {
            print("AudioRecorder: no audio files to merge")
            return
        }

        // If only one source, just encode it to the output
        if systemReader == nil || micReader == nil {
            let source = systemReader ?? micReader!
            encodeToOutput(source: source, targetFormat: targetFormat, bufferSize: bufferSize)
            return
        }

        // Both sources exist — mix them
        guard let outputFile = try? AVAudioFile(
            forWriting: outputURL,
            settings: audioSettings,
            commonFormat: .pcmFormatFloat32,
            interleaved: false
        ) else {
            print("AudioRecorder: failed to create output file for merge")
            return
        }

        // Create converters if needed
        let systemConverter = (systemReader!.processingFormat != targetFormat)
            ? AVAudioConverter(from: systemReader!.processingFormat, to: targetFormat) : nil
        let micConverter = (micReader!.processingFormat != targetFormat)
            ? AVAudioConverter(from: micReader!.processingFormat, to: targetFormat) : nil

        let systemBuf = AVAudioPCMBuffer(pcmFormat: systemReader!.processingFormat, frameCapacity: bufferSize)!
        let micBuf = AVAudioPCMBuffer(pcmFormat: micReader!.processingFormat, frameCapacity: bufferSize)!
        let systemConverted = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: bufferSize)!
        let micConverted = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: bufferSize)!
        let mixBuf = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: bufferSize)!

        let systemTotal = systemReader!.length
        let micTotal = micReader!.length
        let maxFrames = max(systemTotal, micTotal)
        var framesProcessed: AVAudioFramePosition = 0

        while framesProcessed < maxFrames {
            let framesToRead = min(AVAudioFramePosition(bufferSize), maxFrames - framesProcessed)

            // Read and convert system audio
            var systemFrames: AVAudioFrameCount = 0
            var systemSamples: UnsafeMutablePointer<Float>?
            if framesProcessed < systemTotal, let reader = systemReader {
                do {
                    try reader.read(into: systemBuf, frameCount: AVAudioFrameCount(framesToRead))
                    if let conv = systemConverter {
                        systemConverted.frameLength = 0
                        var convError: NSError?
                        conv.convert(to: systemConverted, error: &convError) { _, outStatus in
                            outStatus.pointee = .haveData
                            return systemBuf
                        }
                        if let ch = systemConverted.floatChannelData { systemSamples = ch[0] }
                        systemFrames = systemConverted.frameLength
                    } else {
                        if let ch = systemBuf.floatChannelData { systemSamples = ch[0] }
                        systemFrames = systemBuf.frameLength
                    }
                } catch {}
            }

            // Read and convert mic audio
            var micFrames: AVAudioFrameCount = 0
            var micSamples: UnsafeMutablePointer<Float>?
            if framesProcessed < micTotal, let reader = micReader {
                do {
                    try reader.read(into: micBuf, frameCount: AVAudioFrameCount(framesToRead))
                    if let conv = micConverter {
                        micConverted.frameLength = 0
                        var convError: NSError?
                        conv.convert(to: micConverted, error: &convError) { _, outStatus in
                            outStatus.pointee = .haveData
                            return micBuf
                        }
                        if let ch = micConverted.floatChannelData { micSamples = ch[0] }
                        micFrames = micConverted.frameLength
                    } else {
                        if let ch = micBuf.floatChannelData { micSamples = ch[0] }
                        micFrames = micBuf.frameLength
                    }
                } catch {}
            }

            // Mix: add both sources into mixBuf
            let outFrames = max(systemFrames, micFrames)
            guard outFrames > 0, let mixChannels = mixBuf.floatChannelData else { break }
            let mixChannel = mixChannels[0]
            mixBuf.frameLength = outFrames

            for i in 0..<Int(outFrames) {
                let s: Float = (i < Int(systemFrames) && systemSamples != nil) ? systemSamples![i] : 0
                let m: Float = (i < Int(micFrames) && micSamples != nil) ? micSamples![i] : 0
                mixChannel[i] = s + m
            }

            do {
                try outputFile.write(from: mixBuf)
            } catch {
                print("AudioRecorder: merge write error: \(error)")
                break
            }

            framesProcessed += AVAudioFramePosition(outFrames)
        }

        print("AudioRecorder: merged \(systemTotal) system + \(micTotal) mic frames → \(outputURL.lastPathComponent)")
    }

    private func encodeToOutput(source: AVAudioFile, targetFormat: AVAudioFormat, bufferSize: AVAudioFrameCount) {
        guard let outputFile = try? AVAudioFile(
            forWriting: outputURL,
            settings: audioSettings,
            commonFormat: .pcmFormatFloat32,
            interleaved: false
        ) else { return }

        let converter = (source.processingFormat != targetFormat)
            ? AVAudioConverter(from: source.processingFormat, to: targetFormat) : nil
        let readBuf = AVAudioPCMBuffer(pcmFormat: source.processingFormat, frameCapacity: bufferSize)!
        let convBuf = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: bufferSize)!

        while source.framePosition < source.length {
            do {
                try source.read(into: readBuf)
                if let conv = converter {
                    convBuf.frameLength = 0
                    var convError: NSError?
                    conv.convert(to: convBuf, error: &convError) { _, outStatus in
                        outStatus.pointee = .haveData
                        return readBuf
                    }
                    try outputFile.write(from: convBuf)
                } else {
                    try outputFile.write(from: readBuf)
                }
            } catch {
                break
            }
        }
    }
}

extension CMSampleBuffer {
    func asPCMBuffer() -> AVAudioPCMBuffer? {
        guard let formatDescription = formatDescription else { return nil }
        guard let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(formatDescription) else { return nil }
        guard let format = AVAudioFormat(streamDescription: asbd) else { return nil }

        let frameCount = CMSampleBufferGetNumSamples(self)
        guard frameCount > 0 else { return nil }

        guard let pcmBuffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frameCount)) else {
            return nil
        }
        pcmBuffer.frameLength = AVAudioFrameCount(frameCount)

        guard let blockBuffer = CMSampleBufferGetDataBuffer(self) else { return nil }

        var lengthAtOffset: Int = 0
        var totalLength: Int = 0
        var dataPointer: UnsafeMutablePointer<Int8>?

        let status = CMBlockBufferGetDataPointer(blockBuffer, atOffset: 0, lengthAtOffsetOut: &lengthAtOffset, totalLengthOut: &totalLength, dataPointerOut: &dataPointer)
        guard status == kCMBlockBufferNoErr, let dataPointer else { return nil }

        if let floatChannelData = pcmBuffer.floatChannelData {
            let bytesPerFrame = Int(format.streamDescription.pointee.mBytesPerFrame)
            let channelCount = Int(format.channelCount)
            if format.isInterleaved || channelCount == 1 {
                memcpy(floatChannelData[0], dataPointer, min(totalLength, frameCount * bytesPerFrame))
            } else {
                let framesBytes = frameCount * Int(MemoryLayout<Float>.size)
                for ch in 0..<channelCount {
                    memcpy(floatChannelData[ch], dataPointer.advanced(by: ch * framesBytes), framesBytes)
                }
            }
        } else if let int16ChannelData = pcmBuffer.int16ChannelData {
            let bytesPerFrame = Int(format.streamDescription.pointee.mBytesPerFrame)
            memcpy(int16ChannelData[0], dataPointer, min(totalLength, frameCount * bytesPerFrame))
        }

        return pcmBuffer
    }
}
