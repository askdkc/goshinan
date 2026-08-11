export interface KataGoReleaseAsset {
  name?: string;
  size?: number;
  digest?: string;
  browser_download_url?: string;
}

export interface KataGoRelease {
  tag_name?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: KataGoReleaseAsset[];
}

export interface SelectedKataGoAsset {
  version: string;
  fileName: string;
  url: string;
  bytes: number;
  sha256: string;
}

export function compareVersions(left: string, right: string): number;
export function incrementPatchVersion(version: string): string;
export function findLatestWindowsEigenRelease(
  releases: KataGoRelease[],
): SelectedKataGoAsset;
