import GoBoard, { type Sign } from "@sabaki/go-board";

export const BOARD_SIZE = 19;
export type PlayerColor = "B" | "W";
export type Point = [number, number];
export type GameRuleErrorCode =
  | "finished"
  | "out_of_bounds"
  | "occupied"
  | "suicide"
  | "ko"
  | "turn_order"
  | "invalid_snapshot";

export interface MoveRecord {
  color: PlayerColor;
  point: Point | null;
  captured: number;
  note?: string;
}

export interface GameSnapshot {
  version: 1;
  size: 19;
  rules: "Japanese";
  komi: number;
  moves: MoveRecord[];
  resignedBy?: PlayerColor;
}

export class GameRuleError extends Error {
  constructor(
    readonly code: GameRuleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GameRuleError";
  }
}

const signFor = (color: PlayerColor): Sign => (color === "B" ? 1 : -1);

export const opposite = (color: PlayerColor): PlayerColor =>
  color === "B" ? "W" : "B";

const clonePoint = (point: Point | null): Point | null =>
  point === null ? null : [point[0], point[1]];

export class GoGame {
  private board: GoBoard;
  private readonly history: MoveRecord[];
  private resignation: PlayerColor | undefined;

  constructor(
    readonly komi = 6.5,
    moves: MoveRecord[] = [],
    resignedBy?: PlayerColor,
  ) {
    this.board = GoBoard.fromDimensions(BOARD_SIZE);
    this.history = [];

    for (const move of moves) {
      if (this.isFinished) {
        throw new GameRuleError(
          "invalid_snapshot",
          "Snapshot contains moves after game completion",
        );
      }
      if (move.color !== this.currentPlayer) {
        throw new GameRuleError(
          "turn_order",
          `Expected ${this.currentPlayer}, received ${move.color}`,
        );
      }
      this.applyMove(move.point, move.note);
    }

    this.resignation = resignedBy;
  }

  static fromSnapshot(snapshot: GameSnapshot): GoGame {
    if (
      typeof snapshot !== "object" ||
      snapshot === null ||
      snapshot.version !== 1 ||
      snapshot.size !== BOARD_SIZE ||
      snapshot.rules !== "Japanese" ||
      !Number.isFinite(snapshot.komi) ||
      !Array.isArray(snapshot.moves)
    ) {
      throw new GameRuleError(
        "invalid_snapshot",
        "Unsupported or malformed game snapshot",
      );
    }

    for (const move of snapshot.moves) {
      if (
        typeof move !== "object" ||
        move === null ||
        (move.color !== "B" && move.color !== "W") ||
        (move.point !== null &&
          (!Array.isArray(move.point) ||
            move.point.length !== 2 ||
            !move.point.every(
              (coordinate) =>
                Number.isInteger(coordinate) &&
                coordinate >= 0 &&
                coordinate < BOARD_SIZE,
            ))) ||
        !Number.isInteger(move.captured) ||
        move.captured < 0 ||
        (move.note !== undefined && typeof move.note !== "string")
      ) {
        throw new GameRuleError(
          "invalid_snapshot",
          "Snapshot contains an invalid move",
        );
      }
    }
    if (
      snapshot.resignedBy !== undefined &&
      snapshot.resignedBy !== "B" &&
      snapshot.resignedBy !== "W"
    ) {
      throw new GameRuleError(
        "invalid_snapshot",
        "Snapshot contains an invalid resignation",
      );
    }

    return new GoGame(snapshot.komi, snapshot.moves, snapshot.resignedBy);
  }

  get currentPlayer(): PlayerColor {
    return this.history.length % 2 === 0 ? "B" : "W";
  }

  get moves(): readonly MoveRecord[] {
    return this.history;
  }

  get isFinished(): boolean {
    const length = this.history.length;
    return (
      this.resignation !== undefined ||
      (length >= 2 &&
        this.history[length - 1]?.point === null &&
        this.history[length - 2]?.point === null)
    );
  }

