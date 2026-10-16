import { distanceKm } from '~/utils/location-format';
import type { GeoPoint } from '@springfield/ham-radio-api';
import { isValidLatitude, isValidLongitude, maidenheadToLatLon } from '~/utils/maidenhead';
import { coordinatesFromPair, type RepeaterUse } from '~/utils/saved-channels-db';
import { bandNameForFrequency } from '~/utils/transmit-privileges';

/** Select value when the trip list is not sorted from a point. */
export const TRIP_START_NONE = 'none';

/** Select value that shows typed latitude and longitude fields. */
export const TRIP_START_COORDINATES = 'coordinates';

const KILOMETERS_PER_MILE = 1.609344;

export interface TripTrimFilters {
  /** Empty string keeps every band. */
  band: string;
  /** Keep repeaters whose Use is open. Rows without Use are hidden. */
  openOnly: boolean;
  /** Keep repeaters marked on-air. Rows without On-air are hidden. */
  onAirOnly: boolean;
}

export interface TripLocatable {
  latitude?: number;
  longitude?: number;
  use?: RepeaterUse;
  onAir?: boolean;
  transmitFrequency: number;
}

/**
 * Point for a saved station. Stored coordinates win over the Maidenhead cell center.
 */
export function stationStartPoint(station: {
  latitude?: number;
  longitude?: number;
  gridsquare?: string;
}): GeoPoint | undefined {
  const stored = coordinatesFromPair(station.latitude, station.longitude);

  if (stored.latitude !== undefined && stored.longitude !== undefined) {
    return { latitude: stored.latitude, longitude: stored.longitude };
  }

  if (station.gridsquare) {
    return maidenheadToLatLon(station.gridsquare);
  }

  return undefined;
}

/**
 * Decimal degrees typed as the trip start. Incomplete or out-of-range text yields no point.
 */
export function parseTypedTripCoordinates(latitudeText: string, longitudeText: string): GeoPoint | undefined {
  const latitudeRaw = latitudeText.trim();
  const longitudeRaw = longitudeText.trim();

  if (!latitudeRaw || !longitudeRaw) {
    return undefined;
  }

  const latitude = Number(latitudeRaw);
  const longitude = Number(longitudeRaw);
  const point = coordinatesFromPair(latitude, longitude);

  if (point.latitude === undefined || point.longitude === undefined) {
    return undefined;
  }

  return { latitude: point.latitude, longitude: point.longitude };
}

/**
 * Error for one typed coordinate. Blank text is not an error yet.
 */
export function typedCoordinateError(text: string, axis: 'latitude' | 'longitude'): string | undefined {
  const trimmed = text.trim();

  if (!trimmed) {
    return undefined;
  }

  const value = Number(trimmed);

  if (axis === 'latitude' ? isValidLatitude(value) : isValidLongitude(value)) {
    return undefined;
  }

  return axis === 'latitude' ? 'Enter a latitude from -90 to 90' : 'Enter a longitude from -180 to 180';
}

/**
 * Band names present on the rows, in first-seen order.
 */
export function uniqueTripBands(channels: readonly { transmitFrequency: number }[]): string[] {
  const bands: string[] = [];

  for (const channel of channels) {
    const band = bandNameForFrequency(channel.transmitFrequency);

    if (band && !bands.includes(band)) {
      bands.push(band);
    }
  }

  return bands;
}

/**
 * Hide rows that fail the trip filters. Unset Use or On-air does not match a filter that asks for it.
 */
export function trimTripChannels<T extends TripLocatable>(channels: readonly T[], filters: TripTrimFilters): T[] {
  return channels.filter((channel) => {
    if (filters.band && bandNameForFrequency(channel.transmitFrequency) !== filters.band) {
      return false;
    }

    if (filters.openOnly && channel.use !== 'open') {
      return false;
    }

    if (filters.onAirOnly && channel.onAir !== true) {
      return false;
    }

    return true;
  });
}

export type DistanceUnit = 'mi' | 'km';

export interface DistanceStartStation {
  id: string;
  latitude?: number;
  longitude?: number;
  gridsquare?: string;
}

/**
 * Station to select for Distance from.
 *
 * The operator's selected station wins when it has a point, then Home, then the first
 * located station. Returns `none` when no station can be placed.
 */
export function defaultDistanceStartId(
  stations: readonly DistanceStartStation[],
  options: { selectedStationId?: string; homeStationId: string },
): string {
  const selected = stations.find((station) => station.id === options.selectedStationId);

  if (selected && stationStartPoint(selected)) {
    return selected.id;
  }

  const home = stations.find((station) => station.id === options.homeStationId);

  if (home && stationStartPoint(home)) {
    return home.id;
  }

  const located = stations.find((station) => stationStartPoint(station));

  return located?.id ?? TRIP_START_NONE;
}

/**
 * Straight-line kilometers from the start, or undefined when the row has no coordinates.
 */
export function tripDistanceKm(
  channel: { latitude?: number; longitude?: number },
  start: GeoPoint | undefined,
): number | undefined {
  const point = coordinatesFromPair(channel.latitude, channel.longitude);

  if (!start || point.latitude === undefined || point.longitude === undefined) {
    return undefined;
  }

  return distanceKm(start, { latitude: point.latitude, longitude: point.longitude });
}

/**
 * Order by straight-line distance from `start`.
 *
 * Rows without coordinates stay at the end, in their previous order, for both
 * ascending and descending sorts. With no start point the input order is kept.
 */
export function orderTripChannels<T extends { latitude?: number; longitude?: number }>(
  channels: readonly T[],
  start: GeoPoint | undefined,
  direction: 'asc' | 'desc' = 'asc',
): T[] {
  if (!start) {
    return [...channels];
  }

  return channels
    .map((channel, index) => ({
      channel,
      index,
      distanceKm: tripDistanceKm(channel, start),
    }))
    .sort((left, right) => {
      if (left.distanceKm === undefined && right.distanceKm === undefined) {
        return left.index - right.index;
      }

      if (left.distanceKm === undefined) {
        return 1;
      }

      if (right.distanceKm === undefined) {
        return -1;
      }

      const delta = direction === 'desc' ? right.distanceKm - left.distanceKm : left.distanceKm - right.distanceKm;

      return delta === 0 ? left.index - right.index : delta;
    })
    .map((row) => row.channel);
}

/**
 * Distance label for the channel table. `—` when the row cannot be placed.
 * Miles are the default. One mile is 1.609344 kilometers.
 */
export function formatTripDistance(distanceKm: number | undefined, unit: DistanceUnit = 'mi'): string {
  if (distanceKm === undefined) {
    return '—';
  }

  const value = unit === 'km' ? distanceKm : distanceKm / KILOMETERS_PER_MILE;
  const suffix = unit === 'km' ? 'km' : 'mi';

  return `${value.toFixed(1)} ${suffix}`;
}
