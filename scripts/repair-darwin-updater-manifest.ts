import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repairDarwinUpdaterManifest, type UpdaterAssetRef, type UpdaterManifest } from './darwin-updater-manifest.ts';

const releaseTag = process.env.RELEASE_TAG?.trim();
const repository = process.env.GITHUB_REPOSITORY?.trim();

if (!releaseTag) {
  throw new Error('Set RELEASE_TAG to the release tag, for example v0.36.0');
}

const tag: string = releaseTag;

const repoArgs = repository ? ['--repo', repository] : [];

function gh(args: string[]): string {
  return execFileSync('gh', [...args, ...repoArgs], { encoding: 'utf8' });
}

function commandText(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const stderr = 'stderr' in error ? String((error as Error & { stderr?: unknown }).stderr ?? '') : '';

  return `${error.message}\n${stderr}`;
}

function listAssets(): UpdaterAssetRef[] {
  const raw = gh(['release', 'view', tag, '--json', 'assets']);
  const parsed = JSON.parse(raw) as { assets: UpdaterAssetRef[] };

  return parsed.assets;
}

const workDirectory = mkdtempSync(join(tmpdir(), 'darwin-updater-'));

function finish(status: number): never {
  rmSync(workDirectory, { recursive: true, force: true });
  process.exit(status);
}

let latestJsonPresent = true;

try {
  gh(['release', 'download', tag, '--pattern', 'latest.json', '--dir', workDirectory]);
} catch (error) {
  if (commandText(error).includes('no assets match')) {
    latestJsonPresent = false;
  } else {
    rmSync(workDirectory, { recursive: true, force: true });
    throw error;
  }
}

if (!latestJsonPresent) {
  console.log(`No latest.json on ${tag}; updater metadata was not changed.`);
  finish(0);
}

const manifestPath = join(workDirectory, 'latest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as UpdaterManifest;

if (!manifest.platforms || typeof manifest.platforms !== 'object') {
  rmSync(workDirectory, { recursive: true, force: true });
  throw new Error(`latest.json on ${tag} has no platforms object`);
}

const assets = listAssets();
const signaturesByName: Record<string, string> = {};

for (const asset of assets) {
  if (!asset.name.endsWith('_aarch64.app.tar.gz.sig') && !asset.name.endsWith('_x64.app.tar.gz.sig')) {
    continue;
  }

  gh(['release', 'download', tag, '--pattern', asset.name, '--clobber', '--dir', workDirectory]);
  signaturesByName[asset.name] = readFileSync(join(workDirectory, asset.name), 'utf8');
}

const repaired = repairDarwinUpdaterManifest(manifest, assets, signaturesByName);

if (!repaired.changed) {
  console.log(`macOS updater entries in latest.json on ${tag} already match the release assets.`);
  finish(0);
}

writeFileSync(manifestPath, `${JSON.stringify(repaired.manifest, null, 2)}\n`);
gh(['release', 'upload', tag, manifestPath, '--clobber']);
console.log(`Updated latest.json platforms: ${repaired.updatedPlatforms.join(', ')}`);
finish(0);
