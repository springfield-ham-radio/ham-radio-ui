/** Bytes shown on one row of the radio hex dump. */
export const HEX_DUMP_BYTES_PER_ROW = 16;

/** Fixed row height used by the virtualized hex dump. Matches `h-5`. */
export const HEX_DUMP_ROW_HEIGHT_PX = 20;

/**
 * Row count for a memory image. A 500480-byte TH-D74 image is 31280 rows.
 */
export function hexDumpRowCount(byteLength: number): number {
  if (byteLength <= 0) {
    return 0;
  }

  return Math.ceil(byteLength / HEX_DUMP_BYTES_PER_ROW);
}

/**
 * Row index that contains a buffer offset. Used to scroll the virtual list.
 */
export function hexDumpRowIndex(offset: number): number {
  if (!Number.isFinite(offset) || offset <= 0) {
    return 0;
  }

  return Math.floor(offset / HEX_DUMP_BYTES_PER_ROW);
}

export function formatHexDumpAddress(address: number): string {
  return address.toString(16).padStart(8, '0').toUpperCase();
}

export function formatHexDumpByte(value: number): string {
  return (value & 0xff).toString(16).padStart(2, '0').toUpperCase();
}

export function formatHexDumpAscii(value: number): string {
  return value >= 32 && value <= 126 ? String.fromCharCode(value) : '.';
}
