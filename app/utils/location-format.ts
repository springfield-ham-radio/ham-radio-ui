/**
 * Formatting and conversion over `GeoPoint` (signed decimal degrees, WGS84).
 *
 * Which record stores a grid, a point, or both is documented in `docs/location.md`.
 * Maidenhead encode and decode stay in `maidenhead.ts`; this module wraps the 4- and
 * 6-character forms. GeoJSON Point coordinates are `[longitude, latitude]` and are
 * only for map and API boundaries.
 */

import {
  haversineDistanceKm,
  isValidLatitude,
  isValidLongitude,
  latLonToMaidenhead,
  maidenheadToLatLon,
  MAX_LATITUDE,
  MAX_LONGITUDE,
  MIN_LATITUDE,
  MIN_LONGITUDE,
  normalizeMaidenhead,
  type GeoPoint,
} from '~/utils/maidenhead';

export type { GeoPoint };

const DECIMAL_FRACTION_DIGITS = 6;
const SECONDS_DECIMALS = 2;
const SECONDS_FACTOR = 10 ** SECONDS_DECIMALS;

export type CoordinateAxis = 'latitude' | 'longitude';
export type LatitudeHemisphere = 'N' | 'S';
export type LongitudeHemisphere = 'E' | 'W';
export type DmsHemisphere = LatitudeHemisphere | LongitudeHemisphere;

export interface DmsParts {
  degrees: number;
  minutes: number;
  seconds: number;
  hemisphere: DmsHemisphere;
}

export interface DmsInput {
  degrees: string;
  minutes: string;
  seconds: string;
  hemisphere: DmsHemisphere;
}

export type DmsParseResult = { empty: true } | { empty: false; value: number } | { empty: false; error: string };

const COMPASS_POINTS = [
  'N',
  'NNE',
  'NE',
  'ENE',
  'E',
  'ESE',
  'SE',
  'SSE',
  'S',
  'SSW',
  'SW',
  'WSW',
  'W',
  'WNW',
  'NW',
  'NNW',
] as const;

export type CompassPoint = (typeof COMPASS_POINTS)[number];

export interface GeoJsonPoint {
  type: 'Point';
  /** `[longitude, latitude]`, RFC 7946. */
  coordinates: [number, number];
}

export interface GeoJsonFeature<Properties> {
  type: 'Feature';
  geometry: GeoJsonPoint;
  properties: Properties;
}

/**
 * Signed decimal degrees, up to 6 fractional digits, without trailing zeros.
 */
export function formatDecimalDegrees(value: number): string {
  if (!Number.isFinite(value)) {
    return '';
  }

  const rounded = roundCoord(Object.is(value, -0) ? 0 : value);

  return rounded.toFixed(DECIMAL_FRACTION_DIGITS).replace(/\.?0+$/, '');
}

/**
 * One signed decimal-degree field. Blank text and out-of-range values are undefined.
 */
export function parseDecimalDegrees(text: string, axis: CoordinateAxis): number | undefined {
  const trimmed = text.trim();

  if (!trimmed || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(trimmed)) {
    return undefined;
  }

  const value = Number(trimmed);

  if (axis === 'latitude' ? !isValidLatitude(value) : !isValidLongitude(value)) {
    return undefined;
  }

  return value;
}

/**
 * Empty DMS fields. Hemisphere defaults to N / W until the operator picks otherwise.
 */
export function emptyDmsInput(axis: CoordinateAxis): DmsInput {
  return {
    degrees: '',
    minutes: '',
    seconds: '',
    hemisphere: axis === 'latitude' ? 'N' : 'W',
  };
}

/**
 * Splits signed decimal degrees into unsigned degrees, minutes, decimal seconds, and hemisphere.
 */
export function decimalDegreesToDms(decimal: number, axis: CoordinateAxis): DmsParts {
  let hemisphere: DmsHemisphere;

  if (axis === 'latitude') {
    hemisphere = decimal < 0 ? 'S' : 'N';
  } else {
    hemisphere = decimal < 0 ? 'W' : 'E';
  }

  const abs = Math.abs(decimal);
  const totalHundredths = Math.round(abs * 3600 * SECONDS_FACTOR);
  let degrees = Math.floor(totalHundredths / (3600 * SECONDS_FACTOR));
  let remainder = totalHundredths - degrees * 3600 * SECONDS_FACTOR;
  let minutes = Math.floor(remainder / (60 * SECONDS_FACTOR));
  let secondsHundredths = remainder - minutes * 60 * SECONDS_FACTOR;

  if (secondsHundredths >= 60 * SECONDS_FACTOR) {
    secondsHundredths = 0;
    minutes += 1;
  }

  if (minutes >= 60) {
    minutes = 0;
    degrees += 1;
  }

  return {
    degrees,
    minutes,
    seconds: secondsHundredths / SECONDS_FACTOR,
    hemisphere,
  };
}

