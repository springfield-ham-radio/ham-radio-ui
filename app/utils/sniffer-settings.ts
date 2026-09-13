export const SNIFFER_SETTINGS_STORAGE_KEY = 'ham-radio-sniffer';
export const DEFAULT_SNIFFER_HOST = '127.0.0.1';
export const DEFAULT_SNIFFER_SSH_PORT = 22;
export const DEFAULT_SNIFFER_INSTALL_DIRECTORY = '~/ham-radio-sniffer';
/** @deprecated Use DEFAULT_SNIFFER_INSTALL_DIRECTORY. */
export const DEFAULT_SNIFFER_REMOTE_DIRECTORY = DEFAULT_SNIFFER_INSTALL_DIRECTORY;
export const DEFAULT_SNIFFER_START_COMMAND = 'yarn start';
/** @deprecated Use DEFAULT_SNIFFER_START_COMMAND. */
export const DEFAULT_SNIFFER_REMOTE_START_COMMAND = DEFAULT_SNIFFER_START_COMMAND;
export const DEFAULT_SNIFFER_PORT = 3010;
export const DEFAULT_SNIFFER_BASE_URL = `http://${DEFAULT_SNIFFER_HOST}:${DEFAULT_SNIFFER_PORT}`;
export const MINIMUM_SNIFFER_NODE_MAJOR = 24;

export interface SnifferSettings {
  /** Hostname or IP. Optional `user@host` when SSH needs a username. */
  host: string;
  port: number;
  /** Directory for sniffer sources/build, on this computer or the SSH host. */
  installDirectory: string;
  /** Command used to start the sniffer process after install. */
  startCommand: string;
  /** When true, install/start/stop run on `host` over SSH. */
  sshEnabled: boolean;
}

export interface SnifferSshTarget {
  /** SSH destination: `user@host` when the host field has a user, otherwise `host`. */
  sshHost: string;
  port: number;
}

/**
 * Default connection target for the headless sniffer sidecar.
 */
export function defaultSnifferSettings(): SnifferSettings {
  return {
    host: DEFAULT_SNIFFER_HOST,
    port: DEFAULT_SNIFFER_PORT,
    installDirectory: DEFAULT_SNIFFER_INSTALL_DIRECTORY,
    startCommand: DEFAULT_SNIFFER_START_COMMAND,
    sshEnabled: false,
  };
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
 * Resolve a listen port from current or legacy storage shapes.
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

function isLoopbackHostname(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1' || hostname === '[::1]';
}

/**
 * Hostname (or IP) from a host field like `pi@192.168.1.10`.
 */
export function snifferHostnameFromHost(host: string): string {
  const trimmed = host.trim();

  if (trimmed.length === 0) {
    return '';
  }

  if (trimmed.startsWith('[')) {
    const end = trimmed.indexOf(']');
    return end === -1 ? trimmed : trimmed.slice(0, end + 1);
  }

  const separator = trimmed.lastIndexOf('@');
  return separator === -1 ? trimmed : trimmed.slice(separator + 1);
}

function snifferUserFromHost(host: string): string {
  const trimmed = host.trim();

  if (trimmed.startsWith('[')) {
    return '';
  }

  const separator = trimmed.lastIndexOf('@');

  if (separator <= 0) {
    return '';
  }

  return trimmed.slice(0, separator);
}

function formatHostnameForUrl(hostname: string): string {
  return hostname.includes(':') && !hostname.startsWith('[') ? `[${hostname}]` : hostname;
}

/**
 * HTTP origin Radio → Sniffer uses. SSH userinfo is not included.
 */
export function snifferHttpUrl(settings: Pick<SnifferSettings, 'host' | 'port'>): string {
  const hostname = snifferHostnameFromHost(settings.host);

  if (hostname.length === 0) {
    return DEFAULT_SNIFFER_BASE_URL;
  }

  return `http://${formatHostnameForUrl(hostname)}:${settings.port}`;
}

/**
 * Listen address for a managed sniffer process.
 *
 * Loopback hosts bind localhost; any other host binds all interfaces so LAN
 * clients can reach a remote (or LAN-advertised local) process.
 */
export function snifferBindHost(host: string): string {
  return isLoopbackHostname(snifferHostnameFromHost(host)) ? '127.0.0.1' : '0.0.0.0';
}

function readSshEnabled(record: Record<string, unknown>): boolean {
  if (typeof record.sshEnabled === 'boolean') {
    return record.sshEnabled;
  }

  return readOptionalString(record.sshHost, '').length > 0;
}

/**
 * SSH destination taken from the host field and listen port.
 */
export function snifferSshTarget(settings: Pick<SnifferSettings, 'host' | 'port'>): SnifferSshTarget | undefined {
  const hostname = snifferHostnameFromHost(settings.host);

  if (hostname.length === 0 || !Number.isInteger(settings.port) || settings.port <= 0) {
    return undefined;
  }

  const username = snifferUserFromHost(settings.host);
  return {
    sshHost: username.length > 0 ? `${username}@${hostname}` : hostname,
    port: settings.port,
  };
}

function hostFromHttpUrl(value: string): { host: string; port: number } | undefined {
  try {
    const parsed = new URL(value);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined;
    }

    const hostname = parsed.hostname.trim();

    if (hostname.length === 0) {
      return undefined;
    }

    const username = decodeURIComponent(parsed.username);
    const port = parsed.port.length > 0 ? Number(parsed.port) : DEFAULT_SNIFFER_PORT;

    if (!Number.isInteger(port) || port <= 0) {
      return undefined;
    }

    return {
      host: username.length > 0 ? `${username}@${hostname}` : hostname,
      port,
    };
  } catch {
    return undefined;
  }
}

