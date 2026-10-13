import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RadioCatalogRecord } from '../../app/utils/radio-catalog-db.ts';

const invoke = vi.fn();
const deleteRadioCatalogRecord = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

vi.mock('~/utils/radio-memory-file-io', () => ({
  isTauriRuntime: () => true,
}));

vi.mock('../../app/utils/radio-catalog-db.ts', () => ({
  deleteRadioCatalogRecord: (...args: unknown[]) => deleteRadioCatalogRecord(...args),
}));

import { uninstallRadioCatalogRecord } from '../../app/utils/radio-module-install.ts';

function installedRecord(modelId: string, version: string): RadioCatalogRecord {
  return {
    modelId,
    name: modelId,
    manufacturer: 'Kenwood',
    version,
    description: '',
    capabilities: {
      memoryRead: true,
      memoryWrite: true,
      channelProgramming: true,
      settingsProgramming: true,
      liveControl: false,
    },
    source: 'installed',
    sourcePath: `/tmp/radio-modules/${modelId}/${version}`,
    config: {} as RadioCatalogRecord['config'],
    contentHash: 'hash',
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('uninstallRadioCatalogRecord', () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue(undefined);
    deleteRadioCatalogRecord.mockReset();
    deleteRadioCatalogRecord.mockResolvedValue(undefined);
  });

  it('removes only the TH-F6 catalog row and install directory when TH-D74 and TM-D710A stay installed', async () => {
    const thF6 = installedRecord('kenwood-th-f6', '1.11.0');
    const removed = await uninstallRadioCatalogRecord(thF6);

    expect(removed).toEqual(['kenwood-th-f6']);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('uninstall_radio_module', {
      moduleId: 'kenwood-th-f6',
      version: '1.11.0',
    });
    expect(deleteRadioCatalogRecord).toHaveBeenCalledTimes(1);
    expect(deleteRadioCatalogRecord).toHaveBeenCalledWith('kenwood-th-f6');
    expect(deleteRadioCatalogRecord).not.toHaveBeenCalledWith('kenwood-th-d74');
    expect(deleteRadioCatalogRecord).not.toHaveBeenCalledWith('kenwood-tm-d710a');
  });
});
