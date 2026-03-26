import AVFoundation
import CoreMedia
import ScreenCaptureKit

@MainActor
final class AudioRecorder {
    private var stream: SCStream?
    private var delegate: AudioStreamDelegate?
    private var durationTimer: Timer?
    private var startTime: Date?
    var onDurationUpdate: ((TimeInterval) -> Void)?

    func startRecording() async throws {
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
        guard let display = content.displays.first else {
            throw RecorderError.noDisplay
        }

        let filter = SCContentFilter(display: display, excludingWindows: [])

        let config = SCStreamConfiguration()
        config.capturesAudio = true
        config.excludesCurrentProcessAudio = true
        config.sampleRate = 48000
        config.channelCount = 2

        // Minimal video config (SCStream requires a display)
        config.width = 2
        config.height = 2
        config.minimumFrameInterval = CMTime(value: 1, timescale: 1)

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("meeting_\(Int(Date().timeIntervalSince1970)).m4a")

        let audioSettings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: 48000,
            AVNumberOfChannelsKey: 2,
            AVEncoderBitRateKey: 128000,
        ]

        let streamDelegate = AudioStreamDelegate(outputURL: outputURL, audioSettings: audioSettings)
        self.delegate = streamDelegate

        let stream = SCStream(filter: filter, configuration: config, delegate: nil)
        try stream.addStreamOutput(streamDelegate, type: .audio, sampleHandlerQueue: .global(qos: .userInitiated))
        try await stream.startCapture()
        self.stream = stream

        let capturedStart = Date()
        startTime = capturedStart
        let capturedCallback = onDurationUpdate
        durationTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
            let duration = Date().timeIntervalSince(capturedStart)
            capturedCallback?(duration)
        }
    }

    func stopRecording() async throws -> URL {
        durationTimer?.invalidate()
        durationTimer = nil

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

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .audio else { return }
        guard sampleBuffer.isValid else { return }

        guard let pcmBuffer = sampleBuffer.asPCMBuffer() else { return }

        lock.lock()
        defer { lock.unlock() }

        if !started {
            do {
                audioFile = try AVAudioFile(
                    forWriting: outputURL,
                    settings: audioSettings,
                    commonFormat: pcmBuffer.format.commonFormat,
                    interleaved: pcmBuffer.format.isInterleaved
                )
                started = true
            } catch {
                print("AudioRecorder: Failed to create audio file: \(error)")
                return
            }
        }

        do {
            try audioFile?.write(from: pcmBuffer)
        } catch {
            print("AudioRecorder: Failed to write audio buffer: \(error)")
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
