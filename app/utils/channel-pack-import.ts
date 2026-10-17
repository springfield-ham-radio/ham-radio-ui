import { RadioChannelId, RadioToneType, type RadioTone } from '@springfield/ham-radio-api';
import { normalizeChannelGroupName, validateChannelGroupName, type ChannelGroupMembership } from '~/utils/channel-groups';
import type { ChannelPackDocument, SavedChannelWithPackId } from '~/utils/channel-pack';
import { packChannelsToSavedChannels } from '~/utils/channel-pack';
import { linkedNodesEqual } from '~/utils/linked-nodes';
import type { SavedChannel } from '~/utils/saved-channels-db';

export type ChannelPackDiffKind = 'add' | 'change' | 'remove';

export interface ChannelPackDiffEntry {
  kind: ChannelPackDiffKind;
  packChannelId?: string;
  channelId?: RadioChannelId;
  label: string;
  summary?: string;
}

export interface ChannelPackImportPlan {
  insert: SavedChannelWithPackId[];
  update: SavedChannelWithPackId[];
  removeFromGroup: RadioChannelId[];
  deleteOrphans: RadioChannelId[];
  memberIds: RadioChannelId[];
  added: number;
  changed: number;
  removed: number;
  diff: ChannelPackDiffEntry[];
}

export interface ChannelPackGroupCandidate {
  id: string;
  name: string;
  packId?: string;
  builtin?: boolean;
}

export type ChannelPackGroupResolution =
  | { action: 'update'; groupId: string }
  | { action: 'create' }
  | { action: 'blocked'; reason: string };

/**
 * Pick the library group a pack updates.
 *
 * Match the stored pack id first. Otherwise adopt a same-name group that is not
 * already a different pack. A name collision, a reserved name, or a built-in
 * group blocks apply.
 */
export function resolveChannelPackGroup(
  pack: Pick<ChannelPackDocument, 'id' | 'name'>,
  groups: readonly ChannelPackGroupCandidate[],
): ChannelPackGroupResolution {
  const stored = groups.filter((group) => !group.builtin);
  const byPack = stored.find((group) => group.packId === pack.id);

  if (byPack) {
    const nameError = groupNameError(pack.name, groups, byPack.id);

    if (nameError) {
      return { action: 'blocked', reason: nameError };
    }

    return { action: 'update', groupId: byPack.id };
  }

  const normalized = normalizeChannelGroupName(pack.name).toLowerCase();
  const byName = stored.find((group) => normalizeChannelGroupName(group.name).toLowerCase() === normalized);

  if (byName) {
    if (byName.packId && byName.packId !== pack.id) {
      return { action: 'blocked', reason: 'That group already belongs to a different channel pack' };
    }

    return { action: 'update', groupId: byName.id };
  }

  const nameError = groupNameError(pack.name, groups);

  if (nameError) {
    return { action: 'blocked', reason: nameError };
  }

  return { action: 'create' };
}

function groupNameError(
  name: string,
  groups: readonly ChannelPackGroupCandidate[],
  exceptId?: string,
): string | undefined {
  const existingNames = groups.filter((group) => group.id !== exceptId).map((group) => group.name);
  return validateChannelGroupName(name, existingNames);
}

export interface ChannelPackImportContext {
  groupId: string;
  /** Channels currently in the target group (with optional pack slugs). */
  groupChannels: readonly SavedChannelWithPackId[];
  /** Full library for source-key matching outside the group. */
  libraryChannels: readonly SavedChannelWithPackId[];
  memberships: readonly ChannelGroupMembership[];
}

/**
 * Plan how a channel pack updates a library group.
 *
 * Match pack rows by pack channel id, then by source key. Do not fall back to the
 * legacy frequency key. Pack apply overwrites name and notes. Rows missing from
 * the pack leave the group; library rows are deleted only when no other group
 * still references them.
 */
