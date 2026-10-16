import { describe, expect, it } from 'vitest';
import type { RadioModuleCatalogEntry } from '@springfield/ham-radio-registry';
import type { LoadedRadioConfig, RadioCatalogRecord } from '../../app/utils/radio-catalog-db.ts';
import { APP_HAM_RADIO_API_VERSION } from '../../app/utils/radio-module-install.ts';
import {
  buildAvailableManufacturerGroups,
  buildInstalledRadioListItems,
  catalogEntryForInstalledRadio,
  formatCatalogRadioName,
  isBetaDriverRecord,
  isUnverifiedDriverRecord,
  groupInstalledRadiosByManufacturer,
  installedDriverVersionLabel,
  installedRadiosEligibleForVerifiedSwitch,
  radioDisplayName,
  radioMenuLabel,
} from '../../app/utils/radio-module-listing.ts';

const baofengEntry = {
  id: 'baofeng-uv5r',
  package: '@springfield/radio-module-baofeng-uv5r',
  manufacturer: 'Baofeng',
  description: 'Baofeng UV-5R series',
  name: 'Baofeng UV-5R',
  version: '3.7.0',
  config: 'configs/baofeng-uv5r.json',
  minApiVersion: '18.0.1',
  downloadUrl: 'https://example.test/baofeng-uv5r.zip',
  integrity: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
} as RadioModuleCatalogEntry;

const kenwoodThD74 = {
  id: 'kenwood-th-d74',
  package: '@springfield/radio-module-kenwood-th-d74',
  manufacturer: 'Kenwood',
  name: 'Kenwood TH-D74',
  version: '1.11.1',
  config: 'configs/kenwood-th-d74.json',
  minApiVersion: '18.0.1',
  downloadUrl: 'https://example.test/kenwood-th-d74.zip',
  integrity: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
} as RadioModuleCatalogEntry;

const kenwoodThF6 = {
  id: 'kenwood-th-f6',
  package: '@springfield/radio-module-kenwood-th-f6',
  manufacturer: 'Kenwood',
  name: 'Kenwood TH-F6',
  version: '1.11.0',
  config: 'configs/kenwood-th-f6.json',
  minApiVersion: '18.0.1',
  downloadUrl: 'https://example.test/kenwood-th-f6.zip',
  integrity: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
} as RadioModuleCatalogEntry;

const kenwoodTmD710a = {
  id: 'kenwood-tm-d710a',
  package: '@springfield/radio-module-kenwood-tm-d710a',
  manufacturer: 'Kenwood',
  name: 'Kenwood TM-D710A',
  version: '1.11.0',
  config: 'configs/kenwood-tm-d710a.json',
  minApiVersion: '18.0.1',
  downloadUrl: 'https://example.test/kenwood-tm-d710a.zip',
  integrity: 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
} as RadioModuleCatalogEntry;

const catalog = [baofengEntry, kenwoodThD74, kenwoodThF6, kenwoodTmD710a];

function record(
  partial: Pick<RadioCatalogRecord, 'modelId' | 'name' | 'manufacturer' | 'version' | 'source'> &
    Partial<RadioCatalogRecord>,
): RadioCatalogRecord {
  return {
    description: '',
    capabilities: {
      memoryRead: false,
      memoryWrite: false,
      channelProgramming: false,
      settingsProgramming: false,
      liveControl: false,
    },
    config: {} as LoadedRadioConfig,
    contentHash: 'hash',
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  };
}

