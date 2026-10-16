import {
  channelMapFeatures,
  channelMapUnlocatedCount,
  type ChannelMapChannel,
  type ChannelMapFeatureCollection,
} from '~/utils/channel-map';
import { channelsInGroup, isTripChannelGroup, type ChannelGroup, type ChannelGroupMembership } from '~/utils/channel-groups';
import { geoJsonFeature } from '~/utils/location-format';
import type { GeoPoint } from '@springfield/ham-radio-api';
import { normalizeMaidenhead } from '~/utils/maidenhead';
import {
  antennaIsAtStation,
  HOME_STATION_ID,
  type RadioStation,
  type StationAntenna,
} from '~/utils/antenna-station';
import { MAP_PAGE_ALL_STORED_GROUPS, type MapPageGroupSelection } from '~/utils/map-page-settings';
import { coordinatesFromPair, type SavedChannel } from '~/utils/saved-channels-db';
import { distanceKm } from '~/utils/location-format';
import { defaultDistanceStartId, stationStartPoint, TRIP_START_NONE } from '~/utils/trip-channels';
import {
  stationLogMapPoints,
  stationLogUnmappedCount,
  stationMapPins,
  type QslMarkerStatus,
  type StationMapPinInput,
} from '~/utils/station-log-map';
import type { StationLogQso } from '~/utils/station-log-db';

export const MAP_STATION_OTHER_PIN_COLOR = '#0f766e';

export type MapPageStationRole = 'home' | 'station';

export interface MapPageStationFeatureProperties {
  id: string;
  nickname: string;
  role: MapPageStationRole;
}

export interface MapPageStationFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: {
      type: 'Point';
      coordinates: [number, number];
    };
    properties: MapPageStationFeatureProperties;
  }>;
}

function mapStationPinInputs(stations: readonly RadioStation[]): StationMapPinInput[] {
  return stations.map((station) => ({
    id: station.id,
    nickname: station.nickname,
    gridsquare: station.gridsquare,
    latitude: station.latitude,
    longitude: station.longitude,
  }));
}

export function mapStationLocated(stations: readonly RadioStation[]): ReturnType<typeof stationMapPins> {
  return stationMapPins(mapStationPinInputs(stations));
}

/**
 * Station antennas assigned to a site. Radio-mounted antennas are omitted.
 */
export function mapStationAntennas(
  stationId: string,
  antennas: readonly StationAntenna[],
): StationAntenna[] {
  return antennas.filter((antenna) => antennaIsAtStation(antenna, stationId));
}

export function mapStationFeatures(stations: readonly RadioStation[]): MapPageStationFeatureCollection {
  const pins = mapStationLocated(stations);

  return {
    type: 'FeatureCollection',
    features: pins.map((pin) =>
      geoJsonFeature(
        { latitude: pin.latitude, longitude: pin.longitude },
        {
          id: pin.id,
          nickname: pin.nickname,
          role: pin.id === HOME_STATION_ID ? 'home' : 'station',
        },
      ),
    ),
  };
}

export function mapStationHomeUnlocated(stations: readonly RadioStation[]): boolean {
  const home = stations.find((station) => station.id === HOME_STATION_ID);

  if (!home) {
    return false;
  }

  return mapStationLocated([home]).length === 0;
}

export function mapStationOtherUnlocatedCount(stations: readonly RadioStation[]): number {
  let unlocated = 0;

  for (const station of stations) {
    if (station.id === HOME_STATION_ID) {
      continue;
    }

    if (mapStationLocated([station]).length === 0) {
      unlocated += 1;
    }
  }

  return unlocated;
}

export function mapStationHomeUnlocatedMessage(stations: readonly RadioStation[]): string | undefined {
  return mapStationHomeUnlocated(stations) ? 'Home has no location.' : undefined;
}

export function mapStationOtherUnlocatedMessage(
  stations: readonly RadioStation[],
): string | undefined {
  const unlocated = mapStationOtherUnlocatedCount(stations);

  if (unlocated === 1) {
    return '1 station has no location.';
  }

  if (unlocated > 1) {
    return `${unlocated} stations have no location.`;
  }

  return undefined;
}

