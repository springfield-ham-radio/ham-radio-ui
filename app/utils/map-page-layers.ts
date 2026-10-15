import {
  channelMapFeatures,
  channelMapUnlocatedCount,
  type ChannelMapChannel,
  type ChannelMapFeatureCollection,
} from '~/utils/channel-map';
import { channelsInGroup, type ChannelGroup, type ChannelGroupMembership } from '~/utils/channel-groups';
import { geoJsonFeature } from '~/utils/location-format';
import { normalizeMaidenhead } from '~/utils/maidenhead';
import { MAP_PAGE_ALL_STORED_GROUPS, type MapPageGroupSelection } from '~/utils/map-page-settings';
import type { SavedChannel } from '~/utils/saved-channels-db';
import {
  stationLogMapPoints,
  stationLogUnmappedCount,
  type QslMarkerStatus,
} from '~/utils/station-log-map';
import type { StationLogQso } from '~/utils/station-log-db';

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
