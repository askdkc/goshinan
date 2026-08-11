import { useEffect, useMemo, useReducer, useRef } from "react";
import {
  assessMove,
  updateMistakeStreak,
  type MoveAssessment,
} from "../domain/assessment";
import { explainMistake, type CoachingEvidence } from "../domain/coaching";
import { gtpToPoint, pointToGtp } from "../domain/coordinates";
import { GoGame, type GameSnapshot, type Point } from "../domain/game";
import { sampleHumanMove, SeededRandom } from "../domain/opponent";
import { parseSgf, serializeSgf } from "../domain/sgf";
import type {
  AnalysisResult,
  Difficulty,
  EngineStatus,
} from "../shared/contracts";
import { CoachingPanel } from "./components/CoachingPanel";
import { GoBoard } from "./components/GoBoard";
import { translator } from "./i18n";
import {
  initialSessionState,
  newSnapshot,
  sessionReducer,
  type CoachingState,
} from "./sessionReducer";

const engineCanAnalyze = (status: EngineStatus): boolean =>
  status.state === "ready" || status.state === "busy";
const manualMode = (status: EngineStatus): boolean =>
  status.state === "missing" ||
  status.state === "error" ||
  status.state === "stopped";

const mergeAnalysis = (
  base: AnalysisResult,
  refined: AnalysisResult,
): AnalysisResult => {
  const moves = new Map(
    base.moveInfos.map((move) => [move.move.toLowerCase(), move]),
  );
  for (const move of refined.moveInfos)
    moves.set(move.move.toLowerCase(), move);
  return { ...base, ...refined, moveInfos: [...moves.values()] };
};

const mergePlayedPosition = (
  base: AnalysisResult,
  afterMove: AnalysisResult,
  coordinate: string,
): AnalysisResult => {
  const existing = base.moveInfos.find(
    (move) => move.move.toLowerCase() === coordinate.toLowerCase(),
  );
  const played = {
    move: coordinate,
    visits: afterMove.rootInfo.visits,
    scoreLead: afterMove.rootInfo.scoreLead,
    winrate: afterMove.rootInfo.winrate,
    ...(existing?.prior === undefined ? {} : { prior: existing.prior }),
    ...(existing?.order === undefined ? {} : { order: existing.order }),
    ...(afterMove.moveInfos[0]?.pv === undefined
      ? {}
      : { pv: afterMove.moveInfos[0].pv }),
  };
  return mergeAnalysis(base, { ...afterMove, moveInfos: [played] });
};

const ownershipDifference = (
  left?: number[],
  right?: number[],
): { swing: number; region: Point[] } => {
  if (
    left === undefined ||
    right === undefined ||
    left.length !== 361 ||
    right.length !== 361
  ) {
    return { swing: 0, region: [] };
  }
  const differences = left.map((value, index) => ({
    index,
    difference: Math.abs(value - (right[index] ?? value)),
  }));
  const region = differences
    .filter((item) => item.difference >= 0.35)
    .sort((a, b) => b.difference - a.difference)
    .slice(0, 16)
    .map(({ index }): Point => [index % 19, Math.floor(index / 19)]);
  return {
    swing: differences.reduce(
      (maximum, item) => Math.max(maximum, item.difference),
      0,
    ),
    region,
  };
};

const engineLabel = (
  status: EngineStatus,
  t: ReturnType<typeof translator>,
): string => {
  if (status.state === "ready") return t("engineReady");
  if (status.state === "busy" || status.state === "starting")
    return t("engineBusy");
  if (status.state === "missing") return t("engineMissing");
  return t("engineError");
};

