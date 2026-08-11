import type { GameSnapshot, Point } from "../domain/game";

export type Language = "en" | "ja";
export type Difficulty = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type EngineState =
  "missing" | "starting" | "ready" | "busy" | "error" | "stopped";

export interface AppSettings {
  difficulty: Difficulty;
  language: Language;
  showCandidates: boolean;
  showOwnership: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  difficulty: 3,
  language: "en",
  showCandidates: false,
  showOwnership: false,
};

export interface EngineStatus {
  state: EngineState;
  message?: string;
  version?: string;
  normalModel?: string;
  humanModel?: string;
}

export interface KataGoMoveInfo {
  move: string;
  visits: number;
  scoreLead: number;
  winrate: number;
  prior?: number;
  order?: number;
  pv?: string[];
}

export interface KataGoRootInfo {
  visits: number;
  scoreLead: number;
  winrate: number;
}

export interface AnalysisResult {
  id: string;
  turnNumber: number;
  isDuringSearch: boolean;
  rootInfo: KataGoRootInfo;
  moveInfos: KataGoMoveInfo[];
  ownership?: number[];
  policy?: number[];
  humanPolicy?: number[];
}

export interface AnalyzeRequest {
  snapshot: GameSnapshot;
  maxVisits?: number;
  includeOwnership?: boolean;
  includePolicy?: boolean;
  humanProfile?: `rank_${Difficulty}d`;
  allowMoves?: Point[];
  priority?: number;
}

export interface MoveValidationRequest {
  snapshot: GameSnapshot;
  point: Point | null;
  note?: string;
}

export interface MoveValidationResult {
  legal: boolean;
  snapshot?: GameSnapshot;
  error?: string;
}

export interface FileResult {
  canceled: boolean;
  path?: string;
  contents?: string;
}

export interface DesktopApi {
  getSettings(): Promise<AppSettings>;
  updateSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
  getEngineStatus(): Promise<EngineStatus>;
  analyze(request: AnalyzeRequest): Promise<AnalysisResult>;
  cancelAnalysis(): Promise<void>;
  validateMove(request: MoveValidationRequest): Promise<MoveValidationResult>;
  saveSgf(contents: string): Promise<FileResult>;
  loadSgf(): Promise<FileResult>;
  saveSession(snapshot: GameSnapshot): Promise<void>;
  loadSession(): Promise<GameSnapshot | null>;
  onEngineStatus(listener: (status: EngineStatus) => void): () => void;
}

export const IPC = {
  settingsGet: "settings:get",
  settingsUpdate: "settings:update",
  engineStatus: "engine:status",
  engineStatusChanged: "engine:status-changed",
  engineAnalyze: "engine:analyze",
  engineCancel: "engine:cancel",
  gameValidateMove: "game:validate-move",
  sgfSave: "sgf:save",
  sgfLoad: "sgf:load",
  sessionSave: "session:save",
  sessionLoad: "session:load",
} as const;
