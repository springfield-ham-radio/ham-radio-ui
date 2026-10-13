import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { isApiVersionCompatible, parseModuleCatalog } from '@springfield/ham-radio-registry';
import { isPathUnderDirectory } from '../../app/utils/radio-catalog-db.ts';
import {
  APP_HAM_RADIO_API_VERSION,
  catalogConfigMatchesPath,
  isLegacyManufacturerModulePath,
  isModuleInstallPath,
  isUserJsonCatalogSourcePath,
  parseModuleInstallPath,
} from '../../app/utils/radio-module-install.ts';

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
});
