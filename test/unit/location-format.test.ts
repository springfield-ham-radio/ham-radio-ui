import { describe, expect, it } from 'vitest';
import {
  compassPoint,
  compassPointBetween,
  distanceKm,
  formatDecimalDegrees,
  formatLatitude,
  geoJsonFeature,
  geoJsonPoint,
  initialBearingDegrees,
  isLocated,
  locatedPoint,
  maidenheadToPoint,
  parseDecimalDegrees,
  parseLocatedPoint,
  pointFromGeoJsonPoint,
  pointToMaidenhead,
} from '../../app/utils/location-format.ts';
import { haversineDistanceKm } from '../../app/utils/maidenhead.ts';

const stLouis = { latitude: 38.627, longitude: -90.1994 };

describe('decimal degrees', () => {
  it('formats signed degrees and drops trailing zeros', () => {
    expect(formatDecimalDegrees(38.5)).toBe('38.5');
    expect(formatDecimalDegrees(-90.1994)).toBe('-90.1994');
    expect(formatDecimalDegrees(0)).toBe('0');
    expect(formatDecimalDegrees(-0)).toBe('0');
  });

  it('parses a signed field and treats blank or out-of-range text as undefined', () => {
    expect(parseDecimalDegrees(' 38.627 ', 'latitude')).toBe(38.627);
    expect(parseDecimalDegrees('-90.1994', 'longitude')).toBe(-90.1994);
    expect(parseDecimalDegrees('+13', 'longitude')).toBe(13);
    expect(parseDecimalDegrees('', 'latitude')).toBeUndefined();
    expect(parseDecimalDegrees('   ', 'longitude')).toBeUndefined();
    expect(parseDecimalDegrees('91', 'latitude')).toBeUndefined();
    expect(parseDecimalDegrees('181', 'longitude')).toBeUndefined();
    expect(parseDecimalDegrees('38° 30\'', 'latitude')).toBeUndefined();
    expect(parseDecimalDegrees('1e1', 'latitude')).toBeUndefined();
  });
});

describe('maidenhead point conversion', () => {
  it('converts a point to a 4- or 6-character locator', () => {
    expect(pointToMaidenhead(stLouis, 4)).toBe('EM48');
    expect(pointToMaidenhead(stLouis, 6)).toBe('EM48VP');
    expect(pointToMaidenhead(stLouis)).toBe('EM48VP');
  });

  it('returns the cell center for a 4- or 6-character locator', () => {
    expect(maidenheadToPoint('FN42')).toEqual({ latitude: 42.5, longitude: -71 });
    expect(maidenheadToPoint('em48qq')).toEqual(maidenheadToPoint('EM48QQ'));
    expect(pointToMaidenhead(maidenheadToPoint('EM48QQ')!, 6)).toBe('EM48QQ');
  });

  it('rejects a 2-character field and an invalid locator', () => {
    expect(maidenheadToPoint('FN')).toBeUndefined();
    expect(maidenheadToPoint('EM4')).toBeUndefined();
    expect(maidenheadToPoint('nope')).toBeUndefined();
  });
});

describe('distance and bearing', () => {
  it('reuses the haversine distance', () => {
    const origin = { latitude: 0, longitude: 0 };
    const east = { latitude: 0, longitude: 1 };

    expect(distanceKm(origin, origin)).toBe(0);
    expect(distanceKm(origin, east)).toBe(haversineDistanceKm(origin, east));
    expect(distanceKm(origin, east)).toBeCloseTo(111.195, 2);
  });

  it('reports the initial bearing clockwise from true north', () => {
    const origin = { latitude: 0, longitude: 0 };

    expect(initialBearingDegrees(origin, origin)).toBe(0);
    expect(initialBearingDegrees(origin, { latitude: 1, longitude: 0 })).toBeCloseTo(0, 5);
    expect(initialBearingDegrees(origin, { latitude: 0, longitude: 1 })).toBeCloseTo(90, 5);
    expect(initialBearingDegrees(origin, { latitude: -1, longitude: 0 })).toBeCloseTo(180, 5);
    expect(initialBearingDegrees(origin, { latitude: 0, longitude: -1 })).toBeCloseTo(270, 5);
  });

  it('labels the bearing with a 16-point compass rose', () => {
    const origin = { latitude: 0, longitude: 0 };

    expect(compassPoint(0)).toBe('N');
    expect(compassPoint(11.24)).toBe('N');
    expect(compassPoint(11.25)).toBe('NNE');
    expect(compassPoint(90)).toBe('E');
    expect(compassPoint(180)).toBe('S');
    expect(compassPoint(270)).toBe('W');
    expect(compassPoint(359)).toBe('N');
    expect(compassPoint(-90)).toBe('W');
    expect(compassPointBetween(origin, { latitude: 0, longitude: 1 })).toBe('E');
    expect(compassPointBetween(stLouis, { latitude: stLouis.latitude + 1, longitude: stLouis.longitude })).toBe('N');
  });
});

