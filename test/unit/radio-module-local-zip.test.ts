import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RadioModuleCatalogEntry } from '@springfield/ham-radio-registry';
import type { RadioCatalogRecord } from '../../app/utils/radio-catalog-db.ts';

const invoke = vi.fn();
const getRadioCatalogRecord = vi.fn();
const upsertRadioCatalogRecord = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

vi.mock('~/utils/radio-memory-file-io', () => ({
  isTauriRuntime: () => true,
}));

vi.mock('~/utils/load-radio-config', () => ({
  loadRadioConfigFromFile: vi.fn(async () => ({
    id: { model: 'kenwood-th-d74', name: 'Kenwood TH-D74', manufacturer: 'Kenwood' },
    version: '1.11.2-beta.1',
  })),
}));

vi.mock('../../app/utils/radio-catalog-db.ts', () => ({
  getRadioCatalogRecord: (...args: unknown[]) => getRadioCatalogRecord(...args),
  upsertRadioCatalogRecord: (...args: unknown[]) => upsertRadioCatalogRecord(...args),
  deleteRadioCatalogRecord: vi.fn(),
  deleteRadioCatalogRecordsUnderDirectories: vi.fn(),
  listRadioCatalogRecords: vi.fn(async () => []),
}));

import { loadRadioConfigFromFile } from '~/utils/load-radio-config';
import { installLocalModuleZip, updateInstalledModule } from '../../app/utils/radio-module-install.ts';

const entry = {
  id: 'kenwood-th-d74',
  package: '@springfield/radio-module-kenwood-th-d74',
  manufacturer: 'Kenwood',
  name: 'Kenwood TH-D74',
  version: '1.11.1',
  config: 'configs/kenwood-th-d74.json',
  minApiVersion: '18.0.1',
  downloadUrl: 'https://github.com/springfield-ham-radio/radio-module-kenwood/releases/download/v1.11.1/radio.zip',
  integrity: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
} as RadioModuleCatalogEntry;

