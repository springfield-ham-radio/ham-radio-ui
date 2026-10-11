import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Frequency } from '@springfield/ham-radio-api';
import { parseRepeaterImportCsv } from '../../app/utils/repeater-import.ts';
import { bandNameForFrequency } from '../../app/utils/transmit-privileges.ts';
import {
  defaultDistanceStartId,
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
    expect(stationStartPoint({ latitude: 0, longitude: 0, gridsquare: 'EM38' })?.latitude).toBeCloseTo(38.5, 0);
    expect(stationStartPoint({ latitude: 0, longitude: -94.58 })).toEqual({ latitude: 0, longitude: -94.58 });
  });

  it('parses typed coordinates and reports range errors', () => {
    expect(parseTypedTripCoordinates('39.1', '-94.58')).toEqual({ latitude: 39.1, longitude: -94.58 });
    expect(parseTypedTripCoordinates('0', '0')).toBeUndefined();
    expect(parseTypedTripCoordinates('0', '-94.58')).toEqual({ latitude: 0, longitude: -94.58 });
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

  it('keeps unlocated rows last when distance is sorted descending', () => {
    const unknownLater = row('unknown-later', undefined, undefined, 146_520_000);
    const ordered = orderTripChannels([unknown, near, far, unknownLater], start, 'desc');

    expect(ordered.map((channel) => channel.id)).toEqual(['far', 'near', 'unknown', 'unknown-later']);
    expect(orderTripChannels([far, near], undefined, 'desc').map((channel) => channel.id)).toEqual(['far', 'near']);
  });

  it('sorts Null Island and the Austin export last and shows an em dash', () => {
    const nullIsland = row('null-island', 0, 0, 146_940_000);
    const equator = row('equator', 0, -94.58, 146_520_000);
    const ordered = orderTripChannels([nullIsland, far, equator], start);

    expect(tripDistanceKm(nullIsland, start)).toBeUndefined();
    expect(tripDistanceKm(equator, start)).toBeTypeOf('number');
    expect(formatTripDistance(tripDistanceKm(nullIsland, start))).toBe('—');
    expect(ordered.map((channel) => channel.id)).toEqual(['far', 'equator', 'null-island']);

    const austin = parseRepeaterImportCsv(readFileSync(new URL('../fixtures/austin-repeaters.csv', import.meta.url), 'utf8'));
    const austinRows = austin.repeaters.map((repeater, index) =>
      row(`austin-${index}`, repeater.latitude, repeater.longitude, repeater.receiveFrequency),
    );
    const mixed = orderTripChannels([austinRows[0]!, near, austinRows[1]!], start, 'desc');

    expect(austinRows.length).toBeGreaterThan(0);
    expect(austinRows.every((channel) => tripDistanceKm(channel, start) === undefined)).toBe(true);
    expect(mixed.map((channel) => channel.id)).toEqual(['near', 'austin-0', 'austin-1']);
    expect(formatTripDistance(tripDistanceKm(austinRows[0]!, start))).toBe('—');
  });

  it('formats kilometers and miles from the same kilometer value', () => {
    expect(formatTripDistance(1.609344, 'mi')).toBe('1.0 mi');
    expect(formatTripDistance(1.609344, 'km')).toBe('1.6 km');
    expect(formatTripDistance(10, 'km')).toBe('10.0 km');
    expect(formatTripDistance(undefined, 'km')).toBe('—');
  });

  it('defaults Distance from to the selected station, then Home', () => {
    const home = { id: 'station-home', gridsquare: 'EM38' };
    const portable = { id: 'station-portable', latitude: 39.2, longitude: -94.6 };
    const bare = { id: 'station-bare' };
    const options = { homeStationId: 'station-home' };

    expect(defaultDistanceStartId([home, portable], { ...options, selectedStationId: portable.id })).toBe(portable.id);
    expect(defaultDistanceStartId([bare, home], { ...options, selectedStationId: bare.id })).toBe(home.id);
    expect(defaultDistanceStartId([bare, portable], { ...options, selectedStationId: bare.id })).toBe(portable.id);
    expect(defaultDistanceStartId([bare], { ...options, selectedStationId: bare.id })).toBe('none');
    expect(stationStartPoint(home)?.latitude).toBeGreaterThan(0);
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
