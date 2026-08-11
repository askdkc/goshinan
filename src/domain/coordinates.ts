import { BOARD_SIZE, type Point } from "./game";

const GTP_COLUMNS = "ABCDEFGHJKLMNOPQRST";

export const pointToGtp = (point: Point | null): string => {
  if (point === null) return "pass";
  const [x, y] = point;
  if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE)
    throw new Error("Point is outside 19x19 board");
  return `${GTP_COLUMNS[x]}${BOARD_SIZE - y}`;
};

export const gtpToPoint = (coordinate: string): Point | null => {
  if (coordinate.toLowerCase() === "pass") return null;
  const match = /^([A-HJ-T])(1[0-9]|[1-9])$/i.exec(coordinate.trim());
  if (match === null) throw new Error(`Invalid GTP coordinate: ${coordinate}`);
  const x = GTP_COLUMNS.indexOf(match[1]!.toUpperCase());
  const y = BOARD_SIZE - Number(match[2]);
  if (x < 0 || y < 0 || y >= BOARD_SIZE)
    throw new Error(`Invalid GTP coordinate: ${coordinate}`);
  return [x, y];
};

export const pointToSgf = (point: Point | null): string =>
  point === null
    ? ""
    : `${String.fromCharCode(97 + point[0])}${String.fromCharCode(97 + point[1])}`;

export const sgfToPoint = (coordinate: string): Point | null => {
  if (coordinate === "") return null;
  if (!/^[a-s]{2}$/.test(coordinate))
    throw new Error(`Invalid SGF coordinate: ${coordinate}`);
  return [coordinate.charCodeAt(0) - 97, coordinate.charCodeAt(1) - 97];
};

export const formatPoint = (
  point: Point | null,
  language: "en" | "ja",
): string => {
  if (point === null) return language === "ja" ? "パス" : "Pass";
  return pointToGtp(point);
};
