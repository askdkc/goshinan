import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { gtpToPoint, pointToGtp } from "../../domain/coordinates";
import { BOARD_SIZE, type GoGame, type Point } from "../../domain/game";
import type { AnalysisResult } from "../../shared/contracts";
import type { CoachingState } from "../sessionReducer";
import type { Translator } from "../i18n";

interface GoBoardProps {
  game: GoGame;
  analysis?: AnalysisResult | undefined;
  coaching?: CoachingState | undefined;
  showCandidates: boolean;
  showOwnership: boolean;
  disabled: boolean;
  onPlay: (point: Point) => void;
  t: Translator;
}

const MARGIN = 38;
const STEP = 38;
const EXTENT = MARGIN + STEP * (BOARD_SIZE - 1);
const VIEWBOX = EXTENT + MARGIN;
const STAR_POINTS = [3, 9, 15].flatMap((x) =>
  [3, 9, 15].map((y): Point => [x, y]),
);

const location = ([x, y]: Point): [number, number] => [
  MARGIN + x * STEP,
  MARGIN + y * STEP,
];

const safePoint = (coordinate: string): Point | null => {
  try {
    return gtpToPoint(coordinate);
  } catch {
    return null;
  }
};

export function GoBoard({
  game,
  analysis,
  coaching,
  showCandidates,
  showOwnership,
  disabled,
  onPlay,
  t,
}: GoBoardProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [keyboardPoint, setKeyboardPoint] = useState<Point>([9, 9]);
  const stones = game.stones();
  const lastMove = game.moves[game.moves.length - 1]?.point;
  const revealCandidates = showCandidates || (coaching?.hintLevel ?? 0) >= 3;
  const revealRegion = (coaching?.hintLevel ?? 0) >= 2;
  const candidatePoints = useMemo(
    () =>
      revealCandidates
        ? (analysis?.moveInfos ?? [])
            .slice(0, 5)
            .map((move, index) => ({
              point: safePoint(move.move),
              index: index + 1,
            }))
            .filter(
              (candidate): candidate is { point: Point; index: number } =>
                candidate.point !== null,
            )
        : [],
    [analysis, revealCandidates],
  );

  const focusPoint = (point: Point): void => {
    setKeyboardPoint(point);
    requestAnimationFrame(() => {
      svgRef.current
        ?.querySelector<SVGCircleElement>(
          `[data-x="${point[0]}"][data-y="${point[1]}"]`,
        )
        ?.focus();
    });
  };

  const handleKey = (
    event: KeyboardEvent<SVGCircleElement>,
    point: Point,
  ): void => {
    let next: Point | undefined;
    if (event.key === "ArrowLeft") next = [Math.max(0, point[0] - 1), point[1]];
    if (event.key === "ArrowRight")
      next = [Math.min(18, point[0] + 1), point[1]];
    if (event.key === "ArrowUp") next = [point[0], Math.max(0, point[1] - 1)];
    if (event.key === "ArrowDown")
      next = [point[0], Math.min(18, point[1] + 1)];
    if (next !== undefined) {
      event.preventDefault();
      focusPoint(next);
      return;
    }
    if (
      (event.key === "Enter" || event.key === " ") &&
      !disabled &&
      game.stoneAt(point) === null
    ) {
      event.preventDefault();
      onPlay(point);
    }
  };

  return (
    <svg
      ref={svgRef}
      className="go-board"
      viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
      role="grid"
      aria-label={t("boardLabel")}
    >
      <defs>
        <radialGradient id="black-stone" cx="35%" cy="28%" r="72%">
          <stop offset="0" stopColor="#56615b" />
          <stop offset="0.34" stopColor="#1c2320" />
          <stop offset="1" stopColor="#050706" />
        </radialGradient>
        <radialGradient id="white-stone" cx="35%" cy="28%" r="72%">
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.65" stopColor="#e7e5dc" />
          <stop offset="1" stopColor="#b9b9af" />
        </radialGradient>
        <filter id="stone-shadow" x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="1.5" dy="2.5" stdDeviation="2" floodOpacity="0.4" />
        </filter>
      </defs>
      <rect
        className="board-wood"
        x="0"
        y="0"
        width={VIEWBOX}
        height={VIEWBOX}
        rx="12"
      />
      {Array.from({ length: BOARD_SIZE }, (_, index) => {
        const offset = MARGIN + index * STEP;
        return (
          <g key={`line-${index}`} className="grid-lines">
            <line x1={MARGIN} y1={offset} x2={EXTENT} y2={offset} />
            <line x1={offset} y1={MARGIN} x2={offset} y2={EXTENT} />
          </g>
        );
      })}
      {STAR_POINTS.map((point) => {
        const [cx, cy] = location(point);
        return (
          <circle
            key={`star-${point.join("-")}`}
            className="star-point"
            cx={cx}
            cy={cy}
            r="4.3"
          />
        );
      })}
      {showOwnership &&
        analysis?.ownership?.map((value, index) => {
          const point: Point = [
            index % BOARD_SIZE,
            Math.floor(index / BOARD_SIZE),
          ];
          const [cx, cy] = location(point);
          return (
            <circle
              key={`ownership-${index}`}
              className="ownership-dot"
              cx={cx}
              cy={cy}
              r={Math.max(2, Math.abs(value) * 13)}
              fill={value >= 0 ? "#1a2822" : "#f4f0df"}
              opacity={Math.min(0.6, Math.abs(value) * 0.55)}
            />
          );
        })}
      {revealRegion &&
        coaching?.explanation.affectedRegion.map((point) => {
          const [cx, cy] = location(point);
          return (
            <rect
              key={`region-${point.join("-")}`}
              className="region-mark"
              x={cx - 15}
              y={cy - 15}
              width="30"
              height="30"
              rx="8"
            />
          );
        })}
      {stones.map(({ point, color }) => {
        const [cx, cy] = location(point);
        return (
          <circle
            key={`stone-${point.join("-")}`}
            className={`stone stone-${color.toLowerCase()}`}
            cx={cx}
            cy={cy}
            r="17.2"
            fill={`url(#${color === "B" ? "black" : "white"}-stone)`}
            filter="url(#stone-shadow)"
          />
        );
      })}
      {lastMove !== null && lastMove !== undefined && (
        <circle
          className="last-move"
          cx={location(lastMove)[0]}
          cy={location(lastMove)[1]}
          r="5"
          fill={game.stoneAt(lastMove) === "B" ? "#f5e7b4" : "#26332d"}
        />
      )}
      {candidatePoints.map(({ point, index }) => {
        const [cx, cy] = location(point);
        return (
          <g
            key={`candidate-${point.join("-")}`}
            className="candidate-mark"
            aria-hidden="true"
          >
            <circle cx={cx} cy={cy} r="12" />
            <text x={cx} y={cy + 4}>
              {index}
            </text>
          </g>
        );
      })}
      {Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => {
        const point: Point = [
          index % BOARD_SIZE,
          Math.floor(index / BOARD_SIZE),
        ];
        const [cx, cy] = location(point);
        const stone = game.stoneAt(point);
        const label = `${pointToGtp(point)}, ${stone === null ? t("empty") : `${t("occupiedBy")} ${stone === "B" ? t("black") : t("white")}`}`;
        return (
          <circle
            key={`hit-${index}`}
            className="intersection-hit"
            role="gridcell"
            aria-label={label}
            aria-disabled={disabled || stone !== null}
            data-x={point[0]}
            data-y={point[1]}
            cx={cx}
            cy={cy}
            r="17"
            tabIndex={
              keyboardPoint[0] === point[0] && keyboardPoint[1] === point[1]
                ? 0
                : -1
            }
            onFocus={() => setKeyboardPoint(point)}
            onKeyDown={(event) => handleKey(event, point)}
            onClick={() => {
              if (!disabled && stone === null) onPlay(point);
            }}
          />
        );
      })}
    </svg>
  );
}
