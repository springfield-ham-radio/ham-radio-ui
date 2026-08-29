/**
 * Payload sent to Tauri remote-sniffer commands.
 */
export interface RemoteSnifferConfig {
  sshHost: string;
  sshPort: number;
  remoteDirectory: string;
  remoteStartCommand: string;
  localPort: number;
  remotePort: number;
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
export function remoteSnifferInstallLabel(check: Pick<RemoteSnifferCheckResult, 'sourcesPresent' | 'buildPresent'>): string {
  if (check.sourcesPresent && check.buildPresent) {
    return 'Installed';
  }

  if (check.sourcesPresent) {
    return 'Sources only';
  }

  return 'Not installed';
}

export function remoteSnifferInstallBadgeColor(
  check: Pick<RemoteSnifferCheckResult, 'sourcesPresent' | 'buildPresent'>,
): 'success' | 'warning' | 'neutral' {
  if (check.sourcesPresent && check.buildPresent) {
    return 'success';
  }

  if (check.sourcesPresent) {
    return 'warning';
  }

  return 'neutral';
}
