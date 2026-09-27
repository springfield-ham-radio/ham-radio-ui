import { maidenheadToLatLon, normalizeMaidenhead } from '~/utils/maidenhead';
import type { StationLogQso } from '~/utils/station-log-db';

/** Public OpenFreeMap styles. No API key. MapLibre draws the required attribution. */
export const OPENFREEMAP_STYLE_LIGHT = 'https://tiles.openfreemap.org/styles/liberty';
export const OPENFREEMAP_STYLE_DARK = 'https://tiles.openfreemap.org/styles/dark';

export type QslMarkerStatus = 'none' | 'sent' | 'received' | 'both' | 'mixed';

export const QSL_MARKER_COLOR: Record<QslMarkerStatus, string> = {
  none: '#64748b',
  sent: '#d97706',
  received: '#2563eb',
  both: '#059669',
  mixed: '#7c3aed',
};

export interface StationLogMapPoint {
  grid: string;
  latitude: number;
  longitude: number;
  status: QslMarkerStatus;
  qsos: StationLogQso[];
}

export interface StationLogMapFeatureCollection {
  type: 'FeatureCollection';
  features: StationLogMapFeature[];
}

export interface StationLogMapFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: {
    grid: string;
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

/**
 * One map point per Maidenhead grid. Contacts without a valid grid are omitted.
 */
export function stationLogMapPoints(qsos: readonly StationLogQso[]): StationLogMapPoint[] {
  const groups = new Map<string, StationLogQso[]>();

  for (const qso of qsos) {
    const grid = normalizeMaidenhead(qso.theirGridsquare);

    if (!grid) {
      continue;
    }

    const existing = groups.get(grid);

    if (existing) {
      existing.push(qso);
    } else {
      groups.set(grid, [qso]);
    }
  }

  const points: StationLogMapPoint[] = [];

  for (const [grid, group] of groups) {
    const location = maidenheadToLatLon(grid);

    if (!location) {
      continue;
    }

    points.push({
      grid,
      latitude: location.latitude,
      longitude: location.longitude,
      status: combinedQslStatus(group),
      qsos: group,
    });
  }

  points.sort((left, right) => left.grid.localeCompare(right.grid));

  return points;
}

/**
 * Contacts that cannot be plotted because they have no valid Maidenhead grid.
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
    features: points.map((point) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [point.longitude, point.latitude],
      },
      properties: {
        grid: point.grid,
        status: point.status,
        count: point.qsos.length,
      },
    })),
  };
}
