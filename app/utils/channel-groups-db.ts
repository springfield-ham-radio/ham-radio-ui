import { RadioChannelId } from '@springfield/ham-radio-api';
import {
  channelGroupKindFromDb,
  normalizeChannelGroupName,
  validateChannelGroupName,
  type ChannelGroup,
  type ChannelGroupKind,
  type ChannelGroupMembership,
} from '~/utils/channel-groups';
import { getSavedChannelsDatabase } from '~/utils/saved-channels-db';

interface ChannelGroupRow {
  id: string;
  name: string;
  kind: string | null;
  pack_id: string | null;
  description: string | null;
  author: string | null;
  pack_version: string | null;
  pack_updated: string | null;
  pack_source_url: string | null;
  created_at: number;
  updated_at: number;
}

interface ChannelGroupMemberRow {
  group_id: string;
  channel_id: string;
}

export interface ChannelGroupPackFields {
  packId?: string;
  description?: string;
  author?: string;
  packVersion?: string;
  packUpdated?: string;
  packSourceUrl?: string;
}

function textFromDb(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function channelGroupRowToModel(row: ChannelGroupRow): ChannelGroup {
  const kind = channelGroupKindFromDb(row.kind);

  return {
    id: row.id,
    name: row.name,
    kind,
    icon: kind === 'trip' ? 'i-lucide-route' : undefined,
    packId: textFromDb(row.pack_id),
    description: textFromDb(row.description),
    author: textFromDb(row.author),
    packVersion: textFromDb(row.pack_version),
    packUpdated: textFromDb(row.pack_updated),
    packSourceUrl: textFromDb(row.pack_source_url),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listChannelGroups(): Promise<ChannelGroup[]> {
  const database = await getSavedChannelsDatabase();
  const rows = await database.select<ChannelGroupRow[]>(
    `SELECT id, name, kind, pack_id, description, author, pack_version, pack_updated, pack_source_url,
            created_at, updated_at
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

export async function insertChannelGroup(
  name: string,
  channelIds: readonly RadioChannelId[],
  kind: ChannelGroupKind = 'group',
  pack?: ChannelGroupPackFields,
): Promise<ChannelGroup> {
  const groups = await listChannelGroups();
  const error = validateChannelGroupName(name, groups.map((group) => group.name));

  if (error) {
    throw new Error(error);
  }

  const now = Date.now();
  const group: ChannelGroup = {
    id: crypto.randomUUID(),
    name: normalizeChannelGroupName(name),
    kind,
    icon: kind === 'trip' ? 'i-lucide-route' : undefined,
    packId: pack?.packId,
    description: pack?.description,
    author: pack?.author,
    packVersion: pack?.packVersion,
    packUpdated: pack?.packUpdated,
    packSourceUrl: pack?.packSourceUrl,
    createdAt: now,
    updatedAt: now,
  };
  const database = await getSavedChannelsDatabase();

  await database.execute(
    `INSERT INTO channel_groups (
       id, name, kind, pack_id, description, author, pack_version, pack_updated, pack_source_url,
       created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      group.id,
      group.name,
      kind,
      group.packId ?? null,
      group.description ?? null,
      group.author ?? null,
      group.packVersion ?? null,
      group.packUpdated ?? null,
      group.packSourceUrl ?? null,
      group.createdAt,
      group.updatedAt,
    ],
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

export async function replaceChannelGroupMembers(
  groupId: string,
  channelIds: readonly RadioChannelId[],
): Promise<void> {
  const database = await getSavedChannelsDatabase();
  await database.execute('DELETE FROM channel_group_members WHERE group_id = $1', [groupId]);
  await addChannelsToGroup(groupId, channelIds);
}

export async function updateChannelGroupPackFields(
  id: string,
  fields: ChannelGroupPackFields & { name?: string },
): Promise<ChannelGroup> {
  const groups = await listChannelGroups();
  const current = groups.find((group) => group.id === id);

  if (!current) {
    throw new Error('That group no longer exists');
  }

  const nextName = fields.name ? normalizeChannelGroupName(fields.name) : current.name;

  if (fields.name) {
    const error = validateChannelGroupName(
      nextName,
      groups.filter((group) => group.id !== id).map((group) => group.name),
    );

    if (error) {
      throw new Error(error);
    }
  }

  const updated: ChannelGroup = {
    ...current,
    name: nextName,
    packId: fields.packId ?? current.packId,
    description: fields.description ?? current.description,
    author: fields.author ?? current.author,
    packVersion: fields.packVersion ?? current.packVersion,
    packUpdated: fields.packUpdated ?? current.packUpdated,
    packSourceUrl: fields.packSourceUrl ?? current.packSourceUrl,
    updatedAt: Date.now(),
  };
  const database = await getSavedChannelsDatabase();

  await database.execute(
    `UPDATE channel_groups SET
       name = $1,
       pack_id = $2,
       description = $3,
       author = $4,
       pack_version = $5,
       pack_updated = $6,
       pack_source_url = $7,
       updated_at = $8
     WHERE id = $9`,
    [
      updated.name,
      updated.packId ?? null,
      updated.description ?? null,
      updated.author ?? null,
      updated.packVersion ?? null,
      updated.packUpdated ?? null,
      updated.packSourceUrl ?? null,
      updated.updatedAt,
      updated.id,
    ],
  );

  return updated;
}

export async function renameChannelGroup(id: string, name: string): Promise<ChannelGroup> {
  return updateChannelGroupPackFields(id, { name });
}

export async function deleteChannelGroup(id: string): Promise<void> {
  const database = await getSavedChannelsDatabase();
  await database.execute('DELETE FROM channel_group_members WHERE group_id = $1', [id]);
  await database.execute('DELETE FROM channel_groups WHERE id = $1', [id]);
}
