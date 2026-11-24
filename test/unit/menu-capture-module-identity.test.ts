import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { LoadedRadioConfig } from '../../app/utils/radio-catalog-db.ts';
import {
  moduleIdentityFromInstallPath,
  resolveMenuCaptureModuleIdentity,
} from '../../app/utils/menu-capture-module-config.ts';

const getRadioCatalogRecord = vi.hoisted(() => vi.fn());

vi.mock('../../app/utils/radio-catalog-db.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../app/utils/radio-catalog-db.ts')>();

  return {
    ...actual,
    getRadioCatalogRecord: getRadioCatalogRecord,
  };
});

function thD74Config(): LoadedRadioConfig {
  return {
    id: { manufacturer: 'Kenwood', model: 'TH-D74', name: 'TH-D74' },
    version: '1.0.0',
    description: 'Test',
    settingsSchema: {},
    memoryConfig: { chunkSize: 256, addressSize: 2, addressEndianness: 'big', segments: {} },
    serialConfig: { baudRate: 57600 },
    readMemory: [{}],
    writeMemory: [{}],
    metadata: { moduleId: 'kenwood-th-d74', moduleVersion: '1.0.0-ignored' },
  } as LoadedRadioConfig;
}

describe('resolveMenuCaptureModuleIdentity', () => {
  beforeEach(() => {
    getRadioCatalogRecord.mockReset();
  });

  it('prefers the catalog install row over empty metadata', async () => {
    getRadioCatalogRecord.mockResolvedValue({
      version: '1.26.0-beta.1',
      sourcePath: '/data/radio-module-kenwood-th-d74/1.26.0-beta.1/radio.json',
    });

    const identity = await resolveMenuCaptureModuleIdentity(thD74Config());

    expect(identity).toEqual({
      moduleId: 'kenwood-th-d74',
      moduleVersion: '1.26.0-beta.1',
    });
  });

  it('falls back to install path segments when metadata is blank', async () => {
    getRadioCatalogRecord.mockResolvedValue({
      version: '1.26.0-beta.1',
      sourcePath: '/app/modules/radio-module-kenwood/1.26.0-beta.1',
    });

    const config = { ...thD74Config(), metadata: {} } as LoadedRadioConfig;
    const identity = await resolveMenuCaptureModuleIdentity(config);

    expect(identity.moduleId).toBe('radio-module-kenwood');
    expect(identity.moduleVersion).toBe('1.26.0-beta.1');
    expect(moduleIdentityFromInstallPath('/app/modules/radio-module-kenwood/1.26.0-beta.1')).toEqual({
      moduleId: 'radio-module-kenwood',
      version: '1.26.0-beta.1',
    });
  });
});