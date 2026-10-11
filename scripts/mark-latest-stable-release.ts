import { execFileSync } from 'node:child_process';
import {
  parseGhReleaseList,
  stableReleaseToMarkLatest,
} from './latest-stable-release.ts';

const GH_MAX_BUFFER = 10 * 1024 * 1024;

const repository = process.env.GITHUB_REPOSITORY?.trim();

if (!repository) {
  throw new Error('Set GITHUB_REPOSITORY to owner/name');
}

function gh(args: string[]): string {
  return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: GH_MAX_BUFFER });
}

function listReleases() {
  const raw = gh([
    'release',
    'list',
    '--json',
    'tagName,isDraft,isPrerelease',
    '--limit',
    '100',
    '-R',
    repository,
  ]);

  return parseGhReleaseList(raw);
}

function currentLatestTag(): string | undefined {
  const raw = gh([
    'release',
    'list',
    '--json',
    'tagName,isLatest',
    '--limit',
    '100',
    '-R',
    repository,
  ]);
  const releases = JSON.parse(raw) as Array<{ tagName: string; isLatest: boolean }>;

  return releases.find((release) => release.isLatest)?.tagName;
}

const target = stableReleaseToMarkLatest(listReleases(), currentLatestTag());

if (!target) {
  console.log('Newest stable release is already marked latest');
} else {
  gh(['release', 'edit', target.tagName, '--latest', '-R', repository]);
  console.log(`Marked ${target.tagName} as the latest release`);
}
