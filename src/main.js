const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  desktopCapturer,
  systemPreferences,
} = require("electron");
const path = require("path");
const fs = require("fs");

// Suppress EPIPE errors on stdout/stderr (can occur when the launching
// terminal or parent process closes the pipe while the app is still running).
process.stdout?.on("error", (err) => {
  if (err.code !== "EPIPE") throw err;
});
process.stderr?.on("error", (err) => {
  if (err.code !== "EPIPE") throw err;
});

// Try to load electron-audio-loopback for system audio capture.
let enableLoopback;
try {
  enableLoopback = require("electron-audio-loopback");
} catch {
  enableLoopback = null;
}

const USER_DATA_DIR = app.getPath("userData");
const SETTINGS_PATH = path.join(USER_DATA_DIR, "settings.json");
const RECORDINGS_DIR = path.join(USER_DATA_DIR, "recordings");

// Ensure directories exist.
fs.mkdirSync(USER_DATA_DIR, { recursive: true });
fs.mkdirSync(RECORDINGS_DIR, { recursive: true });

let mainWindow;
let meetingDetectionInterval = null;

// Meeting detection patterns — window titles that indicate a meeting is active.
const MEETING_PATTERNS = [
  {
    platform: "zoom",
    // Matches "Zoom Meeting" or "Zoom Webinar" in window title
    test: (title) => /zoom\s*(meeting|webinar)/i.test(title),
  },
  {
    platform: "google-meet",
    // Matches "Meet -" or "meet.google.com" in window title
    test: (title) =>
      /meet\s*[-–—]|meet\.google\.com/i.test(title),
  },
  {
    platform: "teams",
    // Matches "Microsoft Teams" meeting indicators
    test: (title) =>
      /microsoft teams/i.test(title) &&
      !/sign in/i.test(title),
  },
];

// --- Settings ---

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
    }
  } catch (err) {
    console.error("Failed to load settings:", err.message);
  }
  return {
    autoRecord: false,
    whisperModel: "base",
    recordingQuality: "standard",
  };
}

function saveSettings(settings) {
  const data = JSON.stringify(settings, null, 2);
  const tmpPath = SETTINGS_PATH + ".tmp";
  fs.writeFileSync(tmpPath, data);
  fs.renameSync(tmpPath, SETTINGS_PATH);
}

// --- Recording history (index of all recordings) ---

function getRecordingsIndex() {
  const indexPath = path.join(RECORDINGS_DIR, "index.json");
  try {
    if (fs.existsSync(indexPath)) {
      return JSON.parse(fs.readFileSync(indexPath, "utf-8"));
    }
  } catch {
    // ignore
  }
  return [];
}

function saveRecordingsIndex(recordings) {
  const indexPath = path.join(RECORDINGS_DIR, "index.json");
  const data = JSON.stringify(recordings, null, 2);
  const tmpPath = indexPath + ".tmp";
  fs.writeFileSync(tmpPath, data);
  fs.renameSync(tmpPath, indexPath);
}

function addRecording(entry) {
  const recordings = getRecordingsIndex();
  recordings.unshift(entry);
  if (recordings.length > 100) recordings.length = 100;
  saveRecordingsIndex(recordings);
  return entry;
}

// --- Meeting detection via desktopCapturer ---

let detectedMeetings = new Map(); // id -> { id, platform, title }

async function scanForMeetings() {
  try {
    const sources = await desktopCapturer.getSources({
      types: ["window"],
      thumbnailSize: { width: 0, height: 0 },
    });

    const currentIds = new Set();

    for (const source of sources) {
      const title = source.name || "";
      for (const pattern of MEETING_PATTERNS) {
        if (pattern.test(title)) {
          const id = source.id;
          currentIds.add(id);

          if (!detectedMeetings.has(id)) {
            const meeting = {
              id,
              platform: pattern.platform,
              title: title,
            };
            detectedMeetings.set(id, meeting);
            sendToRenderer("meeting-detected", meeting);

            // Auto-record if enabled
            const settings = loadSettings();
            if (settings.autoRecord) {
              sendToRenderer("auto-record-triggered", { meetingId: id });
            }
          } else {
            // Update title if it changed
            const existing = detectedMeetings.get(id);
            if (existing.title !== title) {
              existing.title = title;
              sendToRenderer("meeting-updated", existing);
            }
          }
          break;
        }
      }
    }

    // Detect closed meetings
    for (const [id] of detectedMeetings) {
      if (!currentIds.has(id)) {
        detectedMeetings.delete(id);
        sendToRenderer("meeting-closed", { id });
      }
    }
  } catch (err) {
    console.error("Meeting scan error:", err.message);
  }
}

function startMeetingDetection() {
  if (meetingDetectionInterval) return;
  // Scan immediately, then every 4 seconds
  scanForMeetings();
  meetingDetectionInterval = setInterval(scanForMeetings, 4000);
}

function stopMeetingDetection() {
  if (meetingDetectionInterval) {
    clearInterval(meetingDetectionInterval);
    meetingDetectionInterval = null;
  }
}

// --- Helpers ---

function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

function generateRecordingId() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    now.getFullYear() +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    "-" +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds())
  );
}

// --- Window ---

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 700,
    minHeight: 500,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0f0f13",
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));

  mainWindow.webContents.on("did-finish-load", () => {
    startMeetingDetection();
    sendToRenderer("app-ready", {});
  });
}

