import { describe, it } from 'node:test';
import { expect } from 'chai';
import { remoteSnifferInstallBadgeColor, remoteSnifferInstallLabel } from '../../app/utils/sniffer-ssh.ts';

describe('remote sniffer install status', () => {
  it('should label missing sources as not installed', () => {
    expect(remoteSnifferInstallLabel({ sourcesPresent: false, buildPresent: false })).to.equal('Not installed');
    expect(remoteSnifferInstallBadgeColor({ sourcesPresent: false, buildPresent: false })).to.equal('neutral');
  });

  it('should label sources without a build as sources only', () => {
    expect(remoteSnifferInstallLabel({ sourcesPresent: true, buildPresent: false })).to.equal('Sources only');
    expect(remoteSnifferInstallBadgeColor({ sourcesPresent: true, buildPresent: false })).to.equal('warning');
  });

  it('should label a complete remote build as installed', () => {
    expect(
      remoteSnifferInstallLabel({ sourcesPresent: true, buildPresent: true, versionMatch: true }),
    ).to.equal('Installed');
    expect(
      remoteSnifferInstallBadgeColor({ sourcesPresent: true, buildPresent: true, versionMatch: true }),
    ).to.equal('success');
  });

  it('should include the installed version when it matches the bundled copy', () => {
    expect(
      remoteSnifferInstallLabel({
        sourcesPresent: true,
        buildPresent: true,
        versionMatch: true,
        installedVersion: '0.1.0',
      }),
    ).to.equal('Installed 0.1.0');
  });

  it('should flag an older installed sniffer as needing an update', () => {
    expect(
      remoteSnifferInstallLabel({
        sourcesPresent: true,
        buildPresent: true,
        versionMatch: false,
        installedVersion: '0.1.0',
      }),
    ).to.equal('Update from 0.1.0');
    expect(
      remoteSnifferInstallBadgeColor({
        sourcesPresent: true,
        buildPresent: true,
        versionMatch: false,
      }),
    ).to.equal('warning');
  });
});
