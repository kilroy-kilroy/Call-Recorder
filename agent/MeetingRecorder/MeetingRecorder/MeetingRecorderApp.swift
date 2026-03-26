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