function userRecord(sourcePath: string, version: string): RadioCatalogRecord {
  return {
    modelId: 'kenwood-th-d74',
    name: 'TH-D74',
    manufacturer: 'Kenwood',
    version,
    description: '',
    capabilities: {
      memoryRead: false,
      memoryWrite: false,
      channelProgramming: false,
      settingsProgramming: false,
      liveControl: false,
    },
    source: 'user',
    sourcePath,
    config: {} as RadioCatalogRecord['config'],
    contentHash: 'hash',
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('local beta zip install', () => {
  beforeEach(() => {
    invoke.mockReset();
    getRadioCatalogRecord.mockReset();
    upsertRadioCatalogRecord.mockReset();
    upsertRadioCatalogRecord.mockImplementation(async () => userRecord('/tmp/radio-modules/kenwood-th-d74/1.11.2-beta.1', '1.11.2-beta.1'));
    vi.mocked(loadRadioConfigFromFile).mockResolvedValue({
      id: { model: 'kenwood-th-d74', name: 'Kenwood TH-D74', manufacturer: 'Kenwood' },
      version: '1.11.2-beta.1',
    } as Awaited<ReturnType<typeof loadRadioConfigFromFile>>);
  });

  it('should roll back a blocked install and leave no catalog row', async () => {
    getRadioCatalogRecord.mockResolvedValue(undefined);
    invoke.mockImplementation(async (command: string) => {
      if (command === 'install_radio_module_from_zip') {
        return {
          moduleId: 'kenwood-th-d74',
          version: '1.11.2-beta.1',
          installPath: '/tmp/radio-modules/kenwood-th-d74/1.11.2-beta.1',
          configPaths: ['/tmp/radio-modules/kenwood-th-d74/1.11.2-beta.1/configs/kenwood-th-d74.json'],
          replacedPrevious: false,
        };
      }

      if (command === 'load_text_file') {
        return JSON.stringify({ minApiVersion: '99.0.0' });
      }

      return undefined;
    });

    await expect(
      installLocalModuleZip('/tmp/radio-module-kenwood-th-d74-1.11.2-beta.1.zip', 'kenwood-th-d74', '1.11.2-beta.1'),
    ).rejects.toThrow(/requires ham-radio-api/);

    expect(upsertRadioCatalogRecord).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith('uninstall_radio_module', {
      moduleId: 'kenwood-th-d74',
      version: '1.11.2-beta.1',
    });
  });

  it('should restore the previous directory when a replacement is blocked', async () => {
    getRadioCatalogRecord.mockResolvedValue(
      userRecord('/tmp/radio-modules/kenwood-th-d74/1.11.1-beta.1', '1.11.1-beta.1'),
    );
    invoke.mockImplementation(async (command: string) => {
      if (command === 'install_radio_module_from_zip') {
        return {
          moduleId: 'kenwood-th-d74',
          version: '1.11.1-beta.1',
          installPath: '/tmp/radio-modules/kenwood-th-d74/1.11.1-beta.1',
          configPaths: ['/tmp/radio-modules/kenwood-th-d74/1.11.1-beta.1/configs/kenwood-th-d74.json'],
          replacedPrevious: true,
        };
      }

      if (command === 'load_text_file') {
        return JSON.stringify({ minApiVersion: 'not-a-version' });
      }

      return undefined;
    });

    await expect(
      installLocalModuleZip('/tmp/radio-module-kenwood-th-d74-1.11.1-beta.1.zip', 'kenwood-th-d74', '1.11.1-beta.1'),
    ).rejects.toThrow(/invalid minApiVersion/);

    expect(upsertRadioCatalogRecord).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith('rollback_radio_module_replace', {
      moduleId: 'kenwood-th-d74',
      version: '1.11.1-beta.1',
    });
    expect(invoke).not.toHaveBeenCalledWith('uninstall_radio_module', expect.anything());
  });

  it('should delete the previous module directory only after the new catalog row succeeds', async () => {
    const order: string[] = [];
    const written = userRecord('/tmp/radio-modules/kenwood-th-d74/1.11.2-beta.1', '1.11.2-beta.1');
    let current = userRecord('/tmp/radio-modules/kenwood-th-d74/1.11.1-beta.1', '1.11.1-beta.1');
    getRadioCatalogRecord.mockImplementation(async () => current);
    upsertRadioCatalogRecord.mockImplementation(async () => {
      order.push('upsert');
      current = written;
      return written;
    });
    invoke.mockImplementation(async (command: string, args?: { version?: string }) => {
      if (command === 'uninstall_radio_module') {
        order.push(`uninstall:${args?.version}`);
      }

      if (command === 'install_radio_module_from_zip') {
        return {
          moduleId: 'kenwood-th-d74',
          version: '1.11.2-beta.1',
          installPath: '/tmp/radio-modules/kenwood-th-d74/1.11.2-beta.1',
          configPaths: ['/tmp/radio-modules/kenwood-th-d74/1.11.2-beta.1/configs/kenwood-th-d74.json'],
          replacedPrevious: false,
        };
      }

      if (command === 'load_text_file') {
        return JSON.stringify({ minApiVersion: '18.0.1' });
      }

      return undefined;
    });

    await installLocalModuleZip('/tmp/radio.zip', 'kenwood-th-d74', '1.11.2-beta.1');

    expect(order).toEqual(['upsert', 'uninstall:1.11.1-beta.1']);
  });

  it('should not delete a user JSON path when a local zip replaces it', async () => {
    const written = userRecord('/tmp/radio-modules/kenwood-th-d74/1.11.1-beta.1', '1.11.1-beta.1');
    let current = userRecord('/tmp/kenwood-th-d74.json', '1.11.1');
    getRadioCatalogRecord.mockImplementation(async () => current);
    upsertRadioCatalogRecord.mockImplementation(async () => {
      current = written;
      return written;
    });
    invoke.mockImplementation(async (command: string) => {
      if (command === 'install_radio_module_from_zip') {
        return {
          moduleId: 'kenwood-th-d74',
          version: '1.11.1-beta.1',
          installPath: '/tmp/radio-modules/kenwood-th-d74/1.11.1-beta.1',
          configPaths: ['/tmp/radio-modules/kenwood-th-d74/1.11.1-beta.1/configs/kenwood-th-d74.json'],
          replacedPrevious: false,
        };
      }

      if (command === 'load_text_file') {
        return JSON.stringify({ minApiVersion: '18.0.1' });
      }

      return undefined;
    });

    await installLocalModuleZip('/tmp/radio-module-kenwood-th-d74-1.11.1-beta.1.zip', 'kenwood-th-d74', '1.11.1-beta.1');

    expect(upsertRadioCatalogRecord).toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalledWith('uninstall_radio_module', expect.anything());
  });

  it('should not delete the previous directory when the new catalog row fails', async () => {
    getRadioCatalogRecord.mockResolvedValue(
      userRecord('/tmp/radio-modules/kenwood-th-d74/1.11.1-beta.1', '1.11.1-beta.1'),
    );
    upsertRadioCatalogRecord.mockRejectedValue(new Error('catalog write failed'));
    invoke.mockImplementation(async (command: string) => {
      if (command === 'install_radio_module_from_zip') {
        return {
          moduleId: 'kenwood-th-d74',
          version: '1.11.2-beta.1',
          installPath: '/tmp/radio-modules/kenwood-th-d74/1.11.2-beta.1',
          configPaths: ['/tmp/radio-modules/kenwood-th-d74/1.11.2-beta.1/configs/kenwood-th-d74.json'],
          replacedPrevious: false,
        };
      }

      if (command === 'load_text_file') {
        return JSON.stringify({ minApiVersion: '18.0.1' });
      }

      return undefined;
    });

    await expect(installLocalModuleZip('/tmp/radio.zip', 'kenwood-th-d74', '1.11.2-beta.1')).rejects.toThrow(
      /catalog write failed/,
    );

    expect(invoke).toHaveBeenCalledWith('uninstall_radio_module', {
      moduleId: 'kenwood-th-d74',
      version: '1.11.2-beta.1',
    });
    expect(invoke).not.toHaveBeenCalledWith('uninstall_radio_module', {
      moduleId: 'kenwood-th-d74',
      version: '1.11.1-beta.1',
    });
  });

  it('should replace a beta catalog row on Update and then delete the beta directory', async () => {
    const order: string[] = [];
    getRadioCatalogRecord.mockImplementation(async () => {
      order.push('read-catalog');
      return {
        ...userRecord('/tmp/radio-modules/kenwood-th-d74/1.11.1', '1.11.1'),
        source: 'installed' as const,
      };
    });
    upsertRadioCatalogRecord.mockImplementation(async (_radio: unknown, source: string) => {
      order.push(`upsert:${source}`);
      return userRecord('/tmp/radio-modules/kenwood-th-d74/1.11.1', '1.11.1');
    });
    invoke.mockImplementation(async (command: string, args?: { version?: string }) => {
      if (command === 'uninstall_radio_module') {
        order.push(`uninstall:${args?.version}`);
      }

      if (command === 'download_and_install_radio_module') {
        return {
          moduleId: 'kenwood-th-d74',
          version: '1.11.1',
          installPath: '/tmp/radio-modules/kenwood-th-d74/1.11.1',
          configPaths: ['/tmp/radio-modules/kenwood-th-d74/1.11.1/configs/kenwood-th-d74.json'],
          replacedPrevious: false,
        };
      }

      if (command === 'load_text_file') {
        return '{}';
      }

      return undefined;
    });

    await updateInstalledModule(entry, userRecord('/tmp/radio-modules/kenwood-th-d74/1.11.1-beta.1', '1.11.1-beta.1'));

    expect(upsertRadioCatalogRecord).toHaveBeenCalledWith(
      expect.anything(),
      'installed',
      expect.objectContaining({ replaceUserCatalog: true }),
    );
    expect(order.indexOf('upsert:installed')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('read-catalog')).toBeGreaterThan(order.indexOf('upsert:installed'));
    expect(order.indexOf('uninstall:1.11.1-beta.1')).toBeGreaterThan(order.indexOf('read-catalog'));
  });

  it('should not delete a user JSON when switching that unverified install to official', async () => {
    getRadioCatalogRecord.mockResolvedValue({
      ...userRecord('/tmp/radio-modules/kenwood-th-d74/1.11.1', '1.11.1'),
      source: 'installed' as const,
    });
    invoke.mockImplementation(async (command: string) => {
      if (command === 'download_and_install_radio_module') {
        return {
          moduleId: 'kenwood-th-d74',
          version: '1.11.1',
          installPath: '/tmp/radio-modules/kenwood-th-d74/1.11.1',
          configPaths: ['/tmp/radio-modules/kenwood-th-d74/1.11.1/configs/kenwood-th-d74.json'],
          replacedPrevious: false,
        };
      }

      if (command === 'load_text_file') {
        return '{}';
      }

      return undefined;
    });

    await updateInstalledModule(entry, userRecord('/tmp/kenwood-th-d74.json', '1.0.0'));

    expect(upsertRadioCatalogRecord).toHaveBeenCalledWith(
      expect.anything(),
      'installed',
      expect.objectContaining({ replaceUserCatalog: true }),
    );
    expect(invoke).not.toHaveBeenCalledWith('uninstall_radio_module', expect.anything());
  });

  it('should reject a kenwood-th-f6 update that leaves the catalog on 1.11.0', async () => {
    const stalePath =
      '/Users/me/Library/Application Support/com.springfield.ham-radio/radio-modules/kenwood-th-f6/1.11.0';
    const stale = {
      ...userRecord(stalePath, '1.11.0'),
      modelId: 'kenwood-th-f6',
      name: 'TH-F6',
      source: 'installed' as const,
    };
    getRadioCatalogRecord.mockResolvedValue(stale);
    upsertRadioCatalogRecord.mockResolvedValue(stale);
    vi.mocked(loadRadioConfigFromFile).mockResolvedValue({
      id: { model: 'kenwood-th-f6', name: 'Kenwood TH-F6', manufacturer: 'Kenwood' },
      version: '1.12.0',
    } as Awaited<ReturnType<typeof loadRadioConfigFromFile>>);
    invoke.mockImplementation(async (command: string) => {
      if (command === 'download_and_install_radio_module') {
        return {
          moduleId: 'kenwood-th-f6',
          version: '1.12.0',
          installPath:
            '/Users/me/Library/Application Support/com.springfield.ham-radio/radio-modules/kenwood-th-f6/1.12.0',
          configPaths: [
            '/Users/me/Library/Application Support/com.springfield.ham-radio/radio-modules/kenwood-th-f6/1.12.0/configs/kenwood-th-f6.json',
          ],
          replacedPrevious: false,
        };
      }

      if (command === 'load_text_file') {
        return JSON.stringify({ minApiVersion: '18.0.1' });
      }

      return undefined;
    });

    const f6 = {
      ...entry,
      id: 'kenwood-th-f6',
      name: 'Kenwood TH-F6',
      version: '1.12.0',
    };

    await expect(updateInstalledModule(f6, stale)).rejects.toThrow(/catalog row still has/);
    expect(invoke).toHaveBeenCalledWith('uninstall_radio_module', {
      moduleId: 'kenwood-th-f6',
      version: '1.12.0',
    });
    expect(invoke).not.toHaveBeenCalledWith('uninstall_radio_module', {
      moduleId: 'kenwood-th-f6',
      version: '1.11.0',
    });
  });
});
