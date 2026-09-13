/**
 * Payload sent to Tauri remote-sniffer commands.
 */

import {
  DEFAULT_SNIFFER_INSTALL_DIRECTORY,
  DEFAULT_SNIFFER_PORT,
  DEFAULT_SNIFFER_START_COMMAND,
  DEFAULT_SNIFFER_SSH_PORT,
  snifferBindHost,
  snifferSshTarget,
} from './sniffer-settings';

export interface RemoteSnifferConfig {
  sshEnabled: boolean;
  sshHost: string;
  sshPort: number;
  remoteDirectory: string;
  remoteStartCommand: string;
  port: number;
  bindHost: string;
}

export interface RemoteSnifferCheckResult {
  ok: boolean;
  nodeVersion?: string;
  yarnAvailable: boolean;
  directoryWritable: boolean;
  /** `package.json` exists in the remote directory. */
  sourcesPresent: boolean;
  /** `.output/server/index.mjs` exists (yarn build completed). */
  buildPresent: boolean;
  installedVersion?: string;
  expectedVersion?: string;
  /** False when the installed sniffer is older than the copy bundled in this app. */
  versionMatch: boolean;
  messages: string[];
}

export interface RemoteSnifferStatus {
  running: boolean;
}

export interface RemoteSnifferCommandResult {
  ok: boolean;
  message: string;
}

/**
 * Human-readable remote sniffer install state from a host check.
 */
export function remoteSnifferInstallLabel(
  check: Pick<RemoteSnifferCheckResult, 'sourcesPresent' | 'buildPresent'> &
    Partial<Pick<RemoteSnifferCheckResult, 'versionMatch' | 'installedVersion'>>,
): string {
  if (check.sourcesPresent && check.buildPresent) {
    if (check.versionMatch === false) {
      return check.installedVersion ? `Update from ${check.installedVersion}` : 'Update available';
    }

    return check.installedVersion ? `Installed ${check.installedVersion}` : 'Installed';
  }

  if (check.sourcesPresent) {
    return 'Sources only';
  }

  return 'Not installed';
}

export function remoteSnifferInstallBadgeColor(
  check: Pick<RemoteSnifferCheckResult, 'sourcesPresent' | 'buildPresent'> &
    Partial<Pick<RemoteSnifferCheckResult, 'versionMatch'>>,
): 'success' | 'warning' | 'neutral' {
  if (check.sourcesPresent && check.buildPresent) {
    return check.versionMatch === false ? 'warning' : 'success';
  }

  if (check.sourcesPresent) {
    return 'warning';
  }

  return 'neutral';
}

/**
 * Map preferences into the Tauri sniffer-manager payload.
 *
 * SSH target and listen port come from host and port. When SSH is off, commands
 * run on this computer.
 */
export function snifferSettingsToRemoteConfig(settings: {
  host: string;
  port: number;
  installDirectory: string;
  startCommand: string;
  sshEnabled: boolean;
}): RemoteSnifferConfig {
  const target = snifferSshTarget(settings);

  return {
    sshEnabled: settings.sshEnabled,
    sshHost: settings.sshEnabled ? (target?.sshHost ?? '') : '',
    sshPort: DEFAULT_SNIFFER_SSH_PORT,
    remoteDirectory: settings.installDirectory.trim() || DEFAULT_SNIFFER_INSTALL_DIRECTORY,
    remoteStartCommand: settings.startCommand.trim() || DEFAULT_SNIFFER_START_COMMAND,
    port: target?.port ?? DEFAULT_SNIFFER_PORT,
    bindHost: snifferBindHost(settings.host),
  };
}
