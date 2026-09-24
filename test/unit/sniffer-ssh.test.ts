import { describe, expect, it } from 'vitest';
import { remoteSnifferInstallBadgeColor, remoteSnifferInstallLabel } from '../../app/utils/sniffer-ssh.ts';

describe('remote sniffer install status', () => {
  it('should label missing sources as not installed', () => {
    expect(remoteSnifferInstallLabel({ sourcesPresent: false, buildPresent: false })).toBe('Not installed');
    expect(remoteSnifferInstallBadgeColor({ sourcesPresent: false, buildPresent: false })).toBe('neutral');
  });

  it('should label sources without a build as sources only', () => {
    expect(remoteSnifferInstallLabel({ sourcesPresent: true, buildPresent: false })).toBe('Sources only');
    expect(remoteSnifferInstallBadgeColor({ sourcesPresent: true, buildPresent: false })).toBe('warning');
  });

  it('should label a complete remote build as installed', () => {
    expect(
      remoteSnifferInstallLabel({ sourcesPresent: true, buildPresent: true, versionMatch: true }),
    ).toBe('Installed');
    expect(
      remoteSnifferInstallBadgeColor({ sourcesPresent: true, buildPresent: true, versionMatch: true }),
    ).toBe('success');
  });

  it('should include the installed version when it matches the bundled copy', () => {
    expect(
      remoteSnifferInstallLabel({
        sourcesPresent: true,
        buildPresent: true,
        versionMatch: true,
        installedVersion: '0.1.0',
      }),
    ).toBe('Installed 0.1.0');
  });

  it('should flag an older installed sniffer as needing an update', () => {
    expect(
      remoteSnifferInstallLabel({
        sourcesPresent: true,
        buildPresent: true,
        versionMatch: false,
        installedVersion: '0.1.0',
      }),
    ).toBe('Update from 0.1.0');
    expect(
      remoteSnifferInstallBadgeColor({
        sourcesPresent: true,
        buildPresent: true,
        versionMatch: false,
      }),
    ).toBe('warning');
  });
});
