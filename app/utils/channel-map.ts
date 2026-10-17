import type { GeoPoint } from '@springfield/ham-radio-api';
import { formatChannelLocation } from '~/utils/channel-location';
import { formatFrequencyMHz } from '~/utils/channel-edit';
import {
  compassPointBetween,
  distanceKm,
  geoJsonFeature,
  locatedPoint,
  type GeoJsonFeature,
} from '~/utils/location-format';
import { formatSavedTone } from '~/utils/saved-channels-db';
import { STATION_PIN_COLOR } from '~/utils/station-log-map';
import { bandNameForFrequency } from '~/utils/transmit-privileges';
import { formatTripDistance, type DistanceUnit } from '~/utils/trip-channels';
/** Slate fallback for bands outside the repeater palette. */
export const CHANNEL_MAP_BAND_FALLBACK = '#64748b';

/** Keys match `bandNameForFrequency` / `displayBandName` labels (for example `2 Meter`, not `2M`). */
export const CHANNEL_MAP_BAND_COLORS: Record<string, string> = {
  '160 Meter': '#475569',
  '80 Meter': '#64748b',
  '60 Meter': '#e11d48',
  '40 Meter': '#dc2626',
  '30 Meter': '#ea580c',
  '20 Meter': '#d97706',
  '17 Meter': '#ca8a04',
  '15 Meter': '#65a30d',
  '12 Meter': '#16a34a',
  '10 Meter': '#059669',
  '6 Meter': '#0d9488',
  '2 Meter': '#2563eb',
  '1.25 Meter': '#7c3aed',
  '70 Centimeter': '#db2777',
  '33 Centimeter': '#c026d3',
  '23 Centimeter': '#9333ea',
  GMRS: '#0891b2',
  'FRS/GMRS': '#14b8a6',
  'Weather Radio': '#6366f1',
};

export interface ChannelMapChannel {
  id: string | { toString(): string };
  name?: string;
  callsign?: string;
  kind?: string;
  latitude?: number;
  longitude?: number;
  transmitFrequency: number;
  receiveFrequency: number;
  transmitTone?: { tone: number; type: string };
  receiveTone?: { tone: number; type: string };
  city?: string;
  state?: string;
  county?: string;
  country?: string;
  landmark?: string;
  band?: string;
}

export interface ChannelMapFeatureProperties {
  id: string;
  band: string;
  bandColor: string;
  callsign: string;
  name: string;
  transmitLabel: string;
  receiveLabel: string;
  transmitToneLabel: string;
  receiveToneLabel: string;
  locationLabel: string;
}

export interface ChannelMapFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJsonFeature<ChannelMapFeatureProperties>[];
}

export interface ChannelMapBounds {
  minLongitude: number;
  minLatitude: number;
  maxLongitude: number;
  maxLatitude: number;
}

export function channelMapBandColor(band: string): string {
  const key = band.trim();

  if (!key) {
    return CHANNEL_MAP_BAND_FALLBACK;
  }

  return CHANNEL_MAP_BAND_COLORS[key] ?? CHANNEL_MAP_BAND_FALLBACK;
}

/**
 * MapLibre `match` expression for circle color from the `band` property.
 */
export function channelMapBandColorExpression(): unknown[] {
  const pairs: unknown[] = ['match', ['get', 'band']];

  for (const [band, color] of Object.entries(CHANNEL_MAP_BAND_COLORS)) {
    pairs.push(band, color);
  }

  pairs.push(CHANNEL_MAP_BAND_FALLBACK);

  return pairs;
}