/**
 * Signed decimal degrees from unsigned DMS and a hemisphere.
 */
export function dmsToDecimalDegrees(parts: DmsParts): number {
  const unsigned = parts.degrees + parts.minutes / 60 + parts.seconds / 3600;
  const signed = parts.hemisphere === 'S' || parts.hemisphere === 'W' ? -unsigned : unsigned;

  return roundCoord(signed);
}

/**
 * Fills the editor fields from stored decimal degrees, or blanks them when unset.
 */
export function dmsInputFromDecimal(decimal: number | undefined, axis: CoordinateAxis): DmsInput {
  if (decimal === undefined) {
    return emptyDmsInput(axis);
  }

  const parts = decimalDegreesToDms(decimal, axis);

  return {
    degrees: String(parts.degrees),
    minutes: String(parts.minutes),
    seconds: String(parts.seconds),
    hemisphere: parts.hemisphere,
  };
}

/**
 * Parses operator-entered DMS. Blank fields are an empty coordinate; missing minutes or seconds are zero.
 */
export function parseDmsInput(input: DmsInput, axis: CoordinateAxis): DmsParseResult {
  const degreesText = input.degrees.trim();
  const minutesText = input.minutes.trim();
  const secondsText = input.seconds.trim();

  if (!degreesText && !minutesText && !secondsText) {
    return { empty: true };
  }

  const maxDegrees = axis === 'latitude' ? MAX_LATITUDE : MAX_LONGITUDE;
  const degrees = parseWholeNumber(degreesText, 0);
  const minutes = parseWholeNumber(minutesText, 0);
  const seconds = parseSeconds(secondsText);

  if (degrees === undefined) {
    return { empty: false, error: `Degrees must be a whole number from 0 to ${maxDegrees}.` };
  }

  if (minutes === undefined) {
    return { empty: false, error: 'Minutes must be a whole number from 0 to 59.' };
  }

  if (seconds === undefined) {
    return { empty: false, error: 'Seconds must be from 0 up to (but not including) 60.' };
  }

  if (degrees < 0 || degrees > maxDegrees) {
    return { empty: false, error: `Degrees must be a whole number from 0 to ${maxDegrees}.` };
  }

  if (minutes < 0 || minutes > 59) {
    return { empty: false, error: 'Minutes must be a whole number from 0 to 59.' };
  }

  if (seconds < 0 || seconds >= 60) {
    return { empty: false, error: 'Seconds must be from 0 up to (but not including) 60.' };
  }

  if (degrees === maxDegrees && (minutes > 0 || seconds > 0)) {
    return { empty: false, error: `${axis === 'latitude' ? 'Latitude' : 'Longitude'} cannot exceed ${maxDegrees}°.` };
  }

  if (axis === 'latitude' && input.hemisphere !== 'N' && input.hemisphere !== 'S') {
    return { empty: false, error: 'Latitude hemisphere must be N or S.' };
  }

  if (axis === 'longitude' && input.hemisphere !== 'E' && input.hemisphere !== 'W') {
    return { empty: false, error: 'Longitude hemisphere must be E or W.' };
  }

  const value = dmsToDecimalDegrees({
    degrees,
    minutes,
    seconds,
    hemisphere: input.hemisphere,
  });

  if (axis === 'latitude' && !isValidLatitude(value)) {
    return { empty: false, error: `Latitude must be between ${MIN_LATITUDE}° and ${MAX_LATITUDE}°.` };
  }

  if (axis === 'longitude' && !isValidLongitude(value)) {
    return { empty: false, error: `Longitude must be between ${MIN_LONGITUDE}° and ${MAX_LONGITUDE}°.` };
  }

  return { empty: false, value };
}

/**
 * Formats latitude for display, for example 38° 30' 00.00" N.
 */
export function formatLatitude(latitude: number): string {
  return formatDms(decimalDegreesToDms(latitude, 'latitude'));
}

/**
 * Formats longitude for display, for example 90° 11' 57.84" W.
 */
export function formatLongitude(longitude: number): string {
  return formatDms(decimalDegreesToDms(longitude, 'longitude'));
}

/**
 * 4- or 6-character Maidenhead locator for a point. The default length is 6.
 */
export function pointToMaidenhead(point: GeoPoint, length: 4 | 6 = 6): string | undefined {
  return latLonToMaidenhead(point.latitude, point.longitude, length);
}

/**
 * Center of a 4- or 6-character Maidenhead cell. Field-only (2-character) locators are undefined.
 */
export function maidenheadToPoint(grid: string): GeoPoint | undefined {
  const normalized = normalizeMaidenhead(grid);

  if (!normalized || (normalized.length !== 4 && normalized.length !== 6)) {
    return undefined;
  }

  return maidenheadToLatLon(normalized);
}

/**
 * Great-circle distance in kilometers. Same calculation as `haversineDistanceKm`.
 */
