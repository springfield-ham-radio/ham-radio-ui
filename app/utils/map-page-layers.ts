import {
  channelMapFeatures,
  channelMapUnlocatedCount,
  type ChannelMapChannel,
  type ChannelMapFeatureCollection,
} from '~/utils/channel-map';
import { channelsInGroup, type ChannelGroup, type ChannelGroupMembership } from '~/utils/channel-groups';
import { MAP_PAGE_ALL_STORED_GROUPS, type MapPageGroupSelection } from '~/utils/map-page-settings';
import type { SavedChannel } from '~/utils/saved-channels-db';

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
