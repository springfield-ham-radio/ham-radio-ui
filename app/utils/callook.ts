import { isValidLatitude, isValidLongitude, latLonToMaidenhead, normalizeMaidenhead, type GeoPoint } from '~/utils/maidenhead';

export type CallookStatus = 'VALID' | 'INVALID' | 'UPDATING';

export type CallookLicenseType = 'CLUB' | 'MILITARY' | 'RACES' | 'RECREATION' | 'PERSON';

const CITY_STATE_ZIP = /^(.+?),\s*([A-Za-z]{2})\s+\d{5}(?:-\d{4})?\s*$/;

export interface CallookResponse {
  status: CallookStatus;
  type?: CallookLicenseType | string;
  current?: {
    callsign: string;
    operClass: string;
  };
  previous?: {
    callsign: string;
    operClass: string;
  };
  trustee?: {
    callsign: string;
    name: string;
  };
  name?: string;
  address?: {
    line1?: string;
    line2?: string;
    attn?: string;
  };
  location?: {
    latitude?: string;
    longitude?: string;
    gridsquare?: string;
  };
  otherInfo?: {
    grantDate?: string;
    expiryDate?: string;
    lastActionDate?: string;
    frn?: string;
    ulsUrl?: string;
  };
}

const UPDATING_RETRY_DELAY_MS = 2_000;
const UPDATING_MAX_ATTEMPTS = 3;

/**
 * Fetches US amateur license data from Callook.info for a call sign.
 *
 * Retries briefly when Callook reports UPDATING during its daily refresh.
 */
export async function fetchCallookLicense(callSign: string): Promise<CallookResponse> {
  const normalized = callSign.trim().toUpperCase();

  if (!normalized) {
    throw new Error('Call sign is required');
  }

  let attempt = 0;

  while (attempt < UPDATING_MAX_ATTEMPTS) {
    attempt += 1;

    const response = await fetch(`https://callook.info/${encodeURIComponent(normalized)}/json`);

    if (!response.ok) {
      throw new Error(`Callook lookup failed with HTTP ${response.status}`);
    }

    const payload = (await response.json()) as CallookResponse;

    if (payload.status !== 'UPDATING') {
      return payload;
    }

    if (attempt < UPDATING_MAX_ATTEMPTS) {
      await delay(UPDATING_RETRY_DELAY_MS);
    } else {
      return payload;
    }
  }

  throw new Error('Callook lookup failed');
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

/**
 * City and state from a Callook mailing address, such as "Liberty Hill, TX".
 * Street and ZIP stay off the contact. Unrecognized address lines are skipped.
 */
export function qthFromCallook(response: CallookResponse): string | undefined {
  const line2 = response.address?.line2?.trim();

  if (!line2) {
    return undefined;
  }

  const match = CITY_STATE_ZIP.exec(line2);

  if (!match?.[1] || !match[2]) {
    return undefined;
  }

  const city = titleCasePlace(match[1]);

  if (!city) {
    return undefined;
  }

  return `${city}, ${match[2].toUpperCase()}`;
}

/**
 * Maidenhead locator for a looked-up license.
 * Uses Callook's grid when that lookup produced one. Otherwise geocodes the
 * mailing address, because Callook sometimes returns a name with empty coordinates.
 */
export async function resolveCallookGrid(response: CallookResponse): Promise<string | undefined> {
  const declared = normalizeMaidenhead(response.location?.gridsquare);

  if (declared) {
    return declared;
  }

  for (const query of callookGeocodeQueries(response)) {
    const point = await geocodePlace(query);
    const grid = point ? latLonToMaidenhead(point.latitude, point.longitude, 6) : undefined;

    if (grid) {
      return grid;
    }
  }

  return undefined;
}

export function callookGeocodeQueries(response: CallookResponse): string[] {
  const line1 = response.address?.line1?.trim() ?? '';
  const line2 = response.address?.line2?.trim() ?? '';
  const queries: string[] = [];

  if (line1 && line2) {
    queries.push(`${line1}, ${line2}`);
  }

  if (line2) {
    queries.push(line2);
  } else if (line1) {
    queries.push(line1);
  }

  return queries;
}

function titleCasePlace(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

async function geocodePlace(query: string): Promise<GeoPoint | undefined> {
  try {
    const response = await fetch(`https://photon.komoot.io/api/?limit=1&q=${encodeURIComponent(query)}`);

    if (!response.ok) {
      return undefined;
    }

    return pointFromPhoton(await response.json());
  } catch {
    return undefined;
  }
}

function pointFromPhoton(payload: unknown): GeoPoint | undefined {
  if (payload === null || typeof payload !== 'object') {
    return undefined;
  }

  const features = (payload as { features?: unknown }).features;

  if (!Array.isArray(features)) {
    return undefined;
  }

  const geometry = (features[0] as { geometry?: { coordinates?: unknown } } | undefined)?.geometry;
  const coordinates = geometry?.coordinates;

  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return undefined;
  }

  const longitude = coordinates[0];
  const latitude = coordinates[1];

  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
    return undefined;
  }

  return { latitude, longitude };
}
