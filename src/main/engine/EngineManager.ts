import { EventEmitter } from "node:events";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface, type Interface } from "node:readline";
import type {
  AnalyzeRequest,
  AnalysisResult,
  EngineStatus,
} from "../../shared/contracts";
import { pointToGtp } from "../../domain/coordinates";
import { GoGame } from "../../domain/game";
import { resolveAndVerifyResources } from "./resources";

interface PendingQuery {
  generation: number;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

interface EngineMessage {
  id?: string;
  action?: string;
  error?: string;
  warning?: string;
  isDuringSearch?: boolean;
  noResults?: boolean;
  [key: string]: unknown;
}

type EngineProcessFactory = (
  executable: string,
  args: string[],
  cwd: string,
) => ChildProcessWithoutNullStreams;

const spawnEngineProcess: EngineProcessFactory = (executable, args, cwd) =>
  spawn(executable, args, {
    cwd,
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
  });

export class EngineUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineUnavailableError";
  }
}

export class EngineManager extends EventEmitter {
  private process: ChildProcessWithoutNullStreams | undefined;
  private reader: Interface | undefined;
  private readonly pending = new Map<string, PendingQuery>();
  private sequence = 0;
  private generation = 0;
  private intentionalStop = false;
  private restartAttempts = 0;
  private currentStatus: EngineStatus = { state: "stopped" };

  constructor(
    private readonly resourceRoot: string,
    private readonly createProcess: EngineProcessFactory = spawnEngineProcess,
  ) {
    super();
  }

  get status(): EngineStatus {
    return { ...this.currentStatus };
  }

  private setStatus(status: EngineStatus): void {
    this.currentStatus = status;
    this.emit("status", this.status);
  }

  private nextId(prefix: string): string {
    this.sequence += 1;
    return `${prefix}-${Date.now()}-${this.sequence}`;
  }

