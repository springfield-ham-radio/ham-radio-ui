import type { CircleLayerSpecification, SymbolLayerSpecification } from 'maplibre-gl';
import { formatAx25Call, canonicalAx25Call } from '~/utils/aprs-ax25';
import type { SavedRadioAprsBeacon } from '~/utils/aprs-beacon';
import { formatAprsBeaconSummaryPosition, resolveAprsBeaconLocation } from '~/utils/aprs-beacon-location';
import type { StationAntennaStore } from '~/utils/antenna-station';
import { formatAprsHeardAt } from '~/utils/aprs-display';
import type { AprsStation } from '~/utils/aprs-stations';

/** Marker color used for a heard station that is not the selected call. */
export const APRS_STATION_MARKER_COLOR = '#0f766e';

/** Marker color used when the APRS map has that callsign selected. */
export const APRS_STATION_SELECTED_COLOR = '#c2410c';

/** Fill for this radio’s manual beacon position (not a heard station). */
export const APRS_OWN_BEACON_MARKER_COLOR = '#2563eb';

/** Accent ring for the own-beacon marker. */
export const APRS_OWN_BEACON_RING_COLOR = '#fbbf24';

/**
 * Circle paint shared by the APRS tab map and the main Map APRS layer.
 *
 * Selected stations are larger and use the selected color. A feature with
 * `selected` 0 keeps the default marker.
 */
export function aprsStationCirclePaint(): NonNullable<CircleLayerSpecification['paint']> {
  return {
    'circle-radius': ['case', ['==', ['get', 'selected'], 1], 8, 6],
    'circle-color': ['case', ['==', ['get', 'selected'], 1], APRS_STATION_SELECTED_COLOR, APRS_STATION_MARKER_COLOR],
    'circle-stroke-width': 2,
    'circle-stroke-color': '#ffffff',
  };
}

/** Own-beacon marker: larger fill with an accent outline so it stands apart from heard traffic. */
export function aprsOwnBeaconCirclePaint(): NonNullable<CircleLayerSpecification['paint']> {
  return {
    'circle-radius': 9,
    'circle-color': APRS_OWN_BEACON_MARKER_COLOR,
    'circle-stroke-width': 3,
    'circle-stroke-color': APRS_OWN_BEACON_RING_COLOR,
  };
}

/** Callsign label under the station marker. */
export function aprsStationLabelLayout(): NonNullable<SymbolLayerSpecification['layout']> {
  return {
    'text-field': ['get', 'callsign'],
    'text-font': ['Noto Sans Bold'],
    'text-size': [
      'interpolate',
      ['linear'],
      ['zoom'],
      8,
      ['case', ['==', ['get', 'selected'], 1], 14, 12],
      12,
      ['case', ['==', ['get', 'selected'], 1], 16, 14],
      16,
      ['case', ['==', ['get', 'selected'], 1], 18, 16],
    ],
    'text-offset': [0, 1.4],
    'text-anchor': 'top',
  };
}

export function aprsStationLabelPaint(): NonNullable<SymbolLayerSpecification['paint']> {
  return {
    'text-color': '#f8fafc',
    'text-halo-color': '#0f172a',
    'text-halo-width': ['case', ['==', ['get', 'selected'], 1], 2, 1.75],
    'text-halo-blur': 0,
  };
}

export interface AprsMapFeatureProperties {
  callsign: string;
  label: string;
  lastHeardAt: string;
  /** 1 when this callsign is the selected station. */
  selected: 0 | 1;
}

export interface AprsMapFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: AprsMapFeatureProperties;
}

export interface AprsMapFeatureCollection {
  type: 'FeatureCollection';
  features: AprsMapFeature[];
}

export interface AprsMapBounds {
  minLongitude: number;
  minLatitude: number;
  maxLongitude: number;
  maxLatitude: number;
}

export interface AprsMapOwnBeaconPosition {
  callsign: string;
  latitude: number;
  longitude: number;
  label: string;
}

/**
 * A station position can be drawn only when the decoder produced finite coordinates.
 *
 * Mic-E ambiguity, missing positions, and object reports are not filled in here.
 */
export function isPlottableAprsPosition(position: { latitude: number; longitude: number } | undefined): boolean {
  if (!position) {
    return false;
  }

  const { latitude, longitude } = position;

  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/**
 * One point per callsign that has its own decoded position.
 *
 * A later packet updates that point. An object position on the station is not plotted.
 */
export function aprsMapFeatures(stations: readonly AprsStation[], selectedCall?: string): AprsMapFeatureCollection {
  const features: AprsMapFeature[] = [];
  const seen = new Set<string>();

  for (const station of stations) {
    const position = station.position?.value;

    if (seen.has(station.callsign) || !isPlottableAprsPosition(position) || !position) {
      continue;
    }

    seen.add(station.callsign);
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [position.longitude, position.latitude],
      },
      properties: {
        callsign: station.callsign,
        label: position.label,
        lastHeardAt: station.position?.heardAt ?? station.lastHeardAt,
        selected: station.callsign === selectedCall ? 1 : 0,
      },
    });
  }

  return { type: 'FeatureCollection', features };
}

/**
 * Position for **My callsign** on the map: saved `aprsBeacon` first, otherwise station prefill.
 * Omitted when there is no valid latitude and longitude or My callsign is not a valid AX.25 call.
 */
