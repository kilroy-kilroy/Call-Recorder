# Call Recorder

A desktop application that records your Zoom, Google Meet, and Microsoft Teams calls locally using the [Recall.ai Desktop Recording SDK](https://docs.recall.ai/docs/desktop-sdk) — no bot joins your meeting.

## Features

- **Automatic meeting detection** — the SDK detects when you join Zoom, Meet, or Teams
- **One-click recording** — click Record on any detected meeting, or enable auto-record
- **Live transcription** — real-time speaker-attributed transcript streamed during the call
- **Local recording** — audio/video captured from your desktop, uploaded to Recall.ai for processing
- **Download recordings** — save completed MP4 recordings to your computer
- **No meeting bots** — records directly from your machine, invisible to other participants

## How It Works

1. Launch the app — the SDK begins listening for meeting windows
2. Join a Zoom, Google Meet, or Microsoft Teams call
3. The app detects the meeting and shows it in the **Live** tab
4. Click **Record** (or enable auto-record in Settings)
5. The SDK captures audio/video locally and uploads to Recall.ai
6. Live transcript appears in real-time during the call
7. When the call ends, the recording is available in the **Recordings** tab

## Getting Started

### Prerequisites

- macOS (Apple Silicon) or Windows
- [Node.js](https://nodejs.org/) 18+
- A [Recall.ai](https://www.recall.ai/) API key

### Install

```bash
npm install
```

### Run

```bash
npm start
```

### Permissions (macOS)

On first launch, grant these system permissions when prompted:
- **Accessibility** — required for meeting detection
- **Microphone** — required for audio recording
- **Screen Capture** — required for video recording

You can trigger the permission prompts from **Settings > Grant System Permissions**.

## Tech Stack

- **Electron** — cross-platform desktop app
- **@recallai/desktop-sdk** — Recall.ai Desktop Recording SDK for local recording
- **Recall.ai REST API** — SDK upload management and recording retrieval
- **Vanilla JS** — lightweight renderer with no framework dependencies

## Project Structure

```
src/
  main.js        — Electron main process, SDK initialization, IPC handlers
  preload.js     — Secure IPC bridge (context isolation)
  recall-api.js  — Recall.ai REST API client (sdk_upload, recordings)
  index.html     — UI with Live, Recordings, and Settings tabs
```

## Building

```bash
npm run build          # build for current platform
npm run build:mac      # macOS
npm run build:win      # Windows
npm run build:linux    # Linux
```
