import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import { isApiVersionCompatible, parseModuleCatalog } from '@springfield/ham-radio-registry';
import { isPathUnderDirectory } from '../../app/utils/radio-catalog-db.ts';
import {
  APP_HAM_RADIO_API_VERSION,
  catalogConfigMatchesPath,
  fetchOfficialModuleCatalog,
  isLegacyManufacturerModulePath,
  isModuleInstallPath,
  isUserJsonCatalogSourcePath,
  OFFICIAL_CATALOG_INCOMPATIBLE_TITLE,
  OFFICIAL_CATALOG_NETWORK_TITLE,
  OfficialModuleCatalogError,
  officialCatalogFailureFromCause,
  parseModuleInstallPath,
  previousModuleDirectoryToRemove,
  switchAllToVerifiedModules,
  validatePackedConfigMinApiVersion,
} from '../../app/utils/radio-module-install.ts';
import { versionFromZipName } from '../../app/utils/radio-module-semver.ts';

describe('radio module install helpers', () => {
  it('should parse a schema version 3 catalog entry', () => {
    const catalog = parseModuleCatalog(
      JSON.stringify({
        schemaVersion: 3,
        modules: [
          {
            id: 'baofeng-uv5r',
            package: '@springfield/radio-module-baofeng-uv5r',
            manufacturer: 'Baofeng',
            name: 'Baofeng UV-5R',
            version: '3.7.0',
            config: 'configs/baofeng-uv5r.json',
            minApiVersion: '18.0.1',
            downloadUrl:
              'https://github.com/springfield-ham-radio/radio-module-baofeng/releases/download/v3.7.2/radio-module-baofeng-uv5r-3.7.0.zip',
            integrity: 'sha256:a7d4006eea12b6a25b74dc47e26999ad6ca4ed41f5c91c4d36411028094acac1',
          },
        ],
      }),
    );

    expect(catalog.modules[0]?.id).toBe('baofeng-uv5r');
    expect(isApiVersionCompatible(APP_HAM_RADIO_API_VERSION, catalog.modules[0]!.minApiVersion)).toBe(true);
  });

  it('should match the installed @springfield/ham-radio-api package version', () => {
    const require = createRequire(import.meta.url);
    const apiPackage = require('@springfield/ham-radio-api/package.json') as { version: string };

    expect(APP_HAM_RADIO_API_VERSION).toBe(apiPackage.version);
    expect(APP_HAM_RADIO_API_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('should accept or reject minApiVersion at semver boundaries', () => {
    const installed = APP_HAM_RADIO_API_VERSION;
    const parts = installed.split('.').map((part) => Number.parseInt(part, 10) || 0);
    const [major, minor, patch] = parts;
    const previousPatch = `${major}.${minor}.${Math.max(0, patch - 1)}`;
    const nextPatch = `${major}.${minor}.${patch + 1}`;
    const nextMajor = `${major + 1}.0.0`;

    expect(isApiVersionCompatible(installed, installed)).toBe(true);
    expect(isApiVersionCompatible(installed, previousPatch)).toBe(true);
    expect(isApiVersionCompatible(installed, nextPatch)).toBe(false);
    expect(isApiVersionCompatible(installed, nextMajor)).toBe(false);
    expect(isApiVersionCompatible(`${installed}-beta.1`, installed)).toBe(true);
  });

  it('should detect per-radio module install directories', () => {
    expect(
      isModuleInstallPath(
        '/Users/me/Library/Application Support/com.springfield.ham-radio/radio-modules/baofeng-uv5r/3.7.0',
      ),
    ).toBe(true);
    expect(isModuleInstallPath('/tmp/baofeng-config.json')).toBe(false);
  });

  it('should parse model id and version from install paths', () => {
    expect(
      parseModuleInstallPath(
        'C:\\Users\\me\\AppData\\Roaming\\com.springfield.ham-radio\\radio-modules\\kenwood-th-f6\\1.11.0',
      ),
    ).toEqual({ moduleId: 'kenwood-th-f6', version: '1.11.0' });
  });

  it('should only treat paths inside the retired app-data directories as legacy rows', () => {
    const kenwoodBundle =
      '/Users/me/Library/Application Support/com.springfield.ham-radio/radio-modules/kenwood';
    const baofengBundle =
      'C:\\Users\\me\\AppData\\Roaming\\com.springfield.ham-radio\\radio-modules\\baofeng';

    expect(isPathUnderDirectory(`${kenwoodBundle}/1.11.2`, kenwoodBundle)).toBe(true);
    expect(isPathUnderDirectory(`${kenwoodBundle}/1.11.2/configs/kenwood-th-d74.json`, kenwoodBundle)).toBe(true);
    expect(isPathUnderDirectory(`${baofengBundle}\\3.7.2`, baofengBundle)).toBe(true);
    expect(
      isPathUnderDirectory(
        '/Users/me/Library/Application Support/com.springfield.ham-radio/radio-modules/kenwood-th-f6/1.11.0',
        kenwoodBundle,
      ),
    ).toBe(false);
    expect(isPathUnderDirectory('/Users/me/Development/radio-module-kenwood/configs/kenwood-th-f6.json', kenwoodBundle)).toBe(
      false,
    );
    expect(isPathUnderDirectory('/Users/me/Documents/my-radio.json', kenwoodBundle)).toBe(false);
  });

  it('should flag legacy manufacturer bundle install paths', () => {
    expect(isLegacyManufacturerModulePath('/tmp/radio-modules/kenwood/1.8.0')).toBe(true);
    expect(isLegacyManufacturerModulePath('/tmp/radio-modules/kenwood-th-f6/1.11.0')).toBe(false);
  });

  it('should reload catalog rows that were installed from a local JSON file', () => {
    expect(
      isUserJsonCatalogSourcePath(
        'user',
        '/Users/me/Development/radio-module-kenwood/configs/kenwood-tm-d710a.json',
      ),
    ).toBe(true);
    expect(isUserJsonCatalogSourcePath('installed', '/Users/me/radio-modules/kenwood-th-f6/1.11.0')).toBe(false);
    expect(isUserJsonCatalogSourcePath('user', '/Users/me/radio-modules/kenwood/1.1.0')).toBe(false);
  });

  it('should distinguish network failures from incompatible catalog documents', async () => {
    const network = officialCatalogFailureFromCause(
      new OfficialModuleCatalogError('network', 'Failed to fetch radio module catalog (HTTP 503)'),
    );
    expect(network.kind).toBe('network');
    expect(network.title).toBe(OFFICIAL_CATALOG_NETWORK_TITLE);
    expect(network.guidance).toContain('Connect to the internet');

    const incompatible = officialCatalogFailureFromCause(
      new OfficialModuleCatalogError(
        'incompatible',
        'Invalid module catalog: Unsupported schemaVersion 1: this registry accepts only schema version 3.',
      ),
    );
    expect(incompatible.kind).toBe('incompatible');
    expect(incompatible.title).toBe(OFFICIAL_CATALOG_INCOMPATIBLE_TITLE);
    expect(incompatible.guidance).toContain('Update HamBench');

    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () =>
        JSON.stringify({
          schemaVersion: 1,
          modules: [],
        }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchOfficialModuleCatalog('https://example.test/catalog.json')).rejects.toMatchObject({
      kind: 'incompatible',
    });

    vi.unstubAllGlobals();
  });

  it('should match a catalog config path to an extracted file', () => {
    expect(
      catalogConfigMatchesPath(
        'configs/baofeng-uv5r.json',
        '/tmp/radio-modules/baofeng-uv5r/3.7.0/configs/baofeng-uv5r.json',
      ),
    ).toBe(true);
    expect(
      catalogConfigMatchesPath('configs/kenwood-th-f6.json', '/tmp/radio-modules/kenwood-th-d74/1.11.1/configs/kenwood-th-d74.json'),
    ).toBe(false);
  });

  it('should not uninstall the verified directory when it replaced the same version', () => {
    const sameVersion =
      '/Users/me/Library/Application Support/com.springfield.ham-radio/radio-modules/baofeng-uv5r/3.7.0';

    expect(previousModuleDirectoryToRemove(sameVersion, 'baofeng-uv5r', '3.7.0')).toBeUndefined();
    expect(previousModuleDirectoryToRemove('/tmp/uv5r.json', 'baofeng-uv5r', '3.7.0')).toBeUndefined();
    expect(
      previousModuleDirectoryToRemove(
        '/Users/me/Library/Application Support/com.springfield.ham-radio/radio-modules/baofeng-uv5r/3.0.0',
        'baofeng-uv5r',
        '3.7.0',
      ),
    ).toEqual({ moduleId: 'baofeng-uv5r', version: '3.0.0' });
  });

  it('should validate packed config minApiVersion as strict semver', () => {
    expect(() =>
      validatePackedConfigMinApiVersion('kenwood-th-d74', JSON.stringify({ minApiVersion: '18.0.1' })),
    ).not.toThrow();

    expect(() => validatePackedConfigMinApiVersion('kenwood-th-d74', JSON.stringify({}))).toThrow(
      /invalid minApiVersion/,
    );
    expect(() =>
      validatePackedConfigMinApiVersion('kenwood-th-d74', JSON.stringify({ minApiVersion: '18.0.1-beta.1' })),
    ).toThrow(/invalid minApiVersion/);
  });

  it('should block packed configs that need a newer ham-radio-api', () => {
    const parts = APP_HAM_RADIO_API_VERSION.split('.').map((part) => Number.parseInt(part, 10) || 0);
    const future = `${parts[0]}.${parts[1]}.${(parts[2] ?? 0) + 1}`;

    expect(() =>
      validatePackedConfigMinApiVersion('kenwood-th-d74', JSON.stringify({ minApiVersion: future })),
    ).toThrow(/requires ham-radio-api/);
  });

  it('should export zip version parsing with beta suffix', () => {
    expect(versionFromZipName('radio-module-kenwood-th-d74-1.11.1-beta.1.zip')).toBe('1.11.1-beta.1');
  });

  it('should keep switching the remaining radios when one download fails', async () => {
    const entries = [
      { id: 'kenwood-th-d74' },
      { id: 'baofeng-uv5r' },
      { id: 'kenwood-th-f6' },
    ] as Parameters<typeof switchAllToVerifiedModules>[0];
    const attempted: string[] = [];

    const result = await switchAllToVerifiedModules(entries, async (entry) => {
      attempted.push(entry.id);

      if (entry.id === 'baofeng-uv5r') {
        throw new Error('Failed to download radio module: HTTP 503');
      }
    });

    expect(attempted).toEqual(['kenwood-th-d74', 'baofeng-uv5r', 'kenwood-th-f6']);
    expect(result.switchedIds).toEqual(['kenwood-th-d74', 'kenwood-th-f6']);
    expect(result.failures).toEqual([
      { id: 'baofeng-uv5r', message: 'Failed to download radio module: HTTP 503' },
    ]);
  });
});
