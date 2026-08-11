#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import {
  access,
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createReadStream, createWriteStream, constants } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");
const resourceRoot = path.join(projectRoot, "resources", "katago");
const cacheRoot = path.join(projectRoot, ".cache", "katago");
const manifestPath = path.join(resourceRoot, "manifest.json");
const sourcesPath = path.join(resourceRoot, "sources.json");
const supportedTargets = new Set(["darwin-arm64", "darwin-x64", "win32-x64"]);

const usage = `Usage:
  npm run resources:fetch -- --platform=darwin --arch=arm64
  npm run resources:fetch -- --platform=darwin --arch=x64
  npm run resources:fetch -- --platform=win32 --arch=x64

Options:
  --platform <darwin|win32>  Target operating system (default: current host)
  --arch <arm64|x64>         Target CPU (default: current host)
  --katago-binary <path>     macOS KataGo executable to bundle
  --help                     Show this help

macOS does not have an official precompiled KataGo release asset. Install it
with "brew install katago", or pass --katago-binary. The command copies the
binary and its non-system dynamic libraries; it never installs Homebrew itself.`;

const parseArguments = (arguments_) => {
  const options = {
    platform: process.platform,
    arch: process.arch,
    katagoBinary: process.env.KATAGO_BINARY,
    help: false,
  };
  const takeValue = (index, name) => {
    const value = arguments_[index + 1];
    if (value === undefined || value.startsWith("--"))
      throw new Error(`${name} requires a value`);
    return value;
  };

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (argument.startsWith("--platform=")) {
      options.platform = argument.slice("--platform=".length);
    } else if (argument === "--platform") {
      options.platform = takeValue(index, argument);
      index += 1;
    } else if (argument.startsWith("--arch=")) {
      options.arch = argument.slice("--arch=".length);
    } else if (argument === "--arch") {
      options.arch = takeValue(index, argument);
      index += 1;
    } else if (argument.startsWith("--katago-binary=")) {
      options.katagoBinary = argument.slice("--katago-binary=".length);
    } else if (argument === "--katago-binary") {
      options.katagoBinary = takeValue(index, argument);
      index += 1;
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }
  return options;
};

const sha256 = async (filePath) =>
  new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });

const verifyFile = async (filePath, expectedHash, expectedBytes) => {
  try {
    const metadata = await stat(filePath);
    if (expectedBytes !== undefined && metadata.size !== expectedBytes)
      return false;
    return (await sha256(filePath)) === expectedHash.toLowerCase();
  } catch {
    return false;
  }
};

