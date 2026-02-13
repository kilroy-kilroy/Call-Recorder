const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const https = require("https");
const RecallAPI = require("./recall-api");

// Suppress EPIPE errors on stdout/stderr (can occur when the launching
// terminal or parent process closes the pipe while the app is still running).
process.stdout?.on("error", (err) => {
  if (err.code !== "EPIPE") throw err;
});
process.stderr?.on("error", (err) => {
  if (err.code !== "EPIPE") throw err;
});

let RecallAiSdk;
try {
  RecallAiSdk = require("@recallai/desktop-sdk");
} catch {
  // SDK may not be available on all platforms (e.g. Linux dev)
  RecallAiSdk = null;
}

const SETTINGS_PATH = path.join(app.getPath("userData"), "settings.json");
const RECORDINGS_PATH = path.join(app.getPath("userData"), "recordings.json");

let mainWindow;
let recallApi;
let sdkInitialized = false;
let activeRecordings = new Map(); // windowId -> { uploadId, uploadToken }
let liveTranscripts = new Map(); // uploadId -> [{ speaker, text }]

// --- Settings ---

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
    }
  } catch {
    // ignore
  }
  return {
    apiKey: "db35f9b6084afe226422fe51d30b1137d815b194",
    region: "us-west-2",
    autoRecord: false,
  };
}

function saveSettings(settings) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

// --- Local recording history ---

function loadRecordingHistory() {
  try {
    if (fs.existsSync(RECORDINGS_PATH)) {
      return JSON.parse(fs.readFileSync(RECORDINGS_PATH, "utf-8"));
    }
  } catch {
    // ignore
  }
  return [];
}

function saveRecordingHistory(recordings) {
  fs.writeFileSync(RECORDINGS_PATH, JSON.stringify(recordings, null, 2));
}

function addRecordingToHistory(entry) {
  const recordings = loadRecordingHistory();
  recordings.unshift(entry);
  // Keep last 100
  if (recordings.length > 100) recordings.length = 100;
  saveRecordingHistory(recordings);
}

// --- API ---

function getApi() {
  const settings = loadSettings();
  if (!settings.apiKey) {
    throw new Error(
      "API key not configured. Go to Settings to add your Recall.ai API key."
    );
  }
  if (
    !recallApi ||
    recallApi.apiKey !== settings.apiKey ||
    recallApi.baseHost !== `${settings.region}.recall.ai`
  ) {
    recallApi = new RecallAPI(settings.apiKey, settings.region);
  }
  return recallApi;
}

// --- Desktop SDK ---

function initSdk() {
  if (!RecallAiSdk || sdkInitialized) return;

  const settings = loadSettings();
  const apiUrl = `https://${settings.region}.recall.ai`;

  try {
    RecallAiSdk.init({ apiUrl });
    sdkInitialized = true;
    setupSdkEventListeners();
  } catch (err) {
    sendToRenderer("sdk-error", {
      message: `SDK init failed: ${err.message}`,
    });
  }
}

function setupSdkEventListeners() {
  if (!RecallAiSdk) return;

  RecallAiSdk.addEventListener("meeting-detected", (evt) => {
    sendToRenderer("meeting-detected", {
      windowId: evt.window.id,
      platform: evt.window.platform || "unknown",
      title: evt.window.title || "",
      meetingUrl: evt.window.meetingUrl || "",
    });

    // Auto-record if enabled
    const settings = loadSettings();
    if (settings.autoRecord) {
      handleStartRecording(evt.window.id);
    }
  });

  RecallAiSdk.addEventListener("meeting-updated", (evt) => {
    sendToRenderer("meeting-updated", {
      windowId: evt.window.id,
      platform: evt.window.platform || "unknown",
      title: evt.window.title || "",
      meetingUrl: evt.window.meetingUrl || "",
    });
  });

  RecallAiSdk.addEventListener("sdk-state-change", (evt) => {
    sendToRenderer("sdk-state-change", evt);
  });

  RecallAiSdk.addEventListener("recording-ended", (evt) => {
    const windowId = evt.window?.id;
    const recording = activeRecordings.get(windowId);

    sendToRenderer("recording-ended", {
      windowId,
      uploadId: recording?.uploadId || null,
    });

    if (recording) {
      addRecordingToHistory({
        uploadId: recording.uploadId,
        platform: evt.window?.platform || "unknown",
        title: evt.window?.title || "",
        endedAt: new Date().toISOString(),
      });

      // Save live transcript to disk
      const segments = liveTranscripts.get(recording.uploadId);
      if (segments && segments.length > 0) {
        const transcriptPath = path.join(
          app.getPath("userData"),
          `transcript-${recording.uploadId}.json`
        );
        try {
          fs.writeFileSync(transcriptPath, JSON.stringify(segments, null, 2));
        } catch {
          // ignore write errors
        }
      }
      liveTranscripts.delete(recording.uploadId);

      activeRecordings.delete(windowId);
    }
  });

  RecallAiSdk.addEventListener("realtime-event", (evt) => {
    sendToRenderer("realtime-event", evt);

    // Persist transcript segments locally during recording
    if (evt && evt.event === "transcript.data") {
      const words =
        evt.data?.data?.words?.map((w) => w.text?.trim()).filter(Boolean) || [];
      if (words.length > 0) {
        const speaker =
          evt.data?.data?.participant?.name?.trim() || "Speaker";
        // Find the uploadId for the current recording
        for (const [, rec] of activeRecordings) {
          if (!liveTranscripts.has(rec.uploadId)) {
            liveTranscripts.set(rec.uploadId, []);
          }
          liveTranscripts.get(rec.uploadId).push({
            speaker,
            text: words.join(" "),
          });
        }
      }
    }
  });
}