export function distanceKm(from: GeoPoint, to: GeoPoint): number {
  return haversineDistanceKm(from, to);
}

/**
 * Initial bearing in degrees, clockwise from true north, in the range [0, 360).
 * Coincident points report 0.
 */
export function initialBearingDegrees(from: GeoPoint, to: GeoPoint): number {
  const latitudeFrom = toRadians(from.latitude);
  const latitudeTo = toRadians(to.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const y = Math.sin(longitudeDelta) * Math.cos(latitudeTo);
  const x =
    Math.cos(latitudeFrom) * Math.sin(latitudeTo) -
    Math.sin(latitudeFrom) * Math.cos(latitudeTo) * Math.cos(longitudeDelta);
  const degrees = (Math.atan2(y, x) * 180) / Math.PI;

  return (degrees + 360) % 360;
}

/**
 * 16-point compass label for a bearing in degrees.
 */
export function compassPoint(bearingDegrees: number): CompassPoint {
  const normalized = ((bearingDegrees % 360) + 360) % 360;
  const index = Math.round(normalized / 22.5) % COMPASS_POINTS.length;

  return COMPASS_POINTS[index] ?? 'N';
}

/**
 * Compass point of the initial bearing from `from` to `to`.
 */
export function compassPointBetween(from: GeoPoint, to: GeoPoint): CompassPoint {
  return compassPoint(initialBearingDegrees(from, to));
}

/**
 * GeoJSON Point. The first coordinate is longitude.
 */
export function geoJsonPoint(point: GeoPoint): GeoJsonPoint {
  return {
    type: 'Point',
    coordinates: [point.longitude, point.latitude],
  };
}

/**
 * GeoJSON Feature with a Point geometry. The first coordinate is longitude.
 */
export function geoJsonFeature<Properties>(point: GeoPoint, properties: Properties): GeoJsonFeature<Properties> {
  return {
    type: 'Feature',
    geometry: geoJsonPoint(point),
    properties,
  };
}

/**
 * `GeoPoint` from a GeoJSON Point. Coordinates are read as `[longitude, latitude]`.
 * Out-of-range latitude or longitude is undefined. `[10, 120]` is rejected because 120 is not a latitude.
 */
export function pointFromGeoJsonPoint(geometry: unknown): GeoPoint | undefined {
  if (geometry === null || typeof geometry !== 'object') {
    return undefined;
  }

  const record = geometry as { type?: unknown; coordinates?: unknown };

  if (record.type !== 'Point' || !Array.isArray(record.coordinates) || record.coordinates.length < 2) {
    return undefined;
  }

  const longitude = record.coordinates[0];
  const latitude = record.coordinates[1];

  if (typeof longitude !== 'number' || typeof latitude !== 'number') {
    return undefined;
  }

  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
    return undefined;
  }

  return { latitude, longitude };
}

/**
 * True when the pair is a stored location.
 * Missing values and the exact pair (0, 0) are unlocated. One zero axis stays valid.
 */
export function isLocated(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): boolean {
  return locatedPoint(latitude, longitude) !== undefined;
}

/**
 * Coordinate pair for storage and distance. Blank (null or undefined) and exact (0, 0) are undefined.
 */
export function locatedPoint(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): GeoPoint | undefined {
  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
    return undefined;
  }

  if (latitude === 0 && longitude === 0) {
    return undefined;
  }

  return { latitude, longitude };
}

/**
 * Decimal-degree text or numbers for a stored point.
 * Blank text is undefined. The exact pair (0, 0) is unlocated.
 */
export function parseLocatedPoint(latitude: unknown, longitude: unknown): GeoPoint | undefined {
  return locatedPoint(decimalCoordinate(latitude, 'latitude'), decimalCoordinate(longitude, 'longitude'));
}

function decimalCoordinate(value: unknown, axis: CoordinateAxis): number | undefined {
  if (typeof value === 'number') {
    const valid = axis === 'latitude' ? isValidLatitude(value) : isValidLongitude(value);

    return valid ? value : undefined;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  return parseDecimalDegrees(value, axis);
}

function formatDms(parts: DmsParts): string {
  const minutes = String(parts.minutes).padStart(2, '0');
  const seconds = parts.seconds.toFixed(SECONDS_DECIMALS).padStart(5, '0');

  return `${parts.degrees}° ${minutes}' ${seconds}" ${parts.hemisphere}`;
}

function parseWholeNumber(text: string, blankValue: number): number | undefined {
  if (!text) {
    return blankValue;
  }

  if (!/^-?\d+$/.test(text)) {
    return undefined;
  }

  const value = Number(text);

  return Number.isInteger(value) ? value : undefined;
}

function parseSeconds(text: string): number | undefined {
  if (!text) {
    return 0;
  }

  if (!/^-?\d+(?:\.\d+)?$/.test(text)) {
    return undefined;
  }

  const value = Number(text);

  return Number.isFinite(value) ? value : undefined;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function roundCoord(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
