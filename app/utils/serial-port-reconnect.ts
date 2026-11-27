import { SerialPort } from 'tauri-plugin-serialplugin-api';
import { serialPortMatchKey } from '~/utils/serial-port-list';

/** Poll interval while waiting for a USB CDC device to enumerate again. */
export const SERIAL_PORT_RECONNECT_POLL_MS = 250;

/** Upper bound before giving up on a missing programming port. */
export const SERIAL_PORT_RECONNECT_TIMEOUT_MS = 15_000;

/** After a clone write, poll this long for the CDC path to disappear (radio reboot). */
export const CLONE_EXIT_PORT_GONE_GRACE_MS = 3_000;

/** After the programming port reappears, wait before the first post-reboot clone handshake. */
export const CLONE_EXIT_FIRMWARE_SETTLE_MS = 2_000;

export interface SerialPortReconnectHooks {
  /** Cancel only the wait for this path. Another port's transfer keeps polling. */
  shouldAbort?: (path: string) => boolean;
  onWaiting?: (path: string, waiting: boolean) => void;
}

let hooks: SerialPortReconnectHooks = {};

/** Wire transfer cancel and progress UI into reconnect polling. */
export function setSerialPortReconnectHooks(next: SerialPortReconnectHooks): void {
  hooks = next;
}

/** @internal Test helper */
export function resetSerialPortReconnectHooks(): void {
  hooks = {};
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function isPortMissingError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('no such file or directory') ||
    message.includes('enoent') ||
    message.includes('system cannot find the file') ||
    message.includes('could not open port')
  );
}

/**
 * User-facing open failure when the saved path is not present.
 */
export function formatSerialPortOpenError(path: string, cause: unknown): Error {
  const detail = cause instanceof Error ? cause.message : String(cause);
  const trimmed = detail.trim();
  const suffix = trimmed.length > 0 ? `: ${trimmed}` : '';

  return new Error(
    `Failed to open serial port ${path}${suffix}. Reconnect the programming cable or wait for the radio to finish restarting, then try again.`,
  );
}

async function listAvailablePortPaths(): Promise<string[]> {
  const available = await SerialPort.available_ports();
  return Object.keys(available);
}

export async function isSerialPortPathAvailable(path: string): Promise<boolean> {
  const key = serialPortMatchKey(path);
  const listed = await listAvailablePortPaths();
  return listed.some((candidate) => serialPortMatchKey(candidate) === key);
}

export interface WaitForSerialPortOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
  listPorts?: () => Promise<string[]>;
  sleep?: (milliseconds: number) => Promise<void>;
}

/**
 * Poll until `path` shows up in the OS port list or the timeout elapses.
 */
export async function waitForSerialPortPathAvailable(
  path: string,
  options: WaitForSerialPortOptions = {},
): Promise<void> {
  const pollIntervalMs = options.pollIntervalMs ?? SERIAL_PORT_RECONNECT_POLL_MS;
  const timeoutMs = options.timeoutMs ?? SERIAL_PORT_RECONNECT_TIMEOUT_MS;
  const listPorts = options.listPorts ?? listAvailablePortPaths;
  const delay = options.sleep ?? sleep;
  const key = serialPortMatchKey(path);
  const deadline = Date.now() + timeoutMs;

  hooks.onWaiting?.(path, true);

  try {
    while (Date.now() < deadline) {
      if (hooks.shouldAbort?.(path)) {
        throw new Error('Serial port reconnect canceled');
      }

      const listed = await listPorts();
      if (listed.some((candidate) => serialPortMatchKey(candidate) === key)) {
        return;
      }

      await delay(pollIntervalMs);
    }

    throw formatSerialPortOpenError(
      path,
      new Error('The port did not reappear before the reconnect wait timed out'),
    );
  } finally {
    hooks.onWaiting?.(path, false);
  }
}

export interface WaitAfterCloneExitOptions extends WaitForSerialPortOptions {
  graceMs?: number;
  settleMs?: number;
  isPortAvailable?: (path: string) => Promise<boolean>;
  now?: () => number;
}

/**
 * Menu capture restore only: after a clone write, wait for a TH-D74-style CDC drop and reboot.
 * Does not change global port open timeouts (see ADR 0024).
 */
export async function waitForProgrammingPortAfterCloneExit(
  path: string,
  options: WaitAfterCloneExitOptions = {},
): Promise<void> {
  const graceMs = options.graceMs ?? CLONE_EXIT_PORT_GONE_GRACE_MS;
  const settleMs = options.settleMs ?? CLONE_EXIT_FIRMWARE_SETTLE_MS;
  const delay = options.sleep ?? sleep;
  const now = options.now ?? Date.now;
  const portAvailable = options.isPortAvailable ?? isSerialPortPathAvailable;

  if (!(await portAvailable(path))) {
    await waitForSerialPortPathAvailable(path, options);
    await delay(settleMs);
    return;
  }

  const graceDeadline = now() + graceMs;
  let sawDisappear = false;

  while (now() < graceDeadline) {
    if (hooks.shouldAbort?.(path)) {
      throw new Error('Serial port reconnect canceled');
    }

    if (!(await portAvailable(path))) {
      sawDisappear = true;
      break;
    }

    await delay(options.pollIntervalMs ?? SERIAL_PORT_RECONNECT_POLL_MS);
  }

  if (!sawDisappear) {
    return;
  }

  await waitForSerialPortPathAvailable(path, options);
  await delay(settleMs);
}

/** Drop or add one path. Other ports that are still waiting stay in the list. */
export function updateReconnectWaitingPorts(ports: readonly string[], path: string, waiting: boolean): string[] {
  const key = serialPortMatchKey(path);
  const rest = ports.filter((candidate) => serialPortMatchKey(candidate) !== key);
  return waiting ? [...rest, path] : rest;
}

export function portIsReconnectWaiting(ports: readonly string[], path: string | undefined): boolean {
  if (!path) {
    return false;
  }

  const key = serialPortMatchKey(path);
  return ports.some((candidate) => serialPortMatchKey(candidate) === key);
}

export { isPortMissingError };