function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

async function handleStartRecording(windowId) {
  const api = getApi();
  const settings = loadSettings();

  // Create SDK upload with transcript config
  const recordingConfig = {
    transcript: {
      provider: {
        meeting_captions: {},
      },
    },
    realtime_endpoints: [
      {
        type: "desktop_sdk_callback",
        events: [
          "transcript.data",
          "transcript.partial_data",
          "participant_events.join",
          "participant_events.speech_on",
          "participant_events.speech_off",
        ],
      },
    ],
  };

  const upload = await api.createSdkUpload(recordingConfig);

  activeRecordings.set(windowId, {
    uploadId: upload.id,
    uploadToken: upload.upload_token,
    startedAt: new Date().toISOString(),
  });

  await RecallAiSdk.startRecording({
    windowId,
    uploadToken: upload.upload_token,
  });

  sendToRenderer("recording-started", {
    windowId,
    uploadId: upload.id,
  });
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
    initSdk();
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
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
  saveSettings(settings);
  recallApi = null;
  // Re-initialize SDK with new region if needed
  if (RecallAiSdk && sdkInitialized) {
    sdkInitialized = false;
    initSdk();
  }
  return { success: true };
});

ipcMain.handle("request-permissions", async () => {
  if (!RecallAiSdk) {
    return { error: "Desktop SDK not available on this platform" };
  }
  try {
    RecallAiSdk.requestPermission("accessibility");
    RecallAiSdk.requestPermission("microphone");
    RecallAiSdk.requestPermission("screen-capture");
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("start-recording", async (_event, windowId) => {
  if (!RecallAiSdk) {
    throw new Error("Desktop SDK not available on this platform");
  }
  await handleStartRecording(windowId);
  return { success: true };
});

ipcMain.handle("stop-recording", async () => {
  if (!RecallAiSdk) {
    throw new Error("Desktop SDK not available on this platform");
  }
  try {
    await RecallAiSdk.stopRecording();
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("list-recordings", async () => {
  const history = loadRecordingHistory();
  const api = getApi();

  // Enrich with download URLs from the API
  const enriched = [];
  for (const entry of history.slice(0, 20)) {
    try {
      const upload = await api.getSdkUpload(entry.uploadId);
      enriched.push({
        ...entry,
        status: upload.status?.code || "unknown",
        recordingId: upload.recording_id || null,
      });
    } catch {
      enriched.push({ ...entry, status: "unknown", recordingId: null });
    }
  }
  return enriched;
});

ipcMain.handle("download-recording", async (_event, recordingId, name) => {
  const api = getApi();
  const recording = await api.getRecording(recordingId);

  const videoUrl =
    recording.media_shortcuts?.video_mixed?.data?.download_url || null;
  if (!videoUrl) {
    throw new Error("No video recording available yet");
  }

  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `${name || "recording"}.mp4`,
    filters: [{ name: "Video", extensions: ["mp4"] }],
  });

  if (!filePath) return { cancelled: true };

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filePath);
    const fetch = (url) => {
      https
        .get(url, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            fetch(res.headers.location);
            return;
          }
          res.pipe(file);
          file.on("finish", () => {
            file.close();
            shell.showItemInFolder(filePath);
            resolve({ success: true, path: filePath });
          });
        })
        .on("error", reject);
    };
    fetch(videoUrl);
  });
});

ipcMain.handle("get-transcript", async (_event, uploadId, recordingId) => {
  // 1. Try local cached transcript first (captured during live recording)
  const transcriptPath = path.join(
    app.getPath("userData"),
    `transcript-${uploadId}.json`
  );
  try {
    if (fs.existsSync(transcriptPath)) {
      const segments = JSON.parse(fs.readFileSync(transcriptPath, "utf-8"));
      return { source: "local", segments };
    }
  } catch {
    // fall through to API
  }

  // 2. Fetch from Recall.ai API
  if (!recordingId) {
    throw new Error("Recording is still processing — transcript not available yet");
  }
  const api = getApi();
  const transcript = await api.getTranscript(recordingId);

  // Normalize API response to the same format as local transcripts
  const segments = Array.isArray(transcript)
    ? transcript.map((seg) => ({
        speaker: seg.speaker || seg.participant?.name || "Speaker",
        text: Array.isArray(seg.words)
          ? seg.words.map((w) => w.text || w).join(" ")
          : seg.text || "",
      }))
    : [];

  return { source: "api", segments };
});
