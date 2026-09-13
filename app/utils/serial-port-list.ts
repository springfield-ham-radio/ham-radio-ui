export interface SerialPortOption {
  label: string;
  value: string;
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
 */
export function serialPortLabel(path: string): string {
  if (path.startsWith('/dev/cu.')) {
    return path.slice('/dev/cu.'.length);
  }

  return path;
}

export interface SerialPortSelectOptions {
  filterCommonPorts: boolean;
  excludedPortNames?: string[];
}

/**
 * Turn raw serial paths into select-menu items.
 *
 * Always drops macOS `/dev/tty.*` twins. When `filterCommonPorts` is on,
 * also hides Bluetooth Incoming, debug-console, and wlan-debug. Custom
 * `excludedPortNames` always apply.
 */
export function serialPortSelectItems(paths: string[], options: SerialPortSelectOptions): SerialPortOption[] {
  const excludedPortNames = options.excludedPortNames ?? [];

  return paths
    .filter((path) => !isMacDialInSerialPort(path))
    .filter((path) => !options.filterCommonPorts || !isCommonSystemSerialPort(path))
    .filter((path) => !isExcludedCustomSerialPort(path, excludedPortNames))
    .map((path) => ({
      label: serialPortLabel(path),
      value: path,
    }));
}
