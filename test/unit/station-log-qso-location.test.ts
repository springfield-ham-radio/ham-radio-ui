import { describe, expect, it } from 'vitest';
import {
  coordinatePromotionNeedsPersist,
  coordinatesOutsideGrid,
  gridsquareFromCoordinatesIfEmpty,
  myCoordinatesFromSavedStation,
  promoteAdifExtraCoordinates,
} from '../../app/utils/station-log-qso-location.ts';

describe('station-log-qso-location', () => {
  it('promotes valid LAT/LON and MY_LAT/MY_LON pairs out of adifExtra', () => {
    const result = promoteAdifExtraCoordinates(
      {
        LAT: 'N030 16.032',
        LON: 'W097 44.586',
        MY_LAT: 'N042 18.000',
        MY_LON: 'W071 48.000',
        DXCC: '291',
      },
      {},
    );

    expect(result.latitude).toBeCloseTo(30.2672, 4);
    expect(result.longitude).toBeCloseTo(-97.7431, 4);
    expect(result.myLatitude).toBeCloseTo(42.3, 4);
    expect(result.myLongitude).toBeCloseTo(-71.8, 4);
    expect(result.adifExtra).toEqual({ DXCC: '291' });
  });

  it('keeps lone LAT in adifExtra when LON is missing', () => {
    const result = promoteAdifExtraCoordinates({ LAT: 'N030 16.032', DXCC: '291' }, {});

    expect(result.latitude).toBeUndefined();
    expect(result.longitude).toBeUndefined();
    expect(result.adifExtra).toEqual({ LAT: 'N030 16.032', DXCC: '291' });
  });

  it('leaves an unlocated Null Island pair in adifExtra', () => {
    const extra = { LAT: 'N000 00.000', LON: 'E000 00.000', DXCC: '291' };
    const result = promoteAdifExtraCoordinates(extra, {});

    expect(result.latitude).toBeUndefined();
    expect(result.longitude).toBeUndefined();
    expect(result.adifExtra).toEqual(extra);
  });

  it('promotes once and does not ask to write a row that did not change', () => {
    const extra = {
      LAT: 'N030 16.032',
      LON: 'W097 44.586',
      DXCC: '291',
    };
    const empty = {
      latitude: null,
      longitude: null,
      myLatitude: null,
      myLongitude: null,
      adifExtra: extra,
    };
    const once = promoteAdifExtraCoordinates(extra, {});
    const twice = promoteAdifExtraCoordinates(once.adifExtra, once);

    expect(twice.latitude).toBe(once.latitude);
    expect(twice.longitude).toBe(once.longitude);
    expect(twice.adifExtra).toEqual(once.adifExtra);
    expect(coordinatePromotionNeedsPersist(empty, once)).toBe(true);
    expect(
      coordinatePromotionNeedsPersist(
        {
          latitude: once.latitude ?? null,
          longitude: once.longitude ?? null,
          myLatitude: null,
          myLongitude: null,
          adifExtra: once.adifExtra,
        },
        twice,
      ),
    ).toBe(false);
    const lone = { LAT: 'N030 16.032' };
    expect(
      coordinatePromotionNeedsPersist(
        { ...empty, adifExtra: lone },
        promoteAdifExtraCoordinates(lone, {}),
      ),
    ).toBe(false);
  });

  it('does not overwrite stored coordinate columns', () => {
    const result = promoteAdifExtraCoordinates(
      { LAT: 'N030 16.032', LON: 'W097 44.586' },
      { latitude: 1, longitude: 2 },
    );

    expect(result.latitude).toBe(1);
    expect(result.longitude).toBe(2);
    expect(result.adifExtra).toEqual({ LAT: 'N030 16.032', LON: 'W097 44.586' });
  });

  it('fills an empty grid from coordinates but keeps an existing grid', () => {
    const point = { latitude: 38.627, longitude: -90.1994 };

    expect(gridsquareFromCoordinatesIfEmpty(undefined, point)).toBe('EM48VP');
    expect(gridsquareFromCoordinatesIfEmpty('FN31', point)).toBe('FN31');
    expect(gridsquareFromCoordinatesIfEmpty('FN31', undefined)).toBe('FN31');
  });

  it('copies my coordinates only from a station saved from coordinates', () => {
    const point = { latitude: 30.2672, longitude: -97.7431, locationSource: 'coordinates' as const };

    expect(myCoordinatesFromSavedStation(point)).toEqual({
      myLatitude: 30.2672,
      myLongitude: -97.7431,
    });
    expect(
      myCoordinatesFromSavedStation({
        latitude: 30.2672,
        longitude: -97.7431,
        locationSource: 'grid',
      }),
    ).toEqual({});
    expect(myCoordinatesFromSavedStation({ latitude: 30.2672, longitude: -97.7431 })).toEqual({});
  });

  it('reports a point that sits outside the entered grid without changing either value', () => {
    const point = { latitude: 30.2672, longitude: -97.7431 };

    expect(coordinatesOutsideGrid('FN31', point)).toBe(true);
    expect(coordinatesOutsideGrid('EM10', point)).toBe(false);
    expect(gridsquareFromCoordinatesIfEmpty('FN31', point)).toBe('FN31');
  });
});
