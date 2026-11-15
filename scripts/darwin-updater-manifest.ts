/**
 * Fill `latest.json` with both macOS updater entries after the release matrix.
 *
 * `tauri-action` merges `latest.json` from each job. Those writes race, and a
 * job can publish a manifest that dropped the other macOS target. The DMG and
 * updater archive names already differ (`_aarch64` vs `_x64`); this only
 * restores the `darwin-aarch64` and `darwin-x86_64` keys from those assets.
 * Linux and Windows entries already in the file are left as they are.
 */

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

const DARWIN_UPDATER_BUNDLES = [
  {
    suffix: '_aarch64.app.tar.gz',
    platforms: ['darwin-aarch64', 'darwin-aarch64-app'],
  },
  {
    suffix: '_x64.app.tar.gz',
    platforms: ['darwin-x86_64', 'darwin-x86_64-app'],
  },
] as const;

export interface DarwinUpdaterRepair {
  manifest: UpdaterManifest;
  changed: boolean;
  /** Platform keys written from a release asset during this repair. */
  updatedPlatforms: string[];
}

function signatureFor(signaturesByName: Readonly<Record<string, string>>, bundleName: string): string | undefined {
  const signature = signaturesByName[`${bundleName}.sig`];

  if (signature === undefined || signature.trim() === '') {
    return undefined;
  }

  return signature;
}

function bundleAsset(assets: readonly UpdaterAssetRef[], suffix: string): UpdaterAssetRef | undefined {
  const matches = assets.filter((asset) => asset.name.endsWith(suffix) && !asset.name.endsWith('.sig'));

  if (matches.length > 1) {
    throw new Error(
      `Multiple macOS updater bundles match ${suffix}: ${matches.map((asset) => asset.name).join(', ')}`,
    );
  }

  return matches[0];
}

export function repairDarwinUpdaterManifest(
  manifest: UpdaterManifest,
  assets: readonly UpdaterAssetRef[],
  signaturesByName: Readonly<Record<string, string>>,
): DarwinUpdaterRepair {
  const platforms: Record<string, UpdaterPlatformEntry> = { ...manifest.platforms };
  const updatedPlatforms: string[] = [];

  for (const spec of DARWIN_UPDATER_BUNDLES) {
    const bundle = bundleAsset(assets, spec.suffix);

    if (!bundle) {
      continue;
    }

    const signature = signatureFor(signaturesByName, bundle.name);

    if (!signature) {
      continue;
    }

    const entry: UpdaterPlatformEntry = { signature, url: bundle.apiUrl };

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
