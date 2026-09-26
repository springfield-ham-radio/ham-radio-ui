import { describe, expect, it } from 'vitest';
import {
  compareMemoryImages,
  formatHexDiffAddress,
  formatMemoryDiffRun,
  memoryDiffByteCount,
  memoryHexDiff,
} from '../../app/utils/driver-debug.ts';

describe('memory clone comparison', () => {
  it('reports no runs when the images match', () => {
    const image = Uint8Array.from([0, 1, 2]);

    expect(compareMemoryImages(image, image)).toEqual([]);
  });

  it('groups neighboring byte changes and keeps separate runs apart', () => {
    const before = Uint8Array.from([0x00, 0x11, 0x22, 0x33, 0x44]);
    const after = Uint8Array.from([0x00, 0x1a, 0x2b, 0x33, 0x99]);
    const runs = compareMemoryImages(before, after);

    expect(runs).toEqual([
      { start: 1, before: [0x11, 0x22], after: [0x1a, 0x2b] },
      { start: 4, before: [0x44], after: [0x99] },
    ]);
    expect(memoryDiffByteCount(runs)).toBe(3);
    expect(formatMemoryDiffRun(runs[0]!)).toBe('0x0001  11 22 → 1A 2B');
  });

  it('treats a shorter image as changed bytes', () => {
    const runs = compareMemoryImages(Uint8Array.from([1, 2]), Uint8Array.from([1]));

    expect(runs).toEqual([{ start: 1, before: [2], after: [undefined] }]);
    expect(formatMemoryDiffRun(runs[0]!)).toBe('0x0001  02 → --');
  });
});

describe('memory hex dump', () => {
  it('keeps only rows that contain a change and highlights those bytes', () => {
    const before = Uint8Array.from([0x00, 0x11, 0x41]);
    const after = Uint8Array.from([0x00, 0x1a, 0x41]);
    const diff = memoryHexDiff(before, after);
    const row = diff.lines.find((line) => line.kind === 'row');

    expect(row?.kind).toBe('row');
    if (row?.kind !== 'row') {
      return;
    }

    expect(formatHexDiffAddress(row.address)).toBe('0x0000');
    expect(row.before.map((cell) => cell.text)).toEqual(['00', '11', '41']);
    expect(row.after[1]).toMatchObject({ text: '1A', ascii: '.', changed: true });
    expect(row.before[0]?.changed).toBe(false);
    expect(row.before[2]).toMatchObject({ ascii: 'A', changed: false });
    expect(diff.omittedRows).toBe(0);
  });

  it('inserts a gap when changed rows are not neighbors', () => {
    const before = new Uint8Array(48);
    const after = new Uint8Array(48);
    after[0] = 1;
    after[32] = 2;
    const diff = memoryHexDiff(before, after);

    expect(diff.lines.map((line) => line.kind)).toEqual(['row', 'gap', 'row']);
    expect(diff.lines[2]).toMatchObject({ kind: 'row', address: 32 });
  });

  it('marks a missing byte when the second image is shorter', () => {
    const diff = memoryHexDiff(Uint8Array.from([1, 2]), Uint8Array.from([1]));
    const row = diff.lines[0];

    expect(row?.kind).toBe('row');
    if (row?.kind !== 'row') {
      return;
    }

    expect(row.after[1]).toMatchObject({ text: '--', changed: true });
  });
});
