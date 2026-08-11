import { readFile, writeFile } from "node:fs/promises";
import {
  dialog,
  ipcMain,
  type BrowserWindow,
  type IpcMainInvokeEvent,
} from "electron";
import { assertPoint, GoGame, type GameSnapshot } from "../domain/game";
import type {
  AnalyzeRequest,
  AppSettings,
  MoveValidationRequest,
} from "../shared/contracts";
import { IPC } from "../shared/contracts";
import type { EngineManager } from "./engine/EngineManager";
import type { PersistenceStore } from "./persistence";

const MAX_SGF_BYTES = 10 * 1024 * 1024;

const guard =
  <T extends unknown[], R>(
    getWindow: () => BrowserWindow | null,
    handler: (event: IpcMainInvokeEvent, ...args: T) => R | Promise<R>,
  ): ((event: IpcMainInvokeEvent, ...args: T) => Promise<R>) =>
  async (event, ...args) => {
    const window = getWindow();
    const trusted =
      window !== null &&
      !window.isDestroyed() &&
      event.sender === window.webContents &&
      event.senderFrame === event.sender.mainFrame;
    if (!trusted)
      throw new Error("Rejected IPC call from an untrusted renderer");
    return handler(event, ...args);
  };

const validateSettingsPatch = (value: unknown): Partial<AppSettings> => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Invalid settings patch");
  const patch = value as Record<string, unknown>;
  const allowed = new Set([
    "difficulty",
    "language",
    "showCandidates",
    "showOwnership",
  ]);
  if (Object.keys(patch).some((key) => !allowed.has(key)))
    throw new Error("Unknown settings field");
  if (
    patch.difficulty !== undefined &&
    (!Number.isInteger(patch.difficulty) ||
      Number(patch.difficulty) < 1 ||
      Number(patch.difficulty) > 9)
  ) {
    throw new Error("Difficulty must be between 1 and 9");
  }
  if (
    patch.language !== undefined &&
    patch.language !== "en" &&
    patch.language !== "ja"
  ) {
    throw new Error("Unsupported language");
  }
  for (const key of ["showCandidates", "showOwnership"] as const) {
    if (patch[key] !== undefined && typeof patch[key] !== "boolean")
      throw new Error(`${key} must be boolean`);
  }
  return patch;
};

const validateAnalysisRequest = (value: unknown): AnalyzeRequest => {
  if (typeof value !== "object" || value === null)
    throw new Error("Invalid analysis request");
  const request = value as AnalyzeRequest;
  const snapshot = GoGame.fromSnapshot(request.snapshot).toSnapshot();
  if (
    request.maxVisits !== undefined &&
    (!Number.isInteger(request.maxVisits) ||
      request.maxVisits < 1 ||
      request.maxVisits > 10_000)
  ) {
    throw new Error("maxVisits must be between 1 and 10000");
  }
  if (
    request.priority !== undefined &&
    (!Number.isInteger(request.priority) ||
      Math.abs(request.priority) > 1_000_000)
  ) {
    throw new Error("Invalid analysis priority");
  }
  if (
    request.humanProfile !== undefined &&
    !/^rank_[1-9]d$/.test(request.humanProfile)
  ) {
    throw new Error("Invalid Human SL profile");
  }
  const allowMoves = request.allowMoves?.map(assertPoint);
  return {
    snapshot,
    ...(request.maxVisits === undefined
      ? {}
      : { maxVisits: request.maxVisits }),
    ...(request.includeOwnership === undefined
      ? {}
      : { includeOwnership: request.includeOwnership }),
    ...(request.includePolicy === undefined
      ? {}
      : { includePolicy: request.includePolicy }),
    ...(request.humanProfile === undefined
      ? {}
      : { humanProfile: request.humanProfile }),
    ...(allowMoves === undefined ? {} : { allowMoves }),
    ...(request.priority === undefined ? {} : { priority: request.priority }),
  };
};

export const registerIpcHandlers = (
  getWindow: () => BrowserWindow | null,
  engine: EngineManager,
  store: PersistenceStore,
): void => {
  const trusted = <T extends unknown[], R>(
    handler: (event: IpcMainInvokeEvent, ...args: T) => R | Promise<R>,
  ): ((event: IpcMainInvokeEvent, ...args: T) => Promise<R>) =>
    guard(getWindow, handler);

  ipcMain.handle(
    IPC.settingsGet,
    trusted(() => store.getSettings()),
  );
  ipcMain.handle(
    IPC.settingsUpdate,
    trusted((_event, patch: unknown) =>
      store.updateSettings(validateSettingsPatch(patch)),
    ),
  );
  ipcMain.handle(
    IPC.engineStatus,
    trusted(() => engine.status),
  );
  ipcMain.handle(
    IPC.engineAnalyze,
    trusted((_event, request: unknown) =>
      engine.analyze(validateAnalysisRequest(request)),
    ),
  );
  ipcMain.handle(
    IPC.engineCancel,
    trusted(() => engine.cancel()),
  );
  ipcMain.handle(
    IPC.gameValidateMove,
    trusted((_event, value: unknown) => {
      try {
        if (typeof value !== "object" || value === null)
          throw new Error("Invalid move request");
        const request = value as MoveValidationRequest;
        const game = GoGame.fromSnapshot(request.snapshot);
        const point =
          request.point === null ? null : assertPoint(request.point);
        if (
          request.note !== undefined &&
          (typeof request.note !== "string" || request.note.length > 2_000)
        ) {
          throw new Error("Move note is invalid or too long");
        }
        game.play(point, request.note);
        return { legal: true, snapshot: game.toSnapshot() };
      } catch (error) {
        return {
          legal: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );
  ipcMain.handle(
    IPC.sgfSave,
    trusted(async (_event, contents: unknown) => {
      if (
        typeof contents !== "string" ||
        Buffer.byteLength(contents, "utf8") > MAX_SGF_BYTES
      ) {
        throw new Error("SGF content is invalid or too large");
      }
      const window = getWindow();
      const options = {
        title: "SGFを保存",
        defaultPath: "対局.sgf",
        filters: [{ name: "SGF（囲碁棋譜）", extensions: ["sgf"] }],
      };
      const result =
        window === null
          ? await dialog.showSaveDialog(options)
          : await dialog.showSaveDialog(window, options);
      if (result.canceled || result.filePath === undefined)
        return { canceled: true };
      await writeFile(result.filePath, contents, "utf8");
      return { canceled: false, path: result.filePath };
    }),
  );
  ipcMain.handle(
    IPC.sgfLoad,
    trusted(async () => {
      const window = getWindow();
      const options: Electron.OpenDialogOptions = {
        title: "SGFを読み込む",
        properties: ["openFile"],
        filters: [{ name: "SGF（囲碁棋譜）", extensions: ["sgf"] }],
      };
      const result =
        window === null
          ? await dialog.showOpenDialog(options)
          : await dialog.showOpenDialog(window, options);
      const filePath = result.filePaths[0];
      if (result.canceled || filePath === undefined) return { canceled: true };
      const contents = await readFile(filePath, "utf8");
      if (Buffer.byteLength(contents, "utf8") > MAX_SGF_BYTES)
        throw new Error("SGF file is too large");
      return { canceled: false, path: filePath, contents };
    }),
  );
  ipcMain.handle(
    IPC.sessionSave,
    trusted((_event, snapshot: unknown) =>
      store.saveSession(snapshot as GameSnapshot),
    ),
  );
  ipcMain.handle(
    IPC.sessionLoad,
    trusted(() => store.loadSession()),
  );
};
