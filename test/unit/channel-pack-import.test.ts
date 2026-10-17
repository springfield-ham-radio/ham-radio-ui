import { describe, expect, it } from 'vitest';
import { RadioChannelId, RadioToneType } from '@springfield/ham-radio-api';
import {
  buildChannelPackDocument,
  parseChannelPack,
  serializeChannelPack,
  type ChannelPackDocument,
  type SavedChannelWithPackId,
} from '~/utils/channel-pack';
import { planChannelPackImport, resolveChannelPackGroup } from '~/utils/channel-pack-import';
import type { ChannelGroupMembership } from '~/utils/channel-groups';
import { radioChannelToSavedChannel } from '~/utils/saved-channels-db';

const groupId = 'group-ares';
const packMeta = {
  id: '8f1c0b2e-7a4d-4c1e-9b6a-1d2e3f4a5b6c',
  name: 'ARES',
  version: '1.0.0',
  updated: '2026-10-17T18:00:00.000Z',
};

function saved(
  id: string,
  options: {
    packChannelId?: string;
    name?: string;
    notes?: string;
    sourceKey?: string;
    tx?: number;
    rx?: number;
    txTone?: number;
    kind?: 'channel' | 'repeater';
  } = {},
): SavedChannelWithPackId {
  return {
    ...radioChannelToSavedChannel(
      {
        name: options.name ?? 'Channel',
        transmitFrequency: options.tx ?? 146_520_000,
        receiveFrequency: options.rx ?? 146_520_000,
        transmitTone: { tone: options.txTone ?? 0, type: RadioToneType.CTCSS },
        receiveTone: { tone: 0, type: RadioToneType.CTCSS },
      },
      { id: RadioChannelId(id), kind: options.kind ?? 'channel', notes: options.notes },
    ),
    packChannelId: options.packChannelId,
    sourceKey: options.sourceKey,
  };
}

function planForPack(pack: ChannelPackDocument, groupChannels: SavedChannelWithPackId[], library: SavedChannelWithPackId[], memberships: ChannelGroupMembership[]) {
  return planChannelPackImport(pack, {
    groupId,
    groupChannels,
    libraryChannels: library,
    memberships,
  });
}

