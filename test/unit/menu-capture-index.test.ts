import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { RadioMemoryMap } from '@springfield/ham-radio-api';
import { lookupMenuCaptureByNumber } from '../../app/utils/menu-capture.ts';

const thD74Map = JSON.parse(
  readFileSync(new URL('../fixtures/kenwood/th-d74-settings.json', import.meta.url), 'utf8'),
) as RadioMemoryMap;

describe('menu capture index', () => {
  it('prefills menu 610 from the memory map', () => {
    const lookup = lookupMenuCaptureByNumber(thD74Map, 610);

    expect(lookup.nameSource).toBe('map');
    expect(lookup.prefilledName).toBe('My Callsign');
    expect(lookup.fields.map((field) => field.fieldId).sort()).toEqual(['callsign', 'memo']);
  });

  it('returns no prefilled name for an unknown menu number', () => {
    const lookup = lookupMenuCaptureByNumber(thD74Map, 99_999);

    expect(lookup.prefilledName).toBeUndefined();
    expect(lookup.nameSource).toBe('operator');
    expect(lookup.fields).toEqual([]);
  });
});