const download = async (asset) => {
  await mkdir(cacheRoot, { recursive: true });
  const destination = path.join(cacheRoot, asset.sourceName ?? asset.fileName);
  if (await verifyFile(destination, asset.sha256, asset.bytes)) {
    console.log(
      `Using verified cache: ${path.relative(projectRoot, destination)}`,
    );
    return destination;
  }

  await rm(destination, { force: true });
  const partial = `${destination}.${process.pid}.part`;
  await rm(partial, { force: true });
  console.log(`Downloading: ${asset.url}`);
  try {
    const response = await fetch(asset.url, {
      redirect: "follow",
      signal: AbortSignal.timeout(15 * 60 * 1000),
      headers: { "User-Agent": "Go-Shinan-resource-fetcher/0.1" },
    });
    if (!response.ok || response.body === null)
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    const contentLength = response.headers.get("content-length");
    if (contentLength !== null && Number(contentLength) !== asset.bytes) {
      throw new Error(
        `Unexpected Content-Length for ${asset.sourceName ?? asset.fileName}: ${contentLength}`,
      );
    }
    await pipeline(
      Readable.fromWeb(response.body),
      createWriteStream(partial, { flags: "wx" }),
    );
    if (!(await verifyFile(partial, asset.sha256, asset.bytes)))
      throw new Error(
        `SHA-256 or size mismatch for ${asset.sourceName ?? asset.fileName}`,
      );
    await rename(partial, destination);
    return destination;
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
};

const installFile = async (source, destination, expectedHash, executable) => {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  await rm(temporary, { force: true });
  try {
    await copyFile(source, temporary);
    if (executable) await chmod(temporary, 0o755);
    if (expectedHash !== undefined) {
      const actual = await sha256(temporary);
      if (actual !== expectedHash)
        throw new Error(`Copied file checksum mismatch: ${destination}`);
    }
    await rm(destination, { force: true });
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
};

const commandExists = async (command) => {
  try {
    await execFileAsync(command, ["--version"], { timeout: 10_000 });
    return true;
  } catch (error) {
    return error?.code !== "ENOENT";
  }
};

const findOnPath = async (name) => {
  for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
    if (directory === "") continue;
    const candidate = path.join(directory, name);
    try {
      await access(candidate, constants.X_OK);
      return await realpath(candidate);
    } catch {
      // Keep searching PATH.
    }
  }
  return undefined;
};

const versionParts = (version) => version.split(".").map(Number);
const versionAtLeast = (actual, minimum) => {
  const left = versionParts(actual);
  const right = versionParts(minimum);
  for (let index = 0; index < 3; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return true;
};

const inspectMacBinary = async (binaryPath, targetArch, minimumVersion) => {
  await access(binaryPath, constants.X_OK);
  const [{ stdout, stderr }, architecture] = await Promise.all([
    execFileAsync(binaryPath, ["version"], {
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    }),
    execFileAsync("lipo", ["-archs", binaryPath], {
      timeout: 10_000,
    }),
  ]);
  const versionOutput = `${stdout}\n${stderr}`;
  const match = /KataGo v(\d+\.\d+\.\d+)/.exec(versionOutput);
  if (match === null)
    throw new Error(`Cannot determine KataGo version: ${binaryPath}`);
  if (!versionAtLeast(match[1], minimumVersion)) {
    throw new Error(
      `KataGo ${match[1]} is too old; version ${minimumVersion} or newer is required`,
    );
  }
  const architectures = architecture.stdout.trim().split(/\s+/);
  if (!architectures.includes(targetArch)) {
    throw new Error(
      `KataGo binary does not contain ${targetArch}; found: ${architectures.join(", ")}`,
    );
  }
  if (!/Using Metal backend/i.test(versionOutput))
    console.warn(
      "Warning: the selected macOS KataGo binary is not a Metal build.",
    );
  return match[1];
};

const readDarwinLinks = async (filePath) => {
  const { stdout } = await execFileAsync("otool", ["-L", filePath], {
    timeout: 30_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  return stdout
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(" (")[0])
    .filter(Boolean);
};

const readDarwinRpaths = async (filePath) => {
  const { stdout } = await execFileAsync("otool", ["-l", filePath], {
    timeout: 30_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const lines = stdout.split("\n");
  const rpaths = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() !== "cmd LC_RPATH") continue;
    for (
      let detail = index + 1;
      detail < Math.min(index + 5, lines.length);
      detail += 1
    ) {
      const match = /^\s*path (.+) \(offset \d+\)$/.exec(lines[detail]);
      if (match !== null) {
        rpaths.push(match[1]);
        break;
      }
    }
  }
  return rpaths;
};

const isSystemDarwinLibrary = (libraryPath) =>
  libraryPath.startsWith("/usr/lib/") ||
  libraryPath.startsWith("/System/Library/");

const expandDarwinToken = (value, loader, executable) => {
  if (value === "@loader_path") return path.dirname(loader);
  if (value.startsWith("@loader_path/"))
    return path.join(path.dirname(loader), value.slice("@loader_path/".length));
  if (value === "@executable_path") return path.dirname(executable);
  if (value.startsWith("@executable_path/"))
    return path.join(
      path.dirname(executable),
      value.slice("@executable_path/".length),
    );
  return value;
};

const resolveDarwinLink = async (link, loader, executable) => {
  if (path.isAbsolute(link)) return realpath(link);
  const expanded = expandDarwinToken(link, loader, executable);
  if (path.isAbsolute(expanded)) return realpath(expanded);
  if (!link.startsWith("@rpath/"))
    throw new Error(`Unsupported dylib reference in ${loader}: ${link}`);

  const suffix = link.slice("@rpath/".length);
  const attempted = [];
  for (const rpath of await readDarwinRpaths(loader)) {
    const expandedRpath = expandDarwinToken(rpath, loader, executable);
    if (!path.isAbsolute(expandedRpath)) continue;
    const candidate = path.join(expandedRpath, suffix);
    attempted.push(candidate);
    try {
      return await realpath(candidate);
    } catch {
      // Try the next LC_RPATH entry recorded in this Mach-O file.
    }
  }
  throw new Error(
    `Cannot resolve ${link} from ${loader}; LC_RPATH candidates: ${attempted.join(", ") || "none"}`,
  );
};

const collectDarwinLibraries = async (binaryPath) => {
  const records = new Map();
  const executable = await realpath(binaryPath);
  const queue = [executable];
  while (queue.length > 0) {
    const source = queue.shift();
    if (records.has(source)) continue;
    const links = await readDarwinLinks(source);
    const dependencies = [];
    for (const link of links) {
      if (isSystemDarwinLibrary(link)) continue;
      const resolved = await resolveDarwinLink(link, source, executable);
      if (resolved === source || isSystemDarwinLibrary(resolved)) continue;
      dependencies.push({ oldLink: link, resolved });
      if (!records.has(resolved)) queue.push(resolved);
    }
    records.set(source, dependencies);
  }
  return records;
};

const bundleMacBinary = async (
  sourceBinary,
  destination,
  targetArch,
  minimumVersion,
) => {
  const version = await inspectMacBinary(
    sourceBinary,
    targetArch,
    minimumVersion,
  );
  const sourceRoot = await realpath(sourceBinary);
  const records = await collectDarwinLibraries(sourceRoot);
  const destinationDirectory = path.dirname(destination);
  const libraryDirectory = path.join(destinationDirectory, "lib");
  await mkdir(libraryDirectory, { recursive: true });

  const destinations = new Map([[sourceRoot, destination]]);
  const names = new Map();
  for (const source of records.keys()) {
    if (source === sourceRoot) continue;
    const name = path.basename(source);
    const collision = names.get(name);
    if (collision !== undefined && collision !== source)
      throw new Error(
        `Two dylibs have the same filename: ${collision} and ${source}`,
      );
    names.set(name, source);
    destinations.set(source, path.join(libraryDirectory, name));
  }

  for (const [source, target] of destinations)
    await installFile(source, target);

  for (const [source, dependencies] of records) {
    const target = destinations.get(source);
    if (source !== sourceRoot) {
      await execFileAsync("install_name_tool", [
        "-id",
        `@loader_path/${path.basename(target)}`,
        target,
      ]);
    }
    for (const { oldLink, resolved } of dependencies) {
      const dependencyTarget = destinations.get(resolved);
      const newLink =
        source === sourceRoot
          ? `@loader_path/lib/${path.basename(dependencyTarget)}`
          : `@loader_path/${path.basename(dependencyTarget)}`;
      await execFileAsync("install_name_tool", [
        "-change",
        oldLink,
        newLink,
        target,
      ]);
    }
  }

  for (const target of [...destinations.values()].reverse()) {
    await execFileAsync("codesign", ["--force", "--sign", "-", target]);
  }
  await chmod(destination, 0o755);
  await inspectMacBinary(destination, targetArch, minimumVersion);

  const dependencies = [];
  for (const target of destinations.values()) {
    if (target === destination) continue;
    dependencies.push({
      path: path.relative(resourceRoot, target).split(path.sep).join("/"),
      sha256: await sha256(target),
    });
  }
  dependencies.sort((left, right) => left.path.localeCompare(right.path));
  return { version, dependencies };
};

const listFiles = async (root) => {
  const output = [];
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(entryPath);
      else if (entry.isFile()) output.push(entryPath);
    }
  };
  await visit(root);
  return output;
};

const extractZip = async (archive, destination) => {
  if (process.platform === "win32") {
    const escapedArchive = archive.replaceAll("'", "''");
    const escapedDestination = destination.replaceAll("'", "''");
    await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `Expand-Archive -LiteralPath '${escapedArchive}' -DestinationPath '${escapedDestination}' -Force`,
      ],
      { timeout: 120_000 },
    );
  } else {
    if (!(await commandExists("unzip")))
      throw new Error(
        "The unzip command is required to extract the Windows archive",
      );
    await execFileAsync("unzip", ["-q", archive, "-d", destination], {
      timeout: 120_000,
    });
  }
};

