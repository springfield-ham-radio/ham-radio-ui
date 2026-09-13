import { describe, it } from 'node:test';
import { expect } from 'chai';
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

    expect(catalog.modules[0]?.id).to.equal('baofeng');
    expect(isApiVersionCompatible(APP_HAM_RADIO_API_VERSION, catalog.modules[0]!.minApiVersion)).to.be.true;
  });

  it('should detect module install directories', () => {
    expect(
      isModuleInstallPath('/Users/me/Library/Application Support/com.springfield.ham-radio/radio-modules/baofeng/3.1.0'),
    ).to.be.true;
    expect(isModuleInstallPath('/tmp/baofeng-config.json')).to.be.false;
  });

  it('should parse module id and version from install paths', () => {
    expect(
      parseModuleInstallPath(
        'C:\\Users\\me\\AppData\\Roaming\\com.springfield.ham-radio\\radio-modules\\baofeng\\3.1.0',
      ),
    ).to.deep.equal({ moduleId: 'baofeng', version: '3.1.0' });
  });

  it('should reload catalog rows that were installed from a local JSON file', () => {
    expect(
      isUserJsonCatalogSourcePath(
        'user',
        '/Users/me/Development/radio-module-kenwood/configs/kenwood-tm-d710a.json',
      ),
    ).to.equal(true);
    expect(isUserJsonCatalogSourcePath('installed', '/Users/me/radio-modules/kenwood/1.1.0')).to.equal(false);
    expect(isUserJsonCatalogSourcePath('user', '/Users/me/radio-modules/kenwood/1.1.0')).to.equal(false);
  });

  it('should match a catalog config path to an extracted file', () => {
    expect(
      catalogConfigMatchesPath(
        'configs/baofeng-uv5r.json',
        '/tmp/radio-modules/baofeng/3.4.1/configs/baofeng-uv5r.json',
      ),
    ).to.equal(true);
    expect(
      catalogConfigMatchesPath('configs/kenwood-th-f6.json', '/tmp/radio-modules/kenwood/1.8.0/configs/kenwood-th-d74.json'),
    ).to.equal(false);
  });

  it('should match a catalog radio id to a prefixed config model', () => {
    expect(catalogModelMatchesId('baofeng-uv5r', 'baofeng-uv5r', 'Baofeng')).to.equal(true);
    expect(catalogModelMatchesId('uv5r', 'baofeng-uv5r', 'Baofeng')).to.equal(true);
    expect(catalogModelMatchesId('uv5r-plus', 'baofeng-uv5r', 'Baofeng')).to.equal(false);
    expect(catalogModelMatchesId('th-d74', 'kenwood-th-d74', 'Kenwood')).to.equal(true);
  });
});

