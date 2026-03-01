const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  // Settings
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (settings) => ipcRenderer.invoke("save-settings", settings),

  // Meeting detection
  getDetectedMeetings: () => ipcRenderer.invoke("get-detected-meetings"),
  rescanMeetings: () => ipcRenderer.invoke("rescan-meetings"),

  // Recording (audio capture happens in the renderer via MediaRecorder)
  getSources: () => ipcRenderer.invoke("get-sources"),
  saveRecording: (data) => ipcRenderer.invoke("save-recording", data),
  saveTranscript: (data) => ipcRenderer.invoke("save-transcript", data),

  // Recording management
  listRecordings: () => ipcRenderer.invoke("list-recordings"),
  getTranscript: (recordingId) => ipcRenderer.invoke("get-transcript", recordingId),
  exportRecording: (recordingId) => ipcRenderer.invoke("export-recording", recordingId),
  deleteRecording: (recordingId) => ipcRenderer.invoke("delete-recording", recordingId),
  openRecordingsFolder: () => ipcRenderer.invoke("open-recordings-folder"),

  // Permissions
  getMicPermission: () => ipcRenderer.invoke("get-mic-permission"),

  // Events from main process
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
  onAppReady: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on("app-ready", handler);
    return () => ipcRenderer.removeListener("app-ready", handler);
  },
  onAutoRecordTriggered: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on("auto-record-triggered", handler);
    return () => ipcRenderer.removeListener("auto-record-triggered", handler);
  },
});
