import type { CircleLayerSpecification, SymbolLayerSpecification } from 'maplibre-gl';
import type { AprsStation } from '~/utils/aprs-stations';
import { formatAprsHeardAt } from '~/utils/aprs-display';

/** Marker color used for a heard station that is not the selected call. */
export const APRS_STATION_MARKER_COLOR = '#0f766e';

/** Marker color used when the APRS map has that callsign selected. */
export const APRS_STATION_SELECTED_COLOR = '#c2410c';

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

/** Callsign label under the station marker. */
export function aprsStationLabelLayout(): NonNullable<SymbolLayerSpecification['layout']> {
  return {
    'text-field': ['get', 'callsign'],
    'text-font': ['Noto Sans Regular'],
    'text-size': 11,
    'text-offset': [0, 1.15],
    'text-anchor': 'top',
  };
}

export function aprsStationLabelPaint(): NonNullable<SymbolLayerSpecification['paint']> {
  return {
    'text-color': '#0f172a',
    'text-halo-color': '#ffffff',
    'text-halo-width': 1.2,
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

export function aprsMapBounds(collection: AprsMapFeatureCollection): AprsMapBounds | undefined {
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
