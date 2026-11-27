/**
 * Repair `latest.json` platform entries from release assets after `tauri-action`
 * merge races.
 *
 * Parallel matrix jobs each merge `latest.json`; a late writer can drop keys another
 * job added. This module rebuilds entries for every platform whose installer (or
 * updater archive) and matching `.sig` are present on the release.
 */

import { releaseInstallerDownloadName } from './release-installer-names.ts';

export interface UpdaterAssetRef {
  name: string;
  /** GitHub API asset URL, the form `latest.json` already stores. */
  apiUrl: string;
}

export interface UpdaterPlatformEntry {
  signature: string;
  url: string;
}

export interface UpdaterManifest {
  version: string;
  notes: string;
  pub_date: string;
  platforms: Record<string, UpdaterPlatformEntry>;
}

export interface UpdaterRepair {
  manifest: UpdaterManifest;
  changed: boolean;
  /** Platform keys written or corrected during this repair. */
  updatedPlatforms: string[];
}

interface UpdaterBundleSpec {
  /** Match exactly one signature asset on the release. */
  sigPattern: RegExp;
  /** Tauri-generated installer / updater filename (no `.sig`). */
  tauriBundleName: (sigAssetName: string) => string;
  platforms: readonly string[];
}

const UPDATER_BUNDLE_SPECS: readonly UpdaterBundleSpec[] = [
  {
    sigPattern: /_aarch64\.app\.tar\.gz\.sig$/,
    tauriBundleName: (sig) => sig.replace(/\.sig$/, ''),
    platforms: ['darwin-aarch64', 'darwin-aarch64-app'],
  },
  {
    sigPattern: /_x64\.app\.tar\.gz\.sig$/,
    tauriBundleName: (sig) => sig.replace(/\.sig$/, ''),
    platforms: ['darwin-x86_64', 'darwin-x86_64-app'],
  },
  {
    sigPattern: /_amd64\.AppImage\.sig$/i,
    tauriBundleName: (sig) => sig.replace(/\.sig$/, ''),
    platforms: ['linux-x86_64', 'linux-x86_64-appimage'],
  },
  {
    sigPattern: /_amd64\.deb\.sig$/i,
    tauriBundleName: (sig) => sig.replace(/\.sig$/, ''),
    platforms: ['linux-x86_64-deb'],
  },
  {
    sigPattern: /\.x86_64\.rpm\.sig$/i,
    tauriBundleName: (sig) => sig.replace(/\.sig$/, ''),
    platforms: ['linux-x86_64-rpm'],
  },
  {
    sigPattern: /_aarch64\.AppImage\.sig$/i,
    tauriBundleName: (sig) => sig.replace(/\.sig$/, ''),
    platforms: ['linux-aarch64', 'linux-aarch64-appimage'],
  },
  {
    sigPattern: /_arm64\.deb\.sig$/i,
    tauriBundleName: (sig) => sig.replace(/\.sig$/, ''),
    platforms: ['linux-aarch64-deb'],
  },
  {
    sigPattern: /\.aarch64\.rpm\.sig$/i,
    tauriBundleName: (sig) => sig.replace(/\.sig$/, ''),
    platforms: ['linux-aarch64-rpm'],
  },
  {
    sigPattern: /_x64_en-US\.msi\.sig$/i,
    tauriBundleName: (sig) => sig.replace(/\.sig$/, ''),
    platforms: ['windows-x86_64', 'windows-x86_64-msi'],
  },
  {
    sigPattern: /_x64-setup\.exe\.sig$/i,
    tauriBundleName: (sig) => sig.replace(/\.sig$/, ''),
    platforms: ['windows-x86_64-nsis'],
  },
] as const;

function signatureFor(signaturesByName: Readonly<Record<string, string>>, sigName: string): string | undefined {
  const signature = signaturesByName[sigName];

  if (signature === undefined || signature.trim() === '') {
    return undefined;
  }

  return signature;
}

function findSigAsset(assets: readonly UpdaterAssetRef[], pattern: RegExp): UpdaterAssetRef | undefined {
  const matches = assets.filter((asset) => pattern.test(asset.name));

  if (matches.length > 1) {
    throw new Error(
      `Multiple signature assets match ${pattern}: ${matches.map((asset) => asset.name).join(', ')}`,
    );
  }

  return matches[0];
}

function resolveBundleAsset(
  tauriBundleName: string,
  assets: readonly UpdaterAssetRef[],
  version: string,
): UpdaterAssetRef | undefined {
  const direct = assets.find((asset) => asset.name === tauriBundleName);

  if (direct) {
    return direct;
  }

  const downloadName = releaseInstallerDownloadName(tauriBundleName, version);

  if (downloadName) {
    const renamed = assets.find((asset) => asset.name === downloadName);

    if (renamed) {
      return renamed;
    }
  }

  return undefined;
}

export interface UpdaterBundleMatch {
  spec: UpdaterBundleSpec;
  sigAsset: UpdaterAssetRef;
  bundleAsset: UpdaterAssetRef;
}

/** Bundles on the release that have both a `.sig` asset and the installable payload. */
export function discoverUpdaterBundles(assets: readonly UpdaterAssetRef[], version: string): UpdaterBundleMatch[] {
  const matches: UpdaterBundleMatch[] = [];

  for (const spec of UPDATER_BUNDLE_SPECS) {
    const sigAsset = findSigAsset(assets, spec.sigPattern);

    if (!sigAsset) {
      continue;
    }

    const tauriName = spec.tauriBundleName(sigAsset.name);
    const bundleAsset = resolveBundleAsset(tauriName, assets, version);

    if (!bundleAsset) {
      continue;
    }

    matches.push({ spec, sigAsset, bundleAsset });
  }

  return matches;
}

export function expectedPlatformKeys(assets: readonly UpdaterAssetRef[], version: string): string[] {
  const keys = discoverUpdaterBundles(assets, version).flatMap((match) => match.spec.platforms);

  return [...new Set(keys)];
}

export function missingExpectedPlatformKeys(manifest: UpdaterManifest, assets: readonly UpdaterAssetRef[], version: string): string[] {
  return expectedPlatformKeys(assets, version).filter((key) => {
    const entry = manifest.platforms[key];

    return !entry?.signature?.trim() || !entry?.url?.trim();
  });
}

export function repairUpdaterManifest(
  manifest: UpdaterManifest,
  assets: readonly UpdaterAssetRef[],
  signaturesByName: Readonly<Record<string, string>>,
): UpdaterRepair {
  const platforms: Record<string, UpdaterPlatformEntry> = { ...manifest.platforms };
  const updatedPlatforms: string[] = [];
  const version = manifest.version;

  for (const { spec, sigAsset, bundleAsset } of discoverUpdaterBundles(assets, version)) {
    const signature = signatureFor(signaturesByName, sigAsset.name);

    if (!signature) {
      continue;
    }

    const entry: UpdaterPlatformEntry = { signature, url: bundleAsset.apiUrl };

    for (const platform of spec.platforms) {
      const current = platforms[platform];

      if (current?.signature === entry.signature && current.url === entry.url) {
        continue;
      }

      platforms[platform] = entry;
      updatedPlatforms.push(platform);
    }
  }

  return {
    manifest: { ...manifest, platforms },
    changed: updatedPlatforms.length > 0,
    updatedPlatforms,
  };
}