  async start(): Promise<void> {
    if (this.process !== undefined) return;
    this.intentionalStop = false;
    this.setStatus({
      state: "starting",
      message: "Validating local KataGo resources",
    });

    let resources;
    try {
      resources = await resolveAndVerifyResources(this.resourceRoot);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus({ state: "missing", message });
      return;
    }

    const child = this.createProcess(
      resources.binaryPath,
      [
        "analysis",
        "-config",
        resources.configPath,
        "-model",
        resources.normalModelPath,
        "-human-model",
        resources.humanModelPath,
      ],
      this.resourceRoot,
    );
    this.process = child;
    this.reader = createInterface({ input: child.stdout });
    this.reader.on("line", (line) => this.handleLine(line));
    child.stderr.on("data", (chunk: Buffer) =>
      this.handleStderr(chunk.toString("utf8")),
    );
    child.once("error", (error) => this.handleCrash(error));
    child.once("exit", (code, signal) => {
      if (this.process === child)
        this.handleCrash(
          new Error(`KataGo exited (${code ?? signal ?? "unknown"})`),
        );
    });

    try {
      await new Promise<void>((resolve, reject) => {
        child.once("spawn", resolve);
        child.once("error", reject);
      });
      const version = (await this.control({ action: "query_version" })) as {
        version?: string;
      };
      const models = (await this.control({ action: "query_models" })) as {
        models?: Array<{
          name?: string;
          usesHumanSLProfile?: boolean;
          usingFP16?: string;
        }>;
      };
      const loadedModels = models.models ?? [];
      if (
        loadedModels.length < 2 ||
        !loadedModels.some((model) => model.usesHumanSLProfile === true)
      ) {
        throw new Error(
          "KataGo did not report both a normal model and a Human SL model",
        );
      }
      this.restartAttempts = 0;
      const normalModel = loadedModels.find(
        (model) => model.usesHumanSLProfile !== true,
      )?.name;
      const humanModel = loadedModels.find(
        (model) => model.usesHumanSLProfile === true,
      )?.name;
      this.setStatus({
        state: "ready",
        version: version.version ?? resources.kataGoVersion,
        ...(normalModel === undefined ? {} : { normalModel }),
        ...(humanModel === undefined ? {} : { humanModel }),
      });
    } catch (error) {
      this.handleCrash(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  private handleStderr(output: string): void {
    const line = output.trim();
    if (line === "") return;
    if (/error|fatal|failed/i.test(line)) {
      this.setStatus({ ...this.currentStatus, message: line.slice(0, 500) });
    }
  }

  private handleLine(line: string): void {
    let message: EngineMessage;
    try {
      message = JSON.parse(line) as EngineMessage;
    } catch {
      return;
    }
    if (message.id === undefined) return;
    const pending = this.pending.get(message.id);
    if (pending === undefined || pending.generation !== this.generation) return;
    if (message.warning !== undefined) return;
    if (message.error !== undefined) {
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      pending.reject(new Error(message.error));
      return;
    }
    if (message.isDuringSearch === true) return;

    clearTimeout(pending.timer);
    this.pending.delete(message.id);
    if (message.noResults === true)
      pending.reject(
        new Error("KataGo query was terminated before producing results"),
      );
    else pending.resolve(message);
    if (this.pending.size === 0 && this.currentStatus.state === "busy") {
      this.setStatus({ ...this.currentStatus, state: "ready" });
    }
  }

  private send(
    query: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<unknown> {
    const child = this.process;
    if (child === undefined || child.stdin.destroyed) {
      return Promise.reject(
        new EngineUnavailableError(
          this.currentStatus.message ?? "KataGo is not running",
        ),
      );
    }
    const id = String(query.id);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new EngineUnavailableError(`KataGo query ${id} timed out`));
        void this.cancel(id);
      }, timeoutMs);
      this.pending.set(id, {
        generation: this.generation,
        resolve,
        reject,
        timer,
      });
      child.stdin.write(`${JSON.stringify(query)}\n`, (error) => {
        if (error !== null && error !== undefined) {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(error);
        }
      });
    });
  }

  private control(payload: {
    action: string;
    [key: string]: unknown;
  }): Promise<unknown> {
    return this.send({ id: this.nextId("control"), ...payload }, 15_000);
  }

  async analyze(request: AnalyzeRequest): Promise<AnalysisResult> {
    if (
      this.currentStatus.state !== "ready" &&
      this.currentStatus.state !== "busy"
    ) {
      throw new EngineUnavailableError(
        this.currentStatus.message ?? "KataGo is unavailable",
      );
    }
    const game = GoGame.fromSnapshot(request.snapshot);
    const id = this.nextId("analysis");
    const currentPlayer = game.currentPlayer;
    const allowMoves = request.allowMoves?.map(pointToGtp);
    const query = {
      id,
      moves: request.snapshot.moves.map((move) => [
        move.color,
        pointToGtp(move.point),
      ]),
      rules: "japanese",
      komi: request.snapshot.komi,
      boardXSize: 19,
      boardYSize: 19,
      analyzeTurns: [request.snapshot.moves.length],
      maxVisits: request.maxVisits ?? 250,
      includeOwnership: request.includeOwnership ?? false,
      includePolicy:
        request.includePolicy ?? request.humanProfile !== undefined,
      priority: request.priority ?? 0,
      ...(request.humanProfile === undefined
        ? {}
        : {
            overrideSettings: {
              humanSLProfile: request.humanProfile,
              ignorePreRootHistory: false,
            },
          }),
      ...(allowMoves === undefined
        ? {}
        : {
            allowMoves: [
              { player: currentPlayer, moves: allowMoves, untilDepth: 1 },
            ],
          }),
    };
    this.setStatus({ ...this.currentStatus, state: "busy" });
    return (await this.send(query, 45_000)) as AnalysisResult;
  }

  async cancel(queryId?: string): Promise<void> {
    if (this.process === undefined) return;
    if (queryId !== undefined) {
      await this.control({ action: "terminate", terminateId: queryId }).catch(
        () => undefined,
      );
      return;
    }
    this.generation += 1;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new EngineUnavailableError("Analysis canceled"));
    }
    this.pending.clear();
    await this.control({ action: "terminate_all" }).catch(() => undefined);
    if (this.currentStatus.state === "busy")
      this.setStatus({ ...this.currentStatus, state: "ready" });
  }

  private handleCrash(error: Error): void {
    const child = this.process;
    this.process = undefined;
    this.reader?.close();
    this.reader = undefined;
    if (child !== undefined && !child.killed) child.kill();
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new EngineUnavailableError(error.message));
    }
    this.pending.clear();
    if (this.intentionalStop) {
      this.setStatus({ state: "stopped" });
      return;
    }
    this.setStatus({ state: "error", message: error.message });
    if (this.restartAttempts < 2) {
      this.restartAttempts += 1;
      setTimeout(() => void this.start(), 1_000 * this.restartAttempts);
    }
  }

  stop(): void {
    this.intentionalStop = true;
    this.generation += 1;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new EngineUnavailableError("KataGo stopped"));
    }
    this.pending.clear();
    const child = this.process;
    this.process = undefined;
    this.reader?.close();
    this.reader = undefined;
    if (child !== undefined && !child.killed) child.kill();
    this.setStatus({ state: "stopped" });
  }
}
