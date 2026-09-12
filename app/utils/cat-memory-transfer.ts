import type { SerialPortOption } from '~/utils/serial-port-list';

/** Shown when Import or Write targets a port CAT already holds. */
export const CAT_MEMORY_TRANSFER_BLOCKED_TITLE = 'CAT session is using this port';

/** Toast copy when memory I/O is aimed at a live CAT serial port. */
export const CAT_MEMORY_TRANSFER_BLOCKED_DESCRIPTION =
  'Choose another serial port, or disconnect CAT on this one.';

/**
 * True when CAT already owns `serialPortPath`.
 *
 * Other ports stay free for a second radio's import, write, or CAT session.
 */
export function isCatMemoryTransferBlocked(
  lockedPorts: readonly string[],
  serialPortPath: string | undefined,
): boolean {
  return Boolean(serialPortPath && lockedPorts.includes(serialPortPath));
}

/** Toolbar tooltip for Write to Radio. */
export function writeToRadioTooltip(options: {
  hasLoadedMemory: boolean;
  writeSupported: boolean;
  radioName?: string;
}): string {
  if (!options.hasLoadedMemory) {
    return 'Open a memory file or import from a radio first';
  }

  if (!options.writeSupported) {
    return `${options.radioName ?? 'This radio'} does not support writing memory`;
  }

  return 'Write to Radio';
}

/**
 * Label and disable serial ports that a CAT session already holds so Import and
 * Write can still pick a second adapter.
 *
 * Pass `omitBusy` on the CAT connect dialog so those ports are not choices.
 */
export function markCatBusySerialPorts(
  ports: SerialPortOption[],
  lockedPorts: readonly string[],
  options?: { omitBusy?: boolean },
): Array<SerialPortOption & { disabled?: boolean; description?: string }> {
  if (options?.omitBusy) {
    return ports.filter((port) => !lockedPorts.includes(port.value));
  }

  return ports.map((port) => {
    if (!lockedPorts.includes(port.value)) {
      return port;
    }

    return {
      ...port,
      label: `${port.label} (CAT)`,
      description: 'Disconnect CAT to use this port',
      disabled: true,
    };
  });
}
