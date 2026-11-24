import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { RadioMemoryConfig, RadioMemoryMap } from '@springfield/ham-radio-api';
import { buildMenuCaptureStepDiff } from '../../app/utils/menu-capture.ts';
import {
  formatMenuCaptureReviewFieldLine,
  menuCaptureFieldReviewLines,
  menuCaptureReviewHasVisibleDiff,
} from '../../app/utils/menu-capture-review.ts';

const sparseMemoryConfig: RadioMemoryConfig = {
  chunkSize: 0,
  addressSize: 0,
  addressEndianness: 'big',
  segments: {
    settings: { startAddress: 0, endAddress: 0xffff },
  },
};

const menu181Map: RadioMemoryMap = {
  version: '1.0.0',
  structs: [
    {
      id: 'flags',
      seek: '0x0010',
      fields: [
        { id: 'padding', type: 'bits', width: 7, reserved: true },
        {
          id: 'fmRadio',
          type: 'bits',
          width: 1,
          value: { kind: 'boolean' },
          ui: {
            group: 'led',
            label: 'LED Control',
            widget: 'switch',
            menu: { number: 181, code: 'FM Radio' },
          },
        },
      ],
    },
  ],
};

describe('menu capture review panel data', () => {
  it('annotates a 1-byte bitfield change at 0x1028 for menu 181', () => {
    const offset = 0x10;
    const before = new Uint8Array(32);
    const after = before.slice();
    before[offset] = 0b1000_0000;
    after[offset] = 0b1000_0001;

    const diff = buildMenuCaptureStepDiff(before, after, menu181Map, sparseMemoryConfig, []);

    expect(diff.byteCount).toBe(1);
    expect(diff.runCount).toBe(1);
    expect(diff.runs[0]?.address).toBe('0x0010');
    expect(diff.runs[0]?.context.length).toBeGreaterThan(0);
    expect(diff.runs[0]?.context[0]?.before).toContain('80');
    expect(diff.runs[0]?.context[0]?.after).toContain('81');
    expect(diff.runs[0]?.fields.some((field) => field.fieldId === 'fmRadio')).toBe(true);

    const lines = menuCaptureFieldReviewLines(diff.runs[0]!.fields, 181);
    expect(lines.some((line) => line.includes('Menu 181'))).toBe(true);
    expect(lines.some((line) => line.includes('LED Control'))).toBe(true);
    expect(lines.some((line) => line.includes('FM Radio'))).toBe(true);
    expect(formatMenuCaptureReviewFieldLine(diff.runs[0]!.fields[0]!, 181)).toMatch(/Menu 181/);
    expect(menuCaptureReviewHasVisibleDiff(diff)).toBe(true);
  });
});

describe('menu capture review UI', () => {
  it('renders mapped fields and context hex on the review step', () => {
    const wizard = readFileSync(new URL('../../app/components/RadioMenuCapture.vue', import.meta.url), 'utf8');
    const diffPanel = readFileSync(new URL('../../app/components/MenuCaptureDiffRuns.vue', import.meta.url), 'utf8');
    const fields = readFileSync(new URL('../../app/components/MenuCaptureStepFields.vue', import.meta.url), 'utf8');

    expect(wizard).toContain('MenuCaptureDiffRuns');
    expect(wizard).toContain('MenuCaptureStepFields');
    expect(wizard).toContain("phase === 'review'");
    expect(wizard).toContain("phase === 'change'");
    expect(wizard).toContain('recordCapturedStep');
    expect(wizard).toContain('activePhaseInstruction');
    expect(wizard).not.toContain('DriverMemoryHexDiff');

    expect(diffPanel).toContain('run.context');
    expect(diffPanel).toContain('menuCaptureFieldReviewLines');
    expect(fields).toContain('Menu number');
    expect(fields).toContain('Original value');
  });
});