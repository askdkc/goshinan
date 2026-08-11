import type { Point } from "./game";

export type ExplanationCategory =
  | "self_atari"
  | "urgent_threat"
  | "endangered_group"
  | "ownership_swing"
  | "low_value"
  | "overconcentration"
  | "endgame_timing"
  | "generic";

export interface CoachingEvidence {
  played: Point | null;
  recommended: Point | null;
  scoreLoss: number;
  winrateLoss?: number;
  playedLiberties?: number;
  capturedStones?: number;
  koViolation?: boolean;
  urgentThreat?: boolean;
  endangeredGroup?: boolean;
  ownershipSwing?: number;
  affectedRegion?: Point[];
  lowPolicyArea?: boolean;
  nearbyFriendlyStones?: number;
  moveNumber?: number;
  principalVariation?: string[];
}

export interface CoachingExplanation {
  category: ExplanationCategory;
  messageKey: `coach.${ExplanationCategory}`;
  affectedRegion: Point[];
  reliable: boolean;
}

export const explainMistake = (
  evidence: CoachingEvidence,
): CoachingExplanation => {
  const region = evidence.affectedRegion ?? [];
  if (
    evidence.koViolation === true ||
    (evidence.playedLiberties !== undefined && evidence.playedLiberties <= 1) ||
    (evidence.capturedStones ?? 0) > 0
  ) {
    return {
      category: "self_atari",
      messageKey: "coach.self_atari",
      affectedRegion: region,
      reliable: true,
    };
  }
  if (evidence.urgentThreat === true) {
    return {
      category: "urgent_threat",
      messageKey: "coach.urgent_threat",
      affectedRegion: region,
      reliable: true,
    };
  }
  if (evidence.endangeredGroup === true) {
    return {
      category: "endangered_group",
      messageKey: "coach.endangered_group",
      affectedRegion: region,
      reliable: true,
    };
  }
  if ((evidence.ownershipSwing ?? 0) >= 0.18) {
    return {
      category: "ownership_swing",
      messageKey: "coach.ownership_swing",
      affectedRegion: region,
      reliable: true,
    };
  }
  if (evidence.lowPolicyArea === true) {
    return {
      category: "low_value",
      messageKey: "coach.low_value",
      affectedRegion: region,
      reliable: false,
    };
  }
  if ((evidence.nearbyFriendlyStones ?? 0) >= 4) {
    return {
      category: "overconcentration",
      messageKey: "coach.overconcentration",
      affectedRegion: region,
      reliable: false,
    };
  }
  if ((evidence.moveNumber ?? 0) >= 180) {
    return {
      category: "endgame_timing",
      messageKey: "coach.endgame_timing",
      affectedRegion: region,
      reliable: false,
    };
  }
  return {
    category: "generic",
    messageKey: "coach.generic",
    affectedRegion: region,
    reliable: true,
  };
};

export const MAX_HINT_LEVEL = 4;
export const nextHintLevel = (current: number): number =>
  Math.min(MAX_HINT_LEVEL, Math.max(1, current + 1));
