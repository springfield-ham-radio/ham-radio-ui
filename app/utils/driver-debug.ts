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
