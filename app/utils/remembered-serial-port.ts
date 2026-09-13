export const REMEMBERED_SERIAL_PORT_STORAGE_KEY = 'ham-radio-selected-serial-port';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Parse the last selected serial port from localStorage.
 */
export function parseRememberedSerialPort(raw: string | null): string | undefined {
  if (!raw) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return undefined;
    }

    const record = parsed as Record<string, unknown>;

    if (!isNonEmptyString(record.path)) {
      return undefined;
    }

    return record.path.trim();
  } catch {
    return undefined;
  }
}

export function serializeRememberedSerialPort(path: string): string {
  return JSON.stringify({
    path: path.trim(),
  });
}

export function readRememberedSerialPort(): string | undefined {
  if (!import.meta.client) {
    return undefined;
  }

  try {
    return parseRememberedSerialPort(localStorage.getItem(REMEMBERED_SERIAL_PORT_STORAGE_KEY));
  } catch {
    return undefined;
  }
}

/**
 * Persist the last serial port the user chose in Import or Write.
 */
export function writeRememberedSerialPort(path: string): void {
  const trimmed = path.trim();

  if (!import.meta.client || trimmed.length === 0) {
    return;
  }

  localStorage.setItem(REMEMBERED_SERIAL_PORT_STORAGE_KEY, serializeRememberedSerialPort(trimmed));
}

/**
 * Keep the current port when it is still listed; otherwise restore the
 * remembered port only if that device is available now.
 */
export function resolveRememberedSerialPort(
  remembered: string | undefined,
  availablePaths: string[],
  current?: string,
): string | undefined {
  if (current && availablePaths.includes(current)) {
    return current;
  }

  if (remembered && availablePaths.includes(remembered)) {
    return remembered;
  }

  return undefined;
}
