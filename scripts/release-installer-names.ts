const PRODUCT_NAME = 'HamBench';

const ALREADY_LABELED = /^HamBench-[\d.]+-(?:macOS|Linux|Windows)-/;

/**
 * Filename for a release asset a person downloads.
 *
 * Updater payloads (`.sig`, `.tar.gz`, `latest.json`) stay as Tauri named them.
 * An already labeled installer is left alone. A later publish of the same tag
 * replaces that file instead of trying to rename onto it.
 */
export interface ReleaseAssetRef {
  name: string;
  apiUrl: string;
}

export interface ReleaseInstallerRename {
  asset: ReleaseAssetRef;
  downloadName: string;
  /** Previous asset already using `downloadName`, from an earlier publish of this tag. */
  replace?: ReleaseAssetRef;
}

/**
 * Installers to rename on a release. A second publish of the same tag uploads
 * Tauri's original filenames beside the names from the first publish; those
 * earlier files are replaced.
 */
export function releaseInstallerRenames(assets: ReleaseAssetRef[], version: string): ReleaseInstallerRename[] {
  const byName = new Map(assets.map((asset) => [asset.name, asset]));

  return assets.flatMap((asset) => {
    const downloadName = releaseInstallerDownloadName(asset.name, version);

    if (!downloadName || downloadName === asset.name) {
      return [];
    }

    const occupant = byName.get(downloadName);
    const replace = occupant && occupant.apiUrl !== asset.apiUrl ? occupant : undefined;

    return [{ asset, downloadName, replace }];
  });
}

export function releaseInstallerDownloadName(filename: string, version: string): string | undefined {
  const base = filename.split(/[/\\]/).pop() ?? filename;

  if (ALREADY_LABELED.test(base) || base === 'latest.json' || base.endsWith('.sig') || base.endsWith('.tar.gz')) {
    return undefined;
  }

  const lower = base.toLowerCase();

  if (lower.endsWith('.dmg')) {
    return labeled(version, 'macOS', macArch(base), 'dmg');
  }

  if (lower.endsWith('.deb')) {
    return labeled(version, 'Linux', otherArch(base), 'deb');
  }

  if (lower.endsWith('.rpm')) {
    return labeled(version, 'Linux', otherArch(base), 'rpm');
  }

  if (lower.endsWith('.appimage')) {
    return labeled(version, 'Linux', otherArch(base), 'AppImage');
  }

  if (lower.endsWith('.msi')) {
    return labeled(version, 'Windows', otherArch(base), 'msi');
  }

  if (lower.endsWith('-setup.exe')) {
    return labeled(version, 'Windows', otherArch(base), 'exe');
  }

  return undefined;
}

function labeled(version: string, platform: string, arch: string | undefined, extension: string): string {
  const archPart = arch ? `-${arch}` : '';

  return `${PRODUCT_NAME}-${version}-${platform}${archPart}.${extension}`;
}

function macArch(filename: string): string | undefined {
  if (/aarch64|arm64/i.test(filename)) {
    return 'Apple-Silicon';
  }

  if (/x86_64|amd64|x64/i.test(filename)) {
    return 'Intel';
  }

  if (/universal/i.test(filename)) {
    return 'Universal';
  }

  return undefined;
}

function otherArch(filename: string): string | undefined {
  if (/aarch64|arm64/i.test(filename)) {
    return 'arm64';
  }

  if (/x86_64|amd64|x64/i.test(filename)) {
    return 'x64';
  }

  return undefined;
}