function migrateHostAndPort(record: Record<string, unknown>, defaults: SnifferSettings): { host: string; port: number } {
  const enteredHost = readOptionalString(record.host, '');
  let host = enteredHost;
  let port = readSnifferPort(record, defaults.port);

  if (host.length === 0) {
    const fromUrl = typeof record.baseUrl === 'string' ? hostFromHttpUrl(record.baseUrl.trim().replace(/\/+$/, '')) : undefined;

    if (fromUrl) {
      host = fromUrl.host;
      if (!Object.prototype.hasOwnProperty.call(record, 'port')) {
        port = fromUrl.port;
      }
    }
  }

  const sshHost = readOptionalString(record.sshHost, '');

  if (sshHost.length > 0) {
    const sshHostname = snifferHostnameFromHost(sshHost);
    const sshUser = snifferUserFromHost(sshHost);
    const currentHostname = snifferHostnameFromHost(host) || DEFAULT_SNIFFER_HOST;
    const missingUser = sshUser.length > 0 && snifferUserFromHost(host).length === 0;

    if (host.length === 0 || isLoopbackHostname(currentHostname) || (currentHostname === sshHostname && missingUser)) {
      host = sshUser.length > 0 ? `${sshUser}@${sshHostname}` : sshHostname;
    }
  }

  if (host.length === 0) {
    return { host: defaults.host, port };
  }

  return { host, port };
}

/**
 * True when optional SSH install/start/stop should run on `host`.
 */
export function isSnifferSshConfigured(settings: Pick<SnifferSettings, 'sshEnabled'>): boolean {
  return settings.sshEnabled;
}

/**
 * Parse sniffer connection preferences from localStorage.
 *
 * Legacy `baseUrl` / `sshHost` values are split into host and port.
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
    const { host, port } = migrateHostAndPort(record, defaults);

    return {
      host,
      port,
      installDirectory:
        readOptionalString(record.installDirectory, '') ||
        readOptionalString(record.remoteDirectory, defaults.installDirectory) ||
        defaults.installDirectory,
      startCommand:
        readOptionalString(record.startCommand, '') ||
        readOptionalString(record.remoteStartCommand, defaults.startCommand) ||
        defaults.startCommand,
      sshEnabled: readSshEnabled(record),
    };
  } catch {
    return defaults;
  }
}

export function serializeSnifferSettings(settings: SnifferSettings): string {
  return JSON.stringify({
    host: settings.host.trim(),
    port: settings.port,
    installDirectory: settings.installDirectory.trim() || DEFAULT_SNIFFER_INSTALL_DIRECTORY,
    startCommand: settings.startCommand.trim() || DEFAULT_SNIFFER_START_COMMAND,
    sshEnabled: settings.sshEnabled,
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
  const origin = baseUrl.trim().replace(/\/+$/, '');
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
