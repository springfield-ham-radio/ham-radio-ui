import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DISTANCE_UNIT,
  parseDistanceUnit,
  parseDistanceUnitSettings,
  serializeDistanceUnitSettings,
} from '../../app/utils/distance-unit.ts';

describe('distance unit preference', () => {
  it('should default to miles', () => {
    expect(DEFAULT_DISTANCE_UNIT).toBe('mi');
    expect(parseDistanceUnit(undefined)).toBe('mi');
    expect(parseDistanceUnit('miles')).toBe('mi');
    expect(parseDistanceUnitSettings(null)).toBe('mi');
    expect(parseDistanceUnitSettings('')).toBe('mi');
    expect(parseDistanceUnitSettings('{')).toBe('mi');
    expect(parseDistanceUnitSettings('[]')).toBe('mi');
    expect(parseDistanceUnitSettings(JSON.stringify({ unit: 'furlongs' }))).toBe('mi');
  });

  it('should parse miles and kilometers', () => {
    expect(parseDistanceUnit('km')).toBe('km');
    expect(parseDistanceUnit('mi')).toBe('mi');
    expect(parseDistanceUnitSettings(JSON.stringify({ unit: 'km' }))).toBe('km');
    expect(parseDistanceUnitSettings('"mi"')).toBe('mi');
  });

  it('should round-trip a stored unit', () => {
    expect(parseDistanceUnitSettings(serializeDistanceUnitSettings('km'))).toBe('km');
    expect(parseDistanceUnitSettings(serializeDistanceUnitSettings('mi'))).toBe('mi');
  });
});