describe('planChannelPackImport', () => {
  it('adds new rows and overwrites name and notes on match', () => {
    const existing = saved('ch-1', {
      packChannelId: 'monday-net',
      name: 'Old name',
      notes: 'Old notes',
    });
    const pack = buildChannelPackDocument(packMeta, [
      {
        ...existing,
        name: 'Monday Net',
        notes: 'Net starts 19:30',
      },
      saved('ch-new', { packChannelId: 'tuesday-net', name: 'Tuesday Net' }),
    ]);

    const plan = planForPack(pack, [existing], [existing], [{ groupId, channelId: existing.id }]);

    expect(plan.added).toBe(1);
    expect(plan.changed).toBe(1);
    expect(plan.update[0]?.name).toBe('Monday Net');
    expect(plan.update[0]?.notes).toBe('Net starts 19:30');
    expect(plan.memberIds).toHaveLength(2);
  });

  it('matches by source key when pack channel id is new', () => {
    const existing = saved('ch-rb', {
      sourceKey: 'rb:48:99',
      kind: 'repeater',
      name: 'KA',
      tx: 146_340_000,
      rx: 146_940_000,
      txTone: 1035,
    });
    const pack = parseChannelPack(
      serializeChannelPack(
        buildChannelPackDocument(packMeta, [
          {
            ...existing,
            packChannelId: 'w5ka',
            name: 'W5KA',
            transmitTone: { tone: 1109, type: RadioToneType.CTCSS },
          },
        ]),
      ),
    );

    const plan = planForPack(pack, [existing], [existing], [{ groupId, channelId: existing.id }]);
    expect(plan.changed).toBe(1);
    expect(plan.update[0]?.name).toBe('W5KA');
    expect(plan.update[0]?.transmitTone.tone).toBe(1109);
    expect(plan.diff.some((entry) => entry.summary?.includes('TX tone'))).toBe(true);
  });

  it('removes group members missing from the pack and deletes orphans only', () => {
    const kept = saved('ch-kept', { packChannelId: 'keep' });
    const dropped = saved('ch-drop', { packChannelId: 'drop', name: 'Old Simplex' });
    const otherGroupMember = saved('ch-shared', { packChannelId: 'shared', name: 'Shared' });
    const pack = buildChannelPackDocument(packMeta, [kept]);
    const memberships: ChannelGroupMembership[] = [
      { groupId, channelId: kept.id },
      { groupId, channelId: dropped.id },
      { groupId, channelId: otherGroupMember.id },
      { groupId: 'other-group', channelId: otherGroupMember.id },
    ];

    const plan = planForPack(
      pack,
      [kept, dropped, otherGroupMember],
      [kept, dropped, otherGroupMember],
      memberships,
    );

    expect(plan.removed).toBe(2);
    expect(plan.removeFromGroup.map(String)).toEqual([String(dropped.id), String(otherGroupMember.id)]);
    expect(plan.deleteOrphans.map(String)).toEqual([String(dropped.id)]);
    expect(plan.diff.filter((entry) => entry.kind === 'remove')).toHaveLength(2);
  });

  it('pulls in a library row that matches outside the group', () => {
    const outsider = saved('ch-out', { packChannelId: 'outside', name: 'Outside' });
    const pack = buildChannelPackDocument(packMeta, [outsider]);
    const plan = planForPack(pack, [], [outsider], []);

    expect(plan.added).toBe(0);
    expect(plan.changed).toBe(0);
    expect(plan.memberIds).toEqual([outsider.id]);
  });

  it('does not match a row by frequency when pack id and source key differ', () => {
    const existing = saved('ch-1', { name: 'Net', tx: 146_520_000, rx: 146_520_000 });
    const incoming = saved('ch-2', { packChannelId: 'other', name: 'Net', tx: 146_520_000, rx: 146_520_000 });
    const pack = buildChannelPackDocument(packMeta, [incoming]);
    const plan = planForPack(pack, [existing], [existing], [{ groupId, channelId: existing.id }]);

    expect(plan.added).toBe(1);
    expect(plan.changed).toBe(0);
    expect(plan.removed).toBe(1);
    expect(plan.deleteOrphans.map(String)).toEqual([String(existing.id)]);
  });

  it('uses a library row only once when a later pack row repeats its source key', () => {
    const existing = saved('ch-rb', { sourceKey: 'rb:48:1', kind: 'repeater', name: 'KA' });
    const first = saved('ch-a', { packChannelId: 'first', sourceKey: 'rb:48:1', kind: 'repeater', name: 'KA' });
    const second = saved('ch-b', { packChannelId: 'second', sourceKey: 'rb:48:1', kind: 'repeater', name: 'Other' });
    const pack = buildChannelPackDocument(packMeta, [first, second]);
    const plan = planForPack(pack, [existing], [existing], [{ groupId, channelId: existing.id }]);

    expect(plan.changed).toBe(1);
    expect(plan.added).toBe(1);
    expect(plan.update[0]?.id).toBe(existing.id);
  });
});

describe('resolveChannelPackGroup', () => {
  const pack = { id: '8f1c0b2e-7a4d-4c1e-9b6a-1d2e3f4a5b6c', name: 'ARES Weekly Net' };

  it('updates the group with the same pack id', () => {
    const resolution = resolveChannelPackGroup(pack, [
      { id: 'other', name: 'Club', packId: 'different' },
      { id: 'ares', name: 'Old name', packId: pack.id },
    ]);
    expect(resolution).toEqual({ action: 'update', groupId: 'ares' });
  });

  it('adopts a same-name group that has no pack id', () => {
    const resolution = resolveChannelPackGroup(pack, [{ id: 'ares', name: 'ares weekly net' }]);
    expect(resolution).toEqual({ action: 'update', groupId: 'ares' });
  });

  it('blocks a name owned by a different pack, reserved names, and long names', () => {
    expect(
      resolveChannelPackGroup(pack, [{ id: 'ares', name: 'ARES Weekly Net', packId: 'other-pack' }]).action,
    ).toBe('blocked');
    expect(resolveChannelPackGroup({ ...pack, name: 'Weather' }, []).action).toBe('blocked');
    expect(resolveChannelPackGroup({ ...pack, name: 'All' }, []).action).toBe('blocked');
    expect(resolveChannelPackGroup({ ...pack, name: 'N'.repeat(41) }, []).action).toBe('blocked');
  });

  it('blocks renaming onto another group and creates when the name is free', () => {
    const collision = resolveChannelPackGroup(pack, [
      { id: 'ares', name: 'Old', packId: pack.id },
      { id: 'club', name: 'ARES Weekly Net' },
    ]);
    expect(collision.action).toBe('blocked');
    expect(resolveChannelPackGroup(pack, [{ id: 'club', name: 'Other' }])).toEqual({ action: 'create' });
  });
});
