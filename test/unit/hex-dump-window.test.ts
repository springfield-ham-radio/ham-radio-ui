import { Virtualizer } from '@tanstack/vue-virtual';
import { describe, expect, it } from 'vitest';
import {
  HEX_DUMP_BYTES_PER_ROW,
  HEX_DUMP_ROW_HEIGHT_PX,
  formatHexDumpAddress,
  formatHexDumpAscii,
  formatHexDumpByte,
  hexDumpRowCount,
  hexDumpRowIndex,
} from '../../app/utils/hex-dump.ts';
import { VIRTUAL_ROW_OVERSCAN } from '../../app/composables/useFixedVirtualRows.ts';
import {
  listMemoryHexDiffItems,
  memoryHexDiffCells,
  summarizeMemoryImages,
} from '../../app/utils/driver-debug.ts';

const TH_D74_BYTES = 500_480;

function mountRowVirtualizer(count: number, viewport: number) {
  let offset = 0;
  const element = {
    scrollTop: 0,
    clientHeight: viewport,
    clientWidth: 800,
    scrollHeight: count * HEX_DUMP_ROW_HEIGHT_PX,
    scrollWidth: 800,
  };

  const virtualizer = new Virtualizer<HTMLElement, HTMLElement>({
    count,
    estimateSize: () => HEX_DUMP_ROW_HEIGHT_PX,
    overscan: VIRTUAL_ROW_OVERSCAN,
    initialRect: { width: 800, height: viewport },
    getScrollElement: () => element as unknown as HTMLElement,
    observeElementRect: (_instance, cb) => {
      cb({ width: 800, height: viewport });
    },
    observeElementOffset: (_instance, cb) => {
      cb(offset, false);
    },
    scrollToFn: (next) => {
      offset = next;
      element.scrollTop = next;
      virtualizer.scrollOffset = next;
    },
  });

  virtualizer._willUpdate();
  return virtualizer;
}

describe('hex dump window', () => {
  it('counts rows for a 500 KB image and maps an offset to its row', () => {
    expect(hexDumpRowCount(TH_D74_BYTES)).toBe(TH_D74_BYTES / HEX_DUMP_BYTES_PER_ROW);
    expect(hexDumpRowCount(0)).toBe(0);
    expect(hexDumpRowIndex(0)).toBe(0);
    expect(hexDumpRowIndex(500_000)).toBe(31_250);
    expect(formatHexDumpAddress(0x4000)).toBe('00004000');
    expect(formatHexDumpByte(0x0a)).toBe('0A');
    expect(formatHexDumpAscii(0x41)).toBe('A');
    expect(formatHexDumpAscii(0)).toBe('.');
  });

  it('mounts a window of rows and can scroll to a late offset', () => {
    const count = hexDumpRowCount(TH_D74_BYTES);
    const virtualizer = mountRowVirtualizer(count, 640);
    const firstPaint = virtualizer.getVirtualItems();

    expect(firstPaint.length).toBeGreaterThan(0);
    expect(firstPaint.length).toBeLessThan(80);
    expect(firstPaint[0]?.index).toBe(0);

    const target = hexDumpRowIndex(500_000);
    virtualizer.scrollToIndex(target, { align: 'auto' });
    const scrolled = virtualizer.getVirtualItems();
    const indexes = scrolled.map((item) => item.index);

    expect(indexes).toContain(target);
    expect(scrolled.length).toBeLessThan(80);
  });
});

describe('driver hex diff window', () => {
  it('lists every changed row of a 500 KB image without building cells up front', () => {
    const before = new Uint8Array(TH_D74_BYTES);
    const after = new Uint8Array(TH_D74_BYTES);
    after[0] = 1;
    after[500_007] = 0x41;

    const start = performance.now();
    const items = listMemoryHexDiffItems(before, after);
    const elapsed = performance.now() - start;
    const address = 500_007 - (500_007 % 16);

    expect(elapsed).toBeLessThan(250);
    expect(items.some((item) => item.kind === 'row' && item.address === address)).toBe(true);
    expect(items.filter((item) => item.kind === 'row').length).toBe(2);
    expect(items.some((item) => item.kind === 'gap')).toBe(true);

    const cells = memoryHexDiffCells(before, after, address);
    expect(cells.after[500_007 - address]).toMatchObject({ text: '41', ascii: 'A', changed: true });
    expect(cells.before[0]?.changed).toBe(false);

    expect(summarizeMemoryImages(before, after)).toEqual({ byteCount: 2, runCount: 2 });
  });

  it('indexes a fully different 500 KB image as one row per 16 bytes', () => {
    const before = new Uint8Array(TH_D74_BYTES);
    const after = new Uint8Array(TH_D74_BYTES);
    after.fill(1);

    const items = listMemoryHexDiffItems(before, after);
    const rows = items.filter((item) => item.kind === 'row');

    expect(rows).toHaveLength(hexDumpRowCount(TH_D74_BYTES));
    expect(items.some((item) => item.kind === 'gap')).toBe(false);
    expect(summarizeMemoryImages(before, after)).toEqual({ byteCount: TH_D74_BYTES, runCount: 1 });
  });
});
