/** One contiguous run of bytes that differ between two memory images. */
export interface MemoryDiffRun {
  start: number;
  before: Array<number | undefined>;
  after: Array<number | undefined>;
}

/**
 * Group bytes that differ between two clones.
 * A missing byte, when one image is shorter, counts as a difference.
 */
export function compareMemoryImages(before: Uint8Array, after: Uint8Array): MemoryDiffRun[] {
  const length = Math.max(before.length, after.length);
  const runs: MemoryDiffRun[] = [];
  let current: MemoryDiffRun | undefined;

  for (let address = 0; address < length; address += 1) {
    const left = address < before.length ? before[address] : undefined;
    const right = address < after.length ? after[address] : undefined;

    if (left === right) {
      current = undefined;
      continue;
    }

    if (!current || current.start + current.before.length !== address) {
      current = { start: address, before: [], after: [] };
      runs.push(current);
    }

    current.before.push(left);
    current.after.push(right);
  }

  return runs;
}

export function memoryDiffByteCount(runs: readonly MemoryDiffRun[]): number {
  return runs.reduce((count, run) => count + run.before.length, 0);
}

function formatDiffByte(value: number | undefined): string {
  return value === undefined ? '--' : value.toString(16).toUpperCase().padStart(2, '0');
}

const HEX_ROW_BYTES = 16;
const HEX_ROW_LIMIT = 64;

/** One changed 16-byte row, or a marker for a skipped unchanged stretch. */
export type MemoryHexDiffItem = { kind: 'row'; address: number } | { kind: 'gap'; address: number };

/**
 * Addresses of changed 16-byte rows, without building a cell for every byte.
 * A full 500 KB image that differs in every row is about 31k entries.
 */
export function listMemoryHexDiffItems(before: Uint8Array, after: Uint8Array): MemoryHexDiffItem[] {
  const length = Math.max(before.length, after.length);
  const items: MemoryHexDiffItem[] = [];
  let previousRow = 0;
  let seenRow = false;

  for (let start = 0; start < length; start += HEX_ROW_BYTES) {
    const count = Math.min(HEX_ROW_BYTES, length - start);
    let changed = false;

    for (let index = 0; index < count; index += 1) {
      const address = start + index;
      const left = address < before.length ? before[address] : undefined;
      const right = address < after.length ? after[address] : undefined;

      if (left !== right) {
        changed = true;
        break;
      }
    }

    if (!changed) {
      continue;
    }

    if (seenRow && start > previousRow + HEX_ROW_BYTES) {
      items.push({ kind: 'gap', address: start });
    }

    seenRow = true;
    previousRow = start;
    items.push({ kind: 'row', address: start });
  }

  return items;
}

/** Cells for one changed row. Built only for rows the virtual list paints. */
export function memoryHexDiffCells(
  before: Uint8Array,
  after: Uint8Array,
  address: number,
): { before: MemoryHexCell[]; after: MemoryHexCell[] } {
  const length = Math.max(before.length, after.length);
  const count = Math.min(HEX_ROW_BYTES, Math.max(length - address, 0));
  const left: MemoryHexCell[] = [];
  const right: MemoryHexCell[] = [];

  for (let index = 0; index < count; index += 1) {
    const offset = address + index;
    const leftByte = offset < before.length ? before[offset] : undefined;
    const rightByte = offset < after.length ? after[offset] : undefined;
    const differs = leftByte !== rightByte;
    left.push(hexCell(leftByte, differs));
    right.push(hexCell(rightByte, differs));
  }

  return { before: left, after: right };
}

/**
 * Counts differing bytes and runs without retaining each byte.
 * A pair of 500 KB images stays a single pass.
 */
export function summarizeMemoryImages(
  before: Uint8Array,
  after: Uint8Array,
): { byteCount: number; runCount: number } {
  const length = Math.max(before.length, after.length);
  let byteCount = 0;
  let runCount = 0;
  let inRun = false;

  for (let address = 0; address < length; address += 1) {
    const left = address < before.length ? before[address] : undefined;
    const right = address < after.length ? after[address] : undefined;

    if (left === right) {
      inRun = false;
      continue;
    }

    byteCount += 1;

    if (!inRun) {
      runCount += 1;
      inRun = true;
    }
  }

  return { byteCount, runCount };
}

/** One byte in a side-by-side hex dump. */
export interface MemoryHexCell {
  text: string;
  ascii: string;
  changed: boolean;
}

export type MemoryHexDiffLine =
  | { kind: 'row'; address: number; before: MemoryHexCell[]; after: MemoryHexCell[] }
  | { kind: 'gap'; address: number };

export interface MemoryHexDiff {
  lines: MemoryHexDiffLine[];
  omittedRows: number;
}

function hexCell(value: number | undefined, changed: boolean): MemoryHexCell {
  const text = value === undefined ? '--' : value.toString(16).toUpperCase().padStart(2, '0');
  const ascii = value !== undefined && value >= 32 && value <= 126 ? String.fromCharCode(value) : '.';

  return { text, ascii, changed };
}

/**
 * 16-byte rows that contain a difference, for a side-by-side hex dump.
 * Unchanged rows are left out. A gap marks a skipped stretch of memory.
 */
export function memoryHexDiff(before: Uint8Array, after: Uint8Array): MemoryHexDiff {
  const length = Math.max(before.length, after.length);
  const lines: MemoryHexDiffLine[] = [];
  let omittedRows = 0;
  let previousRow = 0;
  let seenRow = false;

  for (let start = 0; start < length; start += HEX_ROW_BYTES) {
    const count = Math.min(HEX_ROW_BYTES, length - start);
    const left: MemoryHexCell[] = [];
    const right: MemoryHexCell[] = [];
    let changed = false;

    for (let index = 0; index < count; index += 1) {
      const address = start + index;
      const leftByte = address < before.length ? before[address] : undefined;
      const rightByte = address < after.length ? after[address] : undefined;
      const differs = leftByte !== rightByte;
      changed ||= differs;
      left.push(hexCell(leftByte, differs));
      right.push(hexCell(rightByte, differs));
    }

    if (!changed) {
      continue;
    }

    if (lines.filter((line) => line.kind === 'row').length >= HEX_ROW_LIMIT) {
      omittedRows += 1;
      continue;
    }

    if (seenRow && start > previousRow + HEX_ROW_BYTES) {
      lines.push({ kind: 'gap', address: start });
    }

    seenRow = true;
    previousRow = start;
    lines.push({ kind: 'row', address: start, before: left, after: right });
  }

  return { lines, omittedRows };
}

export function formatHexDiffAddress(address: number): string {
  return `0x${address.toString(16).toUpperCase().padStart(4, '0')}`;
}

/** `0x0010  01 02 → 0A 0B` */
export function formatMemoryDiffRun(run: MemoryDiffRun): string {
  const address = `0x${run.start.toString(16).toUpperCase().padStart(4, '0')}`;
  const before = run.before.map((value) => formatDiffByte(value)).join(' ');
  const after = run.after.map((value) => formatDiffByte(value)).join(' ');

  return `${address}  ${before} → ${after}`;
}
