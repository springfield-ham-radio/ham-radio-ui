import { describe, expect, it } from 'vitest';
import {
  canonicalizeAdifLocationField,
  formatAdifLocationLatitude,
  formatAdifLocationLongitude,
  formatAdifLocationPair,
  parseAdifLocationPair,
} from '../../app/utils/station-log-adif-location.ts';

const AUSTIN = { latitude: 30.2672, longitude: -97.7431 };

describe('ADIF location fields', () => {
  it('should parse canonical LAT and LON strings', () => {
    expect(parseAdifLocationPair('N030 16.032', 'W097 44.586')).toEqual(AUSTIN);
    expect(parseAdifLocationPair('S090 00.000', 'E180 00.000')).toEqual({
      latitude: -90,
      longitude: -180,
    });
    expect(parseAdifLocationPair('N000 00.000', 'W180 00.000')).toEqual({
      latitude: 0,
      longitude: -180,
    });
  });

  it('should accept lowercase and two-digit latitude degrees', () => {
    expect(canonicalizeAdifLocationField('n30 16.032', 'latitude')).toBe('N030 16.032');
    expect(canonicalizeAdifLocationField('w097 44.586', 'longitude')).toBe('W097 44.586');
  });

  it('should round-trip canonical strings through parse and format', () => {
    const canonicalLat = 'N030 16.032';
    const canonicalLon = 'W097 44.586';

    expect(canonicalizeAdifLocationField(canonicalLat, 'latitude')).toBe(canonicalLat);
    expect(canonicalizeAdifLocationField(canonicalLon, 'longitude')).toBe(canonicalLon);

    const point = parseAdifLocationPair(canonicalLat, canonicalLon)!;
    const formatted = formatAdifLocationPair(point)!;

    expect(formatted.latitude).toBe(canonicalLat);
    expect(formatted.longitude).toBe(canonicalLon);
  });

  it('should round-trip loose input to canonical export', () => {
    const point = parseAdifLocationPair('N30 16.032', 'W097 44.586')!;
    const formatted = formatAdifLocationPair(point)!;

    expect(formatted).toEqual({ latitude: 'N030 16.032', longitude: 'W097 44.586' });
  });

  it('should keep formatted values within 0.001 minute of parsed values', () => {
    const samples = [
      AUSTIN,
      { latitude: -33.8688, longitude: 151.2093 },
      { latitude: 64.1467, longitude: -21.9426 },
    ];

    for (const point of samples) {
      const formatted = formatAdifLocationPair(point)!;
      const roundTrip = parseAdifLocationPair(formatted.latitude, formatted.longitude)!;

      const latMinutesDelta = Math.abs(roundTrip.latitude - point.latitude) * 60;
      const lonMinutesDelta = Math.abs(roundTrip.longitude - point.longitude) * 60;

      expect(latMinutesDelta).toBeLessThanOrEqual(0.001);
      expect(lonMinutesDelta).toBeLessThanOrEqual(0.001);
    }
  });

  it('should format south, west, and antimeridian longitudes canonically', () => {
    expect(formatAdifLocationLatitude(-42.5)).toBe('S042 30.000');
    expect(formatAdifLocationLongitude(-71)).toBe('W071 00.000');
    expect(formatAdifLocationLongitude(180)).toBe('E180 00.000');
    expect(formatAdifLocationLongitude(-180)).toBe('W180 00.000');
  });

  it('should reject invalid location strings', () => {
    expect(parseAdifLocationPair('30.2672', 'W097 44.586')).toBeUndefined();
    expect(parseAdifLocationPair('N030 16.032', undefined)).toBeUndefined();
    expect(parseAdifLocationPair('N030 60.000', 'W097 44.586')).toBeUndefined();
    expect(parseAdifLocationPair('N091 00.000', 'W097 44.586')).toBeUndefined();
    expect(parseAdifLocationPair('N030 16.032', 'E181 00.000')).toBeUndefined();
    expect(parseAdifLocationPair('E030 16.032', 'W097 44.586')).toBeUndefined();
    expect(parseAdifLocationPair('N030 16.032', 'N097 44.586')).toBeUndefined();
    expect(parseAdifLocationPair('N090 30.000', 'W097 44.586')).toBeUndefined();
  });
});
