import { describe, it } from 'node:test';
import { expect } from 'chai';
import {
  DEFAULT_SNIFFER_BASE_URL,
  DEFAULT_SNIFFER_LOCAL_PORT,
  DEFAULT_SNIFFER_REMOTE_DIRECTORY,
  DEFAULT_SNIFFER_REMOTE_PORT,
  DEFAULT_SNIFFER_REMOTE_START_COMMAND,
  DEFAULT_SNIFFER_SSH_PORT,
  isSnifferSshConfigured,
  parseSnifferSettings,
  quoteRemoteShellArg,
  serializeSnifferSettings,
  snifferApiUrl,
  snifferLocalForwardBaseUrl,
} from '../../app/utils/sniffer-settings.ts';

describe('sniffer settings', () => {
  it('should default to the local sniffer API with SSH disabled', () => {
    expect(parseSnifferSettings(null)).to.deep.equal({
      baseUrl: DEFAULT_SNIFFER_BASE_URL,
      sshHost: '',
      sshPort: DEFAULT_SNIFFER_SSH_PORT,
      remoteDirectory: DEFAULT_SNIFFER_REMOTE_DIRECTORY,
      remoteStartCommand: DEFAULT_SNIFFER_REMOTE_START_COMMAND,
      localPort: DEFAULT_SNIFFER_LOCAL_PORT,
      remotePort: DEFAULT_SNIFFER_REMOTE_PORT,
    });
    expect(isSnifferSshConfigured(parseSnifferSettings(null))).to.equal(false);
  });

  it('should fall back to the default URL when storage is invalid', () => {
    expect(parseSnifferSettings('').baseUrl).to.equal(DEFAULT_SNIFFER_BASE_URL);
    expect(parseSnifferSettings('{').baseUrl).to.equal(DEFAULT_SNIFFER_BASE_URL);
    expect(parseSnifferSettings('[]').baseUrl).to.equal(DEFAULT_SNIFFER_BASE_URL);
    expect(parseSnifferSettings(JSON.stringify({ baseUrl: 'ftp://example' })).baseUrl).to.equal(DEFAULT_SNIFFER_BASE_URL);
  });

  it('should accept an http(s) URL and optional SSH fields', () => {
    expect(
      parseSnifferSettings(
        JSON.stringify({
          baseUrl: 'http://192.168.1.10:3010/',
          sshHost: 'pi@raspberrypi.local',
          sshPort: 2222,
          remoteDirectory: '/opt/sniffer',
          remoteStartCommand: 'yarn start',
          localPort: 3010,
          remotePort: 3010,
        }),
      ),
    ).to.deep.equal({
      baseUrl: 'http://192.168.1.10:3010',
      sshHost: 'pi@raspberrypi.local',
      sshPort: 2222,
      remoteDirectory: '/opt/sniffer',
      remoteStartCommand: 'yarn start',
      localPort: 3010,
      remotePort: 3010,
    });
  });

  it('should join API paths onto the base URL', () => {
    expect(snifferApiUrl('http://127.0.0.1:3010/', '/api/health')).to.equal('http://127.0.0.1:3010/api/health');
  });

  it('should build the local forward base URL', () => {
    expect(snifferLocalForwardBaseUrl(3010)).to.equal('http://127.0.0.1:3010');
  });

  it('should quote remote shell arguments for bash -lc', () => {
    expect(quoteRemoteShellArg(`/tmp/o'sniffer`)).to.equal(`'/tmp/o'\\''sniffer'`);
  });

  it('should round-trip settings through serialize and parse', () => {
    const settings = {
      baseUrl: 'http://127.0.0.1:3010',
      sshHost: 'pi@host',
      sshPort: 22,
      remoteDirectory: '~/ham-radio-sniffer',
      remoteStartCommand: 'yarn start',
      localPort: 3010,
      remotePort: 3010,
    };

    expect(parseSnifferSettings(serializeSnifferSettings(settings))).to.deep.equal(settings);
    expect(isSnifferSshConfigured(settings)).to.equal(true);
  });
});
