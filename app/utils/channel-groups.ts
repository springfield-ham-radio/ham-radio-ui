import type { RadioChannelId } from '@springfield/ham-radio-api';

/** Virtual tab that lists every saved channel. Not stored as a group. */
export const ALL_CHANNELS_TAB_ID = 'all';

export const CHANNEL_GROUP_NAME_MAX_LENGTH = 40;

export interface ChannelGroup {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChannelGroupMembership {
  groupId: string;
  channelId: RadioChannelId;
}

export function normalizeChannelGroupName(name: string): string {
  return name.trim().replaceAll(/\s+/g, ' ');
}

/**
 * Returns an error message when a group name cannot be saved.
 */
export function validateChannelGroupName(name: string, existingNames: readonly string[]): string | undefined {
  const normalized = normalizeChannelGroupName(name);

  if (!normalized) {
    return 'Enter a group name';
  }

  if (normalized.toLowerCase() === 'all') {
    return 'All is reserved for every channel';
  }

  if (normalized.length > CHANNEL_GROUP_NAME_MAX_LENGTH) {
    return `Use ${CHANNEL_GROUP_NAME_MAX_LENGTH} characters or fewer`;
  }

  const duplicate = existingNames.some((existing) => existing.toLowerCase() === normalized.toLowerCase());

  if (duplicate) {
    return 'A group with that name already exists';
  }

  return undefined;
}

export function channelsInGroup<T extends { id: RadioChannelId }>(
  channels: readonly T[],
  memberships: readonly ChannelGroupMembership[],
  groupId: string,
): T[] {
  if (groupId === ALL_CHANNELS_TAB_ID) {
    return [...channels];
  }

  const ids = new Set(
    memberships.filter((membership) => membership.groupId === groupId).map((membership) => membership.channelId),
  );

  return channels.filter((channel) => ids.has(channel.id));
}