export function App() {
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState);
  const operation = useRef(0);
  const t = useMemo(
    () => translator(state.settings.language),
    [state.settings.language],
  );
  const game = useMemo(
    () => GoGame.fromSnapshot(state.snapshot),
    [state.snapshot],
  );

  useEffect(() => {
    let active = true;
    void Promise.all([
      window.goShinan.getSettings(),
      window.goShinan.getEngineStatus(),
      window.goShinan.loadSession(),
    ]).then(([settings, engine, session]) => {
      if (active)
        dispatch({
          type: "bootstrapped",
          settings,
          engine,
          snapshot: session ?? newSnapshot(),
        });
    });
    const unsubscribe = window.goShinan.onEngineStatus((engine) =>
      dispatch({ type: "engine", engine }),
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const playOpponent = async (
    snapshot: GameSnapshot,
    difficulty: Difficulty,
    token: number,
    streak: number,
  ): Promise<void> => {
    if (!engineCanAnalyze(state.engine)) return;
    dispatch({ type: "phase", phase: "opponent" });
    try {
      const current = GoGame.fromSnapshot(snapshot);
      const analysis = await window.goShinan.analyze({
        snapshot,
        humanProfile: `rank_${difficulty}d`,
        includePolicy: true,
        maxVisits: 80,
        priority: 10,
      });
      if (operation.current !== token) return;
      const move = sampleHumanMove(
        analysis,
        (point) => current.isLegal(point),
        new SeededRandom(0x51a7e + snapshot.moves.length * 7919),
      );
      const validated = await window.goShinan.validateMove({
        snapshot,
        point: move,
      });
      if (operation.current !== token) return;
      if (!validated.legal || validated.snapshot === undefined) {
        throw new Error(validated.error ?? "KataGo selected an illegal move");
      }
      dispatch({ type: "commit", snapshot: validated.snapshot, streak });
      void window.goShinan.saveSession(validated.snapshot);
    } catch (error) {
      if (operation.current === token) {
        dispatch({
          type: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  useEffect(() => {
    if (
      state.phase !== "ready" ||
      !engineCanAnalyze(state.engine) ||
      game.isFinished
    )
      return;
    const token = operation.current;
    if (game.currentPlayer === "W") {
      void playOpponent(
        state.snapshot,
        state.settings.difficulty,
        token,
        state.streak,
      );
      return;
    }
    if (
      state.analysis?.turnNumber === state.snapshot.moves.length &&
      (!state.settings.showOwnership || state.analysis.ownership !== undefined)
    )
      return;
    dispatch({ type: "phase", phase: "thinking" });
    void window.goShinan
      .analyze({
        snapshot: state.snapshot,
        maxVisits: 300,
        includeOwnership: state.settings.showOwnership,
        priority: 20,
      })
      .then((analysis) => {
        if (operation.current === token)
          dispatch({ type: "analysis", analysis });
      })
      .catch((error: unknown) => {
        if (operation.current === token) {
          dispatch({
            type: "phase",
            phase: "ready",
            notice: error instanceof Error ? error.message : String(error),
          });
        }
      });
  }, [
    game,
    state.analysis,
    state.engine,
    state.phase,
    state.settings.difficulty,
    state.settings.showOwnership,
    state.snapshot,
  ]);

  const refineAssessment = async (
    snapshot: GameSnapshot,
    point: Point | null,
    base: AnalysisResult,
    difficulty: Difficulty,
  ): Promise<{ assessment: MoveAssessment; analysis: AnalysisResult }> => {
    let assessment = assessMove(
      base,
      pointToGtp(point),
      GoGame.fromSnapshot(snapshot).currentPlayer,
      difficulty,
    );
    if (!assessment.needsRefinement) return { assessment, analysis: base };
    const bestPoint =
      assessment.bestMove === undefined
        ? undefined
        : gtpToPoint(assessment.bestMove.move);
    const allowMoves = [point, bestPoint]
      .filter(
        (candidate): candidate is Point =>
          candidate !== undefined && candidate !== null,
      )
      .filter(
        (candidate, index, all) =>
          all.findIndex(
            (other) => other[0] === candidate[0] && other[1] === candidate[1],
          ) === index,
      );
    const refined = await window.goShinan.analyze({
      snapshot,
      allowMoves,
      maxVisits: 650,
      priority: 30,
    });
    const combined = mergeAnalysis(base, refined);
    assessment = assessMove(
      combined,
      pointToGtp(point),
      GoGame.fromSnapshot(snapshot).currentPlayer,
      difficulty,
      {
        boundaryMargin: 0.05,
      },
    );
    return { assessment, analysis: combined };
  };

  const buildCoaching = async (
    baseSnapshot: GameSnapshot,
    provisionalSnapshot: GameSnapshot,
    point: Point | null,
    assessment: MoveAssessment,
    analysis: AnalysisResult,
  ): Promise<CoachingState> => {
    const recommended =
      assessment.bestMove === undefined
        ? null
        : gtpToPoint(assessment.bestMove.move);
    let difference = { swing: 0, region: [] as Point[] };
    try {
      const bestResult = await window.goShinan.validateMove({
        snapshot: baseSnapshot,
        point: recommended,
      });
      if (bestResult.legal && bestResult.snapshot !== undefined) {
        const [playedAfter, bestAfter] = await Promise.all([
          window.goShinan.analyze({
            snapshot: provisionalSnapshot,
            includeOwnership: true,
            maxVisits: 450,
            priority: 25,
          }),
          window.goShinan.analyze({
            snapshot: bestResult.snapshot,
            includeOwnership: true,
            maxVisits: 450,
            priority: 25,
          }),
        ]);
        difference = ownershipDifference(
          playedAfter.ownership,
          bestAfter.ownership,
        );
      }
    } catch {
      // Ownership comparison is optional evidence; score evidence remains valid.
    }
    const provisional = GoGame.fromSnapshot(provisionalSnapshot);
    const lastMove = provisional.moves[provisional.moves.length - 1];
    const evidence: CoachingEvidence = {
      played: point,
      recommended,
      scoreLoss: assessment.scoreLoss,
      winrateLoss: assessment.winrateLoss,
      ...(point === null
        ? {}
        : { playedLiberties: provisional.libertiesAt(point).length }),
      capturedStones: lastMove?.captured ?? 0,
      ownershipSwing: difference.swing,
      affectedRegion: difference.region,
      lowPolicyArea: (assessment.playedMove?.prior ?? 1) < 0.01,
      nearbyFriendlyStones: 0,
      moveNumber: baseSnapshot.moves.length + 1,
      principalVariation:
        assessment.bestMove?.pv ?? analysis.moveInfos[0]?.pv ?? [],
    };
    return {
      played: point,
      recommended,
      assessment,
      evidence,
      explanation: explainMistake(evidence),
      hintLevel: 1,
    };
  };

  const handleMove = async (point: Point | null): Promise<void> => {
    if (!["ready", "coaching"].includes(state.phase) || game.isFinished) return;
    if (
      state.engine.state === "starting" ||
      (!manualMode(state.engine) && game.currentPlayer === "W")
    )
      return;
    const token = operation.current;
    const baseSnapshot = state.snapshot;
    dispatch({ type: "phase", phase: "assessing" });
    const coachingNote =
      state.coaching === undefined
        ? undefined
        : `Go Shinan coaching: retry after ${pointToGtp(state.coaching.played)} lost ${state.coaching.assessment.scoreLoss.toFixed(2)} points; suggested ${pointToGtp(state.coaching.recommended)}.`;
    const validated = await window.goShinan.validateMove({
      snapshot: baseSnapshot,
      point,
      ...(coachingNote === undefined ? {} : { note: coachingNote }),
    });
    if (operation.current !== token) return;
    if (!validated.legal || validated.snapshot === undefined) {
      dispatch({
        type: "phase",
        phase: state.coaching === undefined ? "ready" : "coaching",
        notice: validated.error ?? t("illegal"),
      });
      return;
    }

    const relevantAnalysis =
      state.analysis?.turnNumber === baseSnapshot.moves.length
        ? state.analysis
        : undefined;
    if (!engineCanAnalyze(state.engine) || relevantAnalysis === undefined) {
      dispatch({
        type: "commit",
        snapshot: validated.snapshot,
        streak: 0,
        notice: t("uncertainAccepted"),
      });
      void window.goShinan.saveSession(validated.snapshot);
      return;
    }

    try {
      const afterMove = await window.goShinan.analyze({
        snapshot: validated.snapshot,
        maxVisits: 250,
        priority: 35,
      });
      if (operation.current !== token) return;
      const analyzedPosition = mergePlayedPosition(
        relevantAnalysis,
        afterMove,
        pointToGtp(point),
      );
      const refined = await refineAssessment(
        baseSnapshot,
        point,
        analyzedPosition,
        state.settings.difficulty,
      );
      if (operation.current !== token) return;
      const transition = updateMistakeStreak(
        state.coaching === undefined ? state.streak : 0,
        refined.assessment,
      );
      if (
        state.coaching !== undefined &&
        !refined.assessment.acceptable &&
        refined.assessment.certain
      ) {
        const coaching = await buildCoaching(
          baseSnapshot,
          validated.snapshot,
          point,
          refined.assessment,
          refined.analysis,
        );
        if (operation.current === token) dispatch({ type: "coach", coaching });
        return;
      }
      if (transition.coachingRequired) {
        const coaching = await buildCoaching(
          baseSnapshot,
          validated.snapshot,
          point,
          refined.assessment,
          refined.analysis,
        );
        if (operation.current === token) dispatch({ type: "coach", coaching });
        return;
      }
      const notice = refined.assessment.acceptable ? undefined : t("badMove");
      dispatch({
        type: "commit",
        snapshot: validated.snapshot,
        streak: transition.nextStreak,
        ...(notice === undefined ? {} : { notice }),
      });
      void window.goShinan.saveSession(validated.snapshot);
      if (engineCanAnalyze(state.engine)) {
        await playOpponent(
          validated.snapshot,
          state.settings.difficulty,
          token,
          transition.nextStreak,
        );
      }
    } catch {
      if (operation.current !== token) return;
      dispatch({
        type: "commit",
        snapshot: validated.snapshot,
        streak: 0,
        notice: t("uncertainAccepted"),
      });
      void window.goShinan.saveSession(validated.snapshot);
    }
  };

  const cancelWork = (): number => {
    operation.current += 1;
    void window.goShinan.cancelAnalysis();
    return operation.current;
  };

  const handleNewGame = (): void => {
    if (state.snapshot.moves.length > 0 && !window.confirm(t("confirmNew")))
      return;
    cancelWork();
    dispatch({ type: "new_game" });
    void window.goShinan.saveSession(newSnapshot());
  };

  const handleUndo = (): void => {
    if (state.snapshot.moves.length === 0) return;
    cancelWork();
    const undoCount =
      game.currentPlayer === "B" && state.snapshot.moves.length >= 2 ? 2 : 1;
    const snapshot = game.undo(undoCount).toSnapshot();
    dispatch({ type: "loaded", snapshot });
    void window.goShinan.saveSession(snapshot);
  };

  const handleResign = (): void => {
    if (game.isFinished || !window.confirm(t("confirmResign"))) return;
    cancelWork();
    const next = GoGame.fromSnapshot(state.snapshot);
    next.resign();
    const snapshot = next.toSnapshot();
    dispatch({ type: "commit", snapshot, streak: state.streak });
    void window.goShinan.saveSession(snapshot);
  };

  const handleSave = async (): Promise<void> => {
    try {
      await window.goShinan.saveSgf(serializeSgf(state.snapshot));
    } catch (error) {
      dispatch({
        type: "phase",
        phase: state.phase,
        notice: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleLoad = async (): Promise<void> => {
    try {
      const result = await window.goShinan.loadSgf();
      if (result.canceled || result.contents === undefined) return;
      const snapshot = parseSgf(result.contents);
      cancelWork();
      dispatch({ type: "loaded", snapshot });
      void window.goShinan.saveSession(snapshot);
    } catch (error) {
      dispatch({
        type: "phase",
        phase: state.phase,
        notice: `${t("sgfError")}: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  };

  const updateSettings = async (
    patch: Parameters<typeof window.goShinan.updateSettings>[0],
  ): Promise<void> => {
    const settings = await window.goShinan.updateSettings(patch);
    dispatch({ type: "settings", settings });
  };

  const statusText =
    state.phase === "loading"
      ? t("loading")
      : state.phase === "thinking"
        ? t("thinking")
        : state.phase === "assessing"
          ? t("assessing")
          : state.phase === "opponent"
            ? t("opponent")
            : undefined;
  const boardDisabled =
    !["ready", "coaching"].includes(state.phase) ||
    game.isFinished ||
    state.engine.state === "starting" ||
    (!manualMode(state.engine) && game.currentPlayer === "W");

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">{t("subtitle")}</div>
          <h1>{t("appName")}</h1>
        </div>
        <div className="header-status">
          <span className={`status-dot status-${state.engine.state}`} />
          <span>
            {t("engine")}: {engineLabel(state.engine, t)}
          </span>
          <button
            className="language-button"
            onClick={() =>
              void updateSettings({
                language: state.settings.language === "en" ? "ja" : "en",
              })
            }
          >
            {t("language")}
          </button>
        </div>
      </header>

      <section className="workspace">
        <div className="board-column">
          <div className="turn-card">
            <div
              className={`turn-stone turn-${game.currentPlayer.toLowerCase()}`}
            />
            <strong>
              {game.currentPlayer === "B" ? t("black") : t("white")}{" "}
              {t("toPlay")}
            </strong>
            <span>
              {t("move")} {state.snapshot.moves.length + 1}
            </span>
            <span>
              {t("errorStreak")} {state.streak}/3
            </span>
          </div>
          <div className="board-frame">
            <GoBoard
              game={game}
              analysis={state.analysis}
              coaching={state.coaching}
              showCandidates={state.settings.showCandidates}
              showOwnership={state.settings.showOwnership}
              disabled={boardDisabled}
              onPlay={(point) => void handleMove(point)}
              t={t}
            />
            {statusText !== undefined && (
              <div className="thinking-overlay">
                <span className="spinner" />
                {statusText}
              </div>
            )}
          </div>
        </div>

        <aside className="side-panel">
          <section className="settings-card">
            <label htmlFor="difficulty">{t("difficulty")}</label>
            <div className="difficulty-row">
              <select
                id="difficulty"
                value={state.settings.difficulty}
                onChange={(event) =>
                  void updateSettings({
                    difficulty: Number(event.target.value) as Difficulty,
                  })
                }
              >
                {Array.from({ length: 9 }, (_, index) => index + 1).map(
                  (rank) => (
                    <option key={rank} value={rank}>
                      {rank} dan
                    </option>
                  ),
                )}
              </select>
              <span>
                {t("approximate")} {state.settings.difficulty} dan
              </span>
            </div>
            <div className="toggle-row">
              <label>
                <input
                  type="checkbox"
                  checked={state.settings.showCandidates}
                  onChange={(event) =>
                    void updateSettings({
                      showCandidates: event.target.checked,
                    })
                  }
                />
                {t("candidates")}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={state.settings.showOwnership}
                  onChange={(event) =>
                    void updateSettings({ showOwnership: event.target.checked })
                  }
                />
                {t("ownership")}
              </label>
            </div>
          </section>

          {state.coaching !== undefined ? (
            <CoachingPanel
              coaching={state.coaching}
              language={state.settings.language}
              onHint={() => dispatch({ type: "hint" })}
              t={t}
            />
          ) : (
            <section className="analysis-card">
              <div className="eyebrow">{t("engine")}</div>
              <p>
                {state.engine.message ??
                  (state.engine.state === "missing"
                    ? t("noEngine")
                    : engineLabel(state.engine, t))}
              </p>
              {state.analysis !== undefined &&
                state.settings.showCandidates && (
                  <ol className="analysis-list">
                    {state.analysis.moveInfos.slice(0, 5).map((move) => (
                      <li key={move.move}>
                        <strong>{move.move}</strong>
                        <span>
                          {move.scoreLead.toFixed(1)} · {move.visits}v
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
            </section>
          )}

          {state.notice !== undefined && (
            <div className="notice" role="status">
              {state.notice}
            </div>
          )}
          {state.phase === "error" && game.currentPlayer === "W" && (
            <button
              className="button button-accent"
              onClick={() =>
                void playOpponent(
                  state.snapshot,
                  state.settings.difficulty,
                  operation.current,
                  state.streak,
                )
              }
            >
              {t("retryOpponent")}
            </button>
          )}

          <section className="control-card">
            <div className="primary-controls">
              <button
                className="button button-primary"
                disabled={boardDisabled}
                onClick={() => void handleMove(null)}
              >
                {t("pass")}
              </button>
              <button
                className="button"
                disabled={state.snapshot.moves.length === 0}
                onClick={handleUndo}
              >
                {t("undo")}
              </button>
              <button
                className="button"
                disabled={game.isFinished}
                onClick={handleResign}
              >
                {t("resign")}
              </button>
              <button className="button" onClick={handleNewGame}>
                {t("newGame")}
              </button>
            </div>
            <div className="file-controls">
              <button className="text-button" onClick={() => void handleSave()}>
                {t("save")}
              </button>
              <button className="text-button" onClick={() => void handleLoad()}>
                {t("load")}
              </button>
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}