export interface MapPageQsoFeatureProperties {
  grid: string;
  status: QslMarkerStatus;
  count: number;
  locationKind: 'grid-center';
  precisionLength: number;
  precisionLabel: string;
}

export interface MapPageQsoFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: {
      type: 'Point';
      coordinates: [number, number];
    };
    properties: MapPageQsoFeatureProperties;
  }>;
}

const MAP_QSO_FIELD_PRECISION = 'field center · about 20° × 10°';
const MAP_QSO_SQUARE_PRECISION = 'square center · about 2° × 1°';
const MAP_QSO_SUBSQUARE_PRECISION = 'subsquare center · about 5′ × 2.5′';

/** Standing note under the contact legend. Lists the three cell spans. */
export const MAP_QSO_GRID_CENTER_NOTE =
  `Contacts are plotted at the center of each Maidenhead grid: ${MAP_QSO_FIELD_PRECISION}, ${MAP_QSO_SQUARE_PRECISION}, ${MAP_QSO_SUBSQUARE_PRECISION}.`;

/**
 * Phrase for a popup when the marker sits at a Maidenhead cell center.
 */
export function mapQsoPrecisionLabel(grid: string): string {
  const normalized = normalizeMaidenhead(grid);

  if (!normalized) {
    return '';
  }

  if (normalized.length === 2) {
    return MAP_QSO_FIELD_PRECISION;
  }

  if (normalized.length === 4) {
    return MAP_QSO_SQUARE_PRECISION;
  }

  return MAP_QSO_SUBSQUARE_PRECISION;
}

/**
 * One feature per located grid. QSO rows are not embedded in GeoJSON properties.
 */
export function mapQsoFeatures(qsos: readonly StationLogQso[]): MapPageQsoFeatureCollection {
  const points = stationLogMapPoints(qsos);

  return {
    type: 'FeatureCollection',
    features: points.map((point) => {
      const precisionLength = point.grid.length;

      return geoJsonFeature(
        { latitude: point.latitude, longitude: point.longitude },
        {
          grid: point.grid,
          status: point.status,
          count: point.qsos.length,
          locationKind: 'grid-center',
          precisionLength,
          precisionLabel: mapQsoPrecisionLabel(point.grid),
        },
      );
    }),
  };
}

export function mapQsoUnmappedCount(qsos: readonly StationLogQso[]): number {
  return stationLogUnmappedCount(qsos);
}

export function mapQsoUnmappedMessage(unmapped: number, total: number): string | undefined {
  if (unmapped <= 0 || total <= 0) {
    return undefined;
  }

  if (unmapped === 1) {
    return '1 contact has no grid and is not on the map.';
  }

  return `${unmapped} contacts have no grid and are not on the map.`;
}

export function storedLibraryGroups(groups: readonly ChannelGroup[]): ChannelGroup[] {
  return groups.filter((group) => group.builtin !== true);
}

export function resolveSelectedGroupIds(
  selection: MapPageGroupSelection,
  groups: readonly ChannelGroup[],
): string[] {
  const stored = storedLibraryGroups(groups);

  if (selection === MAP_PAGE_ALL_STORED_GROUPS) {
    return stored.map((group) => group.id);
  }

  const allowed = new Set(stored.map((group) => group.id));

  return selection.filter((groupId) => allowed.has(groupId));
}

/**
 * Located repeaters in the selected stored groups, deduped by channel id.
 */
export function mapRepeaterChannels(
  channels: readonly SavedChannel[],
  memberships: readonly ChannelGroupMembership[],
  groups: readonly ChannelGroup[],
  selection: MapPageGroupSelection,
): SavedChannel[] {
  const selectedGroupIds = resolveSelectedGroupIds(selection, groups);
  const byId = new Map<string, SavedChannel>();

  for (const groupId of selectedGroupIds) {
    for (const channel of channelsInGroup(channels, memberships, groupId)) {
      if (channel.kind !== 'repeater') {
        continue;
      }

      byId.set(String(channel.id), channel);
    }
  }

  return [...byId.values()];
}

