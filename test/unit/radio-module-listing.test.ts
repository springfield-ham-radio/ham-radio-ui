import { describe, it } from 'node:test';
import { expect } from 'chai';
import type { RadioModuleCatalogEntry } from '@springfield/ham-radio-registry';
import type { LoadedRadioConfig, RadioCatalogRecord } from '../../app/utils/radio-catalog-db.ts';
import {
  buildAvailableManufacturerGroups,
  buildInstalledRadioListItems,
  catalogEntryForInstalledRadio,
  catalogModelMatchesRecord,
  catalogModuleIdForRecord,
  catalogRadioDisplayNames,
  formatCatalogRadioName,
  groupInstalledRadiosByManufacturer,
  normalizeCatalogModuleId,
  radioDisplayName,
  radiosOnCatalogEntry,
} from '../../app/utils/radio-module-listing.ts';

const baofengEntry = {
  id: 'baofeng',
  package: '@springfield/radio-module-baofeng',
  manufacturer: 'Baofeng',
  description: 'Baofeng UV-5R series',
  version: '3.4.1',
  radios: [
    {
      modelId: 'baofeng-uv5r',
      name: 'Baofeng UV-5R',
      config: 'configs/baofeng-uv5r.json',
    },
  ],
  supportedRadios: ['baofeng-uv5r'],
  minApiVersion: '17.3.0',
  downloadUrl: 'https://example.test/baofeng.zip',
  integrity: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
} as RadioModuleCatalogEntry;

