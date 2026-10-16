/**
 * Maidenhead locator encode/decode.
 *
 * 2-character field, 4-character square, or 6-character subsquare.
 * Lat/lon from a grid are the center of that cell.
 */

import {
  type GeoPoint,
  isGeoPoint,
  MAX_LATITUDE,
  MAX_LONGITUDE,
  MIN_LATITUDE,
  MIN_LONGITUDE,
} from '@springfield/ham-radio-api';

const GRID_PATTERN = /^(?:[A-R]{2}|[A-R]{2}\d{2}|[A-R]{2}\d{2}[A-X]{2})$/i;

export type { GeoPoint };
export { isGeoPoint, MAX_LATITUDE, MAX_LONGITUDE, MIN_LATITUDE, MIN_LONGITUDE };

/**
 * Returns whether `value` is a 2-, 4-, or 6-character Maidenhead locator.
 */
export function isMaidenheadGrid(value: unknown): value is string {
  return typeof value === 'string' && GRID_PATTERN.test(value.trim());
}

/**
 * Uppercase locator, or undefined when the text is not a valid grid.
 */
export function normalizeMaidenhead(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim().toUpperCase();

  return isMaidenheadGrid(trimmed) ? trimmed : undefined;
}

/**
 * Center of a Maidenhead cell in decimal degrees.
 */
export function maidenheadToLatLon(grid: string): GeoPoint | undefined {
  const normalized = normalizeMaidenhead(grid);

  if (!normalized) {
    return undefined;
  }

  const lonField = normalized.charCodeAt(0) - 65;
  const latField = normalized.charCodeAt(1) - 65;
  let longitude = -180 + lonField * 20;
  let latitude = -90 + latField * 10;
  let lonSpan = 20;
  let latSpan = 10;

  if (normalized.length >= 4) {
    const lonSquare = Number(normalized[2]);
    const latSquare = Number(normalized[3]);
    longitude += lonSquare * 2;
    latitude += latSquare * 1;
    lonSpan = 2;
    latSpan = 1;
  }

  if (normalized.length >= 6) {
    const lonSub = normalized.charCodeAt(4) - 65;
    const latSub = normalized.charCodeAt(5) - 65;
    longitude += lonSub * (2 / 24);
    latitude += latSub * (1 / 24);
    lonSpan = 2 / 24;
    latSpan = 1 / 24;
  }

  return {
    latitude: roundCoord(latitude + latSpan / 2),
    longitude: roundCoord(longitude + lonSpan / 2),
  };
}

/**
 * Maidenhead locator for a point. Default length is 6 (subsquare).
 */
export function latLonToMaidenhead(latitude: number, longitude: number, length: 4 | 6 = 6): string | undefined {
  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
    return undefined;
  }

  const lon = wrapLongitude(longitude);
  const lat = clampLatitude(latitude);
  let lonWork = lon + 180;
  let latWork = lat + 90;

  const lonField = Math.min(17, Math.floor(lonWork / 20));
  const latField = Math.min(17, Math.floor(latWork / 10));
  lonWork -= lonField * 20;
  latWork -= latField * 10;

  const lonSquare = Math.min(9, Math.floor(lonWork / 2));
  const latSquare = Math.min(9, Math.floor(latWork / 1));
  lonWork -= lonSquare * 2;
  latWork -= latSquare * 1;

  let grid = `${String.fromCharCode(65 + lonField)}${String.fromCharCode(65 + latField)}${lonSquare}${latSquare}`;

  if (length >= 6) {
    const lonSub = Math.min(23, Math.floor(lonWork / (2 / 24)));
    const latSub = Math.min(23, Math.floor(latWork / (1 / 24)));
    grid += `${String.fromCharCode(65 + lonSub)}${String.fromCharCode(65 + latSub)}`;
  }

  return grid;
}

/**
 * True when latitude is a finite value in range.
 */
export function isValidLatitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= MIN_LATITUDE && value <= MAX_LATITUDE;
}

/**
 * True when longitude is a finite value in range.
 */
export function isValidLongitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= MIN_LONGITUDE && value <= MAX_LONGITUDE;
}

/** Mean Earth radius used by the haversine helper. */
const EARTH_RADIUS_KM = 6371.0088;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Great-circle distance in kilometers between two points.
 * Trip lists and library distance sorting share this helper. It does not call a network service.
 */
export function haversineDistanceKm(from: GeoPoint, to: GeoPoint): number {
  const latitudeFrom = toRadians(from.latitude);
  const latitudeTo = toRadians(to.latitude);
  const latitudeDelta = latitudeTo - latitudeFrom;
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeFrom) * Math.cos(latitudeTo) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

export type {
  CoordinateAxis,
  DmsHemisphere,
  DmsInput,
  DmsParseResult,
  DmsParts,
  LatitudeHemisphere,
  LongitudeHemisphere,
} from '~/utils/location-format';

export {
  decimalDegreesToDms,
  dmsInputFromDecimal,
  dmsToDecimalDegrees,
  emptyDmsInput,
  formatLatitude,
  formatLongitude,
  parseDmsInput,
} from '~/utils/location-format';

function wrapLongitude(longitude: number): number {
  const wrapped = ((((longitude + 180) % 360) + 360) % 360) - 180;

  return wrapped === 180 ? -180 : wrapped;
}

function clampLatitude(latitude: number): number {
  return Math.min(MAX_LATITUDE, Math.max(MIN_LATITUDE, latitude));
}

function roundCoord(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
