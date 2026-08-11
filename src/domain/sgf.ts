import * as sabakiSgf from "@sabaki/sgf";
import { GoGame, type GameSnapshot, type MoveRecord } from "./game";
import { pointToSgf, sgfToPoint } from "./coordinates";

const APP_NAME = "Go Shinan";
const APP_VERSION = "0.1.0";

const appendNode = (
  parent: sabakiSgf.SgfNode,
  move: MoveRecord,
): sabakiSgf.SgfNode => {
  const child: sabakiSgf.SgfNode = {
    data: {
      [move.color]: [pointToSgf(move.point)],
      ...(move.note === undefined ? {} : { C: [move.note] }),
    },
    children: [],
  };
  parent.children.push(child);
  return child;
};

export const serializeSgf = (snapshot: GameSnapshot): string => {
  const result =
    snapshot.resignedBy === undefined
      ? undefined
      : `${snapshot.resignedBy === "B" ? "W" : "B"}+R`;
  const root: sabakiSgf.SgfNode = {
    data: {
      GM: ["1"],
      FF: ["4"],
      CA: ["UTF-8"],
      AP: [`${APP_NAME}:${APP_VERSION}`],
      SZ: ["19"],
      RU: ["Japanese"],
      KM: [String(snapshot.komi)],
      ...(result === undefined ? {} : { RE: [result] }),
    },
    children: [],
  };

  let cursor = root;
  for (const move of snapshot.moves) cursor = appendNode(cursor, move);
  return sabakiSgf.stringify([root], { linebreak: "\n" });
};

const first = (
  data: Record<string, string[]>,
  key: string,
): string | undefined => data[key]?.[0];

export const parseSgf = (contents: string): GameSnapshot => {
  const roots = sabakiSgf.parse(contents);
  const root = roots[0];
  if (root === undefined) throw new Error("SGF contains no game tree");
  if ((first(root.data, "GM") ?? "1") !== "1")
    throw new Error("SGF is not a Go game");
  if ((first(root.data, "SZ") ?? "19") !== "19")
    throw new Error("Only 19x19 SGF files are supported");

  const rules = first(root.data, "RU")?.toLowerCase();
  if (rules !== undefined && !rules.includes("japanese")) {
    throw new Error(
      `Only Japanese rules are supported; SGF declares ${first(root.data, "RU")}`,
    );
  }

  const komi = Number(first(root.data, "KM") ?? "6.5");
  if (!Number.isFinite(komi)) throw new Error("SGF komi is invalid");
  if (
    root.data.AB !== undefined ||
    root.data.AW !== undefined ||
    first(root.data, "HA") !== undefined
  ) {
    throw new Error(
      "Handicap and setup-stone SGFs are not supported in this release",
    );
  }

  const moves: MoveRecord[] = [];
  let cursor: sabakiSgf.SgfNode | undefined = root;
  while (cursor !== undefined) {
    const black = first(cursor.data, "B");
    const white = first(cursor.data, "W");
    if (black !== undefined || white !== undefined) {
      const color = black !== undefined ? "B" : "W";
      const coordinate = black ?? white ?? "";
      moves.push({
        color,
        point: sgfToPoint(coordinate),
        captured: 0,
        ...(first(cursor.data, "C") === undefined
          ? {}
          : { note: first(cursor.data, "C")! }),
      });
    }
    cursor = cursor.children[0];
  }

  const result = first(root.data, "RE");
  const resignedBy = result?.endsWith("+R")
    ? result.startsWith("B+")
      ? "W"
      : "B"
    : undefined;
  return new GoGame(komi, moves, resignedBy).toSnapshot();
};
