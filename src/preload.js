const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  createBot: (meetingUrl, botName) =>
    ipcRenderer.invoke("create-bot", meetingUrl, botName),
  getBot: (botId) => ipcRenderer.invoke("get-bot", botId),
  listBots: () => ipcRenderer.invoke("list-bots"),
  deleteBot: (botId) => ipcRenderer.invoke("delete-bot", botId),
  leaveMeeting: (botId) => ipcRenderer.invoke("leave-meeting", botId),
  downloadRecording: (url, botId) =>
    ipcRenderer.invoke("download-recording", url, botId),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (settings) => ipcRenderer.invoke("save-settings", settings),
});
