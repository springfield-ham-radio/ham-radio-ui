/**
 * Frontend helpers for optional remote-sniffer SSH commands (Tauri only).
 */

import { isTauriRuntime } from '~/utils/radio-memory-file-io';
import type { SnifferSettings } from '~/utils/sniffer-settings';
import { isSnifferSshConfigured } from '~/utils/sniffer-settings';
import type {
  RemoteSnifferCheckResult,
  RemoteSnifferCommandResult,
  RemoteSnifferConfig,
  RemoteSnifferStatus,
} from '~/utils/sniffer-ssh';

export function snifferSettingsToRemoteConfig(settings: SnifferSettings): RemoteSnifferConfig {
  return {
    sshHost: settings.sshHost.trim(),
    sshPort: settings.sshPort,
    remoteDirectory: settings.remoteDirectory.trim(),
    remoteStartCommand: settings.remoteStartCommand.trim(),
    localPort: settings.port,
    remotePort: settings.port,
  };
}

async function invokeRemote<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriRuntime()) {
    throw new Error('Remote sniffer SSH requires the Tauri desktop app.');
  }

  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

export async function checkRemoteSnifferHost(settings: SnifferSettings): Promise<RemoteSnifferCheckResult> {
  return invokeRemote<RemoteSnifferCheckResult>('check_remote_sniffer_host', {
    config: snifferSettingsToRemoteConfig(settings),
  });
}

export async function installRemoteSniffer(settings: SnifferSettings): Promise<RemoteSnifferCommandResult> {
  return invokeRemote<RemoteSnifferCommandResult>('install_remote_sniffer', {
    config: snifferSettingsToRemoteConfig(settings),
  });
}

export async function startRemoteSniffer(settings: SnifferSettings): Promise<RemoteSnifferCommandResult> {
  return invokeRemote<RemoteSnifferCommandResult>('start_remote_sniffer', {
    config: snifferSettingsToRemoteConfig(settings),
  });
}

export async function stopRemoteSniffer(settings?: SnifferSettings): Promise<RemoteSnifferCommandResult> {
  if (settings) {
    return invokeRemote<RemoteSnifferCommandResult>('stop_remote_sniffer', {
      config: snifferSettingsToRemoteConfig(settings),
    });
  }

  return invokeRemote<RemoteSnifferCommandResult>('stop_remote_sniffer', {
    config: null,
  });
}

export async function remoteSnifferStatus(): Promise<RemoteSnifferStatus> {
  return invokeRemote<RemoteSnifferStatus>('remote_sniffer_status');
}

export function canUseRemoteSnifferSsh(settings: Pick<SnifferSettings, 'sshHost'>): boolean {
  return isTauriRuntime() && isSnifferSshConfigured(settings);
}