const kenwoodEntry = {
  id: 'kenwood',
  package: '@springfield/radio-module-kenwood',
  manufacturer: 'Kenwood',
  description: 'Kenwood handhelds and mobiles',
  version: '1.8.0',
  radios: [
    {
      modelId: 'kenwood-th-d74',
      name: 'Kenwood TH-D74',
      config: 'configs/kenwood-th-d74.json',
    },
    {
      modelId: 'kenwood-th-f6',
      name: 'Kenwood TH-F6',
      config: 'configs/kenwood-th-f6.json',
    },
    {
      modelId: 'kenwood-tm-d710a',
      name: 'Kenwood TM-D710A',
      config: 'configs/kenwood-tm-d710a.json',
    },
  ],
  supportedRadios: ['kenwood-th-d74', 'kenwood-th-f6', 'kenwood-tm-d710a'],
  minApiVersion: '17.3.0',
  downloadUrl: 'https://example.test/kenwood.zip',
  integrity: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
} as RadioModuleCatalogEntry;

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
  it('should normalize catalog and package module ids', () => {
    expect(normalizeCatalogModuleId('baofeng')).to.equal('baofeng');
    expect(normalizeCatalogModuleId('radio-module-baofeng')).to.equal('baofeng');
    expect(normalizeCatalogModuleId('@springfield/radio-module-baofeng')).to.equal('baofeng');
  });

  it('should strip a leading manufacturer from radio names', () => {
    expect(radioDisplayName('Baofeng', 'Baofeng UV-5R')).to.equal('UV-5R');
    expect(radioDisplayName('Kenwood', 'TH-D74')).to.equal('TH-D74');
  });

  it('should format catalog radio ids into display names', () => {
    expect(formatCatalogRadioName('uv5r')).to.equal('UV-5R');
    expect(formatCatalogRadioName('uv5r-plus')).to.equal('UV-5R Plus');
    expect(formatCatalogRadioName('th-d74')).to.equal('TH-D74');
    expect(formatCatalogRadioName('tm-d710a')).to.equal('TM-D710A');
    expect(formatCatalogRadioName('baofeng-uv5r', 'Baofeng')).to.equal('UV-5R');
  });

  it('should list zip configs from radios and fall back to supportedRadios', () => {
    expect(radiosOnCatalogEntry(baofengEntry)).to.deep.equal([
      {
        modelId: 'baofeng-uv5r',
        name: 'Baofeng UV-5R',
        config: 'configs/baofeng-uv5r.json',
      },
    ]);
    expect(catalogRadioDisplayNames(baofengEntry)).to.equal('UV-5R');
    expect(catalogRadioDisplayNames(kenwoodEntry)).to.equal('TH-D74, TH-F6, TM-D710A');

    const legacy = {
      ...baofengEntry,
      radios: undefined,
      supportedRadios: ['uv5r', 'uv5r-plus'],
    } as RadioModuleCatalogEntry;

    expect(radiosOnCatalogEntry(legacy).map((radio) => radio.modelId)).to.deep.equal(['uv5r', 'uv5r-plus']);
  });

  it('should match short catalog ids to prefixed installed model ids', () => {
    const installed = record({
      modelId: 'baofeng-uv5r',
      name: 'Baofeng UV-5R',
      manufacturer: 'Baofeng',
      version: '3.4.0',
      source: 'user',
    });

    expect(catalogModelMatchesRecord('baofeng-uv5r', installed)).to.equal(true);
    expect(catalogModelMatchesRecord('uv5r', installed)).to.equal(true);
    expect(catalogModelMatchesRecord('uv5r-plus', installed)).to.equal(false);
  });

  it('should read the module id from an install directory', () => {
    const installed = record({
      modelId: 'baofeng-uv5r',
      name: 'UV-5R',
      manufacturer: 'Baofeng',
      version: '3.0.0',
      source: 'installed',
      sourcePath: '/Users/me/Library/Application Support/com.springfield.ham-radio/radio-modules/baofeng/3.0.0',
    });

    expect(catalogModuleIdForRecord(installed)).to.equal('baofeng');
    expect(catalogEntryForInstalledRadio(installed, [baofengEntry, kenwoodEntry])?.id).to.equal('baofeng');
  });

  it('should flag installed official radios when the catalog has a newer version', () => {
    const installed = record({
      modelId: 'baofeng-uv5r',
      name: 'UV-5R',
      manufacturer: 'Baofeng',
      version: '3.0.0',
      source: 'installed',
      sourcePath: '/tmp/radio-modules/baofeng/3.0.0',
    });
    const items = buildInstalledRadioListItems([installed], [baofengEntry]);

    expect(items).to.have.length(1);
    expect(items[0]?.updateAvailable).to.equal(true);
    expect(items[0]?.canUpdate).to.equal(true);
    expect(items[0]?.catalogEntry?.version).to.equal('3.4.1');
  });

  it('should not flag an update when the installed version matches the catalog', () => {
    const installed = record({
      modelId: 'baofeng-uv5r',
      name: 'UV-5R',
      manufacturer: 'Baofeng',
      version: '3.4.1',
      source: 'installed',
      sourcePath: '/tmp/radio-modules/baofeng/3.4.1',
    });
    const items = buildInstalledRadioListItems([installed], [baofengEntry]);

    expect(items[0]?.updateAvailable).to.equal(false);
    expect(items[0]?.canUpdate).to.equal(false);
  });

  it('should match bundled radios to catalog entries by supported model id', () => {
    const bundled = record({
      modelId: 'baofeng-uv5r',
      name: 'UV-5R',
      manufacturer: 'Baofeng',
      version: '3.0.0',
      source: 'bundled',
    });
    const items = buildInstalledRadioListItems([bundled], [baofengEntry]);

    expect(items[0]?.catalogEntry?.id).to.equal('baofeng');
    expect(items[0]?.updateAvailable).to.equal(true);
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
    const items = buildInstalledRadioListItems([local], [baofengEntry]);

    expect(items[0]?.updateAvailable).to.equal(false);
    expect(items[0]?.canUpdate).to.equal(false);
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
      [baofengEntry, kenwoodEntry],
    );
    const groups = groupInstalledRadiosByManufacturer(items);

    expect(groups.map((group) => group.manufacturer)).to.deep.equal(['Baofeng', 'Kenwood']);
    expect(groups[1]?.radios.map((item) => item.record.modelId)).to.deep.equal([
      'kenwood-th-d74',
      'kenwood-th-f6',
    ]);
  });

  it('should keep a manufacturer available and mark models you already have', () => {
    const local = record({
      modelId: 'kenwood-th-d74',
      name: 'Kenwood TH-D74',
      manufacturer: 'Kenwood',
      version: '1.8.0',
      source: 'user',
      sourcePath: '/tmp/th-d74.json',
    });
    const available = buildAvailableManufacturerGroups([local], [baofengEntry, kenwoodEntry]);
    const kenwood = available.find((group) => group.manufacturer === 'Kenwood');

    expect(available.map((group) => group.manufacturer)).to.deep.equal(['Baofeng', 'Kenwood']);
    expect(kenwood?.radios).to.deep.equal([
      {
        modelId: 'kenwood-th-d74',
        name: 'TH-D74',
        config: 'configs/kenwood-th-d74.json',
        installed: true,
        canInstall: false,
      },
      {
        modelId: 'kenwood-th-f6',
        name: 'TH-F6',
        config: 'configs/kenwood-th-f6.json',
        installed: false,
        canInstall: true,
      },
      {
        modelId: 'kenwood-tm-d710a',
        name: 'TM-D710A',
        config: 'configs/kenwood-tm-d710a.json',
        installed: false,
        canInstall: true,
      },
    ]);
    expect(kenwood?.canInstall).to.equal(true);
  });

  it('should hide a manufacturer from available when every catalog radio is installed', () => {
    const installed = record({
      modelId: 'baofeng-uv5r',
      name: 'UV-5R',
      manufacturer: 'Baofeng',
      version: '3.4.1',
      source: 'installed',
      sourcePath: '/tmp/radio-modules/baofeng/3.4.1',
    });
    const available = buildAvailableManufacturerGroups([installed], [baofengEntry, kenwoodEntry]);

    expect(available.map((group) => group.manufacturer)).to.deep.equal(['Kenwood']);
  });

  it('should block install when the module needs a newer app API', () => {
    const newerApi = {
      ...kenwoodEntry,
      minApiVersion: '99.0.0',
    } as RadioModuleCatalogEntry;
    const available = buildAvailableManufacturerGroups([], [newerApi]);

    expect(available[0]?.canInstall).to.equal(false);
    expect(available[0]?.radios.every((radio) => radio.canInstall === false)).to.equal(true);
    expect(available[0]?.installBlockedReason).to.include('newer version of HamBench');
  });
});
