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
    expect(remoteSnifferInstallLabel({ sourcesPresent: true, buildPresent: true })).to.equal('Installed');
    expect(remoteSnifferInstallBadgeColor({ sourcesPresent: true, buildPresent: true })).to.equal('success');
  });
});
