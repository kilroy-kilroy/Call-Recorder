# Call Recorder

A desktop application for recording meetings on Zoom, Google Meet, Microsoft Teams, and more — powered by [Recall.ai](https://www.recall.ai/).

## Features

- **One-click recording** — paste a meeting link and hit Record
- **Multi-platform support** — Zoom, Google Meet, Microsoft Teams, Webex, Slack Huddles
- **Live status tracking** — see when the bot joins, starts recording, and finishes
- **Download recordings** — save MP4 recordings directly to your computer
- **Transcript support** — recordings include meeting transcripts

## Getting Started

### Prerequisites

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

### Configure

On first launch, go to the **Settings** tab and enter your Recall.ai API key and select your region.

## How It Works

1. Paste a meeting URL (e.g. `https://meet.google.com/abc-defg-hij`)
2. Click **Record** — a bot joins the meeting and records
3. When the meeting ends, the recording appears in the **Recordings** tab
4. Click **Download** to save the MP4 to your computer

## Tech Stack

- **Electron** — cross-platform desktop app
- **Recall.ai API** — meeting bot infrastructure for recording
- **Vanilla JS** — lightweight renderer with no framework dependencies

## Project Structure

```
src/
  main.js        — Electron main process
  preload.js     — IPC bridge (context isolation)
  recall-api.js  — Recall.ai API client
  index.html     — UI (HTML/CSS/JS)
```

## Building

```bash
npm run build          # build for current platform
npm run build:mac      # macOS
npm run build:win      # Windows
npm run build:linux    # Linux
```