const bundleWindowsBinary = async (archive, destination, version) => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "goshinan-katago-"));
  try {
    await extractZip(archive, temporaryRoot);
    const extracted = await listFiles(temporaryRoot);
    const binary = extracted.find(
      (filePath) => path.basename(filePath).toLowerCase() === "katago.exe",
    );
    if (binary === undefined)
      throw new Error("katago.exe is missing from the archive");
    await installFile(binary, destination, undefined, true);

    const dependencies = [];
    const dlls = extracted.filter((filePath) =>
      path.basename(filePath).toLowerCase().endsWith(".dll"),
    );
    for (const dll of dlls) {
      const target = path.join(path.dirname(destination), path.basename(dll));
      await installFile(dll, target);
      dependencies.push({
        path: path.relative(resourceRoot, target).split(path.sep).join("/"),
        sha256: await sha256(target),
      });
    }
    dependencies.sort((left, right) => left.path.localeCompare(right.path));
    return { version, dependencies };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
};

const smokeTestEngine = async ({ binary, normalModel, humanModel, config }) => {
  console.log("Starting KataGo model smoke test...");
  const child = spawn(
    binary,
    [
      "analysis",
      "-config",
      config,
      "-model",
      normalModel,
      "-human-model",
      humanModel,
    ],
    { cwd: resourceRoot, shell: false, stdio: ["pipe", "pipe", "pipe"] },
  );
  const reader = createInterface({ input: child.stdout });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr = `${stderr}${String(chunk)}`.slice(-16_000);
  });

  const results = await new Promise((resolve, reject) => {
    const messages = new Map();
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reader.close();
      child.stdin.end();
      if (!child.killed) child.kill();
      if (error === undefined) resolve(messages);
      else reject(error);
    };
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            `KataGo model smoke test timed out${stderr === "" ? "" : `: ${stderr.trim()}`}`,
          ),
        ),
      180_000,
    );

    reader.on("line", (line) => {
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }
      if (
        (message.id !== "resource-version" &&
          message.id !== "resource-models") ||
        message.warning !== undefined
      )
        return;
      if (message.error !== undefined) {
        finish(new Error(`KataGo smoke test error: ${message.error}`));
        return;
      }
      messages.set(message.id, message);
      if (messages.size === 2) finish();
    });
    child.once("error", (error) => finish(error));
    child.once("exit", (code, signal) => {
      if (!settled)
        finish(
          new Error(
            `KataGo exited during smoke test (${code ?? signal ?? "unknown"})${stderr === "" ? "" : `: ${stderr.trim()}`}`,
          ),
        );
    });
    child.stdin.write(
      `${JSON.stringify({ id: "resource-version", action: "query_version" })}\n`,
    );
    child.stdin.write(
      `${JSON.stringify({ id: "resource-models", action: "query_models" })}\n`,
    );
  });

  const versionResult = results.get("resource-version");
  const modelResult = results.get("resource-models");
  const models = modelResult?.models ?? [];
  if (
    models.length < 2 ||
    !models.some((model) => model.usesHumanSLProfile === true) ||
    !models.some((model) => model.usesHumanSLProfile !== true)
  ) {
    throw new Error(
      "KataGo did not load both the normal model and the Human SL model",
    );
  }
  console.log(
    `Smoke test passed: KataGo ${versionResult?.version ?? "unknown"}, ${models.length} models loaded.`,
  );
};