// Enable loopback audio if the package is available.
// Must be called before app.whenReady().
if (enableLoopback) {
  try {
    enableLoopback();
  } catch (err) {
    console.error("Failed to enable audio loopback:", err.message);
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  stopMeetingDetection();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// --- IPC Handlers ---

ipcMain.handle("get-settings", () => {
  return loadSettings();
});

ipcMain.handle("save-settings", (_event, settings) => {
  try {
    saveSettings(settings);
    return { success: true };
  } catch (err) {
    return { error: `Failed to save settings: ${err.message}` };
  }
});

ipcMain.handle("get-detected-meetings", () => {
  return [...detectedMeetings.values()];
});

ipcMain.handle("rescan-meetings", async () => {
  detectedMeetings.clear();
  await scanForMeetings();
  return { meetings: [...detectedMeetings.values()] };
});

// Get available audio/video sources for recording (used by the renderer
// to create MediaStream via getUserMedia with the desktopCapturer source).
ipcMain.handle("get-sources", async () => {
  const sources = await desktopCapturer.getSources({
    types: ["window", "screen"],
    thumbnailSize: { width: 0, height: 0 },
  });
  return sources.map((s) => ({ id: s.id, name: s.name }));
});

// Save a recording blob sent from the renderer process.
ipcMain.handle("save-recording", async (_event, { buffer, meeting, duration }) => {
  const recId = generateRecordingId();
  const safeTitle = (meeting.title || meeting.platform || "recording")
    .replace(/[^a-zA-Z0-9_\- ]/g, "")
    .substring(0, 60)
    .trim();
  const dirName = `${recId}_${safeTitle}`;
  const recDir = path.join(RECORDINGS_DIR, dirName);
  fs.mkdirSync(recDir, { recursive: true });

  const audioPath = path.join(recDir, "audio.webm");
  fs.writeFileSync(audioPath, Buffer.from(buffer));

  const entry = {
    id: recId,
    dirName,
    platform: meeting.platform || "unknown",
    title: meeting.title || "",
    recordedAt: new Date().toISOString(),
    duration: duration || 0,
    hasAudio: true,
    hasTranscript: false,
  };

  const metaPath = path.join(recDir, "metadata.json");
  fs.writeFileSync(metaPath, JSON.stringify(entry, null, 2));

  addRecording(entry);

  return { success: true, recording: entry };
});

// Save transcript for a recording.
ipcMain.handle("save-transcript", (_event, { recordingId, segments }) => {
  const recordings = getRecordingsIndex();
  const rec = recordings.find((r) => r.id === recordingId);
  if (!rec) return { error: "Recording not found" };

  const recDir = path.join(RECORDINGS_DIR, rec.dirName);
  const transcriptPath = path.join(recDir, "transcript.json");
  fs.writeFileSync(transcriptPath, JSON.stringify(segments, null, 2));

  rec.hasTranscript = true;
  saveRecordingsIndex(recordings);

  return { success: true };
});

ipcMain.handle("list-recordings", () => {
  return getRecordingsIndex();
});

ipcMain.handle("get-transcript", (_event, recordingId) => {
  const recordings = getRecordingsIndex();
  const rec = recordings.find((r) => r.id === recordingId);
  if (!rec) return { segments: [] };

  const transcriptPath = path.join(RECORDINGS_DIR, rec.dirName, "transcript.json");
  try {
    if (fs.existsSync(transcriptPath)) {
      const segments = JSON.parse(fs.readFileSync(transcriptPath, "utf-8"));
      return { segments };
    }
  } catch {
    // ignore
  }
  return { segments: [] };
});

ipcMain.handle("export-recording", async (_event, recordingId) => {
  const recordings = getRecordingsIndex();
  const rec = recordings.find((r) => r.id === recordingId);
  if (!rec) throw new Error("Recording not found");

  const audioPath = path.join(RECORDINGS_DIR, rec.dirName, "audio.webm");
  if (!fs.existsSync(audioPath)) throw new Error("Audio file not found");

  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `${rec.title || "recording"}.webm`,
    filters: [{ name: "Audio", extensions: ["webm"] }],
  });

  if (!filePath) return { cancelled: true };

  fs.copyFileSync(audioPath, filePath);
  shell.showItemInFolder(filePath);
  return { success: true, path: filePath };
});

ipcMain.handle("delete-recording", (_event, recordingId) => {
  const recordings = getRecordingsIndex();
  const idx = recordings.findIndex((r) => r.id === recordingId);
  if (idx === -1) return { error: "Recording not found" };

  const rec = recordings[idx];
  const recDir = path.join(RECORDINGS_DIR, rec.dirName);

  // Remove directory and contents
  try {
    fs.rmSync(recDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }

  recordings.splice(idx, 1);
  saveRecordingsIndex(recordings);

  return { success: true };
});

ipcMain.handle("open-recordings-folder", () => {
  shell.openPath(RECORDINGS_DIR);
  return { success: true };
});

ipcMain.handle("get-mic-permission", async () => {
  if (process.platform === "darwin") {
    const status = systemPreferences.getMediaAccessStatus("microphone");
    if (status !== "granted") {
      const granted = await systemPreferences.askForMediaAccess("microphone");
      return { granted };
    }
    return { granted: true };
  }
  // On Windows/Linux, microphone access is typically always available
  return { granted: true };
});
