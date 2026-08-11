import { describe, expect, it } from "vitest";
import { assessMove, updateMistakeStreak } from "../src/domain/assessment";
import type { AnalysisResult, KataGoMoveInfo } from "../src/shared/contracts";

const move = (
  coordinate: string,
  scoreLead: number,
  visits = 100,
  winrate = 0.5,
): KataGoMoveInfo => ({
  move: coordinate,
  scoreLead,
  visits,
  winrate,
});

const result = (...moveInfos: KataGoMoveInfo[]): AnalysisResult => ({
  id: "test",
  turnNumber: 0,
  isDuringSearch: false,
  rootInfo: { scoreLead: 0, visits: 500, winrate: 0.5 },
  moveInfos,
});

describe("move assessment", () => {
  it("applies stricter thresholds at higher ranks", () => {
    const analysis = result(move("D4", 2), move("Q16", 1));
    expect(assessMove(analysis, "Q16", "B", 1).acceptable).toBe(true);
    expect(assessMove(analysis, "Q16", "B", 9).acceptable).toBe(false);
  });

  it("normalizes score lead for White", () => {
    const analysis = result(move("D4", -3), move("Q16", -1));
    const assessment = assessMove(analysis, "Q16", "W", 5);
    expect(assessment.bestMove?.move).toBe("D4");
    expect(assessment.scoreLoss).toBe(2);
    expect(assessment.acceptable).toBe(false);
  });

  it("never rejects insufficiently searched moves", () => {
    const assessment = assessMove(
      result(move("D4", 4, 100), move("Q16", -4, 12)),
      "Q16",
      "B",
      9,
    );
    expect(assessment.acceptable).toBe(true);
    expect(assessment.certain).toBe(false);
    expect(assessment.needsRefinement).toBe(true);
  });

  it("rolls back only the third consecutive certain mistake", () => {
    const bad = assessMove(
      result(move("D4", 4), move("Q16", 0)),
      "Q16",
      "B",
      3,
    );
    const first = updateMistakeStreak(0, bad);
    const second = updateMistakeStreak(first.nextStreak, bad);
    const third = updateMistakeStreak(second.nextStreak, bad);
    expect(first).toEqual({
      nextStreak: 1,
      coachingRequired: false,
      commitMove: true,
    });
    expect(second).toEqual({
      nextStreak: 2,
      coachingRequired: false,
      commitMove: true,
    });
    expect(third).toEqual({
      nextStreak: 3,
      coachingRequired: true,
      commitMove: false,
    });
  });
});
