import type { RadioCatalogRecord } from '~/utils/radio-catalog-db';

const MODULE_INSTALL_VERSION_PATTERN = /\/radio-modules\/[^/]+\/([^/]+)\/?$/;

/**
 * HamBench semver helpers for driver install paths (including `-beta.<n>`).
 * Registry `compareSemver` stays numeric-only for strict catalog versions.
 */

const STRICT_SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;
const BETA_VERSION_PATTERN = /^\d+\.\d+\.\d+-beta\.(\d+)$/;
const BETA_ZIP_PATTERN = /-beta\.\d+\.zip$/i;

export function isStrictSemverVersion(version: string): boolean {
  return STRICT_SEMVER_PATTERN.test(version.trim());
}

export function isBetaDriverVersion(version: string): boolean {
  return BETA_VERSION_PATTERN.test(version.trim());
}

export function isBetaZipFileName(fileName: string): boolean {
  return BETA_ZIP_PATTERN.test(fileName.trim());
}

export function isBetaDriverRecord(record: Pick<RadioCatalogRecord, 'source' | 'sourcePath' | 'version'>): boolean {
  if (record.source !== 'user') {
    return false;
  }

  if (record.sourcePath) {
    const match = record.sourcePath.replace(/\\/g, '/').match(MODULE_INSTALL_VERSION_PATTERN);

    if (match?.[1] && isBetaDriverVersion(match[1])) {
      return true;
    }
  }

  return isBetaDriverVersion(record.version);
}

interface ParsedDriverVersion {
  major: number;
  minor: number;
  patch: number;
  beta?: number;
}

function parseDriverVersion(version: string): ParsedDriverVersion | undefined {
  const trimmed = version.trim();
  const betaMatch = trimmed.match(BETA_VERSION_PATTERN);

  if (betaMatch) {
    const base = trimmed.slice(0, trimmed.indexOf('-beta.'));
    const [major, minor, patch] = base.split('.').map((part) => Number.parseInt(part, 10));

    if ([major, minor, patch].some((part) => Number.isNaN(part))) {
      return undefined;
    }

    return {
      major,
      minor,
      patch,
      beta: Number.parseInt(betaMatch[1]!, 10),
    };
  }

  if (!isStrictSemverVersion(trimmed)) {
    return undefined;
  }

  const [major, minor, patch] = trimmed.split('.').map((part) => Number.parseInt(part, 10));

  if ([major, minor, patch].some((part) => Number.isNaN(part))) {
    return undefined;
  }

  return { major, minor, patch };
}

/**
 * Compare two driver versions (strict `x.y.z` or `x.y.z-beta.n`).
 * Returns positive when `left` is newer than `right`.
 */
export function compareSemverWithPrerelease(left: string, right: string): number {
  const a = parseDriverVersion(left);
  const b = parseDriverVersion(right);

  if (!a || !b) {
    return 0;
  }

  if (a.major !== b.major) {
    return a.major - b.major;
  }

  if (a.minor !== b.minor) {
    return a.minor - b.minor;
  }

  if (a.patch !== b.patch) {
    return a.patch - b.patch;
  }

  const aBeta = a.beta;
  const bBeta = b.beta;

  if (aBeta === undefined && bBeta === undefined) {
    return 0;
  }

  if (aBeta === undefined) {
    return 1;
  }

  if (bBeta === undefined) {
    return -1;
  }

  return aBeta - bBeta;
}

function basename(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  return index < 0 ? normalized : normalized.slice(index + 1);
}

export function moduleIdFromZipName(fileName: string): string {
  const withoutExt = basename(fileName).replace(/\.zip$/i, '');
  const match = withoutExt.match(/^radio-module-(.+?)(?:-\d+\.\d+\.\d+(?:-beta\.\d+)?)?$/i);
  return match?.[1]?.toLowerCase() || withoutExt.toLowerCase() || 'local';
}

/** Full install-directory version, including `-beta.<n>` when present. */
export function versionFromZipName(fileName: string): string {
  const withoutExt = basename(fileName).replace(/\.zip$/i, '');
  const match = withoutExt.match(/(\d+\.\d+\.\d+(?:-beta\.\d+)?)$/);
  return match?.[1] || '0.0.0';
}
