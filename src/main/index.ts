import path from "node:path";
import { app, BrowserWindow, session } from "electron";
import squirrelStartup from "electron-squirrel-startup";
import { IPC } from "../shared/contracts";
import { EngineManager } from "./engine/EngineManager";
import { registerIpcHandlers } from "./ipc";
import { PersistenceStore } from "./persistence";

if (squirrelStartup) app.quit();

let mainWindow: BrowserWindow | null = null;
let engine: EngineManager | undefined;

const resourceRoot = (): string => {
  if (app.isPackaged) return path.join(process.resourcesPath, "katago");
  const appPath = app.getAppPath();
  const projectRoot = appPath.includes(`${path.sep}.webpack${path.sep}`)
    ? path.resolve(appPath, "..", "..")
    : appPath;
  return path.join(projectRoot, "resources", "katago");
};

const createWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: 1260,
    height: 860,
    minWidth: 820,
    minHeight: 620,
    show: false,
    backgroundColor: "#101512",
    title: "Go Shinan",
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
    },
  });

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (url !== MAIN_WINDOW_WEBPACK_ENTRY) event.preventDefault();
  });
  window.once("ready-to-show", () => window.show());
  void window.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });
  return window;
};

void app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  mainWindow = createWindow();
  const store = new PersistenceStore(app.getPath("userData"));
  engine = new EngineManager(resourceRoot());
  registerIpcHandlers(() => mainWindow, engine, store);
  engine.on("status", (status) => {
    if (mainWindow !== null && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC.engineStatusChanged, status);
    }
  });
  void engine.start();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
});

app.on("before-quit", () => {
  void engine?.stop();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
