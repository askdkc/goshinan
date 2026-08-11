import { createHash } from "node:crypto";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EngineManager } from "../src/main/engine/EngineManager";
import type { GameSnapshot } from "../src/domain/game";

const snapshot: GameSnapshot = {
  version: 1,
  size: 19,
  rules: "Japanese",
  komi: 6.5,
  moves: [],
};

const sha256 = (contents: string): string =>
  createHash("sha256").update(contents).digest("hex");

const platformKey = (): string => {
  if (process.platform === "darwin" && process.arch === "arm64")
    return "darwin-arm64";
  if (process.platform === "darwin" && process.arch === "x64")
    return "darwin-x64";
  if (process.platform === "win32" && process.arch === "x64")
    return "win32-x64";
  return "unsupported";
};

const fakeEngine = `#!/usr/bin/env node
const readline = require("node:readline");
const send = value => process.stdout.write(JSON.stringify(value) + "\\n");
readline.createInterface({input: process.stdin}).on("line", line => {
  const query = JSON.parse(line);
  if (query.action === "query_version") {
    send({...query, version: "1.99.0-test", git_hash: "test"});
    return;
  }
  if (query.action === "query_models") {
    send({...query, models: [
      {name: "normal-test.bin.gz", usesHumanSLProfile: false},
      {name: "human-test.bin.gz", usesHumanSLProfile: true}
    ]});
    return;
  }
  if (query.action) {
    send(query);
    return;
  }
  const turnNumber = query.analyzeTurns[0];
  send({id: query.id, turnNumber, isDuringSearch: true, rootInfo: {visits: 1, scoreLead: 0, winrate: 0.5}, moveInfos: []});
  const delay = query.maxVisits === 111 ? 40 : query.maxVisits === 999 ? 200 : 0;
  setTimeout(() => send({
    id: query.id,
    turnNumber,
    isDuringSearch: false,
    rootInfo: {visits: query.maxVisits, scoreLead: 1, winrate: 0.55},
    moveInfos: [{move: "D4", visits: query.maxVisits, scoreLead: 1, winrate: 0.55}],
    ...(query.overrideSettings ? {humanPolicy: Array(362).fill(1 / 362)} : {})
  }), delay);
});
`;

describe.skipIf(platformKey() === "unsupported")(
  "EngineManager contract",
  () => {
    let root: string | undefined;
    let manager: EngineManager | undefined;

    afterEach(async () => {
      manager?.stop();
      if (root !== undefined) await rm(root, { recursive: true, force: true });
      root = undefined;
      manager = undefined;
    });

    const setup = async (): Promise<EngineManager> => {
      root = await mkdtemp(path.join(tmpdir(), "goshinan-engine-"));
      const binaryName = process.platform === "win32" ? "katago.exe" : "katago";
      const binaryPath = path.join(root, binaryName);
      const normal = "normal-model";
      const human = "human-model";
      const config = "reportAnalysisWinratesAs = BLACK\n";
      await Promise.all([
        writeFile(binaryPath, fakeEngine, "utf8"),
        writeFile(path.join(root, "normal.bin.gz"), normal, "utf8"),
        writeFile(path.join(root, "human.bin.gz"), human, "utf8"),
        writeFile(path.join(root, "analysis.cfg"), config, "utf8"),
      ]);
      await chmod(binaryPath, 0o755);
      const entry = {
        binary: { path: binaryName, sha256: sha256(fakeEngine) },
        normalModel: { path: "normal.bin.gz", sha256: sha256(normal) },
        humanModel: { path: "human.bin.gz", sha256: sha256(human) },
        config: { path: "analysis.cfg", sha256: sha256(config) },
      };
      await writeFile(
        path.join(root, "manifest.json"),
        JSON.stringify({
          kataGoVersion: "test",
          humanModelVersion: "test",
          platforms: { [platformKey()]: entry },
        }),
        "utf8",
      );
      manager = new EngineManager(root);
      await manager.start();
      return manager;
    };

    it("validates startup models, ignores partial reports, and routes out-of-order finals", async () => {
      const engine = await setup();
      expect(engine.status).toMatchObject({
        state: "ready",
        version: "1.99.0-test",
        normalModel: "normal-test.bin.gz",
        humanModel: "human-test.bin.gz",
      });

      const completionOrder: number[] = [];
      const slow = engine
        .analyze({ snapshot, maxVisits: 111 })
        .then((result) => {
          completionOrder.push(result.rootInfo.visits);
          return result;
        });
      const fast = engine
        .analyze({ snapshot, maxVisits: 222, humanProfile: "rank_5d" })
        .then((result) => {
          completionOrder.push(result.rootInfo.visits);
          return result;
        });
      const [slowResult, fastResult] = await Promise.all([slow, fast]);

      expect(completionOrder).toEqual([222, 111]);
      expect(slowResult.isDuringSearch).toBe(false);
      expect(fastResult.humanPolicy).toHaveLength(362);
    });

    it("rejects obsolete work when terminate_all advances the generation", async () => {
      const engine = await setup();
      const pending = engine.analyze({ snapshot, maxVisits: 999 });
      const rejected = expect(pending).rejects.toThrow(/canceled/i);
      await engine.cancel();
      await rejected;
      expect(engine.status.state).toBe("ready");
    });
  },
);
