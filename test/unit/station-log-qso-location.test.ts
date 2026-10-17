import { describe, expect, it } from 'vitest';
import {
  gridsquareFromCoordinatesIfEmpty,
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
  });
});