describe('radio module listing', () => {
  it('labels an installed radio with its driver version', () => {
    expect(installedDriverVersionLabel({ version: '1.4.2', modelId: 'baofeng-uv5r' })).toBe(
      'v1.4.2 · baofeng-uv5r',
    );
  });

  it('should strip a leading manufacturer from radio names', () => {
    expect(radioDisplayName('Baofeng', 'Baofeng UV-5R')).toBe('UV-5R');
    expect(radioDisplayName('Kenwood', 'TH-D74')).toBe('TH-D74');
  });

  it('should name a radio once in a menu', () => {
    expect(radioMenuLabel('Baofeng', 'Baofeng UV-5R')).toBe('Baofeng UV-5R');
    expect(radioMenuLabel('Kenwood', 'Kenwood TM-D710A')).toBe('Kenwood TM-D710A');
    expect(radioMenuLabel('Kenwood', 'TH-D74')).toBe('Kenwood TH-D74');
  });

  it('should format catalog radio ids into display names', () => {
    expect(formatCatalogRadioName('baofeng-uv5r', 'Baofeng')).toBe('UV-5R');
    expect(formatCatalogRadioName('kenwood-th-d74', 'Kenwood')).toBe('TH-D74');
    expect(formatCatalogRadioName('kenwood-tm-d710a', 'Kenwood')).toBe('TM-D710A');
  });

  it('should match catalog entries by model id only', () => {
    const installed = record({
      modelId: 'baofeng-uv5r',
      name: 'UV-5R',
      manufacturer: 'Baofeng',
      version: '3.0.0',
      source: 'installed',
      sourcePath: '/tmp/radio-modules/baofeng-uv5r/3.0.0',
    });

    expect(catalogEntryForInstalledRadio(installed, catalog)?.id).toBe('baofeng-uv5r');
    expect(catalogEntryForInstalledRadio({ ...installed, modelId: 'uv5r' }, catalog)).toBeUndefined();
  });

  it('should flag installed official radios when the catalog has a newer version', () => {
    const installed = record({
      modelId: 'baofeng-uv5r',
      name: 'UV-5R',
      manufacturer: 'Baofeng',
      version: '3.0.0',
      source: 'installed',
      sourcePath: '/tmp/radio-modules/baofeng-uv5r/3.0.0',
    });
    const items = buildInstalledRadioListItems([installed], catalog);

    expect(items).toHaveLength(1);
    expect(items[0]?.updateAvailable).toBe(true);
    expect(items[0]?.canUpdate).toBe(true);
    expect(items[0]?.catalogEntry?.version).toBe('3.7.0');
  });

  it('should offer an update for one Kenwood radio without updating its siblings', () => {
    const installed = [
      record({
        modelId: 'kenwood-th-f6',
        name: 'TH-F6',
        manufacturer: 'Kenwood',
        version: '1.10.0',
        source: 'installed',
        sourcePath: '/tmp/radio-modules/kenwood-th-f6/1.10.0',
      }),
      record({
        modelId: 'kenwood-th-d74',
        name: 'TH-D74',
        manufacturer: 'Kenwood',
        version: '1.11.1',
        source: 'installed',
        sourcePath: '/tmp/radio-modules/kenwood-th-d74/1.11.1',
      }),
      record({
        modelId: 'kenwood-tm-d710a',
        name: 'TM-D710A',
        manufacturer: 'Kenwood',
        version: '1.11.0',
        source: 'installed',
        sourcePath: '/tmp/radio-modules/kenwood-tm-d710a/1.11.0',
      }),
    ];
    const items = buildInstalledRadioListItems(installed, catalog);
    const byId = Object.fromEntries(items.map((item) => [item.record.modelId, item]));

    expect(byId['kenwood-th-f6']?.updateAvailable).toBe(true);
    expect(byId['kenwood-th-f6']?.canUpdate).toBe(true);
    expect(byId['kenwood-th-f6']?.catalogEntry?.minApiVersion).toBe('18.0.1');
    expect(byId['kenwood-th-d74']?.updateAvailable).toBe(false);
    expect(byId['kenwood-tm-d710a']?.updateAvailable).toBe(false);
  });

  it('should not flag an update when the installed directory version matches the catalog', () => {
    const installed = record({
      modelId: 'baofeng-uv5r',
      name: 'UV-5R',
      manufacturer: 'Baofeng',
      version: '3.7.0',
      source: 'installed',
      sourcePath: '/tmp/radio-modules/baofeng-uv5r/3.7.0',
    });
    const items = buildInstalledRadioListItems([installed], catalog);

    expect(items[0]?.updateAvailable).toBe(false);
    expect(items[0]?.canUpdate).toBe(false);
  });

  it('should offer catalog update when a beta is older than the official release', () => {
    const beta = record({
      modelId: 'kenwood-th-d74',
      name: 'TH-D74',
      manufacturer: 'Kenwood',
      version: '1.11.1-beta.1',
      source: 'user',
      sourcePath: '/tmp/radio-modules/kenwood-th-d74/1.11.1-beta.1',
    });
    const items = buildInstalledRadioListItems([beta], catalog);

    expect(items[0]?.updateAvailable).toBe(true);
    expect(items[0]?.canUpdate).toBe(true);
    expect(items[0]?.canSwitchToVerified).toBe(false);
  });

  it('should offer replace with official when beta is newer than the catalog', () => {
    const beta = record({
      modelId: 'kenwood-th-d74',
      name: 'TH-D74',
      manufacturer: 'Kenwood',
      version: '1.11.2-beta.1',
      source: 'user',
      sourcePath: '/tmp/radio-modules/kenwood-th-d74/1.11.2-beta.1',
    });
    const items = buildInstalledRadioListItems([beta], catalog);

    expect(items[0]?.updateAvailable).toBe(false);
    expect(items[0]?.canSwitchToVerified).toBe(false);
    expect(items[0]?.canReplaceWithOfficial).toBe(true);
  });

  it('should not offer catalog updates for unverified local radios', () => {
    const local = record({
      modelId: 'baofeng-uv5r',
      name: 'UV-5R',
      manufacturer: 'Baofeng',
      version: '3.0.0',
      source: 'user',
      sourcePath: '/tmp/uv5r.json',
    });
    const items = buildInstalledRadioListItems([local], catalog);

    expect(items[0]?.updateAvailable).toBe(false);
    expect(items[0]?.canUpdate).toBe(false);
  });

  it('should group installed radios under each manufacturer', () => {
    const items = buildInstalledRadioListItems(
      [
        record({
          modelId: 'baofeng-uv5r',
          name: 'Baofeng UV-5R',
          manufacturer: 'Baofeng',
          version: '3.4.0',
          source: 'user',
        }),
        record({
          modelId: 'kenwood-th-d74',
          name: 'Kenwood TH-D74',
          manufacturer: 'Kenwood',
          version: '1.0.0',
          source: 'user',
        }),
        record({
          modelId: 'kenwood-th-f6',
          name: 'Kenwood TH-F6',
          manufacturer: 'Kenwood',
          version: '1.0.0',
          source: 'user',
        }),
      ],
      catalog,
    );
    const groups = groupInstalledRadiosByManufacturer(items);

    expect(groups.map((group) => group.manufacturer)).toEqual(['Baofeng', 'Kenwood']);
    expect(groups[1]?.radios.map((item) => item.record.modelId)).toEqual([
      'kenwood-th-d74',
      'kenwood-th-f6',
    ]);
  });

  it('should keep a manufacturer available and mark models you already have', () => {
    const local = record({
      modelId: 'kenwood-th-d74',
      name: 'Kenwood TH-D74',
      manufacturer: 'Kenwood',
      version: '1.11.1',
      source: 'user',
      sourcePath: '/tmp/th-d74.json',
    });
    const available = buildAvailableManufacturerGroups([local], catalog);
    const kenwood = available.find((group) => group.manufacturer === 'Kenwood');

    expect(available.map((group) => group.manufacturer)).toEqual(['Baofeng', 'Kenwood']);
    expect(kenwood?.radios.map((radio) => radio.modelId)).toEqual([
      'kenwood-th-d74',
      'kenwood-th-f6',
      'kenwood-tm-d710a',
    ]);
    const thD74 = kenwood?.radios.find((radio) => radio.modelId === 'kenwood-th-d74');
    expect(thD74?.installedUnverified).toBe(true);
    expect(thD74?.installedOfficially).toBe(false);
    expect(thD74?.canSwitchToVerified).toBe(true);
    expect(kenwood?.radios.find((radio) => radio.modelId === 'kenwood-th-f6')?.canInstall).toBe(true);
    expect(kenwood?.canInstall).toBe(true);
  });

  it('should keep an unverified Baofeng UV-5R visible in available drivers with a switch action', () => {
    const local = record({
      modelId: 'baofeng-uv5r',
      name: 'Baofeng UV-5R',
      manufacturer: 'Baofeng',
      version: '3.0.0',
      source: 'user',
      sourcePath: '/tmp/uv5r.json',
    });
    const available = buildAvailableManufacturerGroups([local], catalog);
    const baofeng = available.find((group) => group.manufacturer === 'Baofeng');

    expect(baofeng).toBeDefined();
    expect(baofeng?.radios).toHaveLength(1);
    expect(baofeng?.radios[0]?.installedUnverified).toBe(true);
    expect(baofeng?.radios[0]?.installedOfficially).toBe(false);
    expect(baofeng?.radios[0]?.canSwitchToVerified).toBe(true);
  });

  it('should keep an unverified JSON install on Switch to verified even when its version looks like a beta', () => {
    const local = record({
      modelId: 'kenwood-th-d74',
      name: 'TH-D74',
      manufacturer: 'Kenwood',
      version: '1.11.2-beta.1',
      source: 'user',
      sourcePath: '/tmp/th-d74.json',
    });
    const items = buildInstalledRadioListItems([local], catalog);

    expect(isBetaDriverRecord(local)).toBe(false);
    expect(isUnverifiedDriverRecord(local)).toBe(true);
    expect(items[0]?.canSwitchToVerified).toBe(true);
    expect(items[0]?.canReplaceWithOfficial).toBe(false);
    expect(items[0]?.canUpdate).toBe(false);
    expect(installedRadiosEligibleForVerifiedSwitch(items)).toHaveLength(1);
  });

  it('should leave a newer beta out of switch-all', () => {
    const beta = record({
      modelId: 'kenwood-th-d74',
      name: 'TH-D74',
      manufacturer: 'Kenwood',
      version: '1.11.2-beta.1',
      source: 'user',
      sourcePath: '/tmp/radio-modules/kenwood-th-d74/1.11.2-beta.1',
    });
    const items = buildInstalledRadioListItems([beta], catalog);

    expect(installedRadiosEligibleForVerifiedSwitch(items)).toEqual([]);
    expect(items[0]?.canReplaceWithOfficial).toBe(true);
  });

  it('should distinguish beta zip installs from unverified json installs', () => {
    const beta = record({
      modelId: 'kenwood-th-d74',
      name: 'TH-D74',
      manufacturer: 'Kenwood',
      version: '1.11.1-beta.1',
      source: 'user',
      sourcePath: '/tmp/radio-modules/kenwood-th-d74/1.11.1-beta.1',
    });
    const json = record({
      modelId: 'kenwood-th-d74',
      name: 'TH-D74',
      manufacturer: 'Kenwood',
      version: '1.0.0',
      source: 'user',
      sourcePath: '/tmp/th-d74.json',
    });

    expect(isBetaDriverRecord(beta)).toBe(true);
    expect(isUnverifiedDriverRecord(beta)).toBe(false);
    expect(isBetaDriverRecord(json)).toBe(false);
    expect(isUnverifiedDriverRecord(json)).toBe(true);
  });

  it('should offer switch to verified on installed unverified rows that match the catalog', () => {
    const local = record({
      modelId: 'kenwood-th-d74',
      name: 'TH-D74',
      manufacturer: 'Kenwood',
      version: '1.0.0',
      source: 'user',
      sourcePath: '/tmp/th-d74.json',
    });
    const items = buildInstalledRadioListItems([local], catalog);

    expect(items[0]?.canSwitchToVerified).toBe(true);
    expect(items[0]?.canUpdate).toBe(false);
  });

  it('should hide a manufacturer from available when every catalog radio is installed officially', () => {
    const installed = record({
      modelId: 'baofeng-uv5r',
      name: 'UV-5R',
      manufacturer: 'Baofeng',
      version: '3.7.0',
      source: 'installed',
      sourcePath: '/tmp/radio-modules/baofeng-uv5r/3.7.0',
    });
    const available = buildAvailableManufacturerGroups([installed], catalog);

    expect(available.map((group) => group.manufacturer)).toEqual(['Kenwood']);
  });

  it('should block install when the module needs a newer app API', () => {
    const newerApi = {
      ...kenwoodThF6,
      minApiVersion: '99.0.0',
    } as RadioModuleCatalogEntry;
    const available = buildAvailableManufacturerGroups([], [newerApi]);

    expect(available[0]?.canInstall).toBe(false);
    expect(available[0]?.radios.every((radio) => radio.canInstall === false)).toBe(true);
    expect(available[0]?.installBlockedReason).toContain('newer version of HamBench');
  });

  it('should allow install when minApiVersion matches the installed ham-radio-api', () => {
    const entry = {
      ...kenwoodThF6,
      minApiVersion: APP_HAM_RADIO_API_VERSION,
    } as RadioModuleCatalogEntry;
    const available = buildAvailableManufacturerGroups([], [entry]);

    expect(available[0]?.canInstall).toBe(true);
    expect(available[0]?.radios.every((radio) => radio.canInstall === true)).toBe(true);
    expect(available[0]?.installBlockedReason).toBeUndefined();
  });

  it('should show an update badge but block update when the catalog needs a newer API', () => {
    const parts = APP_HAM_RADIO_API_VERSION.split('.').map((part) => Number.parseInt(part, 10) || 0);
    const minApiVersion = `${parts[0]}.${parts[1]}.${(parts[2] ?? 0) + 1}`;
    const entry = {
      ...baofengEntry,
      minApiVersion,
    } as RadioModuleCatalogEntry;
    const installed = record({
      modelId: 'baofeng-uv5r',
      name: 'UV-5R',
      manufacturer: 'Baofeng',
      version: '3.0.0',
      source: 'installed',
      sourcePath: '/tmp/radio-modules/baofeng-uv5r/3.0.0',
    });
    const items = buildInstalledRadioListItems([installed], [entry]);

    expect(items[0]?.updateAvailable).toBe(true);
    expect(items[0]?.canUpdate).toBe(false);
    expect(items[0]?.updateBlockedReason).toContain('newer version of HamBench');
  });
});
