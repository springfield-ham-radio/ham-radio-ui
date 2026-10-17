import { type GeoPoint } from '@springfield/ham-radio-api';
import { latLonToMaidenhead } from '~/utils/maidenhead';
import { locatedPoint } from '~/utils/location-format';
import { parseAdifLocationPair } from '~/utils/station-log-adif-location';

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
      const parsed = parseAdifLocationPair(extraValue(extra, CONTACT_LAT_TAGS), extraValue(extra, CONTACT_LON_TAGS));

      if (parsed) {
        latitude = parsed.latitude;
        longitude = parsed.longitude;
        removeExtraTags(extra, [...CONTACT_LAT_TAGS, ...CONTACT_LON_TAGS]);
      }
    }

    if (!myPoint) {
      const parsed = parseAdifLocationPair(extraValue(extra, MY_LAT_TAGS), extraValue(extra, MY_LON_TAGS));

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

/** Fill an empty Maidenhead grid from decimal coordinates; never overwrite an existing grid. */
export function gridsquareFromCoordinatesIfEmpty(gridsquare: string | undefined, point: GeoPoint | undefined): string | undefined {
  if (gridsquare?.trim()) {
    return gridsquare;
  }

  if (!point) {
    return gridsquare;
  }

  return latLonToMaidenhead(point.latitude, point.longitude, 6) ?? gridsquare;
}
