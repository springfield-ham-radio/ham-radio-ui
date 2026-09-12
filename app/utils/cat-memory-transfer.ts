/** Shown when Import or Write is refused because a CAT session holds the PC port. */
export const CAT_MEMORY_TRANSFER_BLOCKED_TITLE = 'CAT session is using the radio';

/** Tooltip and toast copy: disconnect CAT before clone or live memory I/O. */
export const CAT_MEMORY_TRANSFER_BLOCKED_DESCRIPTION =
  'Disconnect CAT before importing or writing memory.';

/**
 * True when CAT has claimed the programming serial port.
 *
 * Clone (TM-D710A) and live memory CAT (TH-F6) both need exclusive access to
 * that port, so HamBench must not start a second session.
 */
export function isCatMemoryTransferBlocked(lockedPort: string | undefined): boolean {
  return Boolean(lockedPort);
}

/** Toolbar / empty-state tooltip for Import from Radio. */
export function importFromRadioTooltip(catBlocked: boolean): string {
  return catBlocked ? CAT_MEMORY_TRANSFER_BLOCKED_DESCRIPTION : 'Import from Radio';
}

/** Toolbar tooltip for Write to Radio. CAT wins over missing memory. */
export function writeToRadioTooltip(options: {
  catBlocked: boolean;
  hasLoadedMemory: boolean;
  writeSupported: boolean;
  radioName?: string;
}): string {
  if (options.catBlocked) {
    return CAT_MEMORY_TRANSFER_BLOCKED_DESCRIPTION;
  }

  if (!options.hasLoadedMemory) {
    return 'Open a memory file or import from a radio first';
  }

  if (!options.writeSupported) {
    return `${options.radioName ?? 'This radio'} does not support writing memory`;
  }

  return 'Write to Radio';
}
