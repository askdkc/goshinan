import { describe, expect, it } from "vitest";
import { GameRuleError, GoGame, type Point } from "../src/domain/game";
import {
  gtpToPoint,
  pointToGtp,
  pointToSgf,
  sgfToPoint,
} from "../src/domain/coordinates";

const playSequence = (points: Point[]): GoGame => {
  const game = new GoGame();
  for (const point of points) game.play(point);
  return game;
};

describe("GoGame", () => {
  it("captures surrounded stones and tracks prisoners", () => {
    const game = playSequence([
      [1, 0],
      [1, 1],
      [0, 1],
      [10, 10],
      [2, 1],
      [10, 11],
      [1, 2],
    ]);
    expect(game.stoneAt([1, 1])).toBeNull();
    expect(game.captures.B).toBe(1);
    expect(game.moves.at(-1)?.captured).toBe(1);
  });

  it("prevents suicide", () => {
    const game = playSequence([
      [1, 0],
      [10, 10],
      [0, 1],
      [10, 11],
      [2, 1],
      [10, 12],
      [1, 2],
    ]);
    expect(() => game.play([1, 1])).toThrowError(GameRuleError);
    expect(game.isLegal([1, 1])).toBe(false);
  });

  it("enforces simple ko", () => {
    const game = playSequence([
      [1, 2],
      [2, 2],
      [3, 2],
      [1, 1],
      [2, 3],
      [3, 1],
      [10, 10],
      [2, 0],
      [2, 1],
    ]);
    expect(game.stoneAt([2, 2])).toBeNull();
    expect(() => game.play([2, 2])).toThrowError(/ko/i);
  });

  it("ends after two passes and can undo immutably", () => {
    const game = new GoGame();
    game.play([3, 3]);
    game.play(null);
    game.play(null);
    expect(game.isFinished).toBe(true);
    expect(game.isLegal([4, 4])).toBe(false);
    const previous = game.undo(2);
    expect(previous.isFinished).toBe(false);
    expect(previous.moves).toHaveLength(1);
    expect(game.moves).toHaveLength(3);
  });

  it("round-trips GTP and SGF coordinates including pass", () => {
    expect(pointToGtp([8, 0])).toBe("J19");
    expect(gtpToPoint("T1")).toEqual([18, 18]);
    expect(pointToGtp(null)).toBe("pass");
    expect(gtpToPoint("PASS")).toBeNull();
    expect(pointToSgf([3, 15])).toBe("dp");
    expect(sgfToPoint("dp")).toEqual([3, 15]);
    expect(sgfToPoint("")).toBeNull();
  });
});
