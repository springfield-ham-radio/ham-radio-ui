import type {
  RadioChannel,
  RadioMemoryMap,
  RadioProgram,
  RadioProgrammedChannel,
  RadioSettings,
} from '@springfield/ham-radio-api';
import { bandNameForFrequency } from '~/utils/transmit-privileges';
import {
  diffRadioPrograms,
  type WriteReviewChannelKind,
  type WriteReviewFieldChange,
} from '~/utils/radio-write-review';

/** Where the comparison program came from. */
export type PendingComparisonSource = 'radio' | 'loaded';

export interface PendingChannelDiff {
  channelNumber: number;
  kind: WriteReviewChannelKind;
  /**
   * Table column ids whose displayed values differ.
   * Empty for added and cleared rows, and for a slot a channel moved out of.
   */
  changedColumnIds: string[];
  /** True when this slot's channel content moved to or from another slot. */
  moved: boolean;
}

export interface PendingRadioDiff {
  channels: PendingChannelDiff[];
  /** Memory-map setting paths whose values differ. */
  settingsPaths: string[];
}

interface VisibleChannel {
  channelNumber: number;
  radioChannel: RadioChannel;
  settings?: RadioSettings;
}

const CORE_COLUMN_ORDER = ['name', 'bandName', 'transmit', 'receive', 'txTone', 'rxTone', 'toneType'] as const;

export function emptyPendingRadioDiff(): PendingRadioDiff {
  return { channels: [], settingsPaths: [] };
}

/**
 * Channel slots and settings that differ from the session baseline.
 *
 * A slot that is empty in the baseline and filled now is added. A slot that is
 * filled in the baseline and empty now is cleared. Any other field difference is
 * changed. When the same channel content leaves one slot and arrives in another,
 * both slots are changed.
 */
export function diffPendingRadioState(
  before: RadioProgram | undefined,
  after: RadioProgram,
  memoryMap?: RadioMemoryMap,
): PendingRadioDiff {
  const preliminary = diffRadioPrograms(before, after, memoryMap);
  const beforeChannels = visibleChannels(before);
  const afterChannels = visibleChannels(after);
  const movedSlots = movedChannelSlots(beforeChannels, afterChannels);
  const channels: PendingChannelDiff[] = [];

  for (const entry of preliminary.channels) {
    const previous = beforeChannels.get(entry.channelNumber);
    const next = afterChannels.get(entry.channelNumber);
    const moved = movedSlots.has(entry.channelNumber);
    const kind: WriteReviewChannelKind =
      moved && (entry.kind === 'added' || entry.kind === 'cleared') ? 'changed' : entry.kind;
    const highlight = kind === 'changed' && next !== undefined;

    channels.push({
      channelNumber: entry.channelNumber,
      kind,
      moved,
      changedColumnIds: highlight ? changedColumnIds(entry.fields, previous, next) : [],
    });
  }

  return {
    channels,
    settingsPaths: preliminary.settingsGroups.flatMap((group) => group.fields.map((field) => field.id)),
  };
}

export function pendingChangeCount(diff: PendingRadioDiff): number {
  return diff.channels.length + diff.settingsPaths.length;
}

/**
 * Short sentence for the badge next to Write.
 * `source` is the radio image when this session has one, otherwise the loaded memory.
 */
export function summarizePendingChanges(diff: PendingRadioDiff, source: PendingComparisonSource): string {
  const channels = diff.channels.length;
  const settings = diff.settingsPaths.length;
  const target = source === 'radio' ? 'the radio' : 'the loaded memory';

  if (channels > 0 && settings === 0) {
    return `${channels} ${channels === 1 ? 'channel differs' : 'channels differ'} from ${target}.`;
  }

  if (settings > 0 && channels === 0) {
    return `${settings} ${settings === 1 ? 'setting differs' : 'settings differ'} from ${target}.`;
  }

  if (channels === 0 && settings === 0) {
    return '';
  }

  const channelLabel = `${channels} ${channels === 1 ? 'channel' : 'channels'}`;
  const settingLabel = `${settings} ${settings === 1 ? 'setting' : 'settings'}`;
  return `${channelLabel} and ${settingLabel} differ from ${target}.`;
}

