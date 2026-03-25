import SwiftUI

struct MenuBarView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        VStack {
            Text("Meeting Recorder")
                .font(.headline)
            Divider()
            Text("Status: \(appState.state.rawValue)")
            Divider()
            Button("Quit") {
                NSApplication.shared.terminate(nil)
            }
            .keyboardShortcut("q")
        }
        .padding(8)
    }
}
