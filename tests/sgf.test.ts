import { describe, expect, it } from "vitest";
import { GoGame } from "../src/domain/game";
import { parseSgf, serializeSgf } from "../src/domain/sgf";

describe("SGF adapter", () => {
  it("round-trips moves, passes, notes, rules, komi, and resignation", () => {
    const game = new GoGame(6.5);
    game.play([3, 3], "Opening note");
    game.play(null);
    game.play([15, 15]);
    game.resign();
    const serialized = serializeSgf(game.toSnapshot());
    const restored = parseSgf(serialized);

    expect(serialized).toContain("RU[Japanese]");
    expect(serialized).toContain("KM[6.5]");
    expect(serialized).toContain("C[Opening note]");
    expect(
      restored.moves.map(({ color, point, note }) => ({ color, point, note })),
    ).toEqual(
      game.moves.map(({ color, point, note }) => ({ color, point, note })),
    );
    expect(restored.resignedBy).toBe("W");
  });

  it("rejects unsupported board sizes and setup stones", () => {
    expect(() => parseSgf("(;GM[1]SZ[13];B[aa])")).toThrow(/19x19/);
    expect(() => parseSgf("(;GM[1]SZ[19]HA[2]AB[dd][pp])")).toThrow(/Handicap/);
  });
});
