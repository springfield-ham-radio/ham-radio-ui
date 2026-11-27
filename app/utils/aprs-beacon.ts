import { isValidLatitude, isValidLongitude } from '~/utils/maidenhead';
import { canonicalAx25Call, encodeAx25Ui, type Ax25Call } from '~/utils/aprs-ax25';

/** Experimental HamBench position-beacon tocall until an aprs-deviceid allocation exists. */
export const APRS_BEACON_TOCALL = 'APZHMB';

export const APRS_BEACON_COMMENT_MAX = 43;

export const APRS_BEACON_PATH_DEFAULT = 'WIDE1-1,WIDE2-1';

export const APRS_BEACON_INTERVAL_MIN = 10;

export const APRS_BEACON_INTERVAL_DEFAULT = 30;

export const APRS_BEACON_MAX_PATH_HOPS = 2;

export interface SavedRadioAprsBeacon {
  latitude: number;
  longitude: number;
  symbolTable: string;
  symbolCode: string;
  comment?: string;
  altitudeFt?: number;
  path: string;
  intervalMinutes: number;
}

export interface AprsBeaconSymbolOption {
  label: string;
  table: string;
  code: string;
}

export const APRS_BEACON_SYMBOLS: readonly AprsBeaconSymbolOption[] = [
  { label: 'Home', table: '/', code: '-' },
  { label: 'Car', table: '/', code: '>' },
  { label: 'Person', table: '/', code: '[' },
  { label: 'Radio', table: '\\', code: 'Y' },
  { label: 'RV', table: '/', code: 'R' },
  { label: 'Jeep', table: '/', code: 'j' },
  { label: 'Truck', table: '/', code: 'k' },
  { label: 'Small circle', table: '\\', code: 'o' },
  { label: 'Digipeater', table: '/', code: '#' },
  { label: 'PC user', table: '/', code: 'L' },
];

export function defaultSavedRadioAprsBeacon(): SavedRadioAprsBeacon {
  return {
    latitude: 0,
    longitude: 0,
    symbolTable: '/',
    symbolCode: '-',
    path: APRS_BEACON_PATH_DEFAULT,
    intervalMinutes: APRS_BEACON_INTERVAL_DEFAULT,
  };
}

export function clampBeaconIntervalMinutes(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(number)) {
    return APRS_BEACON_INTERVAL_DEFAULT;
  }

  return Math.min(24 * 60, Math.max(APRS_BEACON_INTERVAL_MIN, Math.round(number)));
}

export function parseSavedRadioAprsBeacon(value: unknown): SavedRadioAprsBeacon | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }

  const raw = value as Record<string, unknown>;
  const latitude = typeof raw.latitude === 'number' && Number.isFinite(raw.latitude) ? raw.latitude : undefined;
  const longitude = typeof raw.longitude === 'number' && Number.isFinite(raw.longitude) ? raw.longitude : undefined;

  if (latitude === undefined || longitude === undefined || !isValidLatitude(latitude) || !isValidLongitude(longitude)) {
    return undefined;
  }

  const symbolTable = typeof raw.symbolTable === 'string' && raw.symbolTable.length === 1 ? raw.symbolTable : '/';
  const symbolCode = typeof raw.symbolCode === 'string' && raw.symbolCode.length === 1 ? raw.symbolCode : '-';
  const comment = typeof raw.comment === 'string' && raw.comment.trim().length > 0 ? raw.comment : undefined;
  const altitudeFt = typeof raw.altitudeFt === 'number' && Number.isFinite(raw.altitudeFt) && raw.altitudeFt >= 0
    ? Math.round(raw.altitudeFt)
    : undefined;
  const path = typeof raw.path === 'string' ? raw.path.trim() : APRS_BEACON_PATH_DEFAULT;

  return {
    latitude,
    longitude,
    symbolTable,
    symbolCode,
    ...(comment ? { comment } : {}),
    ...(altitudeFt !== undefined ? { altitudeFt } : {}),
    path,
    intervalMinutes: clampBeaconIntervalMinutes(raw.intervalMinutes),
  };
}

function symbolCharValid(character: string): boolean {
  const code = character.charCodeAt(0);
  return code >= 0x21 && code <= 0x7e;
}

export function beaconSymbolError(table: string, code: string): string | undefined {
  if (table.length !== 1 || !symbolCharValid(table)) {
    return 'Choose a symbol table character';
  }

  if (code.length !== 1 || !symbolCharValid(code)) {
    return 'Choose a symbol code';
  }

  return undefined;
}

