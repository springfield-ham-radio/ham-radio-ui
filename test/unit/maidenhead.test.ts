import { describe, expect, it } from 'vitest';
import {
  decimalDegreesToDms,
  dmsToDecimalDegrees,
  formatLatitude,
  formatLongitude,
  isMaidenheadGrid,
  latLonToMaidenhead,
  maidenheadToLatLon,
  normalizeMaidenhead,
  parseDmsInput,
} from '../../app/utils/maidenhead.ts';

describe('maidenhead', () => {
  it('should accept 2-, 4-, and 6-character locators', () => {
    expect(isMaidenheadGrid('FN')).toBe(true);
    expect(isMaidenheadGrid('FN42')).toBe(true);
    expect(isMaidenheadGrid('EM48qq')).toBe(true);
    expect(isMaidenheadGrid('fn42')).toBe(true);
    expect(isMaidenheadGrid('ZZ99')).toBe(false);
    expect(isMaidenheadGrid('EM4')).toBe(false);
  });

  it('should put FN42 at the center of that square', () => {
    const point = maidenheadToLatLon('FN42');

    expect(point?.latitude).toBe(42.5);
    expect(point?.longitude).toBe(-71);
  });

  it('should round-trip a 6-character locator through its cell center', () => {
    const grid = 'EM48QQ';
    const point = maidenheadToLatLon(grid);

    expect(point).not.toBe(undefined);
    expect(latLonToMaidenhead(point!.latitude, point!.longitude, 6)).toBe(grid);
  });

  it('should encode St. Louis coordinates into EM48', () => {
    expect(latLonToMaidenhead(38.627, -90.1994, 4)).toBe('EM48');
  });

  it('should normalize locators to uppercase', () => {
    expect(normalizeMaidenhead('  em48qq ')).toBe('EM48QQ');
    expect(normalizeMaidenhead('nope')).toBe(undefined);
  });

  it('should format coordinates as degrees, minutes, and decimal seconds', () => {
    expect(formatLatitude(38.5)).toBe('38° 30\' 00.00" N');
    expect(formatLatitude(-33.9)).toBe('33° 54\' 00.00" S');
    expect(formatLongitude(-90.1994)).toBe('90° 11\' 57.84" W');
    expect(formatLongitude(13)).toBe('13° 00\' 00.00" E');
  });

  it('should split St. Louis decimal degrees into DMS', () => {
    expect(decimalDegreesToDms(38.627, 'latitude')).toEqual({
      degrees: 38,
      minutes: 37,
      seconds: 37.2,
      hemisphere: 'N',
    });
    expect(decimalDegreesToDms(-90.1994, 'longitude')).toEqual({
      degrees: 90,
      minutes: 11,
      seconds: 57.84,
      hemisphere: 'W',
    });
  });

  it('should convert DMS back to signed decimal degrees', () => {
    expect(dmsToDecimalDegrees({ degrees: 38, minutes: 37, seconds: 37.2, hemisphere: 'N' })).toBe(38.627);
    expect(dmsToDecimalDegrees({ degrees: 90, minutes: 11, seconds: 57.84, hemisphere: 'W' })).toBe(-90.1994);
    expect(dmsToDecimalDegrees({ degrees: 42, minutes: 30, seconds: 0, hemisphere: 'N' })).toBe(42.5);
    expect(dmsToDecimalDegrees({ degrees: 71, minutes: 0, seconds: 0, hemisphere: 'W' })).toBe(-71);
  });

  it('should treat blank DMS fields as an empty coordinate', () => {
    expect(parseDmsInput({ degrees: '', minutes: '', seconds: '', hemisphere: 'N' }, 'latitude')).toEqual({
      empty: true,
    });
  });

  it('should treat missing minutes and seconds as zero', () => {
    const parsed = parseDmsInput({ degrees: '38', minutes: '', seconds: '', hemisphere: 'N' }, 'latitude');

    expect(parsed).toEqual({ empty: false, value: 38 });
  });

  it('should reject unsigned degrees outside the axis range and non-integer minutes', () => {
    expect(parseDmsInput({ degrees: '91', minutes: '0', seconds: '0', hemisphere: 'N' }, 'latitude').error).toMatch(
      /0 to 90/,
    );
    expect(parseDmsInput({ degrees: '38', minutes: '60', seconds: '0', hemisphere: 'S' }, 'latitude').error).toMatch(
      /minutes/i,
    );
    expect(parseDmsInput({ degrees: '90', minutes: '0', seconds: '0.01', hemisphere: 'N' }, 'latitude').error).toMatch(
      /90/,
    );
  });
});
