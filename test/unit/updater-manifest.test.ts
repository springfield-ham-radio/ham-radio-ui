import { describe, expect, it } from 'vitest';
import {
  discoverUpdaterBundles,
  missingExpectedPlatformKeys,
  repairUpdaterManifest,
  type UpdaterAssetRef,
  type UpdaterManifest,
} from '../../scripts/updater-manifest.ts';

const signatureAarch64 = 'untrusted comment: signature from aarch64\nRabc64\n';
const signatureX64 = 'untrusted comment: signature from x86_64\nRxyz64\n';
const signatureLinuxAmd64AppImage = 'linux-amd64-appimage-sig\n';
const signatureLinuxAmd64Deb = 'linux-amd64-deb-sig\n';
const signatureWindowsMsi = 'windows-msi-sig\n';

function manifest(platforms: UpdaterManifest['platforms']): UpdaterManifest {
  return {
    version: '3.19.0',
    notes: 'See the assets to download this version and install.',
    pub_date: '2026-11-27T00:20:10.823Z',
    platforms,
  };
}

function v319Assets(): UpdaterAssetRef[] {
  return [
    { name: 'HamBench_3.19.0_aarch64.app.tar.gz', apiUrl: 'https://api.github.com/repos/example/releases/assets/1' },
    { name: 'HamBench_3.19.0_aarch64.app.tar.gz.sig', apiUrl: 'https://api.github.com/repos/example/releases/assets/2' },
    { name: 'HamBench_3.19.0_x64.app.tar.gz', apiUrl: 'https://api.github.com/repos/example/releases/assets/3' },
    { name: 'HamBench_3.19.0_x64.app.tar.gz.sig', apiUrl: 'https://api.github.com/repos/example/releases/assets/4' },
    { name: 'HamBench-3.19.0-Linux-x64.AppImage', apiUrl: 'https://api.github.com/repos/example/releases/assets/10' },
    { name: 'HamBench_3.19.0_amd64.AppImage.sig', apiUrl: 'https://api.github.com/repos/example/releases/assets/11' },
    { name: 'HamBench-3.19.0-Linux-x64.deb', apiUrl: 'https://api.github.com/repos/example/releases/assets/12' },
    { name: 'HamBench_3.19.0_amd64.deb.sig', apiUrl: 'https://api.github.com/repos/example/releases/assets/13' },
    { name: 'HamBench-3.19.0-Linux-x64.rpm', apiUrl: 'https://api.github.com/repos/example/releases/assets/14' },
    { name: 'HamBench-3.19.0-1.x86_64.rpm.sig', apiUrl: 'https://api.github.com/repos/example/releases/assets/15' },
    { name: 'HamBench-3.19.0-Linux-arm64.AppImage', apiUrl: 'https://api.github.com/repos/example/releases/assets/20' },
    { name: 'HamBench_3.19.0_aarch64.AppImage.sig', apiUrl: 'https://api.github.com/repos/example/releases/assets/21' },
    { name: 'HamBench-3.19.0-Windows-x64.msi', apiUrl: 'https://api.github.com/repos/example/releases/assets/30' },
    { name: 'HamBench_3.19.0_x64_en-US.msi.sig', apiUrl: 'https://api.github.com/repos/example/releases/assets/31' },
    { name: 'HamBench-3.19.0-Windows-x64.exe', apiUrl: 'https://api.github.com/repos/example/releases/assets/32' },
    { name: 'HamBench_3.19.0_x64-setup.exe.sig', apiUrl: 'https://api.github.com/repos/example/releases/assets/33' },
  ];
}

