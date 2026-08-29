export const SNIFFER_SETTINGS_STORAGE_KEY = 'ham-radio-sniffer';
export const DEFAULT_SNIFFER_BASE_URL = 'http://127.0.0.1:3010';
export const DEFAULT_SNIFFER_SSH_PORT = 22;
export const DEFAULT_SNIFFER_REMOTE_DIRECTORY = '~/ham-radio-sniffer';
export const DEFAULT_SNIFFER_REMOTE_START_COMMAND = 'yarn start';
/** Shared local-forward and remote-listen port for SSH assist. */
export const DEFAULT_SNIFFER_PORT = 3010;
export const MINIMUM_SNIFFER_NODE_MAJOR = 24;

export interface SnifferSettings {
  baseUrl: string;
  /** Blank means optional SSH assist is disabled. */
  sshHost: string;
  sshPort: number;
  remoteDirectory: string;
  remoteStartCommand: string;
  /**
   * Port used for both the local SSH forward and the remote sniffer listen
   * address (`PORT` / `NITRO_PORT`).
   */
  port: number;
}

/**
 * Default connection target for the headless sniffer sidecar.
 */
export function defaultSnifferSettings(): SnifferSettings {
  return {
    baseUrl: DEFAULT_SNIFFER_BASE_URL,
    sshHost: '',
    sshPort: DEFAULT_SNIFFER_SSH_PORT,
    remoteDirectory: DEFAULT_SNIFFER_REMOTE_DIRECTORY,
    remoteStartCommand: DEFAULT_SNIFFER_REMOTE_START_COMMAND,
    port: DEFAULT_SNIFFER_PORT,
  };
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Normalize a user-entered sniffer origin so API paths can be joined safely.
 */
export function normalizeSnifferBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function readPositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return fallback;
  }

  return value;
}

function readOptionalString(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  return value.trim();
}

/**
 * Resolve the shared sniffer port from current or legacy storage shapes.
 *
 * Prefers `port`, then falls back to older `localPort` / `remotePort` fields.
 */
function readSnifferPort(record: Record<string, unknown>, fallback: number): number {
  if (Object.prototype.hasOwnProperty.call(record, 'port')) {
    return readPositiveInt(record.port, fallback);
  }

  if (Object.prototype.hasOwnProperty.call(record, 'localPort')) {
    return readPositiveInt(record.localPort, fallback);
  }

  if (Object.prototype.hasOwnProperty.call(record, 'remotePort')) {
    return readPositiveInt(record.remotePort, fallback);
  }

  return fallback;
}

/**
 * True when optional SSH install/start controls should be offered.
 */
export function isSnifferSshConfigured(settings: Pick<SnifferSettings, 'sshHost'>): boolean {
  return settings.sshHost.trim().length > 0;
}

/**
 * Local URL the UI should use while an SSH local forward is active.
 */
export function snifferLocalForwardBaseUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}

/**
 * Parse sniffer connection preferences from localStorage.
 *
 * Only http(s) origins are accepted so the UI does not try to EventSource an
 * arbitrary scheme. Invalid values fall back to the local sidecar default.
 * SSH fields are optional and blank by default.
 */
export function parseSnifferSettings(raw: string | null): SnifferSettings {
  const defaults = defaultSnifferSettings();

  if (!raw) {
    return defaults;
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return defaults;
    }

    const record = parsed as Record<string, unknown>;
    const baseUrl = typeof record.baseUrl === 'string' ? normalizeSnifferBaseUrl(record.baseUrl) : '';
    const port = readSnifferPort(record, defaults.port);

    if (!isHttpUrl(baseUrl)) {
      return {
        ...defaults,
        sshHost: readOptionalString(record.sshHost, defaults.sshHost),
        sshPort: readPositiveInt(record.sshPort, defaults.sshPort),
        remoteDirectory: readOptionalString(record.remoteDirectory, defaults.remoteDirectory) || defaults.remoteDirectory,
        remoteStartCommand:
          readOptionalString(record.remoteStartCommand, defaults.remoteStartCommand) || defaults.remoteStartCommand,
        port,
      };
    }

    return {
      baseUrl,
      sshHost: readOptionalString(record.sshHost, defaults.sshHost),
      sshPort: readPositiveInt(record.sshPort, defaults.sshPort),
      remoteDirectory: readOptionalString(record.remoteDirectory, defaults.remoteDirectory) || defaults.remoteDirectory,
      remoteStartCommand:
        readOptionalString(record.remoteStartCommand, defaults.remoteStartCommand) || defaults.remoteStartCommand,
      port,
    };
  } catch {
    return defaults;
  }
}

export function serializeSnifferSettings(settings: SnifferSettings): string {
  return JSON.stringify({
    baseUrl: normalizeSnifferBaseUrl(settings.baseUrl),
    sshHost: settings.sshHost.trim(),
    sshPort: settings.sshPort,
    remoteDirectory: settings.remoteDirectory.trim() || DEFAULT_SNIFFER_REMOTE_DIRECTORY,
    remoteStartCommand: settings.remoteStartCommand.trim() || DEFAULT_SNIFFER_REMOTE_START_COMMAND,
    port: settings.port,
  });
}

export function readSnifferSettings(): SnifferSettings {
  if (!import.meta.client) {
    return defaultSnifferSettings();
  }

  try {
    return parseSnifferSettings(localStorage.getItem(SNIFFER_SETTINGS_STORAGE_KEY));
  } catch {
    return defaultSnifferSettings();
  }
}

export function writeSnifferSettings(settings: SnifferSettings): void {
  if (!import.meta.client) {
    return;
  }

  localStorage.setItem(SNIFFER_SETTINGS_STORAGE_KEY, serializeSnifferSettings(settings));
}

export function snifferApiUrl(baseUrl: string, path: string): string {
  const origin = normalizeSnifferBaseUrl(baseUrl);
  const suffix = path.startsWith('/') ? path : `/${path}`;

  return `${origin}${suffix}`;
}

/**
 * Quote a string for inclusion inside a remote `bash -lc '…'` single-quoted segment.
 */
export function quoteRemoteShellArg(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * RHS for `DIR=<expr>` on a remote host. Leading `~` becomes `"$HOME"` so tilde
 * still expands inside a single-quoted `bash -lc` script.
 */
export function remoteDirectoryAssignmentRhs(value: string): string {
  const trimmed = value.trim();

  if (trimmed === '~') {
    return '"$HOME"';
  }

  if (trimmed.startsWith('~/')) {
    const rest = trimmed
      .slice(2)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\$/g, '\\$')
      .replace(/`/g, '\\`');

    return `"$HOME/${rest}"`;
  }

  return quoteRemoteShellArg(trimmed);
}
