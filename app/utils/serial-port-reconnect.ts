import { SerialPort } from 'tauri-plugin-serialplugin-api';
import { serialPortMatchKey } from '~/utils/serial-port-list';

/** Poll interval while waiting for a USB CDC device to enumerate again. */
export const SERIAL_PORT_RECONNECT_POLL_MS = 250;

/** Upper bound before giving up on a missing programming port. */
export const SERIAL_PORT_RECONNECT_TIMEOUT_MS = 15_000;

export interface SerialPortReconnectHooks {
  shouldAbort?: () => boolean;
  onWaiting?: (waiting: boolean) => void;
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

  hooks.onWaiting?.(true);

  try {
    while (Date.now() < deadline) {
      if (hooks.shouldAbort?.()) {
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
    hooks.onWaiting?.(false);
  }
}

export { isPortMissingError };
