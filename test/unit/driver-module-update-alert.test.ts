import { describe, expect, it } from 'vitest';
import type { RadioModuleCatalogEntry } from '@springfield/ham-radio-registry';
import type { LoadedRadioConfig, RadioCatalogRecord } from '../../app/utils/radio-catalog-db.ts';
import { APP_HAM_RADIO_API_VERSION } from '../../app/utils/radio-module-install.ts';
import {
  isDriverUpdateDismissed,
  parseDriverUpdateDismissals,
  serializeDriverUpdateDismissals,
} from '../../app/utils/driver-update-dismissals.ts';
import {
  driverModuleUpdateAlertDescription,
  driverModuleUpdatesFromInstalledItems,
  filterVisibleDriverModuleUpdates,
} from '../../app/utils/driver-module-update-alert.ts';
import { buildInstalledRadioListItems } from '../../app/utils/radio-module-listing.ts';

const baofengEntry = {
  id: 'baofeng-uv5r',
  package: '@springfield/radio-module-baofeng-uv5r',
  manufacturer: 'Baofeng',
  name: 'Baofeng UV-5R',
  version: '3.7.0',
  config: 'configs/baofeng-uv5r.json',
  minApiVersion: '18.0.1',
  downloadUrl: 'https://example.test/baofeng-uv5r.zip',
  integrity: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
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

describe('driver module update alert', () => {
  it('should list compatible driver updates from installed radio rows', () => {
    const installed = record({
      modelId: 'baofeng-uv5r',
      name: 'UV-5R',
      manufacturer: 'Baofeng',
      version: '3.4.0',
      source: 'installed',
      sourcePath: '/tmp/radio-modules/baofeng-uv5r/3.0.0',
    });
    const items = buildInstalledRadioListItems([installed], [baofengEntry]);
    const updates = driverModuleUpdatesFromInstalledItems(items);

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      modelId: 'baofeng-uv5r',
      displayName: 'UV-5R',
      installedModuleVersion: '3.0.0',
      configVersion: '3.4.0',
      availableVersion: '3.7.0',
    });
    expect(driverModuleUpdateAlertDescription(updates)).toContain('v3.0.0 → v3.7.0');
  });

  it('should ignore updates blocked by minApiVersion', () => {
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

    expect(driverModuleUpdatesFromInstalledItems(items)).toEqual([]);
  });

  it('should hide a dismissed catalog version until a newer one is published', () => {
    const update = {
      modelId: 'baofeng-uv5r',
      displayName: 'UV-5R',
      installedModuleVersion: '3.0.0',
      configVersion: '3.4.0',
      availableVersion: '3.7.0',
    };
    const dismissals = parseDriverUpdateDismissals(
      serializeDriverUpdateDismissals({ 'baofeng-uv5r': '3.7.0' }),
    );

    expect(isDriverUpdateDismissed('baofeng-uv5r', '3.7.0', dismissals)).toBe(true);
    expect(filterVisibleDriverModuleUpdates([update], dismissals)).toEqual([]);
    expect(isDriverUpdateDismissed('baofeng-uv5r', '3.8.0', dismissals)).toBe(false);
    expect(filterVisibleDriverModuleUpdates([{ ...update, availableVersion: '3.8.0' }], dismissals)).toHaveLength(1);
  });

  it('should round-trip dismissal storage per driver model id', () => {
    const raw = serializeDriverUpdateDismissals({ 'baofeng-uv5r': '3.7.0', 'kenwood-th-d74': '1.12.0' });
    expect(parseDriverUpdateDismissals(raw)).toEqual({
      'baofeng-uv5r': '3.7.0',
      'kenwood-th-d74': '1.12.0',
    });
  });
});
