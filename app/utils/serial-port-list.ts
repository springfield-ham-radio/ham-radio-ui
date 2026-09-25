/** A system serial port shown under a name the operator chose. */
export interface SerialPortAlias {
  /** System path or device name, for example `usbserial-A50285BI` or `COM3`. */
  systemName: string;
  /** Name shown in serial-port selectors. */
  name: string;
}

export interface SerialPortOption {
  label: string;
  value: string;
  /** System name, kept visible when the label is a user-chosen port name. */
  description?: string;
}

/**
 * macOS system serial devices that are never programming cables.
 *
 * These show up under `/dev/cu.*` on every Mac: the Bluetooth incoming SPP
 * endpoint, the kernel debug console, and the Wi-Fi debug UART.
 */
export const COMMON_SYSTEM_SERIAL_PORT_NAMES = ['bluetooth-incoming', 'debug-console', 'wlan-debug'] as const;

function serialPortBasename(path: string): string {
  const separator = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return separator === -1 ? path : path.slice(separator + 1);
}

function serialPortDeviceName(path: string): string {
  const basename = serialPortBasename(path);

  if (basename.startsWith('cu.') || basename.startsWith('tty.')) {
    return basename.slice(basename.indexOf('.') + 1);
  }

  return basename;
}

/**
 * Strip path prefixes so a pasted `/dev/cu.BryansHeadphones` matches the device name.
 */
export function normalizeSerialPortFilterPattern(value: string): string {
  let pattern = value.trim().toLowerCase();

  if (pattern.startsWith('/dev/cu.')) {
    pattern = pattern.slice('/dev/cu.'.length);
  } else if (pattern.startsWith('/dev/tty.')) {
    pattern = pattern.slice('/dev/tty.'.length);
  } else if (pattern.startsWith('cu.')) {
    pattern = pattern.slice('cu.'.length);
  } else if (pattern.startsWith('tty.')) {
    pattern = pattern.slice('tty.'.length);
  }

  return pattern;
}

/**
 * Identity used to match a system path, a short device name, and a typed alias.
 *
 * `/dev/cu.usbserial-A50285BI`, `usbserial-A50285BI`, and `COM3` each collapse
 * to one key. Matching is exact, so a short fragment such as `usb` does not
 * claim every USB adapter.
 */
export function serialPortMatchKey(value: string): string {
  let key = normalizeSerialPortFilterPattern(value);

  if (key.startsWith('/dev/')) {
    key = key.slice('/dev/'.length);
  }

  if (key.startsWith('\\\\.\\')) {
    key = key.slice(4);
  }

  return key;
}

/**
 * User-chosen name for this path, when the system port was mapped in preferences.
 */
export function findSerialPortAlias(
  path: string,
  aliases: readonly SerialPortAlias[],
): SerialPortAlias | undefined {
  const key = serialPortMatchKey(path);

  if (key.length === 0) {
    return undefined;
  }

  return aliases.find((alias) => {
    const aliasKey = serialPortMatchKey(alias.systemName);

    return aliasKey.length > 0 && alias.name.trim().length > 0 && aliasKey === key;
  });
}

/**
 * True for macOS dial-in devices (`/dev/tty.*`).
 *
 * The matching `/dev/cu.*` callout path is the one that programming software
 * should open; listing both only duplicates every adapter.
 */
export function isMacDialInSerialPort(path: string): boolean {
  return path.startsWith('/dev/tty.');
}

/**
 * True when the path is a well-known macOS system serial device.
 */
export function isCommonSystemSerialPort(path: string): boolean {
  const deviceName = serialPortDeviceName(path).toLowerCase();

  return COMMON_SYSTEM_SERIAL_PORT_NAMES.some((name) => deviceName.includes(name));
}

/**
 * True when the path matches a user-entered exclusion such as `BryansHeadphones`.
 */
export function isExcludedCustomSerialPort(path: string, excludedPortNames: string[]): boolean {
  const deviceName = serialPortDeviceName(path).toLowerCase();
  const label = serialPortLabel(path).toLowerCase();

  return excludedPortNames.some((name) => {
    const pattern = normalizeSerialPortFilterPattern(name);

    if (pattern.length === 0) {
      return false;
    }

    return deviceName.includes(pattern) || label.includes(pattern);
  });
}

/**
 * Short label for a serial path, dropping the macOS `/dev/cu.` prefix.
 *
 * When `aliases` includes this port, the label is the name from preferences.
 */
export function serialPortLabel(path: string, aliases: readonly SerialPortAlias[] = []): string {
  const alias = findSerialPortAlias(path, aliases);

  if (alias) {
    return alias.name.trim();
  }

  if (path.startsWith('/dev/cu.')) {
    return path.slice('/dev/cu.'.length);
  }

  return path;
}

/**
 * Select-menu item for a serial path.
 *
 * A mapped port uses the preference name as the label and keeps the system
 * name as the description. `suffix` is appended to the label, for example
 * ` (saved)`.
 */
export function serialPortOption(
  path: string,
  aliases: readonly SerialPortAlias[] = [],
  options?: { suffix?: string },
): SerialPortOption {
  const systemLabel = serialPortLabel(path);
  const displayLabel = serialPortLabel(path, aliases);
  const suffix = options?.suffix ?? '';
  const label = `${displayLabel}${suffix}`;

  if (displayLabel === systemLabel) {
    return { label, value: path };
  }

  return {
    label,
    value: path,
    description: systemLabel,
  };
}

export interface SerialPortSelectOptions {
  filterCommonPorts: boolean;
  excludedPortNames?: string[];
  portAliases?: readonly SerialPortAlias[];
}

/**
 * Turn raw serial paths into select-menu items.
 *
 * Always drops macOS `/dev/tty.*` twins. When `filterCommonPorts` is on,
 * also hides Bluetooth Incoming, debug-console, and wlan-debug. Custom
 * `excludedPortNames` always apply. `portAliases` replace the system label
 * with the name from preferences.
 */
export function serialPortSelectItems(paths: string[], options: SerialPortSelectOptions): SerialPortOption[] {
  const excludedPortNames = options.excludedPortNames ?? [];
  const portAliases = options.portAliases ?? [];

  return paths
    .filter((path) => !isMacDialInSerialPort(path))
    .filter((path) => !options.filterCommonPorts || !isCommonSystemSerialPort(path))
    .filter((path) => !isExcludedCustomSerialPort(path, excludedPortNames))
    .map((path) => serialPortOption(path, portAliases));
}
