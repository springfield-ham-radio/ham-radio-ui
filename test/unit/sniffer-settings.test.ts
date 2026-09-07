import { describe, it } from 'node:test';
import { expect } from 'chai';
import {
  DEFAULT_SNIFFER_BASE_URL,
  DEFAULT_SNIFFER_HOST,
  DEFAULT_SNIFFER_INSTALL_DIRECTORY,
  DEFAULT_SNIFFER_PORT,
  DEFAULT_SNIFFER_START_COMMAND,
  DEFAULT_SNIFFER_SSH_PORT,
  isSnifferSshConfigured,
  parseSnifferSettings,
  quoteRemoteShellArg,
  remoteDirectoryAssignmentRhs,
  serializeSnifferSettings,
  snifferApiUrl,
  snifferBindHost,
  snifferHttpUrl,
  snifferSshTarget,
} from '../../app/utils/sniffer-settings.ts';
import { snifferSettingsToRemoteConfig } from '../../app/utils/sniffer-ssh.ts';

describe('sniffer settings', () => {
  it('should default to localhost with SSH disabled', () => {
    expect(parseSnifferSettings(null)).to.deep.equal({
      host: DEFAULT_SNIFFER_HOST,
      port: DEFAULT_SNIFFER_PORT,
      installDirectory: DEFAULT_SNIFFER_INSTALL_DIRECTORY,
      startCommand: DEFAULT_SNIFFER_START_COMMAND,
      sshEnabled: false,
    });
    expect(isSnifferSshConfigured(parseSnifferSettings(null))).to.equal(false);
    expect(snifferHttpUrl(parseSnifferSettings(null))).to.equal(DEFAULT_SNIFFER_BASE_URL);
  });

  it('should fall back to the default host when storage is invalid', () => {
    expect(parseSnifferSettings('').host).to.equal(DEFAULT_SNIFFER_HOST);
    expect(parseSnifferSettings('{').host).to.equal(DEFAULT_SNIFFER_HOST);
    expect(parseSnifferSettings('[]').host).to.equal(DEFAULT_SNIFFER_HOST);
  });

  it('should accept a host, port, install directory, run command, and the SSH checkbox', () => {
    expect(
      parseSnifferSettings(
        JSON.stringify({
          host: '192.168.1.10',
          port: 3010,
          installDirectory: '/opt/sniffer',
          startCommand: 'node .output/server/index.mjs',
          sshEnabled: true,
        }),
      ),
    ).to.deep.equal({
      host: '192.168.1.10',
      port: 3010,
      installDirectory: '/opt/sniffer',
      startCommand: 'node .output/server/index.mjs',
      sshEnabled: true,
    });
  });

  it('should split a legacy Sniffer URL into host and port', () => {
    expect(
      parseSnifferSettings(
        JSON.stringify({
          baseUrl: 'http://192.168.1.10:4010/',
          sshEnabled: true,
        }),
      ),
    ).to.deep.equal({
      host: '192.168.1.10',
      port: 4010,
      installDirectory: DEFAULT_SNIFFER_INSTALL_DIRECTORY,
      startCommand: DEFAULT_SNIFFER_START_COMMAND,
      sshEnabled: true,
    });
  });

  it('should keep a legacy remoteStartCommand as startCommand', () => {
    expect(
      parseSnifferSettings(
        JSON.stringify({
          host: '127.0.0.1',
          remoteStartCommand: 'node .output/server/index.mjs',
        }),
      ).startCommand,
    ).to.equal('node .output/server/index.mjs');
  });

  it('should enable SSH from a legacy sshHost and move it into host when needed', () => {
    expect(
      parseSnifferSettings(
        JSON.stringify({
          baseUrl: 'http://127.0.0.1:3010',
          sshHost: 'pi@192.168.1.10',
          remoteDirectory: '~/ham-radio-sniffer',
          port: 3010,
        }),
      ),
    ).to.deep.equal({
      host: 'pi@192.168.1.10',
      port: 3010,
      installDirectory: '~/ham-radio-sniffer',
      startCommand: DEFAULT_SNIFFER_START_COMMAND,
      sshEnabled: true,
    });
  });

  it('should keep a LAN host and add a legacy SSH username', () => {
    expect(
      parseSnifferSettings(
        JSON.stringify({
          baseUrl: 'http://192.168.1.10:3010',
          sshHost: 'pi@192.168.1.10',
        }),
      ),
    ).to.deep.equal({
      host: 'pi@192.168.1.10',
      port: 3010,
      installDirectory: DEFAULT_SNIFFER_INSTALL_DIRECTORY,
      startCommand: DEFAULT_SNIFFER_START_COMMAND,
      sshEnabled: true,
    });
  });

  it('should derive HTTP URL, SSH target, and bind address from host and port', () => {
    expect(snifferHttpUrl({ host: 'pi@192.168.1.10', port: 3010 })).to.equal('http://192.168.1.10:3010');
    expect(snifferSshTarget({ host: 'pi@192.168.1.10', port: 3010 })).to.deep.equal({
      sshHost: 'pi@192.168.1.10',
      port: 3010,
    });
    expect(snifferSshTarget({ host: '192.168.1.10', port: DEFAULT_SNIFFER_PORT })).to.deep.equal({
      sshHost: '192.168.1.10',
      port: DEFAULT_SNIFFER_PORT,
    });
    expect(snifferBindHost('127.0.0.1')).to.equal('127.0.0.1');
    expect(snifferBindHost('192.168.1.10')).to.equal('0.0.0.0');
  });

  it('should join API paths onto the HTTP origin', () => {
    expect(snifferApiUrl('http://127.0.0.1:3010/', '/api/health')).to.equal('http://127.0.0.1:3010/api/health');
  });

  it('should map local install/start onto bind-localhost without an SSH host', () => {
    expect(
      snifferSettingsToRemoteConfig({
        host: '127.0.0.1',
        port: 3010,
        installDirectory: '~/ham-radio-sniffer',
        startCommand: 'yarn start',
        sshEnabled: false,
      }),
    ).to.deep.equal({
      sshEnabled: false,
      sshHost: '',
      sshPort: DEFAULT_SNIFFER_SSH_PORT,
      remoteDirectory: '~/ham-radio-sniffer',
      remoteStartCommand: DEFAULT_SNIFFER_START_COMMAND,
      port: 3010,
      bindHost: '127.0.0.1',
    });
  });

  it('should map a remote host onto SSH start/stop', () => {
    expect(
      snifferSettingsToRemoteConfig({
        host: 'pi@192.168.1.10',
        port: 4010,
        installDirectory: '/opt/sniffer',
        startCommand: 'node .output/server/index.mjs',
        sshEnabled: true,
      }),
    ).to.deep.equal({
      sshEnabled: true,
      sshHost: 'pi@192.168.1.10',
      sshPort: DEFAULT_SNIFFER_SSH_PORT,
      remoteDirectory: '/opt/sniffer',
      remoteStartCommand: 'node .output/server/index.mjs',
      port: 4010,
      bindHost: '0.0.0.0',
    });
  });

  it('should quote remote shell arguments for bash -lc', () => {
    expect(quoteRemoteShellArg(`/tmp/o'sniffer`)).to.equal(`'/tmp/o'\\''sniffer'`);
  });

  it('should expand a leading tilde for remote directory assignments', () => {
    expect(remoteDirectoryAssignmentRhs('~')).to.equal('"$HOME"');
    expect(remoteDirectoryAssignmentRhs('~/ham-radio-sniffer')).to.equal('"$HOME/ham-radio-sniffer"');
    expect(remoteDirectoryAssignmentRhs('/opt/sniffer')).to.equal("'/opt/sniffer'");
  });

  it('should round-trip settings through serialize and parse', () => {
    const settings = {
      host: 'pi@192.168.1.10',
      port: 3010,
      installDirectory: '~/ham-radio-sniffer',
      startCommand: 'yarn start',
      sshEnabled: true,
    };

    expect(parseSnifferSettings(serializeSnifferSettings(settings))).to.deep.equal(settings);
    expect(isSnifferSshConfigured(settings)).to.equal(true);
  });
});
