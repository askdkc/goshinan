import { describe, expect, it } from "vitest";
import { explainMistake, nextHintLevel } from "../src/domain/coaching";

describe("coaching heuristics", () => {
  it("uses deterministic explanation priority", () => {
    expect(
      explainMistake({
        played: [3, 3],
        recommended: [4, 4],
        scoreLoss: 4,
        playedLiberties: 1,
        urgentThreat: true,
      }).category,
    ).toBe("self_atari");
    expect(
      explainMistake({
        played: [3, 3],
        recommended: [4, 4],
        scoreLoss: 4,
        urgentThreat: true,
      }).category,
    ).toBe("urgent_threat");
  });

  it("caps staged hints at four", () => {
    expect(nextHintLevel(1)).toBe(2);
    expect(nextHintLevel(4)).toBe(4);
    expect(nextHintLevel(99)).toBe(4);
  });
});
