import { describe, expect, it } from 'vitest';
import { releaseInstallerDownloadName } from '../../scripts/release-installer-names.ts';

describe('release installer names', () => {
  const version = '0.36.0';

  it('should name the Apple Silicon disk image as macOS', () => {
    expect(releaseInstallerDownloadName('HamBench_0.36.0_aarch64.dmg', version)).toBe(
      'HamBench-0.36.0-macOS-Apple-Silicon.dmg',
    );
  });

  it('should name Linux packages by format', () => {
    expect(releaseInstallerDownloadName('HamBench_0.36.0_amd64.deb', version)).toBe('HamBench-0.36.0-Linux-x64.deb');
    expect(releaseInstallerDownloadName('HamBench-0.36.0-1.x86_64.rpm', version)).toBe('HamBench-0.36.0-Linux-x64.rpm');
    expect(releaseInstallerDownloadName('HamBench_0.36.0_amd64.AppImage', version)).toBe(
      'HamBench-0.36.0-Linux-x64.AppImage',
    );
  });

  it('should name Windows installers without the NSIS setup suffix', () => {
    expect(releaseInstallerDownloadName('ham-radio_0.36.0_x64-setup.exe', version)).toBe(
      'HamBench-0.36.0-Windows-x64.exe',
    );
    expect(releaseInstallerDownloadName('HamBench_0.36.0_x64_en-US.msi', version)).toBe(
      'HamBench-0.36.0-Windows-x64.msi',
    );
  });

  it('should leave updater artifacts and already labeled installers unchanged', () => {
    expect(releaseInstallerDownloadName('HamBench_0.36.0_aarch64.app.tar.gz', version)).toBeUndefined();
    expect(releaseInstallerDownloadName('HamBench_0.36.0_amd64.deb.sig', version)).toBeUndefined();
    expect(releaseInstallerDownloadName('latest.json', version)).toBeUndefined();
    expect(releaseInstallerDownloadName('HamBench-0.36.0-macOS-Apple-Silicon.dmg', version)).toBeUndefined();
  });
});
