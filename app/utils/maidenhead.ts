/**
 * Maidenhead locator encode/decode.
 *
 * 2-character field, 4-character square, or 6-character subsquare.
 * Lat/lon from a grid are the center of that cell.
 */

const GRID_PATTERN = /^(?:[A-R]{2}|[A-R]{2}\d{2}|[A-R]{2}\d{2}[A-X]{2})$/i;

export const MIN_LATITUDE = -90;
export const MAX_LATITUDE = 90;
export const MIN_LONGITUDE = -180;
export const MAX_LONGITUDE = 180;

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

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

const SECONDS_DECIMALS = 2;
const SECONDS_FACTOR = 10 ** SECONDS_DECIMALS;

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