export function resolveAprsMapOwnBeaconPosition(
  mine: string,
  stored: SavedRadioAprsBeacon | undefined,
  store: StationAntennaStore,
): AprsMapOwnBeaconPosition | undefined {
  const source = canonicalAx25Call(mine.trim());

  if (!source) {
    return undefined;
  }

  const callsign = formatAx25Call(source);
  let latitude: number | undefined;
  let longitude: number | undefined;

  if (stored && isPlottableAprsPosition({ latitude: stored.latitude, longitude: stored.longitude })) {
    latitude = stored.latitude;
    longitude = stored.longitude;
  } else {
    const prefill = resolveAprsBeaconLocation(store);

    if (prefill && isPlottableAprsPosition(prefill)) {
      latitude = prefill.latitude;
      longitude = prefill.longitude;
    }
  }

  if (latitude === undefined || longitude === undefined) {
    return undefined;
  }

  return {
    callsign,
    latitude,
    longitude,
    label: formatAprsBeaconSummaryPosition(latitude, longitude),
  };
}

/**
 * Map feature for this radio’s beacon. Not folded into heard stations.
 */
export function aprsMapOwnBeaconFeature(position: AprsMapOwnBeaconPosition | undefined): AprsMapFeature | undefined {
  if (!position || !isPlottableAprsPosition(position)) {
    return undefined;
  }

  return {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [position.longitude, position.latitude],
    },
    properties: {
      callsign: position.callsign,
      label: position.label,
      lastHeardAt: '',
      selected: 0,
    },
  };
}

function extendBounds(
  bounds: AprsMapBounds | undefined,
  longitude: number,
  latitude: number,
): AprsMapBounds {
  if (!bounds) {
    return { minLongitude: longitude, minLatitude: latitude, maxLongitude: longitude, maxLatitude: latitude };
  }

  return {
    minLongitude: Math.min(bounds.minLongitude, longitude),
    minLatitude: Math.min(bounds.minLatitude, latitude),
    maxLongitude: Math.max(bounds.maxLongitude, longitude),
    maxLatitude: Math.max(bounds.maxLatitude, latitude),
  };
}

export function aprsMapBounds(
  collection: AprsMapFeatureCollection,
  ownBeacon?: Pick<AprsMapOwnBeaconPosition, 'latitude' | 'longitude'>,
): AprsMapBounds | undefined {
  let minLongitude: number | undefined;
  let minLatitude: number | undefined;
  let maxLongitude: number | undefined;
  let maxLatitude: number | undefined;

  for (const feature of collection.features) {
    const [longitude, latitude] = feature.geometry.coordinates;
    minLongitude = minLongitude === undefined ? longitude : Math.min(minLongitude, longitude);
    minLatitude = minLatitude === undefined ? latitude : Math.min(minLatitude, latitude);
    maxLongitude = maxLongitude === undefined ? longitude : Math.max(maxLongitude, longitude);
    maxLatitude = maxLatitude === undefined ? latitude : Math.max(maxLatitude, latitude);
  }

  if (ownBeacon && isPlottableAprsPosition(ownBeacon)) {
    const extended = extendBounds(
      minLongitude === undefined || minLatitude === undefined || maxLongitude === undefined || maxLatitude === undefined
        ? undefined
        : { minLongitude, minLatitude, maxLongitude, maxLatitude },
      ownBeacon.longitude,
      ownBeacon.latitude,
    );

    return extended;
  }

  if (minLongitude === undefined || minLatitude === undefined || maxLongitude === undefined || maxLatitude === undefined) {
    return undefined;
  }

  return { minLongitude, minLatitude, maxLongitude, maxLatitude };
}

export function aprsMapUnlocatedCount(stations: readonly AprsStation[]): number {
  return stations.filter((station) => !isPlottableAprsPosition(station.position?.value)).length;
}

export type AprsMapDetailsEvent =
  | { type: 'choose'; callsign: string }
  | { type: 'dismiss' }
  | { type: 'retain'; callsigns: readonly string[] };

/**
 * Which station's map details card is open.
 *
 * Row highlight and marker selection are separate; this tracks only the popup.
 */
export function aprsMapDetailsCall(
  open: string | undefined,
  event: AprsMapDetailsEvent,
): string | undefined {
  if (event.type === 'choose') {
    return event.callsign;
  }

  if (event.type === 'dismiss') {
    return undefined;
  }

  if (!open) {
    return undefined;
  }

  return event.callsigns.includes(open) ? open : undefined;
}

/**
 * Lines for the selected marker. Omitted when that field was not decoded.
 */
export function aprsMapPopupLines(station: AprsStation): string[] {
  const lines = [station.callsign];

  if (station.position) {
    lines.push(station.position.value.label);
  }

  lines.push(`Last heard ${formatAprsHeardAt(station.lastHeardAt)}`);

  if (station.positionComment) {
    lines.push(station.positionComment.value);
  }

  if (station.comment) {
    lines.push(station.comment.value);
  }

  if (station.courseDegrees) {
    lines.push(`Course ${station.courseDegrees.value}°`);
  }

  if (station.speedKnots) {
    lines.push(`Speed ${station.speedKnots.value.toFixed(0)} kn`);
  }

  if (station.altitude) {
    lines.push(`Altitude ${station.altitude.value}`);
  }

  if (station.statusText) {
    lines.push(station.statusText.value);
  }

  if (station.message) {
    lines.push(`Message ${station.message.value.addressee}: ${station.message.value.text}`);
  }

  return lines;
}
