import { execFileSync } from 'node:child_process';
import { releaseInstallerDownloadName } from './release-installer-names.ts';

interface ReleaseAsset {
  name: string;
  apiUrl: string;
}

const tag = process.env.RELEASE_TAG?.trim();
const repository = process.env.GITHUB_REPOSITORY?.trim();

if (!tag) {
  throw new Error('Set RELEASE_TAG to the release tag, for example v0.36.0');
}

const version = tag.replace(/^v/, '');
const repoArgs = repository ? ['--repo', repository] : [];

function gh(args: string[]): string {
  return execFileSync('gh', [...args, ...repoArgs], { encoding: 'utf8' });
}

function listAssets(): ReleaseAsset[] {
  const raw = gh(['release', 'view', tag, '--json', 'assets']);
  const parsed = JSON.parse(raw) as { assets: ReleaseAsset[] };

  return parsed.assets;
}

function assetId(apiUrl: string): string {
  const id = apiUrl.split('/').pop() ?? '';

  if (!/^\d+$/.test(id)) {
    throw new Error(`Release asset URL has no numeric id: ${apiUrl}`);
  }

  return id;
}

function repositoryName(): string {
  if (repository) {
    return repository;
  }

  const raw = execFileSync('gh', ['repo', 'view', '--json', 'nameWithOwner'], { encoding: 'utf8' });
  const parsed = JSON.parse(raw) as { nameWithOwner: string };

  return parsed.nameWithOwner;
}

const planned = listAssets().flatMap((asset) => {
  const downloadName = releaseInstallerDownloadName(asset.name, version);

  if (!downloadName || downloadName === asset.name) {
    return [];
  }

  return [{ asset, downloadName }];
});

if (planned.length === 0) {
  console.log(`No installer names to change on ${tag}`);
  process.exit(0);
}

const repo = repositoryName();

for (const { asset, downloadName } of planned) {
  execFileSync(
    'gh',
    [
      'api',
      '--method',
      'PATCH',
      `repos/${repo}/releases/assets/${assetId(asset.apiUrl)}`,
      '-f',
      `name=${downloadName}`,
      '-f',
      `label=${downloadName}`,
    ],
    { encoding: 'utf8' },
  );
  console.log(`${asset.name} -> ${downloadName}`);
}