describe('GeoJSON axis order', () => {
  it('writes longitude first so a swap of St. Louis fails', () => {
    const geometry = geoJsonPoint(stLouis);

    expect(geometry).toEqual({
      type: 'Point',
      coordinates: [stLouis.longitude, stLouis.latitude],
    });
    expect(geometry.coordinates[0]).toBe(stLouis.longitude);
    expect(geometry.coordinates[1]).toBe(stLouis.latitude);
    expect(geometry.coordinates).not.toEqual([stLouis.latitude, stLouis.longitude]);
  });

  it('reads longitude first, and rejects a pair that is only valid if the axes were swapped', () => {
    const point = { latitude: 10, longitude: 120 };

    expect(pointFromGeoJsonPoint(geoJsonPoint(point))).toEqual(point);
    expect(pointFromGeoJsonPoint({ type: 'Point', coordinates: [120, 10] })).toEqual(point);
    expect(pointFromGeoJsonPoint({ type: 'Point', coordinates: [10, 120] })).toBeUndefined();
    expect(pointFromGeoJsonPoint({ type: 'Point', coordinates: ['120', '10'] })).toBeUndefined();
    expect(pointFromGeoJsonPoint({ coordinates: [120, 10] })).toBeUndefined();
    expect(pointFromGeoJsonPoint(null)).toBeUndefined();
  });

  it('puts the same longitude-first position on a feature', () => {
    const feature = geoJsonFeature(stLouis, { name: 'St. Louis' });

    expect(feature.type).toBe('Feature');
    expect(feature.geometry.coordinates).toEqual([stLouis.longitude, stLouis.latitude]);
    expect(feature.properties).toEqual({ name: 'St. Louis' });
  });
});

describe('isLocated', () => {
  it('treats blank values as undefined and exact (0, 0) as unlocated', () => {
    expect(isLocated(undefined, undefined)).toBe(false);
    expect(isLocated(null, null)).toBe(false);
    expect(isLocated(39.1, undefined)).toBe(false);
    expect(locatedPoint(null, null)).toBeUndefined();
    expect(locatedPoint(0, 0)).toBeUndefined();
    expect(isLocated(0, 0)).toBe(false);
  });

  it('keeps a single zero axis and an in-range pair', () => {
    expect(locatedPoint(0, -94.5)).toEqual({ latitude: 0, longitude: -94.5 });
    expect(locatedPoint(39.1, 0)).toEqual({ latitude: 39.1, longitude: 0 });
    expect(isLocated(39.1, -94.5)).toBe(true);
    expect(locatedPoint(91, -94.5)).toBeUndefined();
    expect(locatedPoint(39.1, 181)).toBeUndefined();
  });

  it('parses decimal text with the same unlocated rule', () => {
    expect(parseLocatedPoint('', '')).toBeUndefined();
    expect(parseLocatedPoint('  ', '0')).toBeUndefined();
    expect(parseLocatedPoint('0', '0')).toBeUndefined();
    expect(parseLocatedPoint('0.0', '-0')).toBeUndefined();
    expect(parseLocatedPoint('0', '-94.5')).toEqual({ latitude: 0, longitude: -94.5 });
    expect(parseLocatedPoint('39.1', '')).toBeUndefined();
    expect(parseLocatedPoint('nope', '-94.5')).toBeUndefined();
    expect(parseLocatedPoint(39.1, -94.5)).toEqual({ latitude: 39.1, longitude: -94.5 });
  });
});

describe('DMS display', () => {
  it('still formats latitude from the shared module', () => {
    expect(formatLatitude(38.5)).toBe('38° 30\' 00.00" N');
  });
});
