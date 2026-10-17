import { type GeoPoint } from '@springfield/ham-radio-api';
import { latLonToMaidenhead, normalizeMaidenhead } from '~/utils/maidenhead';
import { locatedPoint } from '~/utils/location-format';
import { parseAdifLocationPair } from '~/utils/station-log-adif-location';

const LOCATION_TAGS = ['LAT', 'LON', 'MY_LAT', 'MY_LON'] as const;

const CONTACT_LAT_TAGS = ['LAT', 'lat'];
const CONTACT_LON_TAGS = ['LON', 'lon'];
const MY_LAT_TAGS = ['MY_LAT', 'my_lat'];
const MY_LON_TAGS = ['MY_LON', 'my_lon'];

function extraValue(extra: Record<string, string>, tags: string[]): string | undefined {
  for (const tag of tags) {
    const value = extra[tag];

    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function removeExtraTags(extra: Record<string, string>, tags: string[]): void {
  for (const key of Object.keys(extra)) {
    if (tags.some((tag) => tag.toUpperCase() === key.toUpperCase())) {
      delete extra[key];
    }
  }
}

/**
 * When coordinate columns are empty, promote valid ADIF location pairs out of `adifExtra`.
 * Lone or invalid pairs stay in `adifExtra`.
 */
export function promoteAdifExtraCoordinates(
  adifExtra: Record<string, string> | undefined,
  stored: {
    latitude?: number;
    longitude?: number;
    myLatitude?: number;
    myLongitude?: number;
  },
): {
  latitude?: number;
  longitude?: number;
  myLatitude?: number;
  myLongitude?: number;
  adifExtra?: Record<string, string>;
} {
  const contactPoint = locatedPoint(stored.latitude, stored.longitude);
  const myPoint = locatedPoint(stored.myLatitude, stored.myLongitude);
  const extra = adifExtra ? { ...adifExtra } : undefined;

  let latitude = contactPoint?.latitude;
  let longitude = contactPoint?.longitude;
  let myLatitude = myPoint?.latitude;
  let myLongitude = myPoint?.longitude;

  if (extra) {
    if (!contactPoint) {
      const parsed = locatedAdifPair(extraValue(extra, CONTACT_LAT_TAGS), extraValue(extra, CONTACT_LON_TAGS));

      if (parsed) {
        latitude = parsed.latitude;
        longitude = parsed.longitude;
        removeExtraTags(extra, [...CONTACT_LAT_TAGS, ...CONTACT_LON_TAGS]);
      }
    }

    if (!myPoint) {
      const parsed = locatedAdifPair(extraValue(extra, MY_LAT_TAGS), extraValue(extra, MY_LON_TAGS));

      if (parsed) {
        myLatitude = parsed.latitude;
        myLongitude = parsed.longitude;
        removeExtraTags(extra, [...MY_LAT_TAGS, ...MY_LON_TAGS]);
      }
    }
  }

  const normalizedContact = locatedPoint(latitude, longitude);
  const normalizedMy = locatedPoint(myLatitude, myLongitude);

  return {
    latitude: normalizedContact?.latitude,
    longitude: normalizedContact?.longitude,
    myLatitude: normalizedMy?.latitude,
    myLongitude: normalizedMy?.longitude,
    adifExtra: extra && Object.keys(extra).length > 0 ? extra : undefined,
  };
}

function locatedAdifPair(latitude: string | undefined, longitude: string | undefined): GeoPoint | undefined {
  const parsed = parseAdifLocationPair(latitude, longitude);

  if (!parsed) {
    return undefined;
  }

  return locatedPoint(parsed.latitude, parsed.longitude);
}

function locationTagSet(extra: Record<string, string> | undefined): Set<string> {
  return new Set(
    Object.keys(extra ?? {})
      .map((key) => key.toUpperCase())
      .filter((key) => LOCATION_TAGS.includes(key as (typeof LOCATION_TAGS)[number])),
  );
}

/**
 * True only when a read promoted a located pair into empty columns or dropped those tags.
 * Lone, invalid, and unlocated pairs leave `adifExtra` unchanged, so a later read does not write again.
 */
export function coordinatePromotionNeedsPersist(
  row: {
    latitude: number | null;
    longitude: number | null;
    myLatitude: number | null;
    myLongitude: number | null;
    adifExtra?: Record<string, string>;
  },
  qso: {
    latitude?: number;
    longitude?: number;
    myLatitude?: number;
    myLongitude?: number;
    adifExtra?: Record<string, string>;
  },
): boolean {
  const before = locationTagSet(row.adifExtra);
  const after = locationTagSet(qso.adifExtra);
  const removed = [...before].some((tag) => !after.has(tag));
  const filledContact =
    row.latitude == null &&
    row.longitude == null &&
    qso.latitude !== undefined &&
    qso.longitude !== undefined;
  const filledMine =
    row.myLatitude == null &&
    row.myLongitude == null &&
    qso.myLatitude !== undefined &&
    qso.myLongitude !== undefined;

  return removed || filledContact || filledMine;
}

/**
 * Per-QSO `MY_LAT` / `MY_LON` default. Only a station saved from coordinates qualifies.
 * A grid-sourced station stores the cell center, which is not a precise position.
 */
export function myCoordinatesFromSavedStation(station: {
  latitude?: number;
  longitude?: number;
  locationSource?: 'grid' | 'coordinates';
} | undefined): { myLatitude?: number; myLongitude?: number } {
  if (station?.locationSource !== 'coordinates') {
    return {};
  }

  const point = locatedPoint(station.latitude, station.longitude);

  if (!point) {
    return {};
  }

  return {
    myLatitude: point.latitude,
    myLongitude: point.longitude,
  };
}

/**
 * Fill an empty Maidenhead grid from decimal coordinates.
 * A grid the operator already entered is returned unchanged, and this never yields coordinates.
 */
export function gridsquareFromCoordinatesIfEmpty(gridsquare: string | undefined, point: GeoPoint | undefined): string | undefined {
  if (gridsquare?.trim()) {
    return gridsquare;
  }

  if (!point) {
    return gridsquare;
  }

  return latLonToMaidenhead(point.latitude, point.longitude, 6) ?? gridsquare;
}

/** True when a stored point is outside the Maidenhead cell the operator entered. */
export function coordinatesOutsideGrid(gridsquare: string | undefined, point: GeoPoint | undefined): boolean {
  const grid = normalizeMaidenhead(gridsquare);

  if (!grid || !point) {
    return false;
  }

  const pointGrid = latLonToMaidenhead(point.latitude, point.longitude, 6);

  if (!pointGrid) {
    return false;
  }

  return !pointGrid.toUpperCase().startsWith(grid.toUpperCase());
}
