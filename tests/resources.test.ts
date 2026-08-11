import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveAndVerifyResources } from "../src/main/engine/resources";

const targetKey = (): string | undefined => {
  if (process.platform === "darwin" && process.arch === "arm64")
    return "darwin-arm64";
  if (process.platform === "darwin" && process.arch === "x64")
    return "darwin-x64";
  if (process.platform === "win32" && process.arch === "x64")
    return "win32-x64";
  return undefined;
};

const digest = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

describe.skipIf(targetKey() === undefined)("KataGo resource integrity", () => {
  let root: string | undefined;

  afterEach(async () => {
    if (root !== undefined) await rm(root, { recursive: true, force: true });
    root = undefined;
  });

  it("verifies native dependencies listed by the resource fetcher", async () => {
    root = await mkdtemp(path.join(tmpdir(), "goshinan-resources-"));
    const files = {
      binary: "binary",
      normal: "normal",
      human: "human",
      config: "config",
      dependency: "dependency",
    };
    await Promise.all(
      Object.entries(files).map(([name, value]) =>
        writeFile(path.join(root!, name), value, "utf8"),
      ),
    );
    const entry = {
      binary: { path: "binary", sha256: digest(files.binary) },
      normalModel: { path: "normal", sha256: digest(files.normal) },
      humanModel: { path: "human", sha256: digest(files.human) },
      config: { path: "config", sha256: digest(files.config) },
      dependencies: [{ path: "dependency", sha256: digest(files.dependency) }],
    };
    await writeFile(
      path.join(root, "manifest.json"),
      JSON.stringify({
        kataGoVersion: "test",
        humanModelVersion: "test",
        platforms: { [targetKey()!]: entry },
      }),
      "utf8",
    );

    await expect(resolveAndVerifyResources(root)).resolves.toMatchObject({
      kataGoVersion: "test",
    });
    await writeFile(path.join(root, "dependency"), "tampered", "utf8");
    await expect(resolveAndVerifyResources(root)).rejects.toThrow(
      /Checksum mismatch for dependency/,
    );
  });
});
