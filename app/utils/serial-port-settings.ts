export const SERIAL_PORT_SETTINGS_STORAGE_KEY = 'ham-radio-serial-ports';

export interface SerialPortSettings {
  /** When true, hide well-known system serial devices such as macOS Bluetooth and debug ports. */
  filterCommonPorts: boolean;
  /** User-entered device names to hide, for example `BryansHeadphones`. */
  excludedPortNames: string[];
}

/**
 * Trim, drop blanks, and de-duplicate custom names while keeping the first spelling.
 */
export function normalizeExcludedPortNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const names: string[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    if (typeof entry !== 'string') {
      continue;
    }

    const trimmed = entry.trim();

    if (trimmed.length === 0) {
      continue;
    }

    const key = trimmed.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    names.push(trimmed);
  }

  return names;
}

/** Default serial-port preferences: hide common system devices. */
export function defaultSerialPortSettings(): SerialPortSettings {
  return {
    filterCommonPorts: true,
    excludedPortNames: [],
  };
}

/**
 * Parse serial-port preferences from localStorage.
 *
 * Filtering is on by default so Import, Write, and Sniffer lists stay usable
 * on a Mac without a settings visit. A missing flag is treated as enabled.
 * Custom names are optional and stored as the user typed them.
 */
export function parseSerialPortSettings(raw: string | null): SerialPortSettings {
  const defaults = defaultSerialPortSettings();

  if (!raw) {
    return defaults;
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return defaults;
    }

    const record = parsed as Record<string, unknown>;

    return {
      filterCommonPorts: record.filterCommonPorts === undefined ? true : record.filterCommonPorts === true,
      excludedPortNames: normalizeExcludedPortNames(record.excludedPortNames),
    };
  } catch {
    return defaults;
  }
}

export function serializeSerialPortSettings(settings: SerialPortSettings): string {
  return JSON.stringify({
    filterCommonPorts: settings.filterCommonPorts,
    excludedPortNames: normalizeExcludedPortNames(settings.excludedPortNames),
  });
}

export function readSerialPortSettings(): SerialPortSettings {
  if (!import.meta.client) {
    return defaultSerialPortSettings();
  }

  try {
    return parseSerialPortSettings(localStorage.getItem(SERIAL_PORT_SETTINGS_STORAGE_KEY));
  } catch {
    return defaultSerialPortSettings();
  }
}

export function writeSerialPortSettings(settings: SerialPortSettings): void {
  if (!import.meta.client) {
    return;
  }

  localStorage.setItem(SERIAL_PORT_SETTINGS_STORAGE_KEY, serializeSerialPortSettings(settings));
}