  get resignedBy(): PlayerColor | undefined {
    return this.resignation;
  }

  get captures(): Readonly<Record<PlayerColor, number>> {
    return {
      B: this.board.getCaptures(1) ?? 0,
      W: this.board.getCaptures(-1) ?? 0,
    };
  }

  stoneAt(point: Point): PlayerColor | null {
    const sign = this.board.get(point);
    return sign === 1 ? "B" : sign === -1 ? "W" : null;
  }

  stones(): Array<{ point: Point; color: PlayerColor }> {
    const result: Array<{ point: Point; color: PlayerColor }> = [];
    for (let y = 0; y < BOARD_SIZE; y += 1) {
      for (let x = 0; x < BOARD_SIZE; x += 1) {
        const color = this.stoneAt([x, y]);
        if (color !== null) result.push({ point: [x, y], color });
      }
    }
    return result;
  }

  libertiesAt(point: Point): Point[] {
    return this.board.getLiberties(point).map(([x, y]) => [x, y]);
  }

  isLegal(point: Point | null): boolean {
    if (this.isFinished) return false;
    if (point === null) return true;
    if (!this.board.has(point)) return false;
    const analysis = this.board.analyzeMove(signFor(this.currentPlayer), point);
    return !analysis.overwrite && !analysis.suicide && !analysis.ko;
  }

  play(point: Point | null, note?: string): MoveRecord {
    if (this.isFinished)
      throw new GameRuleError("finished", "The game is already complete");
    return this.applyMove(point, note);
  }

  private applyMove(point: Point | null, note?: string): MoveRecord {
    const color = this.currentPlayer;
    const sign = signFor(color);
    const beforeCaptures = this.board.getCaptures(sign) ?? 0;

    if (point !== null) {
      if (!this.board.has(point))
        throw new GameRuleError("out_of_bounds", "Move is outside the board");
      const analysis = this.board.analyzeMove(sign, point);
      if (analysis.overwrite)
        throw new GameRuleError("occupied", "Intersection is occupied");
      if (analysis.suicide)
        throw new GameRuleError(
          "suicide",
          "Suicide is not legal under Japanese rules",
        );
      if (analysis.ko) throw new GameRuleError("ko", "Move violates simple ko");

      this.board = this.board.makeMove(sign, point, {
        preventOverwrite: true,
        preventSuicide: true,
        preventKo: true,
      });
    } else {
      this.board = this.board.makeMove(sign, [-1, -1]);
    }

    const move: MoveRecord = {
      color,
      point: clonePoint(point),
      captured: (this.board.getCaptures(sign) ?? 0) - beforeCaptures,
      ...(note === undefined ? {} : { note }),
    };
    this.history.push(move);
    return move;
  }

  resign(): void {
    if (this.isFinished)
      throw new GameRuleError("finished", "The game is already complete");
    this.resignation = this.currentPlayer;
  }

  undo(count = 1): GoGame {
    if (!Number.isInteger(count) || count < 1)
      return GoGame.fromSnapshot(this.toSnapshot());
    return new GoGame(
      this.komi,
      this.history.slice(0, Math.max(0, this.history.length - count)),
    );
  }

  toSnapshot(): GameSnapshot {
    return {
      version: 1,
      size: BOARD_SIZE,
      rules: "Japanese",
      komi: this.komi,
      moves: this.history.map((move) => ({
        ...move,
        point: clonePoint(move.point),
      })),
      ...(this.resignation === undefined
        ? {}
        : { resignedBy: this.resignation }),
    };
  }

  toSignMap(): Sign[][] {
    return this.board.signMap.map((row) => [...row]);
  }
}

export const assertPoint = (value: unknown): Point => {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !value.every(
      (coordinate) =>
        Number.isInteger(coordinate) &&
        coordinate >= 0 &&
        coordinate < BOARD_SIZE,
    )
  ) {
    throw new GameRuleError("out_of_bounds", "Invalid board point");
  }
  return [value[0] as number, value[1] as number];
};
