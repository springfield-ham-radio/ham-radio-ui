import { geoJsonFeature, locatedPoint } from '~/utils/location-format';
import { maidenheadToLatLon, normalizeMaidenhead } from '~/utils/maidenhead';
import type { StationLogQso } from '~/utils/station-log-db';

/** Public OpenFreeMap styles. No API key. MapLibre draws the required attribution. */
export const OPENFREEMAP_STYLE_URLS = {
  liberty: 'https://tiles.openfreemap.org/styles/liberty',
  bright: 'https://tiles.openfreemap.org/styles/bright',
  positron: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
  fiord: 'https://tiles.openfreemap.org/styles/fiord',
} as const;

export type OpenFreeMapStyleId = keyof typeof OPENFREEMAP_STYLE_URLS;

/** `theme` follows the app appearance: Liberty in light mode, Dark in dark mode. */
export const STATION_LOG_MAP_STYLE_IDS = ['theme', ...Object.keys(OPENFREEMAP_STYLE_URLS)] as const;

export type StationLogMapStylePreference = (typeof STATION_LOG_MAP_STYLE_IDS)[number];

export const DEFAULT_STATION_LOG_MAP_STYLE: StationLogMapStylePreference = 'theme';

export const OPENFREEMAP_STYLE_LIGHT = OPENFREEMAP_STYLE_URLS.liberty;
export const OPENFREEMAP_STYLE_DARK = OPENFREEMAP_STYLE_URLS.dark;

export function parseStationLogMapStyle(value: unknown): StationLogMapStylePreference {
  if (typeof value === 'string' && (STATION_LOG_MAP_STYLE_IDS as readonly string[]).includes(value)) {
    return value as StationLogMapStylePreference;
  }

  return DEFAULT_STATION_LOG_MAP_STYLE;
}

/**
 * Style URL for the station log map.
 *
 * Match-theme uses Liberty unless the app is in dark mode.
 */
export function stationLogMapStyleUrl(preference: StationLogMapStylePreference, colorMode: string): string {
  if (preference === 'theme') {
    return colorMode === 'dark' ? OPENFREEMAP_STYLE_URLS.dark : OPENFREEMAP_STYLE_URLS.liberty;
  }

  return OPENFREEMAP_STYLE_URLS[preference];
}

/**
 * Accept only HTTPS MapLibre style URLs. Blank and non-URL values are ignored.
 */
export function parseCustomMapStyleUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  try {
    const url = new URL(trimmed);

    if (url.protocol !== 'https:') {
      return undefined;
    }

    return trimmed;
  } catch {
    return undefined;
  }
}

/**
 * Style URL passed to MapLibre. A valid custom HTTPS URL wins over the named OpenFreeMap style.
 */
export function resolveMapStyleUrl(
  preference: StationLogMapStylePreference,
  colorMode: string,
  customUrl?: string,
): string {
  const custom = parseCustomMapStyleUrl(customUrl);

  if (custom) {
    return custom;
  }

  return stationLogMapStyleUrl(preference, colorMode);
}

export type QslMarkerStatus = 'none' | 'sent' | 'received' | 'both' | 'mixed';

/** Distinct from the QSL marker colors. */
export const STATION_PIN_COLOR = '#e11d48';

export const QSL_MARKER_COLOR: Record<QslMarkerStatus, string> = {
  none: '#64748b',
  sent: '#d97706',
  received: '#2563eb',
  both: '#059669',
  mixed: '#7c3aed',
};

export type StationLogMapLocationKind = 'coordinates' | 'grid-center';

export const MAP_QSO_EXACT_COORDINATES_LABEL = 'Exact coordinates';

export interface StationLogMapPoint {
  /** Stable key for popups and clustering lookups. */
  locationKey: string;
  /** Normalized Maidenhead grid when known; empty for coordinate-only contacts. */
  grid: string;
  latitude: number;
  longitude: number;
  locationKind: StationLogMapLocationKind;
  status: QslMarkerStatus;
  qsos: StationLogQso[];
}

export interface ResolvedStationLogMapLocation {
  locationKey: string;
  grid: string;
  latitude: number;
  longitude: number;
  locationKind: StationLogMapLocationKind;
}

export interface StationLogMapFeatureCollection {
  type: 'FeatureCollection';
  features: StationLogMapFeature[];
}

export interface StationMapPinInput {
  id: string;
  nickname: string;
  gridsquare?: string;
  latitude?: number;
  longitude?: number;
}

export interface StationMapPin {
  id: string;
  nickname: string;
  gridsquare?: string;
  latitude: number;
  longitude: number;
}

export interface StationMapFeatureCollection {
  type: 'FeatureCollection';
  features: StationMapFeature[];
}

export interface StationMapFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: {
    id: string;
    nickname: string;
  };
}

export interface StationLogMapFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: {
    locationKey: string;
    grid: string;
    locationKind: StationLogMapLocationKind;
    status: QslMarkerStatus;
    count: number;
  };
}

/**
 * Card state for one contact. Confirmed cards are the ones marked sent or received.
 */
export function qslMarkerStatus(qso: { qslSent?: boolean; qslReceived?: boolean }): Exclude<QslMarkerStatus, 'mixed'> {
  const sent = qso.qslSent === true;
  const received = qso.qslReceived === true;

  if (sent && received) {
    return 'both';
  }

  if (sent) {
    return 'sent';
  }

  if (received) {
    return 'received';
  }

  return 'none';
}