export function beaconCommentError(text: string): string | undefined {
  if (text.length === 0) {
    return undefined;
  }

  if (text.length > APRS_BEACON_COMMENT_MAX) {
    return `Comment is limited to ${APRS_BEACON_COMMENT_MAX} characters`;
  }

  if ([...text].some((character) => character.charCodeAt(0) < 0x20 || character.charCodeAt(0) > 0x7e)) {
    return 'Use printable ASCII in the comment';
  }

  if (/[{|~]/u.test(text)) {
    return 'The characters { | and ~ are reserved';
  }

  if (/\/A=/u.test(text)) {
    return 'Altitude belongs in the altitude field, not the comment';
  }

  if (/^\d{3}\/\d{3}/u.test(text)) {
    return 'A comment cannot start with course and speed';
  }

  return undefined;
}

export function beaconAltitudeError(feetText: string): string | undefined {
  const trimmed = feetText.trim();

  if (trimmed.length === 0) {
    return undefined;
  }

  const feet = Number(trimmed);

  if (!Number.isInteger(feet) || feet < 0 || feet > 999_999) {
    return 'Enter altitude in feet from 0 to 999999';
  }

  return undefined;
}

export function beaconPathError(pathText: string): string | undefined {
  const trimmed = pathText.trim();

  if (trimmed.length === 0) {
    return undefined;
  }

  const hops = trimmed.split(',').map((hop) => hop.trim()).filter((hop) => hop.length > 0);

  if (hops.length > APRS_BEACON_MAX_PATH_HOPS) {
    return `Use at most ${APRS_BEACON_MAX_PATH_HOPS} digipeaters`;
  }

  for (const hop of hops) {
    if (!canonicalAx25Call(hop)) {
      return 'Use valid digipeater callsigns, for example WIDE1-1';
    }
  }

  return undefined;
}

export function parseAprsBeaconPath(pathText: string): Ax25Call[] | undefined {
  const err = beaconPathError(pathText);

  if (err) {
    return undefined;
  }

  const trimmed = pathText.trim();

  if (trimmed.length === 0) {
    return [];
  }

  const hops: Ax25Call[] = [];

  for (const hop of trimmed.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0)) {
    const parsed = canonicalAx25Call(hop);

    if (!parsed) {
      return undefined;
    }

    hops.push(parsed);
  }

  return hops;
}

function formatAxis(degrees: number, negative: boolean, width: number): string | undefined {
  if (!Number.isFinite(degrees)) {
    return undefined;
  }

  const abs = Math.abs(degrees);
  const whole = Math.floor(abs + 1e-9);
  const minutes = (abs - whole) * 60;
  const minuteWhole = Math.floor(minutes + 1e-9);
  let hundredths = Math.round((minutes - minuteWhole) * 100 + 1e-9);

  let carryDegrees = 0;

  if (hundredths >= 100) {
    hundredths = 0;
    carryDegrees = 1;
  }

  let carryMinutes = 0;

  if (minuteWhole + carryDegrees >= 60) {
    carryMinutes = 1;
  }

  const d = whole + carryMinutes;
  const m = (minuteWhole + carryDegrees) % 60;
  const hem = negative ? (width === 2 ? 'S' : 'W') : (width === 2 ? 'N' : 'E');

  if (width === 2 && d > 90) {
    return undefined;
  }

  if (width === 3 && d > 180) {
    return undefined;
  }

  return `${String(d).padStart(width, '0')}${String(m).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}${hem}`;
}

export function formatAprsBeaconPositionBody(settings: SavedRadioAprsBeacon): string | undefined {
  if (beaconSymbolError(settings.symbolTable, settings.symbolCode)) {
    return undefined;
  }

  const comment = settings.comment ?? '';
  const commentError = beaconCommentError(comment);

  if (commentError) {
    return undefined;
  }

  const lat = formatAxis(settings.latitude, settings.latitude < 0, 2);
  const lon = formatAxis(settings.longitude, settings.longitude < 0, 3);

  if (!lat || !lon) {
    return undefined;
  }

  let tail = comment;

  if (settings.altitudeFt !== undefined) {
    const feet = Math.round(settings.altitudeFt);

    if (feet < 0 || feet > 999_999) {
      return undefined;
    }

    const suffix = `/A=${String(feet).padStart(6, '0')}`;
    tail = tail.length > 0 ? `${tail} ${suffix}` : suffix;
  }

  return `=${lat}${settings.symbolTable}${lon}${settings.symbolCode}${tail}`;
}

/**
 * Parse decimal-degree text for the beacon form. Blank or whitespace is invalid (not 0,0).
 */
/**
 * Optional altitude from form text. Non-empty invalid text returns an error instead of dropping the field.
 */
export function parseBeaconAltitudeFeet(altitudeText: string): { feet?: number; error?: string } {
  const trimmed = altitudeText.trim();

  if (trimmed.length === 0) {
    return {};
  }

  const error = beaconAltitudeError(altitudeText);

  if (error) {
    return { error };
  }

  return { feet: Number(trimmed) };
}

export function parseBeaconDecimalDegrees(latText: string, lonText: string): { latitude: number; longitude: number } | undefined {
  const latTrim = latText.trim();
  const lonTrim = lonText.trim();

  if (latTrim.length === 0 || lonTrim.length === 0) {
    return undefined;
  }

  const latitude = Number(latTrim);
  const longitude = Number(lonTrim);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !isValidLatitude(latitude) || !isValidLongitude(longitude)) {
    return undefined;
  }

  return { latitude, longitude };
}

/**
 * AX.25 UI bytes for one messaging-capable position beacon. KISS wrapping is separate.
 */
export function encodeAprsBeaconFrame(source: Ax25Call, settings: SavedRadioAprsBeacon): Uint8Array | undefined {
  const info = formatAprsBeaconPositionBody(settings);

  if (!info) {
    return undefined;
  }

  const path = parseAprsBeaconPath(settings.path);

  if (path === undefined) {
    return undefined;
  }

  return encodeAx25Ui(source, info, path, APRS_BEACON_TOCALL);
}

export function aprsBeaconSettingsError(settings: SavedRadioAprsBeacon): string | undefined {
  if (!isValidLatitude(settings.latitude) || !isValidLongitude(settings.longitude)) {
    return 'Enter a valid latitude and longitude';
  }

  return beaconSymbolError(settings.symbolTable, settings.symbolCode)
    ?? beaconCommentError(settings.comment ?? '')
    ?? (settings.altitudeFt !== undefined ? beaconAltitudeError(String(settings.altitudeFt)) : undefined)
    ?? beaconPathError(settings.path)
    ?? (formatAprsBeaconPositionBody(settings) ? undefined : 'The position could not be encoded');
}