function movedChannelSlots(before: Map<number, VisibleChannel>, after: Map<number, VisibleChannel>): Set<number> {
  const departed: { slot: number; fingerprint: string }[] = [];
  const arrived: { slot: number; fingerprint: string }[] = [];
  const slots = [...new Set([...before.keys(), ...after.keys()])].sort((left, right) => left - right);

  for (const slot of slots) {
    const previous = before.get(slot);
    const next = after.get(slot);
    const previousFingerprint = previous ? channelFingerprint(previous) : undefined;
    const nextFingerprint = next ? channelFingerprint(next) : undefined;

    if (previousFingerprint && previousFingerprint !== nextFingerprint) {
      departed.push({ slot, fingerprint: previousFingerprint });
    }

    if (nextFingerprint && previousFingerprint !== nextFingerprint) {
      arrived.push({ slot, fingerprint: nextFingerprint });
    }
  }

  const moved = new Set<number>();
  const usedArrived = new Set<number>();

  for (const left of departed) {
    const match = arrived.find(
      (entry) => entry.fingerprint === left.fingerprint && entry.slot !== left.slot && !usedArrived.has(entry.slot),
    );

    if (!match) {
      continue;
    }

    usedArrived.add(match.slot);
    moved.add(left.slot);
    moved.add(match.slot);
  }

  return moved;
}

function changedColumnIds(
  fields: WriteReviewFieldChange[],
  before: VisibleChannel | undefined,
  after: VisibleChannel | undefined,
): string[] {
  const ids = new Set<string>();

  for (const field of fields) {
    if (field.id === 'name') {
      ids.add('name');
    } else if (field.id === 'frequency') {
      ids.add('receive');
    } else if (field.id === 'receiveTone') {
      ids.add('rxTone');
    } else if (field.id === 'transmitTone') {
      ids.add('txTone');

      if (toneFamily(field.before) !== toneFamily(field.after)) {
        ids.add('toneType');
      }
    } else if (field.id.startsWith('channel.')) {
      ids.add(field.id.slice('channel.'.length));
    }
  }

  const beforeTransmit = before?.radioChannel.transmitFrequency;
  const afterTransmit = after?.radioChannel.transmitFrequency;

  if (beforeTransmit !== afterTransmit) {
    ids.add('transmit');
  }

  if (bandNameForFrequency(beforeTransmit) !== bandNameForFrequency(afterTransmit)) {
    ids.add('bandName');
  }

  const extras: string[] = [];

  for (const field of fields) {
    if (!field.id.startsWith('channel.')) {
      continue;
    }

    const columnId = field.id.slice('channel.'.length);

    if (ids.has(columnId) && !CORE_COLUMN_ORDER.includes(columnId as (typeof CORE_COLUMN_ORDER)[number])) {
      extras.push(columnId);
    }
  }

  return [...CORE_COLUMN_ORDER.filter((columnId) => ids.has(columnId)), ...extras];
}

function channelFingerprint(channel: VisibleChannel): string {
  return JSON.stringify({
    name: channel.radioChannel.name ?? '',
    receiveFrequency: channel.radioChannel.receiveFrequency,
    transmitFrequency: channel.radioChannel.transmitFrequency,
    receiveTone: channel.radioChannel.receiveTone ?? null,
    transmitTone: channel.radioChannel.transmitTone ?? null,
    settings: normalizeValue(channel.settings ?? null),
  });
}

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeValue(entry));
  }

  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};

    for (const key of Object.keys(record).sort()) {
      sorted[key] = normalizeValue(record[key]);
    }

    return sorted;
  }

  return value ?? null;
}

function toneFamily(value: string): string {
  if (value.startsWith('CTCSS')) {
    return 'CTCSS';
  }

  if (value.startsWith('DCS')) {
    return 'DCS';
  }

  return '';
}

function visibleChannels(program: RadioProgram | undefined): Map<number, VisibleChannel> {
  const channels = new Map<number, VisibleChannel>();

  for (const channel of program?.channels ?? []) {
    const visible = asVisibleChannel(channel);

    if (visible) {
      channels.set(visible.channelNumber, visible);
    }
  }

  return channels;
}

function asVisibleChannel(channel: RadioProgrammedChannel): VisibleChannel | undefined {
  if (typeof channel.radioChannel === 'string') {
    return undefined;
  }

  return {
    channelNumber: channel.channelNumber,
    radioChannel: channel.radioChannel,
    settings: channel.settings,
  };
}
