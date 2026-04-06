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

        let stream = SCStream(filter: filter, configuration: config, delegate: nil)
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

        // Stop system audio
        if let stream {
            try await stream.stopCapture()
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

/// Handles writing both system audio (from SCStream) and microphone audio (from AVAudioEngine)
/// to a single output file. Buffers from both sources are mixed by simple addition.
final class AudioStreamDelegate: NSObject, SCStreamOutput, @unchecked Sendable {
    let outputURL: URL
    private let audioSettings: [String: Any]
    private let lock = NSLock()
    private var audioFile: AVAudioFile?
    private var started = false

    init(outputURL: URL, audioSettings: [String: Any]) {
        self.outputURL = outputURL
        self.audioSettings = audioSettings
        super.init()
    }

    // MARK: - System audio from ScreenCaptureKit

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .audio else { return }
        guard sampleBuffer.isValid else { return }
        guard let pcmBuffer = sampleBuffer.asPCMBuffer() else { return }

        writeBuffer(pcmBuffer)
    }

    // MARK: - Microphone audio from AVAudioEngine

    func writeMicBuffer(_ buffer: AVAudioPCMBuffer) {
        writeBuffer(buffer)
    }

    // MARK: - Shared writer

    private func writeBuffer(_ buffer: AVAudioPCMBuffer) {
        lock.lock()
        defer { lock.unlock() }

        if !started {
            do {
                audioFile = try AVAudioFile(
                    forWriting: outputURL,
                    settings: audioSettings,
                    commonFormat: buffer.format.commonFormat,
                    interleaved: buffer.format.isInterleaved
                )
                started = true
            } catch {
                print("AudioRecorder: Failed to create audio file: \(error)")
                return
            }
        }

        do {
            try audioFile?.write(from: buffer)
        } catch {
            // Silently skip — format mismatch buffers will fail here
        }
    }

    func finish() {
        lock.lock()
        defer { lock.unlock() }
        audioFile = nil
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