function v319Signatures(): Record<string, string> {
  return {
    'HamBench_3.19.0_aarch64.app.tar.gz.sig': signatureAarch64,
    'HamBench_3.19.0_x64.app.tar.gz.sig': signatureX64,
    'HamBench_3.19.0_amd64.AppImage.sig': signatureLinuxAmd64AppImage,
    'HamBench_3.19.0_amd64.deb.sig': signatureLinuxAmd64Deb,
    'HamBench-3.19.0-1.x86_64.rpm.sig': 'linux-amd64-rpm-sig\n',
    'HamBench_3.19.0_aarch64.AppImage.sig': 'linux-arm64-appimage-sig\n',
    'HamBench_3.19.0_x64_en-US.msi.sig': signatureWindowsMsi,
    'HamBench_3.19.0_x64-setup.exe.sig': 'windows-nsis-sig\n',
  };
}

describe('updater manifest repair', () => {
  it('should add Intel updater keys without dropping Linux entries', () => {
    const current = manifest({
      'darwin-aarch64': {
        signature: signatureAarch64,
        url: 'https://api.github.com/repos/example/releases/assets/1',
      },
      'darwin-aarch64-app': {
        signature: signatureAarch64,
        url: 'https://api.github.com/repos/example/releases/assets/1',
      },
      'linux-x86_64': {
        signature: 'linux-sig\n',
        url: 'https://api.github.com/repos/example/releases/assets/9',
      },
    });

    const repaired = repairUpdaterManifest(
      { ...current, version: '3.8.0' },
      [
        { name: 'HamBench_3.8.0_aarch64.app.tar.gz', apiUrl: 'https://api.github.com/repos/example/releases/assets/1' },
        {
          name: 'HamBench_3.8.0_aarch64.app.tar.gz.sig',
          apiUrl: 'https://api.github.com/repos/example/releases/assets/2',
        },
        { name: 'HamBench_3.8.0_x64.app.tar.gz', apiUrl: 'https://api.github.com/repos/example/releases/assets/3' },
        { name: 'HamBench_3.8.0_x64.app.tar.gz.sig', apiUrl: 'https://api.github.com/repos/example/releases/assets/4' },
      ],
      {
        'HamBench_3.8.0_aarch64.app.tar.gz.sig': signatureAarch64,
        'HamBench_3.8.0_x64.app.tar.gz.sig': signatureX64,
      },
    );

    expect(repaired.changed).toBe(true);
    expect(repaired.updatedPlatforms).toEqual(['darwin-x86_64', 'darwin-x86_64-app']);
    expect(repaired.manifest.platforms['linux-x86_64']).toEqual(current.platforms['linux-x86_64']);
    expect(repaired.manifest.platforms['darwin-x86_64']).toEqual({
      signature: signatureX64,
      url: 'https://api.github.com/repos/example/releases/assets/3',
    });
  });

  it('should restore missing Linux x86_64 keys from renamed installers', () => {
    const current = manifest({
      'darwin-aarch64': { signature: signatureAarch64, url: 'https://api.github.com/repos/example/releases/assets/1' },
      'darwin-aarch64-app': { signature: signatureAarch64, url: 'https://api.github.com/repos/example/releases/assets/1' },
      'darwin-x86_64': { signature: signatureX64, url: 'https://api.github.com/repos/example/releases/assets/3' },
      'darwin-x86_64-app': { signature: signatureX64, url: 'https://api.github.com/repos/example/releases/assets/3' },
      'linux-aarch64': { signature: 'arm\n', url: 'https://api.github.com/repos/example/releases/assets/20' },
      'linux-aarch64-appimage': { signature: 'arm\n', url: 'https://api.github.com/repos/example/releases/assets/20' },
      'windows-x86_64': { signature: signatureWindowsMsi, url: 'https://api.github.com/repos/example/releases/assets/30' },
      'windows-x86_64-msi': { signature: signatureWindowsMsi, url: 'https://api.github.com/repos/example/releases/assets/30' },
      'windows-x86_64-nsis': { signature: 'nsis\n', url: 'https://api.github.com/repos/example/releases/assets/32' },
    });

    const assets = v319Assets();
    const signatures = v319Signatures();

    expect(missingExpectedPlatformKeys(current, assets, '3.19.0')).toEqual([
      'linux-x86_64',
      'linux-x86_64-appimage',
      'linux-x86_64-deb',
      'linux-x86_64-rpm',
    ]);

    const repaired = repairUpdaterManifest(current, assets, signatures);

    expect(repaired.updatedPlatforms).toEqual(
      expect.arrayContaining(['linux-x86_64', 'linux-x86_64-appimage', 'linux-x86_64-deb', 'linux-x86_64-rpm']),
    );
    expect(repaired.manifest.platforms['linux-x86_64']).toEqual({
      signature: signatureLinuxAmd64AppImage,
      url: 'https://api.github.com/repos/example/releases/assets/10',
    });
    expect(repaired.manifest.platforms['linux-x86_64-deb']).toEqual({
      signature: signatureLinuxAmd64Deb,
      url: 'https://api.github.com/repos/example/releases/assets/12',
    });
    expect(missingExpectedPlatformKeys(repaired.manifest, assets, '3.19.0')).toEqual([]);
  });

  it('should leave a manifest unchanged when all entries already match', () => {
    const assets = v319Assets();
    const signatures = v319Signatures();
    const repaired = repairUpdaterManifest(
      manifest({
        'darwin-aarch64': { signature: signatureAarch64, url: 'https://api.github.com/repos/example/releases/assets/1' },
        'darwin-aarch64-app': { signature: signatureAarch64, url: 'https://api.github.com/repos/example/releases/assets/1' },
        'darwin-x86_64': { signature: signatureX64, url: 'https://api.github.com/repos/example/releases/assets/3' },
        'darwin-x86_64-app': { signature: signatureX64, url: 'https://api.github.com/repos/example/releases/assets/3' },
        'linux-x86_64': { signature: signatureLinuxAmd64AppImage, url: 'https://api.github.com/repos/example/releases/assets/10' },
        'linux-x86_64-appimage': {
          signature: signatureLinuxAmd64AppImage,
          url: 'https://api.github.com/repos/example/releases/assets/10',
        },
        'linux-x86_64-deb': { signature: signatureLinuxAmd64Deb, url: 'https://api.github.com/repos/example/releases/assets/12' },
        'linux-x86_64-rpm': { signature: 'linux-amd64-rpm-sig\n', url: 'https://api.github.com/repos/example/releases/assets/14' },
        'linux-aarch64': { signature: 'linux-arm64-appimage-sig\n', url: 'https://api.github.com/repos/example/releases/assets/20' },
        'linux-aarch64-appimage': {
          signature: 'linux-arm64-appimage-sig\n',
          url: 'https://api.github.com/repos/example/releases/assets/20',
        },
        'windows-x86_64': { signature: signatureWindowsMsi, url: 'https://api.github.com/repos/example/releases/assets/30' },
        'windows-x86_64-msi': { signature: signatureWindowsMsi, url: 'https://api.github.com/repos/example/releases/assets/30' },
        'windows-x86_64-nsis': { signature: 'windows-nsis-sig\n', url: 'https://api.github.com/repos/example/releases/assets/32' },
      }),
      assets,
      signatures,
    );

    expect(repaired.changed).toBe(false);
    expect(repaired.updatedPlatforms).toEqual([]);
  });

  it('should pair renamed Linux assets with Tauri signature filenames', () => {
    const bundles = discoverUpdaterBundles(v319Assets(), '3.19.0');

    expect(bundles.find((entry) => entry.sigAsset.name.endsWith('amd64.AppImage.sig'))?.bundleAsset.name).toBe(
      'HamBench-3.19.0-Linux-x64.AppImage',
    );
    expect(bundles.find((entry) => entry.sigAsset.name.endsWith('x86_64.rpm.sig'))?.bundleAsset.name).toBe(
      'HamBench-3.19.0-Linux-x64.rpm',
    );
  });
});