export function channelMapFeatures(channels: readonly ChannelMapChannel[]): ChannelMapFeatureCollection {
  const features: GeoJsonFeature<ChannelMapFeatureProperties>[] = [];

  for (const channel of channels) {
    const point = locatedPoint(channel.latitude, channel.longitude);

    if (!point) {
      continue;
    }

    const band = channel.band ?? bandNameForFrequency(channel.transmitFrequency);
    const id = String(channel.id);

    features.push(
      geoJsonFeature(point, {
        id,
        band,
        bandColor: channelMapBandColor(band),
        callsign: channel.callsign ?? '',
        name: channel.name ?? '',
        transmitLabel: formatFrequencyMHz(channel.transmitFrequency),
        receiveLabel: formatFrequencyMHz(channel.receiveFrequency),
        transmitToneLabel: formatSavedTone(channel.transmitTone),
        receiveToneLabel: formatSavedTone(channel.receiveTone),
        locationLabel: formatChannelLocation(channel),
      }),
    );
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

export function channelMapUnlocatedCount(channels: readonly ChannelMapChannel[]): number {
  let count = 0;

  for (const channel of channels) {
    if (!locatedPoint(channel.latitude, channel.longitude)) {
      count += 1;
    }
  }

  return count;
}

export function channelMapUnlocatedMessage(unlocated: number, total: number): string | undefined {
  if (unlocated <= 0 || total <= 0) {
    return undefined;
  }

  if (unlocated === 1) {
    return `1 of ${total} channels has no location.`;
  }

  return `${unlocated} of ${total} channels have no location.`;
}

/**
 * Axis-aligned bounds for fitBounds. Undefined when no located markers or start pin exist.
 */
export function channelMapBounds(
  features: readonly GeoJsonFeature<ChannelMapFeatureProperties>[],
  start?: GeoPoint,
): ChannelMapBounds | undefined {
  let minLongitude: number | undefined;
  let minLatitude: number | undefined;
  let maxLongitude: number | undefined;
  let maxLatitude: number | undefined;

  const extend = (longitude: number, latitude: number): void => {
    minLongitude = minLongitude === undefined ? longitude : Math.min(minLongitude, longitude);
    minLatitude = minLatitude === undefined ? latitude : Math.min(minLatitude, latitude);
    maxLongitude = maxLongitude === undefined ? longitude : Math.max(maxLongitude, longitude);
    maxLatitude = maxLatitude === undefined ? latitude : Math.max(maxLatitude, latitude);
  };

  for (const feature of features) {
    const [longitude, latitude] = feature.geometry.coordinates;
    extend(longitude, latitude);
  }

  if (start) {
    extend(start.longitude, start.latitude);
  }

  if (minLongitude === undefined || minLatitude === undefined || maxLongitude === undefined || maxLatitude === undefined) {
    return undefined;
  }

  return {
    minLongitude,
    minLatitude,
    maxLongitude,
    maxLatitude,
  };
}

const RANGE_RING_STEPS = 64;
const EARTH_RADIUS_KM = 6371;

/**
 * Closed GeoJSON polygon approximating a circle on the WGS84 sphere.
 */
export interface ChannelMapPolygonFeature {
  type: 'Feature';
  geometry: {
    type: 'Polygon';
    coordinates: [number, number][][];
  };
  properties: {
    kind: 'range-ring';
  };
}

export function rangeRingPolygon(center: GeoPoint, radiusKm: number): ChannelMapPolygonFeature {
  const coordinates: [number, number][] = [];

  for (let step = 0; step < RANGE_RING_STEPS; step += 1) {
    const bearing = (step / RANGE_RING_STEPS) * 360;
    const point = destinationPoint(center, radiusKm, bearing);
    coordinates.push([point.longitude, point.latitude]);
  }

  coordinates.push(coordinates[0]!);

  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [coordinates],
    },
    properties: {
      kind: 'range-ring',
    },
  };
}

function destinationPoint(center: GeoPoint, distance: number, bearingDegrees: number): GeoPoint {
  const bearing = (bearingDegrees * Math.PI) / 180;
  const latitude1 = (center.latitude * Math.PI) / 180;
  const longitude1 = (center.longitude * Math.PI) / 180;
  const angularDistance = distance / EARTH_RADIUS_KM;
  const latitude2 = Math.asin(
    Math.sin(latitude1) * Math.cos(angularDistance) + Math.cos(latitude1) * Math.sin(angularDistance) * Math.cos(bearing),
  );
  const longitude2 =
    longitude1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude1),
      Math.cos(angularDistance) - Math.sin(latitude1) * Math.sin(latitude2),
    );

  return {
    latitude: (latitude2 * 180) / Math.PI,
    longitude: ((longitude2 * 180) / Math.PI + 540) % 360 - 180,
  };
}

