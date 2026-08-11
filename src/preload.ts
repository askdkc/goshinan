import { contextBridge, ipcRenderer } from "electron";
import type {
  AnalyzeRequest,
  AppSettings,
  DesktopApi,
  EngineStatus,
  MoveValidationRequest,
} from "./shared/contracts";
import { IPC } from "./shared/contracts";

const api: DesktopApi = {
  getSettings: () =>
    ipcRenderer.invoke(IPC.settingsGet) as Promise<AppSettings>,
  updateSettings: (patch) =>
    ipcRenderer.invoke(IPC.settingsUpdate, patch) as Promise<AppSettings>,
  getEngineStatus: () =>
    ipcRenderer.invoke(IPC.engineStatus) as Promise<EngineStatus>,
  analyze: (request: AnalyzeRequest) =>
    ipcRenderer.invoke(IPC.engineAnalyze, request),
  cancelAnalysis: () => ipcRenderer.invoke(IPC.engineCancel),
  validateMove: (request: MoveValidationRequest) =>
    ipcRenderer.invoke(IPC.gameValidateMove, request),
  saveSgf: (contents) => ipcRenderer.invoke(IPC.sgfSave, contents),
  loadSgf: () => ipcRenderer.invoke(IPC.sgfLoad),
  saveSession: (snapshot) => ipcRenderer.invoke(IPC.sessionSave, snapshot),
  loadSession: () => ipcRenderer.invoke(IPC.sessionLoad),
  onEngineStatus: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      status: EngineStatus,
    ): void => listener(status);
    ipcRenderer.on(IPC.engineStatusChanged, handler);
    return () => ipcRenderer.removeListener(IPC.engineStatusChanged, handler);
  },
};

contextBridge.exposeInMainWorld("goShinan", api);
