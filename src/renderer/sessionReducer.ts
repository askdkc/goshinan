import type { CoachingEvidence, CoachingExplanation } from "../domain/coaching";
import type { GameSnapshot, Point } from "../domain/game";
import type { MoveAssessment } from "../domain/assessment";
import {
  DEFAULT_SETTINGS,
  type AnalysisResult,
  type AppSettings,
  type EngineStatus,
} from "../shared/contracts";

export type SessionPhase =
  | "loading"
  | "ready"
  | "thinking"
  | "assessing"
  | "opponent"
  | "coaching"
  | "finished"
  | "error";

export interface CoachingState {
  played: Point | null;
  recommended: Point | null;
  assessment: MoveAssessment;
  explanation: CoachingExplanation;
  evidence: CoachingEvidence;
  hintLevel: number;
}

export interface SessionState {
  phase: SessionPhase;
  snapshot: GameSnapshot;
  settings: AppSettings;
  engine: EngineStatus;
  analysis: AnalysisResult | undefined;
  streak: number;
  coaching: CoachingState | undefined;
  notice: string | undefined;
}

export const newSnapshot = (): GameSnapshot => ({
  version: 1,
  size: 19,
  rules: "Japanese",
  komi: 6.5,
  moves: [],
});

export const initialSessionState: SessionState = {
  phase: "loading",
  snapshot: newSnapshot(),
  settings: DEFAULT_SETTINGS,
  engine: { state: "stopped" },
  analysis: undefined,
  streak: 0,
  coaching: undefined,
  notice: undefined,
};

export type SessionAction =
  | {
      type: "bootstrapped";
      snapshot: GameSnapshot;
      settings: AppSettings;
      engine: EngineStatus;
    }
  | { type: "engine"; engine: EngineStatus }
  | { type: "settings"; settings: AppSettings }
  | { type: "phase"; phase: SessionPhase; notice?: string }
  | { type: "analysis"; analysis: AnalysisResult }
  | { type: "commit"; snapshot: GameSnapshot; streak: number; notice?: string }
  | { type: "coach"; coaching: CoachingState }
  | { type: "hint" }
  | { type: "new_game" }
  | { type: "loaded"; snapshot: GameSnapshot }
  | { type: "error"; message: string };

export const sessionReducer = (
  state: SessionState,
  action: SessionAction,
): SessionState => {
  switch (action.type) {
    case "bootstrapped":
      return {
        ...state,
        phase: action.snapshot.resignedBy === undefined ? "ready" : "finished",
        snapshot: action.snapshot,
        settings: action.settings,
        engine: action.engine,
      };
    case "engine":
      return { ...state, engine: action.engine };
    case "settings":
      return { ...state, settings: action.settings };
    case "phase":
      return {
        ...state,
        phase: action.phase,
        ...(action.notice === undefined
          ? { notice: undefined }
          : { notice: action.notice }),
      };
    case "analysis":
      return {
        ...state,
        analysis: action.analysis,
        phase: "ready",
        notice: undefined,
      };
    case "commit":
      return {
        ...state,
        snapshot: action.snapshot,
        streak: action.streak,
        phase: action.snapshot.resignedBy === undefined ? "ready" : "finished",
        analysis: undefined,
        coaching: undefined,
        notice: action.notice,
      };
    case "coach":
      return {
        ...state,
        phase: "coaching",
        coaching: action.coaching,
        streak: 3,
        notice: undefined,
      };
    case "hint":
      return state.coaching === undefined
        ? state
        : {
            ...state,
            coaching: {
              ...state.coaching,
              hintLevel: Math.min(4, state.coaching.hintLevel + 1),
            },
          };
    case "new_game":
      return {
        ...state,
        phase: "ready",
        snapshot: newSnapshot(),
        analysis: undefined,
        streak: 0,
        coaching: undefined,
      };
    case "loaded":
      return {
        ...state,
        snapshot: action.snapshot,
        phase: action.snapshot.resignedBy === undefined ? "ready" : "finished",
        analysis: undefined,
        streak: 0,
        coaching: undefined,
        notice: undefined,
      };
    case "error":
      return { ...state, phase: "error", notice: action.message };
  }
};