/**
 * Short label for the station-log table.
 */
export function qslTableLabel(qso: { qslSent?: boolean; qslReceived?: boolean }): string {
  const status = qslMarkerStatus(qso);

  if (status === 'sent') {
    return 'Sent';
  }

  if (status === 'received') {
    return 'Received';
  }

  if (status === 'both') {
    return 'Both';
  }

  return '—';
}

/**
 * Longer label for a map popup.
 */
export function qslStatusLabel(status: QslMarkerStatus): string {
  if (status === 'sent') {
    return 'Card sent';
  }

  if (status === 'received') {
    return 'Card received';
  }

  if (status === 'both') {
    return 'Card sent and received';
  }

  if (status === 'mixed') {
    return 'Mixed';
  }

  return 'No card';
}

function combinedQslStatus(qsos: readonly StationLogQso[]): QslMarkerStatus {
  const statuses = new Set(qsos.map((qso) => qslMarkerStatus(qso)));

  if (statuses.size === 1) {
    return [...statuses][0] ?? 'none';
  }

  return 'mixed';
}

function coordinateLocationKey(point: { latitude: number; longitude: number }): string {
  return `coord:${point.latitude.toFixed(6)}:${point.longitude.toFixed(6)}`;
}

/**
 * Stored coordinates win over the Maidenhead grid center. Contacts need one or the other.
 */
export function resolveStationLogMapLocation(qso: StationLogQso): ResolvedStationLogMapLocation | undefined {
  const grid = normalizeMaidenhead(qso.theirGridsquare);
  const point = locatedPoint(qso.latitude, qso.longitude);

  if (point) {
    return {
      locationKey: coordinateLocationKey(point),
      grid: grid ?? '',
      latitude: point.latitude,
      longitude: point.longitude,
      locationKind: 'coordinates',
    };
  }

  if (!grid) {
    return undefined;
  }

  const center = maidenheadToLatLon(grid);

  if (!center) {
    return undefined;
  }

  return {
    locationKey: `grid:${grid}`,
    grid,
    latitude: center.latitude,
    longitude: center.longitude,
    locationKind: 'grid-center',
  };
}

/**
 * One map point per located contact or shared location. Coordinates win over grid centers.
 */
export function stationLogMapPoints(qsos: readonly StationLogQso[]): StationLogMapPoint[] {
  const groups = new Map<string, { location: ResolvedStationLogMapLocation; qsos: StationLogQso[] }>();

  for (const qso of qsos) {
    const location = resolveStationLogMapLocation(qso);

    if (!location) {
      continue;
    }

    const existing = groups.get(location.locationKey);

    if (existing) {
      existing.qsos.push(qso);
    } else {
      groups.set(location.locationKey, { location, qsos: [qso] });
    }
  }

  const points: StationLogMapPoint[] = [];

  for (const { location, qsos: group } of groups.values()) {
    points.push({
      locationKey: location.locationKey,
      grid: location.grid,
      latitude: location.latitude,
      longitude: location.longitude,
      locationKind: location.locationKind,
      status: combinedQslStatus(group),
      qsos: group,
    });
  }

  points.sort((left, right) => left.locationKey.localeCompare(right.locationKey));

  return points;
}

/**
 * Contacts that cannot be plotted because they have no coordinates or valid grid.
 */
export function stationLogUnmappedCount(qsos: readonly StationLogQso[]): number {
  const mapped = stationLogMapPoints(qsos).reduce((sum, point) => sum + point.qsos.length, 0);

  return qsos.length - mapped;
}

/**
 * GeoJSON for MapLibre. Coordinates are longitude, then latitude.
 */
export function stationLogMapFeatureCollection(points: readonly StationLogMapPoint[]): StationLogMapFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: points.map((point) =>
      geoJsonFeature(
        { latitude: point.latitude, longitude: point.longitude },
        {
          locationKey: point.locationKey,
          grid: point.grid,
          locationKind: point.locationKind,
          status: point.status,
          count: point.qsos.length,
        },
      ),
    ),
  };
}

/**
 * One pin per configured station that has coordinates or a valid Maidenhead grid.
 * Stored coordinates win over the grid center.
 */
export function stationMapPins(stations: readonly StationMapPinInput[]): StationMapPin[] {
  const pins: StationMapPin[] = [];

  for (const station of stations) {
    const grid = normalizeMaidenhead(station.gridsquare);
    const point = locatedPoint(station.latitude, station.longitude);

    if (point) {
      pins.push({
        id: station.id,
        nickname: station.nickname,
        gridsquare: grid,
        latitude: point.latitude,
        longitude: point.longitude,
      });
      continue;
    }

    if (!grid) {
      continue;
    }

    const location = maidenheadToLatLon(grid);

    if (!location) {
      continue;
    }

    pins.push({
      id: station.id,
      nickname: station.nickname,
      gridsquare: grid,
      latitude: location.latitude,
      longitude: location.longitude,
    });
  }

  pins.sort((left, right) => left.nickname.localeCompare(right.nickname) || left.id.localeCompare(right.id));

  return pins;
}

/**
 * GeoJSON for station pins. Coordinates are longitude, then latitude.
 */
export function stationMapFeatureCollection(pins: readonly StationMapPin[]): StationMapFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: pins.map((pin) =>
      geoJsonFeature(
        { latitude: pin.latitude, longitude: pin.longitude },
        {
          id: pin.id,
          nickname: pin.nickname,
        },
      ),
    ),
  };
}
