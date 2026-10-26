import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { parseModuleCatalog } from '@springfield/ham-radio-registry';
import {
  applyCatalogTrustFields,
  communityBadgeLabel,
  driverTrustBadges,
  readCatalogDriverTrust,
} from '../../app/utils/driver-trust-badge.ts';
import { fetchOfficialModuleCatalog } from '../../app/utils/radio-module-install.ts';

const BETA_INSTALL_PATH =
  '/Users/me/Library/Application Support/com.springfield.ham-radio/radio-modules/kenwood-th-d74/1.11.1-beta.1';

function catalogModule(id: string, version: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    package: `@springfield/radio-module-${id}`,
    manufacturer: 'Kenwood',
    name: 'Kenwood TH-D74',
    version,
    config: `configs/${id}.json`,
    minApiVersion: '18.0.1',
    downloadUrl: `https://github.com/springfield-ham-radio/radio-module-kenwood/releases/download/v${version}/radio-module-${id}-${version}.zip`,
    integrity: 'sha256:a7d4006eea12b6a25b74dc47e26999ad6ca4ed41f5c91c4d36411028094acac1',
    ...extra,
  };
}

describe('driver trust badges', () => {
  it('should treat a missing or unknown tier as official', () => {
    expect(readCatalogDriverTrust({ id: 'baofeng-uv5r' })).toEqual({ tier: 'official' });
    expect(readCatalogDriverTrust({ tier: 'official' }).tier).toBe('official');
    expect(readCatalogDriverTrust({ tier: 'experimental' }).tier).toBe('official');
    expect(readCatalogDriverTrust(null).tier).toBe('official');
    expect(driverTrustBadges({ catalogEntry: { id: 'baofeng-uv5r' } }).map((badge) => badge.label)).toEqual([
      'Official',
    ]);
  });

  it('should label a community driver with its publisher', () => {
    expect(communityBadgeLabel('Ada Lovelace')).toBe('Community, by Ada Lovelace');

    const badges = driverTrustBadges({
      catalogEntry: { tier: 'community', publisher: '  Ada Lovelace  ' },
    });

    expect(badges).toEqual([
      { kind: 'community', label: 'Community, by Ada Lovelace', color: 'primary' },
    ]);
    expect(
      driverTrustBadges({
        record: { source: 'installed' },
        catalogEntry: { tier: 'community', publisher: 'Ada Lovelace' },
      }).map((badge) => badge.label),
    ).toEqual(['Community, by Ada Lovelace']);
  });

  it('should omit the by-line when a community publisher is missing', () => {
    expect(driverTrustBadges({ catalogEntry: { tier: 'community', publisher: '   ' } })[0]?.label).toBe(
      'Community',
    );
  });

  it('should add a Deprecated badge whose tooltip is the reason and date', () => {
    const badges = driverTrustBadges({
      catalogEntry: {
        tier: 'community',
        publisher: 'North County ARC',
        deprecated: { reason: 'No maintainer response', date: '2026-10-01' },
      },
    });

    expect(badges.map((badge) => badge.label)).toEqual(['Community, by North County ARC', 'Deprecated']);
    expect(badges[1]).toMatchObject({
      kind: 'deprecated',
      color: 'error',
      tooltip: 'No maintainer response (2026-10-01)',
    });
  });

  it('should require deprecated to be a reason plus a calendar date', () => {
    expect(
      readCatalogDriverTrust({
        deprecated: { reason: 'No maintainer response', date: '2026-10-26' },
      }).deprecated,
    ).toEqual({ reason: 'No maintainer response', date: '2026-10-26' });
    expect(
      readCatalogDriverTrust({
        deprecated: { reason: 'Leap day', date: '2024-02-29' },
      }).deprecated?.date,
    ).toBe('2024-02-29');

    for (const deprecated of [
      true,
      false,
      'Broken on the current API',
      { reason: 'No maintainer response' },
      { date: '2026-10-26' },
      { reason: '   ', date: '2026-10-26' },
      { reason: 'No maintainer response', date: '2026-02-31' },
      { reason: 'No maintainer response', date: '2026-02-29' },
      { reason: 'No maintainer response', date: '10/26/2026' },
    ]) {
      expect(readCatalogDriverTrust({ deprecated }).deprecated).toBeUndefined();
      expect(driverTrustBadges({ catalogEntry: { deprecated } }).map((badge) => badge.kind)).toEqual(['official']);
    }
  });

  it('should mark a file install that is not a catalog zip as Unverified', () => {
    expect(
      driverTrustBadges({
        record: { source: 'user', sourcePath: '/tmp/my-radio.json' },
      }).map((badge) => badge.label),
    ).toEqual(['Unverified']);
    expect(
      driverTrustBadges({
        record: { source: 'user', sourcePath: '/tmp/my-radio.json' },
        catalogEntry: { tier: 'community', publisher: 'Ada Lovelace' },
      }).map((badge) => badge.kind),
    ).toEqual(['unverified']);
  });

  it('should keep a listed file install Unverified and still show Deprecated', () => {
    expect(
      driverTrustBadges({
        record: { source: 'user', sourcePath: '/tmp/my-radio.json' },
        catalogEntry: {
          tier: 'community',
          publisher: 'Ada Lovelace',
          deprecated: { reason: 'No maintainer response', date: '2026-10-26' },
        },
      }).map((badge) => badge.label),
    ).toEqual(['Unverified', 'Deprecated']);
  });

  it('should keep the Beta badge instead of Unverified for a prerelease file', () => {
    expect(
      driverTrustBadges({
        record: { source: 'user', sourcePath: BETA_INSTALL_PATH },
      }).map((badge) => badge.label),
    ).toEqual(['Beta']);
  });

  it('should keep the Beta badge beside Deprecated', () => {
    expect(
      driverTrustBadges({
        record: { source: 'user', sourcePath: BETA_INSTALL_PATH },
        catalogEntry: {
          tier: 'official',
          deprecated: { reason: 'Replaced by the stable zip', date: '2026-10-26' },
        },
      }).map((badge) => ({ label: badge.label, tooltip: badge.tooltip })),
    ).toEqual([
      { label: 'Deprecated', tooltip: 'Replaced by the stable zip (2026-10-26)' },
      { label: 'Beta', tooltip: undefined },
    ]);
  });

  it('should label a catalog install Official when the entry has no trust fields', () => {
    expect(
      driverTrustBadges({
        record: { source: 'installed', sourcePath: '/tmp/radio-modules/baofeng-uv5r/3.7.0' },
        catalogEntry: { id: 'baofeng-uv5r', version: '3.7.0' },
      }).map((badge) => badge.label),
    ).toEqual(['Official']);
  });

  it('should keep Bundled for a bundled driver that is not a community listing', () => {
    expect(driverTrustBadges({ record: { source: 'bundled' } }).map((badge) => badge.label)).toEqual(['Bundled']);
  });

  it('should copy trust fields the registry parser drops', () => {
    const raw = {
      schemaVersion: 3,
      modules: [
        catalogModule('kenwood-th-d74', '1.11.1', {
          tier: 'community',
          publisher: 'Ada Lovelace',
          deprecated: { reason: 'No maintainer response', date: '2026-10-01' },
        }),
        catalogModule('baofeng-uv5r', '3.7.0'),
      ],
    };
    const parsed = parseModuleCatalog(JSON.stringify(raw));

    expect(parsed.modules[0]).not.toHaveProperty('tier');
    expect(parsed.modules[0]).not.toHaveProperty('publisher');
    expect(parsed.modules[0]).not.toHaveProperty('deprecated');

    applyCatalogTrustFields(parsed, raw);

    expect(parsed.modules[0]).toMatchObject({
      package: '@springfield/radio-module-kenwood-th-d74',
      tier: 'community',
      publisher: 'Ada Lovelace',
      deprecated: { reason: 'No maintainer response', date: '2026-10-01' },
    });
    expect(parsed.modules[1]).toMatchObject({ tier: 'official' });
    expect(parsed.modules[1]).not.toHaveProperty('publisher');
    expect(
      driverTrustBadges({ catalogEntry: parsed.modules[0] }).map((badge) => badge.label),
    ).toEqual(['Community, by Ada Lovelace', 'Deprecated']);
    expect(driverTrustBadges({ catalogEntry: parsed.modules[1] }).map((badge) => badge.label)).toEqual([
      'Official',
    ]);
  });

  it('should keep trust fields when the official catalog is fetched', async () => {
    const body = JSON.stringify({
      schemaVersion: 3,
      modules: [
        catalogModule('kenwood-th-d74', '1.11.1', {
          tier: 'community',
          publisher: 'Ada Lovelace',
          deprecated: { reason: 'No maintainer response', date: '2026-10-26' },
        }),
      ],
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        text: async () => body,
      })),
    );

    try {
      const catalog = await fetchOfficialModuleCatalog('https://example.test/catalog.json');
      expect(driverTrustBadges({ catalogEntry: catalog.modules[0] }).map((badge) => badge.label)).toEqual([
        'Community, by Ada Lovelace',
        'Deprecated',
      ]);
      expect(driverTrustBadges({ catalogEntry: catalog.modules[0] })[1]?.tooltip).toBe(
        'No maintainer response (2026-10-26)',
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('should render trust badges with UBadge in Preferences and the install dialog', () => {
    const preference = readFileSync('app/components/RadioModulesPreference.vue', 'utf8');
    const dialog = readFileSync('app/components/RadioModulesInstallDialog.vue', 'utf8');
    const badges = readFileSync('app/components/DriverTrustBadges.vue', 'utf8');

    expect(preference).toContain('function sourceBadge');
    expect(preference).toContain('DriverTrustBadges :badges="sourceBadge(item.record, item.catalogEntry)"');
    expect(preference).toContain('driverTrustBadges({ catalogEntry: radio.entry })');
    expect(dialog).toContain('driverTrustBadges({ catalogEntry: item.entry })');
    expect(badges).toContain('<UBadge');
    expect(badges).toContain('<UTooltip');
    expect(badges).not.toContain('class="badge');
  });
});