export function mapRepeaterFeatures(
  channels: readonly SavedChannel[],
  memberships: readonly ChannelGroupMembership[],
  groups: readonly ChannelGroup[],
  selection: MapPageGroupSelection,
): ChannelMapFeatureCollection {
  return channelMapFeatures(mapRepeaterChannels(channels, memberships, groups, selection) as ChannelMapChannel[]);
}

export function mapRepeaterUnlocatedCount(
  channels: readonly SavedChannel[],
  memberships: readonly ChannelGroupMembership[],
  groups: readonly ChannelGroup[],
  selection: MapPageGroupSelection,
): number {
  return channelMapUnlocatedCount(
    mapRepeaterChannels(channels, memberships, groups, selection) as ChannelMapChannel[],
  );
}

export function mapRepeaterUnlocatedMessage(unlocated: number, total: number): string | undefined {
  if (unlocated <= 0 || total <= 0) {
    return undefined;
  }

  if (unlocated === 1) {
    return `1 of ${total} repeaters has no location.`;
  }

  return `${unlocated} of ${total} repeaters have no location.`;
}

/**
 * Ordinary channels in the selected stored groups, including unlocated rows, deduped by channel id.
 */
export function mapChannelRows(
  channels: readonly SavedChannel[],
  memberships: readonly ChannelGroupMembership[],
  groups: readonly ChannelGroup[],
  selection: MapPageGroupSelection,
): SavedChannel[] {
  const selectedGroupIds = resolveSelectedGroupIds(selection, groups);
  const byId = new Map<string, SavedChannel>();

  for (const groupId of selectedGroupIds) {
    for (const channel of channelsInGroup(channels, memberships, groupId)) {
      if (channel.kind !== 'channel') {
        continue;
      }

      byId.set(String(channel.id), channel);
    }
  }

  return [...byId.values()];
}

export function mapChannelFeatures(
  channels: readonly SavedChannel[],
  memberships: readonly ChannelGroupMembership[],
  groups: readonly ChannelGroup[],
  selection: MapPageGroupSelection,
): ChannelMapFeatureCollection {
  return channelMapFeatures(mapChannelRows(channels, memberships, groups, selection) as ChannelMapChannel[]);
}

export function mapChannelUnlocatedCount(
  channels: readonly SavedChannel[],
  memberships: readonly ChannelGroupMembership[],
  groups: readonly ChannelGroup[],
  selection: MapPageGroupSelection,
): number {
  return channelMapUnlocatedCount(
    mapChannelRows(channels, memberships, groups, selection) as ChannelMapChannel[],
  );
}

export function mapChannelUnlocatedMessage(unlocated: number, total: number): string | undefined {
  if (unlocated <= 0 || total <= 0) {
    return undefined;
  }

  if (unlocated === 1) {
    return `1 of ${total} channels has no location.`;
  }

  return `${unlocated} of ${total} channels have no location.`;
}

export const MAP_TRIP_LINE_CAPTION = 'Straight line through located stops. Not a driven route.';

export const MAP_TRIP_FEATURE_LINE = 'trip-line';
export const MAP_TRIP_FEATURE_STOP = 'trip-stop';

const MAP_TRIP_LINE_COLORS = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#0891b2'] as const;

export interface MapPageTripLineFeatureProperties {
  featureType: typeof MAP_TRIP_FEATURE_LINE;
  groupId: string;
  groupName: string;
  straightLine: true;
  lineColor: string;
}

export interface MapPageTripStopFeatureProperties {
  featureType: typeof MAP_TRIP_FEATURE_STOP;
  groupId: string;
  groupName: string;
  channelId: string;
  stopLabel: string;
  stopCity?: string;
  lineColor: string;
}

export type MapPageTripFeatureProperties = MapPageTripLineFeatureProperties | MapPageTripStopFeatureProperties;

