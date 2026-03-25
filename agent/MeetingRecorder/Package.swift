// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "MeetingRecorder",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "MeetingRecorder",
            path: "MeetingRecorder",
            exclude: ["Info.plist", "MeetingRecorder.entitlements"]
        ),
        .testTarget(
            name: "MeetingRecorderTests",
            dependencies: ["MeetingRecorder"],
            path: "MeetingRecorderTests"
        ),
    ]
)