export function planChannelPackImport(
  pack: ChannelPackDocument,
  context: ChannelPackImportContext,
): ChannelPackImportPlan {
  const incoming = packChannelsToSavedChannels(pack.channels);
  const byPackId = new Map<string, SavedChannelWithPackId>();
  const bySourceKey = new Map<string, SavedChannelWithPackId>();

  const indexChannel = (channel: SavedChannelWithPackId): void => {
    if (channel.packChannelId && !byPackId.has(channel.packChannelId)) {
      byPackId.set(channel.packChannelId, channel);
    }

    if (channel.sourceKey && !bySourceKey.has(channel.sourceKey)) {
      bySourceKey.set(channel.sourceKey, channel);
    }
  };

  for (const channel of context.libraryChannels) {
    indexChannel(channel);
  }

  for (const channel of context.groupChannels) {
    indexChannel(channel);
  }

  const unindex = (channel: SavedChannelWithPackId): void => {
    if (channel.packChannelId && byPackId.get(channel.packChannelId)?.id === channel.id) {
      byPackId.delete(channel.packChannelId);
    }

    if (channel.sourceKey && bySourceKey.get(channel.sourceKey)?.id === channel.id) {
      bySourceKey.delete(channel.sourceKey);
    }
  };

  const insert: SavedChannelWithPackId[] = [];
  const update: SavedChannelWithPackId[] = [];
  const memberIds: RadioChannelId[] = [];
  const diff: ChannelPackDiffEntry[] = [];

  for (const model of incoming) {
    const match =
      (model.packChannelId ? byPackId.get(model.packChannelId) : undefined) ??
      (model.sourceKey ? bySourceKey.get(model.sourceKey) : undefined);

    if (!match) {
      insert.push(model);
      memberIds.push(model.id);
      diff.push({
        kind: 'add',
        packChannelId: model.packChannelId,
        channelId: model.id,
        label: channelLabel(model),
      });
      continue;
    }

    unindex(match);
    const merged = mergePackChannel(match, model);
    memberIds.push(merged.id);

    if (packChannelsEqual(merged, match)) {
      continue;
    }

    update.push(merged);
    diff.push({
      kind: 'change',
      packChannelId: model.packChannelId,
      channelId: merged.id,
      label: channelLabel(merged),
      summary: summarizePackChange(match, merged),
    });
  }

  const memberIdSet = new Set(memberIds.map((id) => String(id)));
  const removeFromGroup = context.groupChannels
    .filter((channel) => !memberIdSet.has(String(channel.id)))
    .map((channel) => channel.id);

  for (const channel of context.groupChannels) {
    if (memberIdSet.has(String(channel.id))) {
      continue;
    }

    diff.push({
      kind: 'remove',
      packChannelId: channel.packChannelId,
      channelId: channel.id,
      label: channelLabel(channel),
      summary: 'Removed from this group',
    });
  }

  const deleteOrphans = removeFromGroup.filter((channelId) =>
    isOrphanAfterRemoval(channelId, context.memberships, context.groupId),
  );

  const uniqueMemberIds = [...new Set(memberIds.map((id) => String(id)))].map((id) => RadioChannelId(id));

  return {
    insert,
    update,
    removeFromGroup,
    deleteOrphans,
    memberIds: uniqueMemberIds,
    added: insert.length,
    changed: update.length,
    removed: removeFromGroup.length,
    diff,
  };
}

function mergePackChannel(match: SavedChannelWithPackId, model: SavedChannelWithPackId): SavedChannelWithPackId {
  return {
    ...match,
    ...model,
    id: match.id,
    packChannelId: model.packChannelId ?? match.packChannelId,
    lastUpdate: model.lastUpdate ?? match.lastUpdate,
    createdAt: match.createdAt,
    updatedAt: Date.now(),
  };
}

function isOrphanAfterRemoval(
  channelId: RadioChannelId,
  memberships: readonly ChannelGroupMembership[],
  groupId: string,
): boolean {
  const otherGroups = memberships.filter(
    (membership) => membership.channelId === channelId && membership.groupId !== groupId,
  );

  return otherGroups.length === 0;
}

function channelLabel(channel: Pick<SavedChannel, 'name' | 'callsign'>): string {
  return (channel.callsign || channel.name || 'Channel').trim();
}

function summarizePackChange(before: SavedChannelWithPackId, after: SavedChannelWithPackId): string {
  const parts: string[] = [];

  if (before.name !== after.name) {
    parts.push(`name ${quote(before.name)} → ${quote(after.name)}`);
  }

  if (before.notes !== after.notes) {
    parts.push('notes updated');
  }

  if (before.transmitFrequency !== after.transmitFrequency || before.receiveFrequency !== after.receiveFrequency) {
    parts.push('frequencies updated');
  }

  const txSummary = toneChangeSummary(before.transmitTone, after.transmitTone);

  if (txSummary) {
    parts.push(`TX tone ${txSummary}`);
  }

  const rxSummary = toneChangeSummary(before.receiveTone, after.receiveTone);

  if (rxSummary) {
    parts.push(`RX tone ${rxSummary}`);
  }

  return parts.join('; ') || 'Updated';
}

function toneChangeSummary(before: RadioTone, after: RadioTone): string | undefined {
  if (tonesEqual(before, after)) {
    return undefined;
  }

  return `${formatTone(before)} → ${formatTone(after)}`;
}

function formatTone(tone: RadioTone): string {
  if (!tone.tone) {
    return 'none';
  }

  if (tone.type === RadioToneType.DCS) {
    return `DCS ${tone.tone}`;
  }

  return `${(tone.tone / 10).toFixed(1)} Hz`;
}

function quote(value: string | undefined): string {
  const text = value?.trim() || '—';
  return `"${text}"`;
}

function tonesEqual(left: RadioTone, right: RadioTone): boolean {
  return left.tone === right.tone && left.type === right.type;
}

function packChannelsEqual(left: SavedChannelWithPackId, right: SavedChannelWithPackId): boolean {
  return (
    left.packChannelId === right.packChannelId &&
    left.name === right.name &&
    left.notes === right.notes &&
    left.kind === right.kind &&
    left.callsign === right.callsign &&
    left.transmitFrequency === right.transmitFrequency &&
    left.receiveFrequency === right.receiveFrequency &&
    tonesEqual(left.transmitTone, right.transmitTone) &&
    tonesEqual(left.receiveTone, right.receiveTone) &&
    left.use === right.use &&
    left.onAir === right.onAir &&
    left.latitude === right.latitude &&
    left.longitude === right.longitude &&
    left.sourceKey === right.sourceKey &&
    left.sourceFormat === right.sourceFormat &&
    left.city === right.city &&
    left.county === right.county &&
    left.state === right.state &&
    left.country === right.country &&
    left.landmark === right.landmark &&
    left.modes === right.modes &&
    linkedNodesEqual(left, right)
  );
}
