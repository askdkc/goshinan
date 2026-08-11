import type { AnalysisResult } from "../shared/contracts";
import { gtpToPoint } from "./coordinates";
import type { Point } from "./game";

export interface RandomSource {
  next(): number;
}

export class SeededRandom implements RandomSource {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state += 0x6d2b79f5;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  }
}

const policyCoordinate = (index: number, size: number): string => {
  if (index === size * size) return "pass";
  const point: Point = [index % size, Math.floor(index / size)];
  const columns = "ABCDEFGHJKLMNOPQRST";
  return `${columns[point[0]]}${size - point[1]}`;
};

export const sampleHumanMove = (
  analysis: AnalysisResult,
  isLegal: (point: Point | null) => boolean,
  random: RandomSource,
  size = 19,
): Point | null => {
  if (
    analysis.humanPolicy === undefined ||
    analysis.humanPolicy.length < size * size + 1
  ) {
    throw new Error("KataGo response does not contain a complete human policy");
  }

  const bestSearchMove = analysis.moveInfos[0];
  const passSupported =
    bestSearchMove?.move.toLowerCase() === "pass" ||
    analysis.moveInfos.some(
      (move) =>
        move.move.toLowerCase() === "pass" &&
        move.scoreLead >= (bestSearchMove?.scoreLead ?? move.scoreLead) - 0.5,
    );

  const candidates: Array<{ point: Point | null; weight: number }> = [];
  for (let index = 0; index < analysis.humanPolicy.length; index += 1) {
    const weight = analysis.humanPolicy[index] ?? 0;
    if (!Number.isFinite(weight) || weight <= 0) continue;
    const coordinate = policyCoordinate(index, size);
    const point = gtpToPoint(coordinate);
    if (point === null && !passSupported) continue;
    if (isLegal(point)) candidates.push({ point, weight });
  }

  const total = candidates.reduce(
    (sum, candidate) => sum + candidate.weight,
    0,
  );
  if (total <= 0) {
    const fallback = analysis.moveInfos
      .map((move) => gtpToPoint(move.move))
      .find((point) => (point !== null || passSupported) && isLegal(point));
    if (fallback === undefined)
      throw new Error("KataGo supplied no legal opponent move");
    return fallback;
  }

  let target = random.next() * total;
  for (const candidate of candidates) {
    target -= candidate.weight;
    if (target <= 0) return candidate.point;
  }
  return candidates[candidates.length - 1]!.point;
};
