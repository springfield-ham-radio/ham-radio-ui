export interface StableReleaseCandidate {
  id: number;
  tagName: string;
  draft: boolean;
  prerelease: boolean;
}

/** Fields from `gh release list --json tagName,isDraft,isPrerelease`. */
export interface GhReleaseListItem {
  tagName: string;
  isDraft: boolean;
  isPrerelease: boolean;
}

export function releasesFromGhList(items: GhReleaseListItem[]): StableReleaseCandidate[] {
  return items.map((release) => ({
    id: 0,
    tagName: release.tagName,
    draft: release.isDraft,
    prerelease: release.isPrerelease,
  }));
}

export function parseGhReleaseList(json: string): StableReleaseCandidate[] {
  return releasesFromGhList(JSON.parse(json) as GhReleaseListItem[]);
}

interface StableVersion {
  major: number;
  minor: number;
  patch: number;
}

const STABLE_TAG = /^v?(\d+)\.(\d+)\.(\d+)$/;

/**
 * Choose which release GitHub should treat as latest.
 *
 * Returns nothing when that release is already latest, or when every release
 * is a draft, prerelease, or non-semver tag. Beta tags (`v1.2.3-beta.1`) are
 * not stable even if the prerelease flag was left off.
 */
export function stableReleaseToMarkLatest(
  releases: StableReleaseCandidate[],
  currentLatestTag: string | undefined,
): StableReleaseCandidate | undefined {
  let best: StableReleaseCandidate | undefined;
  let bestVersion: StableVersion | undefined;

  for (const release of releases) {
    if (release.draft || release.prerelease) {
      continue;
    }

    const version = parseStableVersion(release.tagName);

    if (!version) {
      continue;
    }

    if (!bestVersion || compareStableVersion(version, bestVersion) > 0) {
      best = release;
      bestVersion = version;
    }
  }

  if (!best || best.tagName === currentLatestTag) {
    return undefined;
  }

  return best;
}

function parseStableVersion(tagName: string): StableVersion | undefined {
  const match = STABLE_TAG.exec(tagName);

  if (!match) {
    return undefined;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareStableVersion(left: StableVersion, right: StableVersion): number {
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch;
}
