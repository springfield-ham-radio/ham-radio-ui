import { describe, expect, it } from 'vitest';
import {
  parseGhReleaseList,
  stableReleaseToMarkLatest,
  type StableReleaseCandidate,
} from '../../scripts/latest-stable-release.ts';

function release(tagName: string, overrides: Partial<StableReleaseCandidate> = {}): StableReleaseCandidate {
  return {
    id: tagName.length,
    tagName,
    draft: false,
    prerelease: false,
    ...overrides,
  };
}

describe('stable release to mark latest', () => {
  const releases = [
    release('v0.59.3', { id: 1 }),
    release('v0.60.1', { id: 2 }),
    release('v0.60.2', { id: 3 }),
    release('v0.61.0-beta.1', { id: 4, prerelease: true }),
    release('v0.62.0', { id: 5, draft: true }),
  ];

  it('should select the highest stable release when an older tag is current', () => {
    expect(stableReleaseToMarkLatest(releases, 'v0.60.1')).toEqual(release('v0.60.2', { id: 3 }));
  });

  it('should leave the pointer alone when the highest stable release is already latest', () => {
    expect(stableReleaseToMarkLatest(releases, 'v0.60.2')).toBeUndefined();
  });

  it('should ignore drafts, prereleases, and beta tags that are not flagged prerelease', () => {
    const candidates = [
      release('v0.61.0-beta.2'),
      release('v1.0.0', { draft: true }),
      release('v0.9.0', { prerelease: true }),
      release('not-a-version'),
      release('v0.60.10', { id: 10 }),
      release('v0.60.9', { id: 9 }),
    ];

    expect(stableReleaseToMarkLatest(candidates, undefined)).toEqual(release('v0.60.10', { id: 10 }));
  });

  it('should return nothing when no stable release exists', () => {
    expect(stableReleaseToMarkLatest([release('v0.1.0-beta.1', { prerelease: true })], undefined)).toBeUndefined();
  });

  it('should map gh release list JSON into stable release candidates', () => {
    const json = JSON.stringify([
      { tagName: 'v0.60.2', isDraft: false, isPrerelease: false },
      { tagName: 'v0.61.0-beta.1', isDraft: false, isPrerelease: true },
      { tagName: 'v0.62.0', isDraft: true, isPrerelease: false },
    ]);

    expect(parseGhReleaseList(json)).toEqual([
      release('v0.60.2', { id: 0 }),
      release('v0.61.0-beta.1', { id: 0, prerelease: true }),
      release('v0.62.0', { id: 0, draft: true }),
    ]);
  });
});