export function channelMapHoverFeature(
  channels: readonly ChannelMapChannel[],
  channelId: string | undefined,
): ChannelMapFeatureCollection {
  if (!channelId) {
    return { type: 'FeatureCollection', features: [] };
  }

  const match = channels.find((channel) => String(channel.id) === channelId);
  const point = match ? locatedPoint(match.latitude, match.longitude) : undefined;

  if (!match || !point) {
    return { type: 'FeatureCollection', features: [] };
  }

  const band = match.band ?? bandNameForFrequency(match.transmitFrequency);

  return {
    type: 'FeatureCollection',
    features: [
      geoJsonFeature(point, {
        id: channelId,
        band,
        bandColor: channelMapBandColor(band),
        callsign: match.callsign ?? '',
        name: match.name ?? '',
        transmitLabel: formatFrequencyMHz(match.transmitFrequency),
        receiveLabel: formatFrequencyMHz(match.receiveFrequency),
        transmitToneLabel: formatSavedTone(match.transmitTone),
        receiveToneLabel: formatSavedTone(match.receiveTone),
        locationLabel: formatChannelLocation(match),
      }),
    ],
  };
}

export function channelMapStartFeatureCollection(start?: GeoPoint): ChannelMapFeatureCollection {
  if (!start) {
    return { type: 'FeatureCollection', features: [] };
  }

  return {
    type: 'FeatureCollection',
    features: [
      geoJsonFeature(start, {
        id: 'distance-start',
        band: '',
        bandColor: STATION_PIN_COLOR,
        callsign: '',
        name: 'Distance start',
        transmitLabel: '',
        receiveLabel: '',
        transmitToneLabel: '',
        receiveToneLabel: '',
        locationLabel: '',
      }),
    ],
  };
}

export function channelMapRangeFeatureCollection(
  start?: GeoPoint,
  radiusKm?: number,
): { type: 'FeatureCollection'; features: ChannelMapPolygonFeature[] } {
  if (!start || radiusKm === undefined || radiusKm <= 0) {
    return { type: 'FeatureCollection', features: [] };
  }

  return {
    type: 'FeatureCollection',
    features: [rangeRingPolygon(start, radiusKm)],
  };
}

export function channelMapLegendBands(features: readonly GeoJsonFeature<ChannelMapFeatureProperties>[]): string[] {
  const bands: string[] = [];

  for (const feature of features) {
    const band = feature.properties.band;

    if (band && !bands.includes(band)) {
      bands.push(band);
    }
  }

  return bands.sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
}

export function channelMapPopupDistanceLine(
  channel: ChannelMapChannel,
  start: GeoPoint | undefined,
  unit: DistanceUnit,
): string | undefined {
  const point = locatedPoint(channel.latitude, channel.longitude);

  if (!point || !start) {
    return undefined;
  }

  const km = distanceKm(start, point);
  const bearing = compassPointBetween(start, point);

  return `${formatTripDistance(km, unit)} ${bearing}`;
}

/** Format stored kilometers for the range input in the operator's distance unit. */
export function formatChannelMapRangeDisplay(radiusKm: number, unit: DistanceUnit): string {
  const value = unit === 'km' ? radiusKm : radiusKm / 1.609344;
  const rounded = Math.round(value * 100) / 100;

  return String(rounded);
}

export function parseChannelMapRangeRadius(text: string): number | undefined {
  const trimmed = text.trim();

  if (!trimmed) {
    return undefined;
  }

  const value = Number(trimmed);

  if (!Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  return value;
}

/** Convert operator-entered radius to kilometers for the ring geometry. */
export function channelMapRangeRadiusKm(radius: number | undefined, unit: DistanceUnit): number | undefined {
  if (radius === undefined || radius <= 0) {
    return undefined;
  }

  const KILOMETERS_PER_MILE = 1.609344;

  return unit === 'km' ? radius : radius * KILOMETERS_PER_MILE;
}

/** Sorted located channel ids for fit-bounds change detection. */
export function channelMapLocatedIdKey(channels: readonly ChannelMapChannel[], start?: GeoPoint): string {
  const ids = channels
    .filter((channel) => locatedPoint(channel.latitude, channel.longitude))
    .map((channel) => String(channel.id))
    .sort();
  const startKey = start ? `${start.latitude.toFixed(5)},${start.longitude.toFixed(5)}` : '';

  return `${ids.join('\u0001')}|${startKey}`;
}
