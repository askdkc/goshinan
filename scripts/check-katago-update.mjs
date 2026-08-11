#!/usr/bin/env node

import { appendFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");
const sourcesPath = path.join(
  projectRoot,
  "resources",
  "katago",
  "sources.json",
);
const packagePath = path.join(projectRoot, "package.json");
const lockPath = path.join(projectRoot, "package-lock.json");
const noticePath = path.join(
  projectRoot,
  "THIRD_PARTY_NOTICES",
  "KATAGO_WINDOWS.md",
);
const releasesUrl =
  "https://api.github.com/repos/lightvector/KataGo/releases?per_page=50";

const versionPattern = /^(\d+)\.(\d+)\.(\d+)$/;

export const compareVersions = (left, right) => {
  const leftMatch = versionPattern.exec(left);
  const rightMatch = versionPattern.exec(right);
  if (leftMatch === null || rightMatch === null)
    throw new Error(`Invalid semantic version comparison: ${left}, ${right}`);
  for (let index = 1; index <= 3; index += 1) {
    const difference = Number(leftMatch[index]) - Number(rightMatch[index]);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
};

export const incrementPatchVersion = (version) => {
  const match = versionPattern.exec(version);
  if (match === null)
    throw new Error(`Cannot increment app version: ${version}`);
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
};

const validatedAsset = (release, version) => {
  const expectedName = `katago-v${version}-eigenavx2-windows-x64.zip`;
  const asset = release.assets?.find(
    (candidate) => candidate.name === expectedName,
  );
  if (asset === undefined) return undefined;
  const digest = /^sha256:([a-f0-9]{64})$/i.exec(asset.digest ?? "");
  if (digest === null)
    throw new Error(
      `GitHub did not provide a SHA-256 digest for ${expectedName}`,
    );
  if (!Number.isSafeInteger(asset.size) || asset.size <= 0)
    throw new Error(`GitHub reported an invalid size for ${expectedName}`);
  const expectedUrl = `https://github.com/lightvector/KataGo/releases/download/v${version}/${expectedName}`;
  if (asset.browser_download_url !== expectedUrl)
    throw new Error(`Unexpected download URL for ${expectedName}`);
  return {
    version,
    fileName: expectedName,
    url: expectedUrl,
    bytes: asset.size,
    sha256: digest[1].toLowerCase(),
  };
};

export const findLatestWindowsEigenRelease = (releases) => {
  const candidates = [];
  for (const release of releases) {
    if (release.draft === true || release.prerelease === true) continue;
    const tagMatch = /^v(\d+\.\d+\.\d+)$/.exec(release.tag_name ?? "");
    if (tagMatch === null) continue;
    const expectedName = `katago-v${tagMatch[1]}-eigenavx2-windows-x64.zip`;
    if (release.assets?.some((asset) => asset.name === expectedName))
      candidates.push({ release, version: tagMatch[1] });
  }
  candidates.sort((left, right) =>
    compareVersions(right.version, left.version),
  );
  if (candidates.length === 0)
    throw new Error(
      "No stable KataGo release contains a Windows Eigen AVX2 asset",
    );
  return validatedAsset(candidates[0].release, candidates[0].version);
};

const githubHeaders = () => ({
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "Go-Shinan-KataGo-updater/0.1",
  ...(process.env.GITHUB_TOKEN === undefined
    ? {}
    : { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }),
});

const fetchJson = async (url) => {
  const response = await fetch(url, {
    headers: githubHeaders(),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok)
    throw new Error(
      `GitHub API request failed: HTTP ${response.status} ${url}`,
    );
  return response.json();
};

const releaseExists = async (repository, tag) => {
  if (repository === undefined) return false;
  if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(repository))
    throw new Error(`Invalid GITHUB_REPOSITORY value: ${repository}`);
  const releases = await fetchJson(
    `https://api.github.com/repos/${repository}/releases?per_page=100`,
  );
  return releases.some((release) => release.tag_name === tag);
};

const writeJson = async (filePath, value) =>
  writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");

const renderNotice = (asset) => `# Bundled KataGo Windows payload

This file is generated from \`resources/katago/sources.json\`. Do not edit it
independently of that source definition.

- Version: ${asset.version}
- Backend: Eigen AVX2 CPU, Windows x64
- Archive: \`${asset.fileName}\`
- Source:
  <${asset.url}>
- Bytes: ${asset.bytes}
- SHA-256: \`${asset.sha256}\`
`;

const applyUpdate = async (sources, packageJson, packageLock, asset) => {
  const windowsSource = sources.platforms?.["win32-x64"];
  if (windowsSource?.kind !== "archive")
    throw new Error(
      "sources.json does not contain a Windows archive definition",
    );
  Object.assign(windowsSource, asset);

  const nextAppVersion = incrementPatchVersion(packageJson.version);
  packageJson.version = nextAppVersion;
  packageLock.version = nextAppVersion;
  if (packageLock.packages?.[""] === undefined)
    throw new Error("package-lock.json does not contain the root package");
  packageLock.packages[""].version = nextAppVersion;

  await Promise.all([
    writeJson(sourcesPath, sources),
    writeJson(packagePath, packageJson),
    writeJson(lockPath, packageLock),
    writeFile(noticePath, renderNotice(asset), "utf8"),
  ]);
  return nextAppVersion;
};

const setOutputs = async (outputs) => {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath === undefined) return;
  const text = Object.entries(outputs)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  await appendFile(outputPath, `${text}\n`, "utf8");
};

const main = async () => {
  const apply = process.argv.slice(2).includes("--apply");
  const [sources, packageJson, packageLock, releases] = await Promise.all([
    readFile(sourcesPath, "utf8").then(JSON.parse),
    readFile(packagePath, "utf8").then(JSON.parse),
    readFile(lockPath, "utf8").then(JSON.parse),
    fetchJson(releasesUrl),
  ]);
  const currentVersion = sources.platforms?.["win32-x64"]?.version;
  if (typeof currentVersion !== "string")
    throw new Error(
      "Current Windows KataGo version is missing from sources.json",
    );
  const latest = findLatestWindowsEigenRelease(releases);
  const comparison = compareVersions(latest.version, currentVersion);
  const updated = comparison > 0;
  let appVersion = packageJson.version;

  if (updated) {
    const nextVersion = incrementPatchVersion(appVersion);
    console.log(
      `KataGo update found: ${currentVersion} -> ${latest.version}; app ${appVersion} -> ${nextVersion}`,
    );
    if (apply)
      appVersion = await applyUpdate(sources, packageJson, packageLock, latest);
    else appVersion = nextVersion;
  } else {
    console.log(
      `KataGo ${currentVersion} is the latest eligible stable version.`,
    );
  }

  const tag = `v${appVersion}`;
  const existingRelease = await releaseExists(
    process.env.GITHUB_REPOSITORY,
    tag,
  );
  const releaseNeeded = updated || !existingRelease;
  await setOutputs({
    updated,
    release_needed: releaseNeeded,
    current_katago_version: currentVersion,
    katago_version: latest.version,
    app_version: appVersion,
    tag,
  });
  console.log(
    releaseNeeded
      ? `Draft release ${tag} must be built.`
      : `Release ${tag} already exists; no work is needed.`,
  );
};

if (path.resolve(process.argv[1] ?? "") === scriptPath) {
  main().catch((error) => {
    console.error(
      `KataGo update check failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
