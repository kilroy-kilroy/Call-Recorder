const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  // Settings
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (settings) => ipcRenderer.invoke("save-settings", settings),

  // SDK controls
  requestPermissions: () => ipcRenderer.invoke("request-permissions"),
  getPermissionStatus: () => ipcRenderer.invoke("get-permission-status"),
  rescanMeetings: () => ipcRenderer.invoke("rescan-meetings"),
  startRecording: (windowId) => ipcRenderer.invoke("start-recording", windowId),
  stopRecording: (windowId) => ipcRenderer.invoke("stop-recording", windowId),

  // Recordings
  listRecordings: () => ipcRenderer.invoke("list-recordings"),
  downloadRecording: (url, name) =>
    ipcRenderer.invoke("download-recording", url, name),
  getTranscript: (uploadId, recordingId) =>
    ipcRenderer.invoke("get-transcript", uploadId, recordingId),

  // Events from main process → renderer
  onMeetingDetected: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on("meeting-detected", handler);
    return () => ipcRenderer.removeListener("meeting-detected", handler);
  },
  onMeetingUpdated: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on("meeting-updated", handler);
    return () => ipcRenderer.removeListener("meeting-updated", handler);
  },
  onMeetingClosed: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on("meeting-closed", handler);
    return () => ipcRenderer.removeListener("meeting-closed", handler);
  },
  onRecordingStarted: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on("recording-started", handler);
    return () => ipcRenderer.removeListener("recording-started", handler);
  },
  onRecordingEnded: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on("recording-ended", handler);
    return () => ipcRenderer.removeListener("recording-ended", handler);
  },
  onRealtimeEvent: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on("realtime-event", handler);
    return () => ipcRenderer.removeListener("realtime-event", handler);
  },
  onSdkStateChange: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on("sdk-state-change", handler);
    return () => ipcRenderer.removeListener("sdk-state-change", handler);
  },
  onError: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on("sdk-error", handler);
    return () => ipcRenderer.removeListener("sdk-error", handler);
  },
  onPermissionStatus: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on("permission-status", handler);
    return () => ipcRenderer.removeListener("permission-status", handler);
  },
  onPermissionsGranted: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on("permissions-granted", handler);
    return () => ipcRenderer.removeListener("permissions-granted", handler);
  },
  onSdkInitialized: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on("sdk-initialized", handler);
    return () => ipcRenderer.removeListener("sdk-initialized", handler);
  },
});
