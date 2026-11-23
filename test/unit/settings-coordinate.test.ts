import { describe, expect, it } from 'vitest';
import type { RadioMemoryMapUiField } from '@springfield/ham-radio-utils';
import { fieldComposite, formatCoordinate, parseCoordinate, partsFromCoordinate } from '../../app/utils/settings-coordinate.ts';

function coordinateField(part: 'degrees' | 'minutes' | 'fraction' | 'hemisphere'): RadioMemoryMapUiField {
  return {
    path: `object.${part}`,
    structId: 'object',
    fieldId: part,
    ui: {
      group: 'aprs',
      label: part,
      widget: 'integer',
      composite: {
        id: 'obj1-lat',
        kind: 'coordinate',
        axis: 'lat',
        part,
        fractionScale: 10000,
        label: 'Latitude',
      },
    },
  } as RadioMemoryMapUiField;
}

describe('formatCoordinate', () => {
  it('should show latitude degrees and decimal minutes', () => {
    expect(formatCoordinate(30, 12, 3400, 10000, 'lat')).toBe("30° 12.34'");
    expect(formatCoordinate(0, 0, 0, 10000, 'lat')).toBe("00° 00.00'");
  });

  it('should pad longitude degrees to three digits', () => {
    expect(formatCoordinate(97, 45, 6700, 10000, 'lon')).toBe("097° 45.67'");
  });
});

describe('partsFromCoordinate', () => {
  it('should split decimal minutes into whole minutes and a scaled fraction', () => {
    expect(partsFromCoordinate(30, 12.34, 'lat', 10000)).toEqual({ degrees: 30, minutes: 12, fraction: 3400 });
    expect(partsFromCoordinate(97, 45.67, 'lon', 10000)).toEqual({ degrees: 97, minutes: 45, fraction: 6700 });
    expect(partsFromCoordinate(90, 59.99, 'lat', 10000)).toEqual({ degrees: 90, minutes: 59, fraction: 9900 });
    expect(partsFromCoordinate(0, 0, 'lat', 10000)).toEqual({ degrees: 0, minutes: 0, fraction: 0 });
  });

  it('should reject degrees and minutes outside the coordinate range', () => {
    expect(partsFromCoordinate(91, 0, 'lat', 10000)).toEqual({ error: 'Latitude degrees must be 0–90.' });
    expect(partsFromCoordinate(30.5, 0, 'lat', 10000)).toEqual({ error: 'Latitude degrees must be 0–90.' });
    expect(partsFromCoordinate(181, 0, 'lon', 10000)).toEqual({ error: 'Longitude degrees must be 0–180.' });
    expect(partsFromCoordinate(30, 60, 'lat', 10000)).toEqual({ error: 'Minutes must be 0–59.99.' });
    expect(partsFromCoordinate(30, -1, 'lat', 10000)).toEqual({ error: 'Minutes must be 0–59.99.' });
    expect(partsFromCoordinate(null, 12.34, 'lat', 10000)).toEqual({ error: 'Latitude degrees must be 0–90.' });
    expect(partsFromCoordinate(30, null, 'lat', 10000)).toEqual({ error: 'Minutes must be 0–59.99.' });
  });
});

describe('parseCoordinate', () => {
  it('should split decimal minutes into whole minutes and a scaled fraction', () => {
    expect(parseCoordinate("30° 12.34'", 'lat', 10000)).toEqual({ degrees: 30, minutes: 12, fraction: 3400 });
    expect(parseCoordinate("097° 45.67'", 'lon', 10000)).toEqual({ degrees: 97, minutes: 45, fraction: 6700 });
    expect(parseCoordinate('30 12.34', 'lat', 10000)).toEqual({ degrees: 30, minutes: 12, fraction: 3400 });
  });

  it('should reject degrees and minutes outside the coordinate range', () => {
    expect(parseCoordinate("91° 00.00'", 'lat', 10000)).toEqual({ error: 'Latitude degrees must be 0–90.' });
    expect(parseCoordinate("181° 00.00'", 'lon', 10000)).toEqual({ error: 'Longitude degrees must be 0–180.' });
    expect(parseCoordinate("30° 60.00'", 'lat', 10000)).toEqual({ error: 'Minutes must be 0–59.99.' });
    expect(parseCoordinate("30° -1.00'", 'lat', 10000)).toEqual({ error: 'Minutes must be 0–59.99.' });
    expect(parseCoordinate("90° 59.99'", 'lat', 10000)).toEqual({ degrees: 90, minutes: 59, fraction: 9900 });
    expect(parseCoordinate("180° 00.00'", 'lon', 10000)).toEqual({ degrees: 180, minutes: 0, fraction: 0 });
  });

  it('should ignore hemisphere text because that byte is not mapped', () => {
    expect('error' in parseCoordinate("30° 12.34' N", 'lat', 10000)).toBe(true);
  });
});

describe('fieldComposite', () => {
  it('should read a coordinate composite and ignore other kinds', () => {
    expect(fieldComposite(coordinateField('degrees'))?.label).toBe('Latitude');
    expect(fieldComposite(coordinateField('hemisphere'))?.part).toBe('hemisphere');

    const other = coordinateField('degrees');
    other.ui = { ...other.ui, composite: { id: 'x', kind: 'grid', label: 'Grid' } } as typeof other.ui;

    expect(fieldComposite(other)).toBeUndefined();
    expect(fieldComposite({ ...other, ui: { ...other.ui, composite: undefined } } as RadioMemoryMapUiField)).toBeUndefined();
  });
});
