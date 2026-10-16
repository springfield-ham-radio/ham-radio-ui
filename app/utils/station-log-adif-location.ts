import { type GeoPoint, isGeoPoint } from '@springfield/ham-radio-api';

/**
 * ADIF 3.1.4 Location: `XDDD MM.MMM` (hemisphere, three degree digits, minutes with three decimals).
 */

const ADIF_LOCATION_PATTERN = /^([NSWE])\s*(\d{1,3})\s+(\d{2})\.(\d{3})$/i;

function roundCoord(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function parseAdifLocationAxis(value: string, axis: 'latitude' | 'longitude'): number | undefined {
  const trimmed = value.trim();
  const match = ADIF_LOCATION_PATTERN.exec(trimmed);

  if (!match) {
    return undefined;
  }

  const hemisphere = match[1]!.toUpperCase();

  if (axis === 'latitude' && hemisphere !== 'N' && hemisphere !== 'S') {
    return undefined;
  }

  if (axis === 'longitude' && hemisphere !== 'E' && hemisphere !== 'W') {
    return undefined;
  }

  const degrees = Number(match[2]);
  const minutes = Number(`${match[3]}.${match[4]}`);

  if (!Number.isFinite(degrees) || !Number.isFinite(minutes) || minutes >= 60) {
    return undefined;
  }

  const maxDegrees = axis === 'latitude' ? 90 : 180;

  if (degrees > maxDegrees) {
    return undefined;
  }

  if (degrees === maxDegrees && minutes > 0) {
    return undefined;
  }

  if (axis === 'longitude' && degrees === 180) {
    return -180;
  }

  const decimal = degrees + minutes / 60;

  if (hemisphere === 'S' || hemisphere === 'W') {
    return roundCoord(-decimal);
  }

  return roundCoord(decimal);
}

/**
 * Parse ADIF `LAT` and `LON` into a {@link GeoPoint}. Both fields must be present and valid.
 */
export function parseAdifLocationPair(
  latitude: string | undefined,
  longitude: string | undefined,
): GeoPoint | undefined {
  if (!latitude?.trim() || !longitude?.trim()) {
    return undefined;
  }

  const lat = parseAdifLocationAxis(latitude, 'latitude');
  const lon = parseAdifLocationAxis(longitude, 'longitude');

  if (lat === undefined || lon === undefined) {
    return undefined;
  }

  const point = { latitude: lat, longitude: lon };

  return isGeoPoint(point) ? point : undefined;
}

const MINUTE_THOUSANDTHS_PER_DEGREE = 60_000;

/**
 * Split a non-negative decimal degree value into ADIF degrees and thousandths of a minute.
 * A thousandth that would print as 60.000 minutes carries into the next degree.
 * A value that rounds past the pole or antimeridian stays on that boundary.
 */
function splitAdifDegrees(absolute: number, maxDegrees: number): { degrees: number; minuteThousandths: number } {
  const totalThousandths = Math.round(absolute * MINUTE_THOUSANDTHS_PER_DEGREE);
  let degrees = Math.floor(totalThousandths / MINUTE_THOUSANDTHS_PER_DEGREE);
  let minuteThousandths = totalThousandths - degrees * MINUTE_THOUSANDTHS_PER_DEGREE;

  if (minuteThousandths >= MINUTE_THOUSANDTHS_PER_DEGREE) {
    degrees += 1;
    minuteThousandths = 0;
  }

  if (degrees > maxDegrees || (degrees === maxDegrees && minuteThousandths > 0)) {
    return { degrees: maxDegrees, minuteThousandths: 0 };
  }

  return { degrees, minuteThousandths };
}

function formatAdifLocation(value: number, maxDegrees: number, negativeHemisphere: string, positiveHemisphere: string): string {
  const hemisphere = value < 0 ? negativeHemisphere : positiveHemisphere;
  const { degrees, minuteThousandths } = splitAdifDegrees(Math.abs(value), maxDegrees);
  const minutes = Math.floor(minuteThousandths / 1000);
  const thousandths = minuteThousandths % 1000;

  return `${hemisphere}${String(degrees).padStart(3, '0')} ${String(minutes).padStart(2, '0')}.${String(thousandths).padStart(3, '0')}`;
}

/**
 * Format latitude as ADIF `LAT` (`N030 16.032`).
 */
export function formatAdifLocationLatitude(latitude: number): string | undefined {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return undefined;
  }

  return formatAdifLocation(latitude, 90, 'S', 'N');
}

/**
 * Format longitude as ADIF `LON` (`W097 44.586`). `-180` exports as `W180 00.000`.
 */
export function formatAdifLocationLongitude(longitude: number): string | undefined {
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return undefined;
  }

  return formatAdifLocation(longitude, 180, 'W', 'E');
}

/**
 * Format a located point as ADIF `LAT` / `LON` strings.
 */
export function formatAdifLocationPair(point: GeoPoint): { latitude: string; longitude: string } | undefined {
  if (!isGeoPoint(point)) {
    return undefined;
  }

  const latitude = formatAdifLocationLatitude(point.latitude);
  const longitude = formatAdifLocationLongitude(point.longitude);

  if (!latitude || !longitude) {
    return undefined;
  }

  return { latitude, longitude };
}

/**
 * Normalize a single ADIF location field to canonical `XDDD MM.MMM`, or undefined when invalid.
 */
export function canonicalizeAdifLocationField(value: string, axis: 'latitude' | 'longitude'): string | undefined {
  const parsed = parseAdifLocationAxis(value, axis);

  if (parsed === undefined) {
    return undefined;
  }

  return axis === 'latitude' ? formatAdifLocationLatitude(parsed) : formatAdifLocationLongitude(parsed);
}
