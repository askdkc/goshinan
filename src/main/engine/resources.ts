import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

export interface ResourceEntry {
  path: string;
  sha256: string;
}

interface PlatformResources {
  binary: ResourceEntry;
  normalModel: ResourceEntry;
  humanModel: ResourceEntry;
  config: ResourceEntry;
  dependencies?: ResourceEntry[];
}

interface ResourceManifest {
  kataGoVersion: string;
  humanModelVersion: string;
  platforms: Record<string, PlatformResources>;
}

export interface ResolvedResources {
  binaryPath: string;
  normalModelPath: string;
  humanModelPath: string;
  configPath: string;
  kataGoVersion: string;
}

const platformKey = (
  platform: string = process.platform,
  arch: string = process.arch,
): string => {
  if (platform === "darwin" && arch === "arm64") return "darwin-arm64";
  if (platform === "darwin" && arch === "x64") return "darwin-x64";
  if (platform === "win32" && arch === "x64") return "win32-x64";
  throw new Error(`Unsupported platform: ${platform}-${arch}`);
};

const resolveInside = (root: string, relativePath: string): string => {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (
    resolved !== resolvedRoot &&
    !resolved.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new Error(
      `Resource path escapes the packaged resource directory: ${relativePath}`,
    );
  }
  return resolved;
};

const hashFile = async (filePath: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });

const verifyEntry = async (
  root: string,
  entry: ResourceEntry,
): Promise<string> => {
  if (!/^[a-f0-9]{64}$/i.test(entry.sha256)) {
    throw new Error(`Missing SHA-256 checksum for ${entry.path}`);
  }
  const filePath = resolveInside(root, entry.path);
  await access(filePath);
  const actual = await hashFile(filePath);
  if (actual.toLowerCase() !== entry.sha256.toLowerCase()) {
    throw new Error(`Checksum mismatch for ${entry.path}`);
  }
  return filePath;
};

export const resolveAndVerifyResources = async (
  root: string,
  platform: string = process.platform,
  arch: string = process.arch,
): Promise<ResolvedResources> => {
  const manifestPath = resolveInside(root, "manifest.json");
  let manifest: ResourceManifest;
  try {
    manifest = JSON.parse(
      await readFile(manifestPath, "utf8"),
    ) as ResourceManifest;
  } catch (error) {
    throw new Error(
      `KataGo resource manifest is missing or invalid at ${manifestPath}`,
      { cause: error },
    );
  }

  const targetKey = platformKey(platform, arch);
  const platformResources = manifest.platforms[targetKey];
  if (platformResources === undefined)
    throw new Error(`No KataGo resources are configured for ${targetKey}`);

  const [binaryPath, normalModelPath, humanModelPath, configPath] =
    await Promise.all([
      verifyEntry(root, platformResources.binary),
      verifyEntry(root, platformResources.normalModel),
      verifyEntry(root, platformResources.humanModel),
      verifyEntry(root, platformResources.config),
    ]);
  await Promise.all(
    (platformResources.dependencies ?? []).map((entry) =>
      verifyEntry(root, entry),
    ),
  );

  return {
    binaryPath,
    normalModelPath,
    humanModelPath,
    configPath,
    kataGoVersion: manifest.kataGoVersion,
  };
};
