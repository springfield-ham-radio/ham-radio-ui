import { serialPortMatchKey, type SerialPortAlias } from '~/utils/serial-port-list';

export type { SerialPortAlias } from '~/utils/serial-port-list';

export const SERIAL_PORT_SETTINGS_STORAGE_KEY = 'ham-radio-serial-ports';

export interface SerialPortSettings {
  /** When true, hide well-known system serial devices such as macOS Bluetooth and debug ports. */
  filterCommonPorts: boolean;
  /** User-entered device names to hide, for example `BryansHeadphones`. */
  excludedPortNames: string[];
  /** System ports renamed for serial-port selectors. */
  portAliases: SerialPortAlias[];
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

/**
 * Trim, drop incomplete rows, and de-duplicate by system port while keeping the first name.
 */
export function normalizeSerialPortAliases(value: unknown): SerialPortAlias[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const aliases: SerialPortAlias[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }

    const record = entry as Record<string, unknown>;
    const systemName = typeof record.systemName === 'string' ? record.systemName.trim() : '';
    const name = typeof record.name === 'string' ? record.name.trim() : '';

    if (systemName.length === 0 || name.length === 0) {
      continue;
    }

    const key = serialPortMatchKey(systemName);

    if (key.length === 0 || seen.has(key)) {
      continue;
    }

    seen.add(key);
    aliases.push({ systemName, name });
  }

  return aliases;
}

/** Default serial-port preferences: hide common system devices. */
export function defaultSerialPortSettings(): SerialPortSettings {
  return {
    filterCommonPorts: true,
    excludedPortNames: [],
    portAliases: [],
  };
}

/**
 * Parse serial-port preferences from localStorage.
 *
 * Filtering is on by default so Import, Write, and Sniffer lists stay usable
 * on a Mac without a settings visit. A missing flag is treated as enabled.
 * Custom names and port aliases are optional and stored as the user typed them.
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
      portAliases: normalizeSerialPortAliases(record.portAliases),
    };
  } catch {
    return defaults;
  }
}

export function serializeSerialPortSettings(settings: SerialPortSettings): string {
  return JSON.stringify({
    filterCommonPorts: settings.filterCommonPorts,
    excludedPortNames: normalizeExcludedPortNames(settings.excludedPortNames),
    portAliases: normalizeSerialPortAliases(settings.portAliases),
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

/**
 * Persist serial-port preferences.
 *
 * Names are normalized in the stored JSON. Callers must not replace a live
 * tags-input model with that normalized array; Reka UI TagsInput's deep
 * v-model retriggers and freezes the Preferences page.
 */
export function writeSerialPortSettings(settings: SerialPortSettings): void {
  if (!import.meta.client) {
    return;
  }

  localStorage.setItem(SERIAL_PORT_SETTINGS_STORAGE_KEY, serializeSerialPortSettings(settings));
}
