import { describe, expect, it } from 'vitest';
import { repairDarwinUpdaterManifest, type UpdaterManifest } from '../../scripts/darwin-updater-manifest.ts';

const signatureAarch64 = 'untrusted comment: signature from aarch64\nRabc64\n';
const signatureX64 = 'untrusted comment: signature from x86_64\nRxyz64\n';

function manifest(platforms: UpdaterManifest['platforms']): UpdaterManifest {
  return {
    version: '3.8.0',
    notes: 'See the assets to download this version and install.',
    pub_date: '2026-11-01T00:00:00Z',
    platforms,
  };
}

describe('darwin updater manifest', () => {
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

    const repaired = repairDarwinUpdaterManifest(
      current,
      [
        { name: 'HamBench_3.8.0_aarch64.app.tar.gz', apiUrl: 'https://api.github.com/repos/example/releases/assets/1' },
        {
          name: 'HamBench_3.8.0_aarch64.app.tar.gz.sig',
          apiUrl: 'https://api.github.com/repos/example/releases/assets/2',
        },
        { name: 'HamBench_3.8.0_x64.app.tar.gz', apiUrl: 'https://api.github.com/repos/example/releases/assets/3' },
        { name: 'HamBench_3.8.0_x64.app.tar.gz.sig', apiUrl: 'https://api.github.com/repos/example/releases/assets/4' },
        { name: 'HamBench_3.8.0_x64.dmg', apiUrl: 'https://api.github.com/repos/example/releases/assets/5' },
      ],
      {
        'HamBench_3.8.0_aarch64.app.tar.gz.sig': signatureAarch64,
        'HamBench_3.8.0_x64.app.tar.gz.sig': signatureX64,
      },
    );

    expect(repaired.changed).toBe(true);
    expect(repaired.updatedPlatforms).toEqual(['darwin-x86_64', 'darwin-x86_64-app']);
    expect(repaired.manifest.platforms['linux-x86_64']).toEqual(current.platforms['linux-x86_64']);
    expect(repaired.manifest.platforms['darwin-aarch64']?.url).toBe(
      'https://api.github.com/repos/example/releases/assets/1',
    );
    expect(repaired.manifest.platforms['darwin-x86_64']).toEqual({
      signature: signatureX64,
      url: 'https://api.github.com/repos/example/releases/assets/3',
    });
    expect(repaired.manifest.platforms['darwin-x86_64-app']).toEqual({
      signature: signatureX64,
      url: 'https://api.github.com/repos/example/releases/assets/3',
    });
    expect(repaired.manifest.notes).toBe(current.notes);
  });

  it('should leave a manifest unchanged when both macOS entries already match', () => {
    const current = manifest({
      'darwin-aarch64': { signature: signatureAarch64, url: 'https://api.github.com/repos/example/releases/assets/1' },
      'darwin-aarch64-app': {
        signature: signatureAarch64,
        url: 'https://api.github.com/repos/example/releases/assets/1',
      },
      'darwin-x86_64': { signature: signatureX64, url: 'https://api.github.com/repos/example/releases/assets/3' },
      'darwin-x86_64-app': { signature: signatureX64, url: 'https://api.github.com/repos/example/releases/assets/3' },
    });

    const repaired = repairDarwinUpdaterManifest(
      current,
      [
        { name: 'HamBench_3.8.0_aarch64.app.tar.gz', apiUrl: 'https://api.github.com/repos/example/releases/assets/1' },
        { name: 'HamBench_3.8.0_x64.app.tar.gz', apiUrl: 'https://api.github.com/repos/example/releases/assets/3' },
      ],
      {
        'HamBench_3.8.0_aarch64.app.tar.gz.sig': signatureAarch64,
        'HamBench_3.8.0_x64.app.tar.gz.sig': signatureX64,
      },
    );

    expect(repaired.changed).toBe(false);
    expect(repaired.updatedPlatforms).toEqual([]);
    expect(repaired.manifest).toEqual(current);
  });

  it('should replace a macOS entry that points at the other architecture', () => {
    const current = manifest({
      'darwin-aarch64': { signature: signatureX64, url: 'https://api.github.com/repos/example/releases/assets/3' },
      'darwin-x86_64': { signature: signatureX64, url: 'https://api.github.com/repos/example/releases/assets/3' },
    });

    const repaired = repairDarwinUpdaterManifest(
      current,
      [
        { name: 'HamBench_3.8.0_aarch64.app.tar.gz', apiUrl: 'https://api.github.com/repos/example/releases/assets/1' },
        { name: 'HamBench_3.8.0_x64.app.tar.gz', apiUrl: 'https://api.github.com/repos/example/releases/assets/3' },
      ],
      {
        'HamBench_3.8.0_aarch64.app.tar.gz.sig': signatureAarch64,
        'HamBench_3.8.0_x64.app.tar.gz.sig': signatureX64,
      },
    );

    expect(repaired.updatedPlatforms).toContain('darwin-aarch64');
    expect(repaired.manifest.platforms['darwin-aarch64']).toEqual({
      signature: signatureAarch64,
      url: 'https://api.github.com/repos/example/releases/assets/1',
    });
    expect(repaired.manifest.platforms['darwin-x86_64']?.url).toBe(
      'https://api.github.com/repos/example/releases/assets/3',
    );
  });
});
