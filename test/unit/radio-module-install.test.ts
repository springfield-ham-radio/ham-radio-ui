import { describe, expect, it } from 'vitest';
import { isApiVersionCompatible, parseModuleCatalog } from '@springfield/ham-radio-registry';
import {
  APP_HAM_RADIO_API_VERSION,
  catalogConfigMatchesPath,
  catalogModelMatchesId,
  isModuleInstallPath,
  isUserJsonCatalogSourcePath,
  parseModuleInstallPath,
} from '../../app/utils/radio-module-install.ts';

describe('radio module install helpers', () => {
  it('should parse a catalog entry shape used by the installer', () => {
    const catalog = parseModuleCatalog(
      JSON.stringify({
        schemaVersion: 1,
        modules: [
          {
            id: 'baofeng',
            package: '@springfield/radio-module-baofeng',
            manufacturer: 'Baofeng',
            version: '3.1.0',
            radios: [
              {
                modelId: 'baofeng-uv5r',
                name: 'Baofeng UV-5R',
                config: 'configs/baofeng-uv5r.json',
              },
            ],
            supportedRadios: ['baofeng-uv5r'],
            minApiVersion: '17.3.0',
            downloadUrl:
              'https://github.com/springfield-ham-radio/radio-module-baofeng/releases/download/v3.1.0/radio-module-baofeng-3.1.0.zip',
            integrity: 'sha256:a7d4006eea12b6a25b74dc47e26999ad6ca4ed41f5c91c4d36411028094acac1',
          },
        ],
      }),
    );

    expect(catalog.modules[0]?.id).toBe('baofeng');
    expect(isApiVersionCompatible(APP_HAM_RADIO_API_VERSION, catalog.modules[0]!.minApiVersion)).toBe(true);
  });

  it('should detect module install directories', () => {
    expect(
      isModuleInstallPath('/Users/me/Library/Application Support/com.springfield.ham-radio/radio-modules/baofeng/3.1.0'),
    ).toBe(true);
    expect(isModuleInstallPath('/tmp/baofeng-config.json')).toBe(false);
  });

  it('should parse module id and version from install paths', () => {
    expect(
      parseModuleInstallPath(
        'C:\\Users\\me\\AppData\\Roaming\\com.springfield.ham-radio\\radio-modules\\baofeng\\3.1.0',
      ),
    ).toEqual({ moduleId: 'baofeng', version: '3.1.0' });
  });

  it('should reload catalog rows that were installed from a local JSON file', () => {
    expect(
      isUserJsonCatalogSourcePath(
        'user',
        '/Users/me/Development/radio-module-kenwood/configs/kenwood-tm-d710a.json',
      ),
    ).toBe(true);
    expect(isUserJsonCatalogSourcePath('installed', '/Users/me/radio-modules/kenwood/1.1.0')).toBe(false);
    expect(isUserJsonCatalogSourcePath('user', '/Users/me/radio-modules/kenwood/1.1.0')).toBe(false);
  });

  it('should match a catalog config path to an extracted file', () => {
    expect(
      catalogConfigMatchesPath(
        'configs/baofeng-uv5r.json',
        '/tmp/radio-modules/baofeng/3.4.1/configs/baofeng-uv5r.json',
      ),
    ).toBe(true);
    expect(
      catalogConfigMatchesPath('configs/kenwood-th-f6.json', '/tmp/radio-modules/kenwood/1.8.0/configs/kenwood-th-d74.json'),
    ).toBe(false);
  });

  it('should match a catalog radio id to a prefixed config model', () => {
    expect(catalogModelMatchesId('baofeng-uv5r', 'baofeng-uv5r', 'Baofeng')).toBe(true);
    expect(catalogModelMatchesId('uv5r', 'baofeng-uv5r', 'Baofeng')).toBe(true);
    expect(catalogModelMatchesId('uv5r-plus', 'baofeng-uv5r', 'Baofeng')).toBe(false);
    expect(catalogModelMatchesId('th-d74', 'kenwood-th-d74', 'Kenwood')).toBe(true);
  });
});

