import { describe, expect, it } from 'vitest';
import type { RadioMemoryConfig, RadioMemoryMap } from '@springfield/ham-radio-api';
import {
  analyzeMenuCaptureStep,
  buildMenuCaptureStepDiff,
  filterMemoryDiffRuns,
  imagesMatchExceptMenuCaptureIgnore,
  resolveMenuCaptureIgnore,
} from '../../app/utils/menu-capture.ts';
import { compareMemoryImages } from '../../app/utils/driver-debug.ts';

const sparseMemoryConfig: RadioMemoryConfig = {
  chunkSize: 0,
  addressSize: 0,
  addressEndianness: 'big',
  segments: {
    settings: { startAddress: 0, endAddress: 0xffff },
  },
};

const bitfieldMap: RadioMemoryMap = {
  version: '1.0.0',
  structs: [
    {
      id: 'flags',
      seek: '0x0010',
      fields: [
        { id: 'padding', type: 'bits', width: 7, reserved: true },
        {
          id: 'lockout',
          type: 'bits',
          width: 1,
          value: { kind: 'boolean' },
          ui: { group: 'basic', label: 'Scan skip', widget: 'switch' },
        },
      ],
    },
  ],
};

describe('menu capture diff', () => {
  it('diffs against the previous read rather than the baseline', () => {
    const baseline = Uint8Array.from([0, 1, 2, 3]);
  const afterFirst = Uint8Array.from([0, 9, 2, 3]);
    const afterSecond = Uint8Array.from([0, 9, 8, 3]);

    expect(compareMemoryImages(baseline, afterSecond).length).toBeGreaterThan(0);
    const incremental = analyzeMenuCaptureStep({
      before: afterFirst,
      after: afterSecond,
      ignore: [],
    });

    expect(incremental.diff.byteCount).toBe(1);
    expect(incremental.diff.runs[0]?.offset).toBe(2);
  });

  it('omits driver-declared ignore bytes from flags and diff', () => {
    const before = new Uint8Array(0x0390);
    const after = before.slice();
    after[0x038c] = 0x11;
    after[0x0100] = 0x02;

    const ignore = [{ address: '0x038C', length: 1, reason: 'Read counter' }];
    const resolved = resolveMenuCaptureIgnore(ignore, sparseMemoryConfig, before.length);
    const analyzed = analyzeMenuCaptureStep({
      before,
      after,
      ignore,
      memoryConfig: sparseMemoryConfig,
    });

    expect(analyzed.diff.ignoredByteCount).toBe(1);
    expect(analyzed.diff.byteCount).toBe(1);
    expect(analyzed.diff.runCount).toBe(1);
    expect(analyzed.flags).not.toContain('wide');
    expect(resolved[0]?.offset).toBe(0x038c);
  });

  it('marks empty and wide steps', () => {
    const before = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const emptyAfter = before.slice();
    expect(analyzeMenuCaptureStep({ before, after: emptyAfter, ignore: [] }).flags).toContain('empty');

    const wideAfter = before.slice();
    wideAfter[0] = 0xff;
    wideAfter[8] = 0xff;
    expect(analyzeMenuCaptureStep({ before, after: wideAfter, ignore: [] }).flags).toContain('wide');
  });

  it('lists a bitfield only when its bits change', () => {
    const before = new Uint8Array(32);
    const after = before.slice();
    before[0x10] = 0b1000_0000;
    after[0x10] = 0b1000_0001;

    const diff = buildMenuCaptureStepDiff(before, after, bitfieldMap, sparseMemoryConfig, []);

    expect(diff.runs[0]?.fields.map((field) => field.fieldId)).toEqual(['lockout']);
    expect(diff.runs[0]?.fields.some((field) => field.fieldId === 'padding')).toBe(false);
  });

  it('includes every 16-byte row a run touches', () => {
    const before = new Uint8Array(32);
    const after = before.slice();
    after[15] = 1;
    after[16] = 2;
    const diff = buildMenuCaptureStepDiff(before, after, undefined, undefined, []);

    expect(diff.runs).toHaveLength(1);
    expect(diff.runs[0]?.context).toHaveLength(2);
  });

  it('omits duplicate menu.code on diff field annotations', () => {
    const map: RadioMemoryMap = {
      version: '1.0.0',
      structs: [
        {
          id: 'led',
          seek: '0x0010',
          fields: [
            { id: 'pad', type: 'bits', width: 7, reserved: true },
            {
              id: 'fmRadio',
              type: 'bits',
              width: 1,
              value: { kind: 'boolean' },
              ui: {
                label: 'LED Control',
                widget: 'switch',
                menu: { number: 181, code: 'LED Control' },
              },
            },
          ],
        },
      ],
    };
    const before = new Uint8Array(32);
    const after = before.slice();
    before[0x10] = 0b1000_0000;
    after[0x10] = 0b1000_0001;

    const diff = buildMenuCaptureStepDiff(before, after, map, sparseMemoryConfig, []);
    const field = diff.runs[0]?.fields.find((entry) => entry.fieldId === 'fmRadio');

    expect(field?.menu?.number).toBe(181);
    expect(field?.menu).not.toHaveProperty('code');
  });

  it('marks unmapped offsets and includes hex context', () => {
    const before = Uint8Array.from([0, 0, 0]);
    const after = Uint8Array.from([0, 0, 1]);
    const diff = buildMenuCaptureStepDiff(before, after, undefined, undefined, []);

    expect(diff.runs[0]?.unmapped).toBe(true);
    expect(diff.runs[0]?.context[0]?.before).toMatch(/^00 00 00/);
    expect(diff.runs[0]?.context[0]?.after).toMatch(/^00 00 01/);
  });

  it('verifies baseline match while ignoring volatile bytes', () => {
    const baseline = new Uint8Array(0x0390);
    const verify = baseline.slice();
    verify[0x038c] = 0x44;

    const result = imagesMatchExceptMenuCaptureIgnore(
      baseline,
      verify,
      [{ address: '0x038C', length: 1 }],
      sparseMemoryConfig,
    );

    expect(result.matches).toBe(true);
    expect(filterMemoryDiffRuns(baseline, verify, new Set([0x038c])).runs).toHaveLength(0);
  });
});