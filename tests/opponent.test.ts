import { describe, expect, it } from "vitest";
import { pointToGtp } from "../src/domain/coordinates";
import { sampleHumanMove, SeededRandom } from "../src/domain/opponent";
import type { AnalysisResult } from "../src/shared/contracts";

const analysis = (): AnalysisResult => {
  const humanPolicy = Array<number>(362).fill(-1);
  humanPolicy[3 + 3 * 19] = 0.25;
  humanPolicy[15 + 15 * 19] = 0.75;
  humanPolicy[361] = 100;
  return {
    id: "policy",
    turnNumber: 0,
    isDuringSearch: false,
    rootInfo: { visits: 80, scoreLead: 0, winrate: 0.5 },
    moveInfos: [
      { move: "D16", visits: 80, scoreLead: 1, winrate: 0.52, order: 0 },
    ],
    humanPolicy,
  };
};

describe("Human SL policy sampling", () => {
  it("is deterministic with a seed and excludes unsupported noisy pass", () => {
    const first = sampleHumanMove(analysis(), () => true, new SeededRandom(42));
    const second = sampleHumanMove(
      analysis(),
      () => true,
      new SeededRandom(42),
    );
    expect(first).toEqual(second);
    expect(first).not.toBeNull();
  });

  it("filters locally illegal moves", () => {
    const selected = sampleHumanMove(
      analysis(),
      (point) => point !== null && pointToGtp(point) === "D16",
      new SeededRandom(99),
    );
    expect(pointToGtp(selected)).toBe("D16");
  });
});
