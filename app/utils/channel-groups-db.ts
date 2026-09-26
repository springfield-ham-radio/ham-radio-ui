import { RadioChannelId } from '@springfield/ham-radio-api';
import {
  normalizeChannelGroupName,
  validateChannelGroupName,
  type ChannelGroup,
  type ChannelGroupMembership,
} from '~/utils/channel-groups';
import { getSavedChannelsDatabase } from '~/utils/saved-channels-db';

interface ChannelGroupRow {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
}

interface ChannelGroupMemberRow {
  group_id: string;
  channel_id: string;
}

function channelGroupRowToModel(row: ChannelGroupRow): ChannelGroup {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listChannelGroups(): Promise<ChannelGroup[]> {
  const database = await getSavedChannelsDatabase();
  const rows = await database.select<ChannelGroupRow[]>(
    `SELECT id, name, created_at, updated_at
     FROM channel_groups
     ORDER BY name COLLATE NOCASE ASC`,
  );

  return rows.map(channelGroupRowToModel);
}

export async function listChannelGroupMemberships(): Promise<ChannelGroupMembership[]> {
  const database = await getSavedChannelsDatabase();
  const rows = await database.select<ChannelGroupMemberRow[]>(
    'SELECT group_id, channel_id FROM channel_group_members',
  );

  return rows.map((row) => ({
    groupId: row.group_id,
    channelId: RadioChannelId(row.channel_id),
  }));
}

export async function insertChannelGroup(name: string, channelIds: readonly RadioChannelId[]): Promise<ChannelGroup> {
  const groups = await listChannelGroups();
  const error = validateChannelGroupName(name, groups.map((group) => group.name));

  if (error) {
    throw new Error(error);
  }

  const now = Date.now();
  const group: ChannelGroup = {
    id: crypto.randomUUID(),
    name: normalizeChannelGroupName(name),
    createdAt: now,
    updatedAt: now,
  };
  const database = await getSavedChannelsDatabase();

  await database.execute(
    'INSERT INTO channel_groups (id, name, created_at, updated_at) VALUES ($1, $2, $3, $4)',
    [group.id, group.name, group.createdAt, group.updatedAt],
  );
  await addChannelsToGroup(group.id, channelIds);

  return group;
}

export async function addChannelsToGroup(groupId: string, channelIds: readonly RadioChannelId[]): Promise<void> {
  if (channelIds.length === 0) {
    return;
  }

  const database = await getSavedChannelsDatabase();
  const uniqueIds = [...new Set(channelIds)];

  for (const channelId of uniqueIds) {
    await database.execute(
      'INSERT OR IGNORE INTO channel_group_members (group_id, channel_id) VALUES ($1, $2)',
      [groupId, channelId],
    );
  }
}

export async function renameChannelGroup(id: string, name: string): Promise<ChannelGroup> {
  const groups = await listChannelGroups();
  const current = groups.find((group) => group.id === id);

  if (!current) {
    throw new Error('That group no longer exists');
  }

  const error = validateChannelGroupName(
    name,
    groups.filter((group) => group.id !== id).map((group) => group.name),
  );

  if (error) {
    throw new Error(error);
  }

  const renamed: ChannelGroup = {
    ...current,
    name: normalizeChannelGroupName(name),
    updatedAt: Date.now(),
  };
  const database = await getSavedChannelsDatabase();

  await database.execute('UPDATE channel_groups SET name = $1, updated_at = $2 WHERE id = $3', [
    renamed.name,
    renamed.updatedAt,
    renamed.id,
  ]);

  return renamed;
}

export async function deleteChannelGroup(id: string): Promise<void> {
  const database = await getSavedChannelsDatabase();
  await database.execute('DELETE FROM channel_group_members WHERE group_id = $1', [id]);
  await database.execute('DELETE FROM channel_groups WHERE id = $1', [id]);
}