export interface MapPageTripFeatureCollection {
  type: 'FeatureCollection';
  features: Array<
    | {
        type: 'Feature';
        geometry: {
          type: 'LineString';
          coordinates: [number, number][];
        };
        properties: MapPageTripLineFeatureProperties;
      }
    | {
        type: 'Feature';
        geometry: {
          type: 'Point';
          coordinates: [number, number];
        };
        properties: MapPageTripStopFeatureProperties;
      }
  >;
}

export interface MapTripLocatedStop<T = SavedChannel> {
  channel: T;
  coordinate: [number, number];
}

function mapTripStopCoordinateDistance(left: [number, number], right: [number, number]): number {
  return distanceKm(
    { latitude: left[1], longitude: left[0] },
    { latitude: right[1], longitude: right[0] },
  );
}

function mapTripStopPathLength<T extends { coordinate: [number, number] }>(stops: readonly T[]): number {
  let lengthKm = 0;

  for (let index = 1; index < stops.length; index += 1) {
    lengthKm += mapTripStopCoordinateDistance(stops[index - 1].coordinate, stops[index].coordinate);
  }

  return lengthKm;
}

function mapTripNearestNeighborOrder<T extends { coordinate: [number, number] }>(
  stops: readonly T[],
  startIndex: number,
): T[] {
  const remaining = new Set(stops.map((_, index) => index));
  const order: T[] = [];
  let current = startIndex;

  order.push(stops[current]);
  remaining.delete(current);

  while (remaining.size > 0) {
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    const from = stops[current].coordinate;

    for (const index of remaining) {
      const distance = mapTripStopCoordinateDistance(from, stops[index].coordinate);

      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }

    order.push(stops[bestIndex]);
    remaining.delete(bestIndex);
    current = bestIndex;
  }

  return order;
}

function mapTripTwoOptImprove<T extends { coordinate: [number, number] }>(order: readonly T[]): T[] {
  let path = [...order];
  let improved = true;

  while (improved) {
    improved = false;

    for (let index = 0; index < path.length - 2; index += 1) {
      for (let end = index + 2; end < path.length; end += 1) {
        const candidate = [...path.slice(0, index + 1), ...path.slice(index + 1, end + 1).reverse(), ...path.slice(end + 1)];

        if (mapTripStopPathLength(candidate) + 1e-9 < mapTripStopPathLength(path)) {
          path = candidate;
          improved = true;
        }
      }
    }
  }

  return path;
}

function mapTripStopDistanceFromHome<T extends { coordinate: [number, number] }>(stop: T, home: GeoPoint): number {
  return mapTripStopCoordinateDistance([home.longitude, home.latitude], stop.coordinate);
}

/**
 * Chain located trip stops without doubling back: nearest-neighbor from an endpoint (farthest from Home), then 2-opt.
 */
export function orderTripMapStops<T extends { coordinate: [number, number] }>(
  stops: readonly T[],
  home: GeoPoint,
): T[] {
  if (stops.length <= 1) {
    return [...stops];
  }

  let farthestIndex = 0;
  let farthestDistance = -1;

  for (let index = 0; index < stops.length; index += 1) {
    const distance = mapTripStopDistanceFromHome(stops[index], home);

    if (distance > farthestDistance) {
      farthestDistance = distance;
      farthestIndex = index;
    }
  }

  let otherEndpoint = farthestIndex;
  let longestSpan = -1;

  for (let index = 0; index < stops.length; index += 1) {
    const distance = mapTripStopCoordinateDistance(stops[farthestIndex].coordinate, stops[index].coordinate);

    if (distance > longestSpan) {
      longestSpan = distance;
      otherEndpoint = index;
    }
  }

  const startCandidates = new Set([farthestIndex, otherEndpoint]);
  let bestOrder = stops;
  let bestLength = Number.POSITIVE_INFINITY;

  for (const startIndex of startCandidates) {
    const candidate = mapTripTwoOptImprove(mapTripNearestNeighborOrder(stops, startIndex));
    const length = mapTripStopPathLength(candidate);

    if (length < bestLength) {
      bestLength = length;
      bestOrder = candidate;
    }
  }

  return [...bestOrder];
}

