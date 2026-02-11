const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const https = require("https");
const RecallAPI = require("./recall-api");

const SETTINGS_PATH = path.join(app.getPath("userData"), "settings.json");

let mainWindow;
let recallApi;

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
    botName: "Call Recorder",
  };
}

function saveSettings(settings) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

function getApi() {
  const settings = loadSettings();
  if (!settings.apiKey) {
    throw new Error("API key not configured. Go to Settings to add your Recall.ai API key.");
  }
  if (!recallApi || recallApi.apiKey !== settings.apiKey || recallApi.baseHost !== `${settings.region}.recall.ai`) {
    recallApi = new RecallAPI(settings.apiKey, settings.region);
  }
  return recallApi;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 680,
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
  recallApi = null; // force re-init
  return { success: true };
});

ipcMain.handle("create-bot", async (_event, meetingUrl, botName) => {
  const api = getApi();
  const settings = loadSettings();
  return api.createBot(meetingUrl, botName || settings.botName);
});

ipcMain.handle("get-bot", async (_event, botId) => {
  const api = getApi();
  return api.getBot(botId);
});

ipcMain.handle("list-bots", async () => {
  const api = getApi();
  return api.listBots();
});

ipcMain.handle("delete-bot", async (_event, botId) => {
  const api = getApi();
  return api.deleteBot(botId);
});

ipcMain.handle("leave-meeting", async (_event, botId) => {
  const api = getApi();
  return api.leaveMeeting(botId);
});

ipcMain.handle("download-recording", async (_event, url, botId) => {
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `recording-${botId}.mp4`,
    filters: [{ name: "Video", extensions: ["mp4"] }],
  });

  if (!filePath) return { cancelled: true };

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filePath);
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        https.get(res.headers.location, (redirectRes) => {
          redirectRes.pipe(file);
          file.on("finish", () => {
            file.close();
            shell.showItemInFolder(filePath);
            resolve({ success: true, path: filePath });
          });
        }).on("error", reject);
        return;
      }
      res.pipe(file);
      file.on("finish", () => {
        file.close();
        shell.showItemInFolder(filePath);
        resolve({ success: true, path: filePath });
      });
    }).on("error", reject);
  });
});
