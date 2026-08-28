import { describe, it } from 'node:test';
import { expect } from 'chai';
import { isApiVersionCompatible, parseModuleCatalog } from '@springfield/ham-radio-registry';
import {
  APP_HAM_RADIO_API_VERSION,
  isModuleInstallPath,
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
            supportedRadios: ['uv5r'],
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
});
