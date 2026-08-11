import { describe, expect, it } from "vitest";
import {
  compareVersions,
  findLatestWindowsEigenRelease,
  incrementPatchVersion,
} from "../scripts/check-katago-update.mjs";

const asset = (version: string, digest = "a".repeat(64)) => ({
  name: `katago-v${version}-eigenavx2-windows-x64.zip`,
  size: 5_000_000,
  digest: `sha256:${digest}`,
  browser_download_url: `https://github.com/lightvector/KataGo/releases/download/v${version}/katago-v${version}-eigenavx2-windows-x64.zip`,
});

describe("weekly KataGo update selection", () => {
  it("selects the highest stable version that actually has the target backend", () => {
    const selected = findLatestWindowsEigenRelease([
      {
        tag_name: "v1.18.0",
        draft: false,
        prerelease: false,
        assets: [{ name: "katago-v1.18.0-trt-windows-x64.zip" }],
      },
      {
        tag_name: "v1.19.0",
        draft: false,
        prerelease: true,
        assets: [asset("1.19.0")],
      },
      {
        tag_name: "v1.17.1",
        draft: false,
        prerelease: false,
        assets: [asset("1.17.1")],
      },
      {
        tag_name: "v1.16.5",
        draft: false,
        prerelease: false,
        assets: [asset("1.16.5", "missing")],
      },
    ]);

    expect(selected).toMatchObject({
      version: "1.17.1",
      sha256: "a".repeat(64),
      bytes: 5_000_000,
    });
  });

  it("rejects an asset without a GitHub-provided SHA-256 digest", () => {
    expect(() =>
      findLatestWindowsEigenRelease([
        {
          tag_name: "v1.18.0",
          draft: false,
          prerelease: false,
          assets: [asset("1.18.0", "missing")],
        },
      ]),
    ).toThrow(/SHA-256 digest/);
  });

  it("compares engine versions and increments only the app patch version", () => {
    expect(compareVersions("1.18.0", "1.17.9")).toBe(1);
    expect(compareVersions("1.17.1", "1.17.1")).toBe(0);
    expect(compareVersions("1.16.9", "1.17.0")).toBe(-1);
    expect(incrementPatchVersion("0.1.9")).toBe("0.1.10");
  });
});