const updateManifest = async ({
  targetKey,
  binaryResult,
  normalModel,
  humanModel,
}) => {
  const [manifestText, configHash] = await Promise.all([
    readFile(manifestPath, "utf8"),
    sha256(path.join(resourceRoot, "config", "analysis.cfg")),
  ]);
  const manifest = JSON.parse(manifestText);
  const target = manifest.platforms?.[targetKey];
  if (target === undefined)
    throw new Error(`Manifest target is missing: ${targetKey}`);
  target.binary.sha256 = await sha256(
    path.join(resourceRoot, target.binary.path),
  );
  target.dependencies = binaryResult.dependencies;
  for (const platform of Object.values(manifest.platforms)) {
    platform.normalModel.sha256 = normalModel.sha256;
    platform.humanModel.sha256 = humanModel.sha256;
    platform.config.sha256 = configHash;
  }
  manifest.kataGoVersion = binaryResult.version;
  manifest.humanModelVersion = "b18c384nbt-humanv0";
  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
};

const main = async () => {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(usage);
    return;
  }
  const targetKey = `${options.platform}-${options.arch}`;
  if (!supportedTargets.has(targetKey)) {
    throw new Error(
      `Unsupported target: ${targetKey}. Supported targets: ${[...supportedTargets].join(", ")}`,
    );
  }

  const sources = JSON.parse(await readFile(sourcesPath, "utf8"));
  const source = sources.platforms[targetKey];
  console.log(`Preparing KataGo resources for ${targetKey}`);

  let macBinary;
  if (source.kind === "homebrew") {
    if (process.platform !== "darwin") {
      throw new Error(
        "macOS KataGo resources must be prepared on macOS so Mach-O dependencies can be inspected",
      );
    }
    macBinary =
      options.katagoBinary === undefined
        ? await findOnPath("katago")
        : path.resolve(options.katagoBinary);
    if (macBinary === undefined) {
      throw new Error(
        'KataGo was not found on PATH. Run "brew install katago", then retry; or pass --katago-binary <path>.',
      );
    }
    console.log(`Found local KataGo: ${macBinary}`);
  }

  const [normalCache, humanCache] = await Promise.all([
    download(sources.normalModel),
    download(sources.humanModel),
  ]);
  const modelDirectory = path.join(resourceRoot, "models");
  await Promise.all([
    installFile(
      normalCache,
      path.join(modelDirectory, sources.normalModel.fileName),
      sources.normalModel.sha256,
    ),
    installFile(
      humanCache,
      path.join(modelDirectory, sources.humanModel.fileName),
      sources.humanModel.sha256,
    ),
  ]);

  const binaryName = options.platform === "win32" ? "katago.exe" : "katago";
  const binaryDestination = path.join(
    resourceRoot,
    "bin",
    targetKey,
    binaryName,
  );
  let binaryResult;
  if (source.kind === "archive") {
    const archive = await download(source);
    binaryResult = await bundleWindowsBinary(
      archive,
      binaryDestination,
      source.version,
    );
  } else {
    console.log(`Bundling local KataGo: ${macBinary}`);
    binaryResult = await bundleMacBinary(
      macBinary,
      binaryDestination,
      options.arch,
      source.minimumVersion,
    );
  }

  await smokeTestEngine({
    binary: binaryDestination,
    normalModel: path.join(modelDirectory, sources.normalModel.fileName),
    humanModel: path.join(modelDirectory, sources.humanModel.fileName),
    config: path.join(resourceRoot, "config", "analysis.cfg"),
  });
  await updateManifest({
    targetKey,
    binaryResult,
    normalModel: sources.normalModel,
    humanModel: sources.humanModel,
  });
  console.log(
    `KataGo ${binaryResult.version} resources are ready for ${targetKey}.`,
  );
  console.log(`Manifest updated: ${path.relative(projectRoot, manifestPath)}`);
};

if (path.resolve(process.argv[1] ?? "") === scriptPath) {
  main().catch((error) => {
    console.error(
      `resources:fetch failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}

export { parseArguments, versionAtLeast };
