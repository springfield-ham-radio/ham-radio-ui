import { describe, expect, it } from 'vitest';
import { Frequency } from '@springfield/ham-radio-api';
import { bandNameForFrequency } from '../../app/utils/transmit-privileges.ts';
import {
  formatTripDistance,
  orderTripChannels,
  parseTypedTripCoordinates,
  stationStartPoint,
  trimTripChannels,
  tripDistanceKm,
  typedCoordinateError,
  type TripLocatable,
} from '../../app/utils/trip-channels.ts';

function row(
  id: string,
  latitude: number | undefined,
  longitude: number | undefined,
  transmitHz: number,
  extra: Partial<TripLocatable> = {},
): TripLocatable & { id: string } {
  return {
    id,
    latitude,
    longitude,
    transmitFrequency: transmitHz,
    ...extra,
  };
}

describe('trip-channels', () => {
  const start = { latitude: 39.1, longitude: -94.58 };
  const near = row('near', 39.2, -94.6, 146_520_000, { use: 'open', onAir: true });
  const far = row('far', 38.6, -90.2, 446_000_000, { use: 'closed', onAir: false });
  const unknown = row('unknown', undefined, undefined, 146_520_000, { use: 'open', onAir: true });

  it('resolves a station start from coordinates, then from a grid', () => {
    expect(stationStartPoint({ latitude: 39.1, longitude: -94.58, gridsquare: 'EM38' })).toEqual({
      latitude: 39.1,
      longitude: -94.58,
    });
    expect(stationStartPoint({ gridsquare: 'FN42' })?.latitude).toBeCloseTo(42.5, 1);
    expect(stationStartPoint({})).toBeUndefined();
  });

  it('parses typed coordinates and reports range errors', () => {
    expect(parseTypedTripCoordinates('39.1', '-94.58')).toEqual({ latitude: 39.1, longitude: -94.58 });
    expect(parseTypedTripCoordinates('39.1', '')).toBeUndefined();
    expect(typedCoordinateError('', 'latitude')).toBeUndefined();
    expect(typedCoordinateError('91', 'latitude')).toMatch(/-90 to 90/);
    expect(typedCoordinateError('181', 'longitude')).toMatch(/-180 to 180/);
  });

  it('sorts by straight-line distance and leaves rows without coordinates last', () => {
    const ordered = orderTripChannels([far, unknown, near], start);

    expect(ordered.map((channel) => channel.id)).toEqual(['near', 'far', 'unknown']);
    expect(tripDistanceKm(near, start)).toBeLessThan(tripDistanceKm(far, start)!);
    expect(tripDistanceKm(unknown, start)).toBeUndefined();
    expect(formatTripDistance(undefined)).toBe('—');
    expect(formatTripDistance(1.609344)).toBe('1.0 mi');
    expect(orderTripChannels([far, near], undefined).map((channel) => channel.id)).toEqual(['far', 'near']);
  });

  it('filters by band, open use, and on-air', () => {
    const twoMeter = bandNameForFrequency(Frequency(146_520_000));
    const uhf = bandNameForFrequency(Frequency(446_000_000));

    expect(twoMeter).not.toBe('');
    expect(uhf).not.toBe(twoMeter);

    const channels = [near, far, unknown];

    expect(trimTripChannels(channels, { band: twoMeter, openOnly: false, onAirOnly: false }).map((channel) => channel.id)).toEqual([
      'near',
      'unknown',
    ]);
    expect(trimTripChannels(channels, { band: '', openOnly: true, onAirOnly: false }).map((channel) => channel.id)).toEqual([
      'near',
      'unknown',
    ]);
    expect(trimTripChannels(channels, { band: '', openOnly: false, onAirOnly: true }).map((channel) => channel.id)).toEqual([
      'near',
      'unknown',
    ]);
    expect(trimTripChannels(channels, { band: uhf, openOnly: true, onAirOnly: true })).toEqual([]);
  });
});
