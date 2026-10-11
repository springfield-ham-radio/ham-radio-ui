import { execFileSync } from 'node:child_process';
import { stableReleaseToMarkLatest, type StableReleaseCandidate } from './latest-stable-release.ts';

interface GitHubRelease {
  id: number;
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
}

const repository = process.env.GITHUB_REPOSITORY?.trim();

if (!repository) {
  throw new Error('Set GITHUB_REPOSITORY to owner/name');
}

function gh(args: string[]): string {
  return execFileSync('gh', args, { encoding: 'utf8' });
}

function listReleases(): StableReleaseCandidate[] {
  // `--slurp` wraps every page, including a single page, in an outer array.
  const raw = gh(['api', '--paginate', '--slurp', `repos/${repository}/releases?per_page=100`]);
  const pages = JSON.parse(raw) as GitHubRelease[][];

  return pages.flat().map((release) => ({
    id: release.id,
    tagName: release.tag_name,
    draft: release.draft,
    prerelease: release.prerelease,
  }));
}

function currentLatestTag(): string | undefined {
  try {
    const raw = gh(['api', `repos/${repository}/releases/latest`]);
    const parsed = JSON.parse(raw) as { tag_name?: string };

    return parsed.tag_name;
  } catch (error) {
    if (isNotFound(error)) {
      return undefined;
    }

    throw error;
  }
}

function isNotFound(error: unknown): boolean {
  const stderr = typeof error === 'object' && error !== null && 'stderr' in error ? String(error.stderr) : '';
  const message = error instanceof Error ? error.message : '';

  return stderr.includes('404') || message.includes('404');
}

const target = stableReleaseToMarkLatest(listReleases(), currentLatestTag());

if (!target) {
  console.log('Newest stable release is already marked latest');
} else {
  gh([
    'api',
    '--method',
    'PATCH',
    `repos/${repository}/releases/${target.id}`,
    '--raw-field',
    'make_latest=true',
  ]);
  console.log(`Marked ${target.tagName} as the latest release`);
}