export function mapTripStopLabel(channel: SavedChannel): { label: string; city?: string } {
  const label = channel.callsign?.trim() || channel.name?.trim() || 'Channel';
  const city = channel.city?.trim();

  return city ? { label, city } : { label };
}

export function mapTripLineColor(groupId: string): string {
  let hash = 0;

  for (let index = 0; index < groupId.length; index += 1) {
    hash = (hash * 31 + groupId.charCodeAt(index)) >>> 0;
  }

  return MAP_TRIP_LINE_COLORS[hash % MAP_TRIP_LINE_COLORS.length];
}

function mapTripLocatedCoordinate(channel: SavedChannel): [number, number] | undefined {
  const point = coordinatesFromPair(channel.latitude, channel.longitude);

  if (point.latitude === undefined || point.longitude === undefined) {
    return undefined;
  }

  return [point.longitude, point.latitude];
}

export function mapTripHasSelectedTripGroups(
  groups: readonly ChannelGroup[],
  selection: MapPageGroupSelection,
): boolean {
  const selectedIds = new Set(resolveSelectedGroupIds(selection, groups));

  return groups.some((group) => selectedIds.has(group.id) && isTripChannelGroup(group));
}

/**
 * Distance-order start for trip lines: selected station when located, otherwise Home, then the first located station.
 */
export function mapTripDistanceStart(
  stations: readonly RadioStation[],
  selectedStationId?: string,
): GeoPoint | undefined {
  const startId = defaultDistanceStartId(stations, {
    selectedStationId,
    homeStationId: HOME_STATION_ID,
  });

  if (startId === TRIP_START_NONE) {
    return undefined;
  }

  const station = stations.find((entry) => entry.id === startId);

  return station ? stationStartPoint(station) : undefined;
}

export function mapTripNeedsStartMessage(
  stations: readonly RadioStation[],
  groups: readonly ChannelGroup[],
  selection: MapPageGroupSelection,
  selectedStationId?: string,
): string | undefined {
  if (!mapTripHasSelectedTripGroups(groups, selection)) {
    return undefined;
  }

  if (mapTripDistanceStart(stations, selectedStationId)) {
    return undefined;
  }

  return 'A straight-line trip needs a located station under Preferences → Stations.';
}

/**
 * One dashed line per selected trip group with a start point and at least two located members.
 */
export function mapTripFeatures(
  groups: readonly ChannelGroup[],
  channels: readonly SavedChannel[],
  memberships: readonly ChannelGroupMembership[],
  selection: MapPageGroupSelection,
  start: GeoPoint | undefined,
): MapPageTripFeatureCollection {
  if (!start) {
    return { type: 'FeatureCollection', features: [] };
  }

  const selectedIds = new Set(resolveSelectedGroupIds(selection, groups));
  const features: MapPageTripFeatureCollection['features'] = [];

  for (const group of groups) {
    if (!selectedIds.has(group.id) || !isTripChannelGroup(group)) {
      continue;
    }

    const members = channelsInGroup(channels, memberships, group.id);
    const locatedStops: MapTripLocatedStop[] = [];

    for (const channel of members) {
      const coordinate = mapTripLocatedCoordinate(channel);

      if (coordinate) {
        locatedStops.push({ channel, coordinate });
      }
    }

    if (locatedStops.length < 2) {
      continue;
    }

    const orderedStops = orderTripMapStops(locatedStops, start);
    const coordinates = orderedStops.map((stop) => stop.coordinate);
    const lineColor = mapTripLineColor(group.id);

    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates,
      },
      properties: {
        featureType: MAP_TRIP_FEATURE_LINE,
        groupId: group.id,
        groupName: group.name,
        straightLine: true,
        lineColor,
      },
    });

    for (const stop of orderedStops) {
      const { label, city } = mapTripStopLabel(stop.channel);

      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: stop.coordinate,
        },
        properties: {
          featureType: MAP_TRIP_FEATURE_STOP,
          groupId: group.id,
          groupName: group.name,
          channelId: String(stop.channel.id),
          stopLabel: label,
          stopCity: city,
          lineColor,
        },
      });
    }
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}
