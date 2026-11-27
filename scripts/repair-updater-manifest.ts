import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  discoverUpdaterBundles,
  missingExpectedPlatformKeys,
  repairUpdaterManifest,
  type UpdaterAssetRef,
  type UpdaterManifest,
} from './updater-manifest.ts';

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

const workDirectory = mkdtempSync(join(tmpdir(), 'updater-manifest-'));

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

for (const { sigAsset } of discoverUpdaterBundles(assets, manifest.version)) {
  if (signaturesByName[sigAsset.name] !== undefined) {
    continue;
  }

  gh(['release', 'download', tag, '--pattern', sigAsset.name, '--clobber', '--dir', workDirectory]);
  signaturesByName[sigAsset.name] = readFileSync(join(workDirectory, sigAsset.name), 'utf8');
}

const repaired = repairUpdaterManifest(manifest, assets, signaturesByName);
const stillMissing = missingExpectedPlatformKeys(repaired.manifest, assets, manifest.version);

if (repaired.changed) {
  writeFileSync(manifestPath, `${JSON.stringify(repaired.manifest, null, 2)}\n`);
  gh(['release', 'upload', tag, manifestPath, '--clobber']);
  console.log(`Updated latest.json platforms: ${repaired.updatedPlatforms.join(', ')}`);
} else {
  console.log(`Updater entries in latest.json on ${tag} already match the release assets.`);
}

if (stillMissing.length > 0) {
  console.error(
    `latest.json on ${tag} is still missing platform keys after repair: ${stillMissing.join(', ')}`,
  );
  finish(1);
}

finish(0);