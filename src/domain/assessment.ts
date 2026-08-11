import type {
  AnalysisResult,
  Difficulty,
  KataGoMoveInfo,
} from "../shared/contracts";
import type { PlayerColor } from "./game";

export const SCORE_LOSS_THRESHOLDS: Readonly<Record<Difficulty, number>> = {
  1: 1.5,
  2: 1.35,
  3: 1.2,
  4: 1.05,
  5: 0.9,
  6: 0.8,
  7: 0.7,
  8: 0.6,
  9: 0.5,
};

export interface AssessmentOptions {
  minimumVisits?: number;
  uncertaintyPoints?: number;
  boundaryMargin?: number;
}

export type AssessmentReason =
  | "acceptable"
  | "score_loss"
  | "insufficient_visits"
  | "missing_move"
  | "unstable_boundary";

export interface MoveAssessment {
  acceptable: boolean;
  certain: boolean;
  scoreLoss: number;
  winrateLoss: number;
  threshold: number;
  reason: AssessmentReason;
  bestMove?: KataGoMoveInfo;
  playedMove?: KataGoMoveInfo;
  needsRefinement: boolean;
}

const valueFor = (color: PlayerColor, value: number): number =>
  color === "B" ? value : -value;

const bestFor = (
  color: PlayerColor,
  moves: KataGoMoveInfo[],
): KataGoMoveInfo | undefined =>
  [...moves].sort(
    (left, right) =>
      valueFor(color, right.scoreLead) - valueFor(color, left.scoreLead),
  )[0];

export const assessMove = (
  analysis: AnalysisResult,
  playedCoordinate: string,
  color: PlayerColor,
  difficulty: Difficulty,
  options: AssessmentOptions = {},
): MoveAssessment => {
  const minimumVisits = options.minimumVisits ?? 64;
  const uncertaintyPoints = options.uncertaintyPoints ?? 0.15;
  const boundaryMargin = options.boundaryMargin ?? 0.12;
  const threshold = SCORE_LOSS_THRESHOLDS[difficulty];
  const bestMove = bestFor(color, analysis.moveInfos);
  const playedMove = analysis.moveInfos.find(
    (move) => move.move.toLowerCase() === playedCoordinate.toLowerCase(),
  );

  if (bestMove === undefined || playedMove === undefined) {
    return {
      acceptable: true,
      certain: false,
      scoreLoss: 0,
      winrateLoss: 0,
      threshold,
      reason: "missing_move",
      ...(bestMove === undefined ? {} : { bestMove }),
      needsRefinement: true,
    };
  }

  const scoreLoss = Math.max(
    0,
    valueFor(color, bestMove.scoreLead) - valueFor(color, playedMove.scoreLead),
  );
  const winrateLoss = Math.max(
    0,
    valueFor(color, bestMove.winrate) - valueFor(color, playedMove.winrate),
  );
  const visitFloor = Math.min(bestMove.visits, playedMove.visits);
  const visitsReliable = visitFloor >= minimumVisits;
  const nearBoundary = Math.abs(scoreLoss - threshold) <= boundaryMargin;

  if (!visitsReliable) {
    return {
      acceptable: true,
      certain: false,
      scoreLoss,
      winrateLoss,
      threshold,
      reason: "insufficient_visits",
      bestMove,
      playedMove,
      needsRefinement: true,
    };
  }

  if (scoreLoss <= uncertaintyPoints) {
    return {
      acceptable: true,
      certain: true,
      scoreLoss,
      winrateLoss,
      threshold,
      reason: "acceptable",
      bestMove,
      playedMove,
      needsRefinement: false,
    };
  }

  if (nearBoundary) {
    return {
      acceptable: true,
      certain: false,
      scoreLoss,
      winrateLoss,
      threshold,
      reason: "unstable_boundary",
      bestMove,
      playedMove,
      needsRefinement: true,
    };
  }

  const acceptable = scoreLoss <= threshold;
  return {
    acceptable,
    certain: true,
    scoreLoss,
    winrateLoss,
    threshold,
    reason: acceptable ? "acceptable" : "score_loss",
    bestMove,
    playedMove,
    needsRefinement: false,
  };
};

export interface StreakTransition {
  nextStreak: number;
  coachingRequired: boolean;
  commitMove: boolean;
}

export const updateMistakeStreak = (
  current: number,
  assessment: MoveAssessment,
): StreakTransition => {
  if (!assessment.certain || assessment.acceptable) {
    return { nextStreak: 0, coachingRequired: false, commitMove: true };
  }
  const nextStreak = current + 1;
  return {
    nextStreak,
    coachingRequired: nextStreak >= 3,
    commitMove: nextStreak < 3,
  };
};
