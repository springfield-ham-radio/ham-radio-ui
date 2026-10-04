import type {
  RadioChannel,
  RadioMemoryMap,
  RadioProgram,
  RadioProgrammedChannel,
  RadioSettings,
  RadioSettingValue,
  RadioTone,
} from '@springfield/ham-radio-api';
import { RadioToneType } from '@springfield/ham-radio-api';
import {
  collectChannelMemoryMapUiFields,
  formatMemoryMapFieldValue,
  type RadioMemoryMapUiField,
} from '@springfield/ham-radio-utils';
import { duplexFromFrequencies, formatFrequencyMHz } from '~/utils/channel-edit';
import { collectMemoryMapUiGroups } from '~/utils/settings-groups';
import { getSettingAtPath } from '~/utils/settings-path';

/** Shown through the frequency, offset, and tone rows, or filled in by the codec. */
const SUMMARIZED_CHANNEL_FIELD_IDS = new Set([
  'band',
  'cross_mode',
  'ctcss_mode',
  'dtcs_code',
  'dtcs_mode',
  'duplex',
  'offset',
  'split',
  'tone_mode',
  'used',
  'isuhf',
]);

const EMPTY_VALUE = '—';

export interface WriteReviewFieldChange {
  id: string;
  label: string;
  before: string;
  after: string;
}

export type WriteReviewChannelKind = 'added' | 'cleared' | 'changed';

export interface WriteReviewChannel {
  channelNumber: number;
  kind: WriteReviewChannelKind;
  /** Name that will be on the radio after the write, or the name being cleared. */
  name: string;
  fields: WriteReviewFieldChange[];
}

export interface WriteReviewSettingsGroup {
  id: string;
  label: string;
  fields: WriteReviewFieldChange[];
}

export interface WriteReviewDiff {
  channels: WriteReviewChannel[];
  settingsGroups: WriteReviewSettingsGroup[];
}

interface VisibleChannel {
  channelNumber: number;
  radioChannel: RadioChannel;
  settings?: RadioSettings;
}

interface ReviewField {
  id: string;
  label: string;
  value: string;
}

/**
 * Channel and settings differences between the image on the radio and the image about to be written.
 * `before` is the decoded radio image. Slots present only in `after` are added; slots missing from `after` are cleared.
 */
export function diffRadioPrograms(
  before: RadioProgram | undefined,
  after: RadioProgram,
  memoryMap?: RadioMemoryMap,
): WriteReviewDiff {
  const extras = memoryMap ? collectChannelMemoryMapUiFields(memoryMap) : [];
  const beforeChannels = visibleChannels(before);
  const afterChannels = visibleChannels(after);
  const numbers = [...new Set([...beforeChannels.keys(), ...afterChannels.keys()])].sort((left, right) => left - right);
  const channels: WriteReviewChannel[] = [];

  for (const channelNumber of numbers) {
    const previous = beforeChannels.get(channelNumber);
    const next = afterChannels.get(channelNumber);
    const change = diffChannel(channelNumber, previous, next, extras);

    if (change) {
      channels.push(change);
    }
  }

  return {
    channels,
    settingsGroups: diffSettings(before?.settings ?? {}, after.settings ?? {}, memoryMap),
  };
}

export function summarizeWriteReview(diff: WriteReviewDiff): string {
  const added = diff.channels.filter((channel) => channel.kind === 'added').length;
  const cleared = diff.channels.filter((channel) => channel.kind === 'cleared').length;
  const changed = diff.channels.filter((channel) => channel.kind === 'changed').length;
  const settings = diff.settingsGroups.reduce((count, group) => count + group.fields.length, 0);
  const channelParts: string[] = [];

  if (changed > 0) {
    channelParts.push(`${changed} ${changed === 1 ? 'channel' : 'channels'} changed`);
  }

  if (added > 0) {
    channelParts.push(`${added} ${added === 1 ? 'channel' : 'channels'} added`);
  }

  if (cleared > 0) {
    channelParts.push(`${cleared} ${cleared === 1 ? 'channel' : 'channels'} cleared`);
  }

  const channelSentence = joinClauses(channelParts);
  const settingsSentence = settings > 0 ? `${settings} ${settings === 1 ? 'setting' : 'settings'} changed` : '';

  if (!channelSentence && !settingsSentence) {
    return 'No channel or setting changes.';
  }

  if (channelSentence && settingsSentence) {
    return `${channelSentence}. ${settingsSentence}.`;
  }

  return `${channelSentence || settingsSentence}.`;
}

function diffChannel(
  channelNumber: number,
  before: VisibleChannel | undefined,
  after: VisibleChannel | undefined,
  extras: RadioMemoryMapUiField[],
): WriteReviewChannel | undefined {
  if (!before && !after) {
    return undefined;
  }

  const kind: WriteReviewChannelKind = !before ? 'added' : !after ? 'cleared' : 'changed';
  const beforeFields = before ? channelFields(before, extras) : [];
  const afterFields = after ? channelFields(after, extras) : [];
  const fields = diffFields(beforeFields, afterFields, kind);

  if (fields.length === 0) {
    return undefined;
  }

  const named = kind === 'cleared' ? before : after;

  return {
    channelNumber,
    kind,
    name: named?.radioChannel.name?.trim() ?? '',
    fields,
  };
}

function channelFields(channel: VisibleChannel, extras: RadioMemoryMapUiField[]): ReviewField[] {
  const radioChannel = channel.radioChannel;
  const fields: ReviewField[] = [
    { id: 'name', label: 'Name', value: radioChannel.name?.trim() ?? '' },
    { id: 'frequency', label: 'Frequency', value: formatReviewFrequency(radioChannel.receiveFrequency) },
    { id: 'offset', label: 'Offset', value: formatOffset(radioChannel, channel.settings) },
    { id: 'receiveTone', label: 'Receive tone', value: formatReviewTone(radioChannel.receiveTone) },
    { id: 'transmitTone', label: 'Transmit tone', value: formatReviewTone(radioChannel.transmitTone) },
  ];

  for (const field of extras) {
    if (SUMMARIZED_CHANNEL_FIELD_IDS.has(field.fieldId)) {
      continue;
    }

    const raw = channel.settings ? getSettingAtPath(channel.settings, field.path) : undefined;
    fields.push({
      id: `channel.${field.path}`,
      label: field.ui.label,
      value: formatMemoryMapFieldValue(raw, field),
    });
  }

  return fields;
}

function diffFields(before: ReviewField[], after: ReviewField[], kind: WriteReviewChannelKind): WriteReviewFieldChange[] {
  const count = Math.max(before.length, after.length);
  const changes: WriteReviewFieldChange[] = [];

  for (let index = 0; index < count; index += 1) {
    const left = before[index];
    const right = after[index];
    const id = left?.id ?? right?.id ?? String(index);
    const beforeValue = left?.value ?? '';
    const afterValue = right?.value ?? '';

    if (kind === 'changed' && beforeValue === afterValue) {
      continue;
    }

    if (kind === 'added' && isBlankReviewValue(id, afterValue)) {
      continue;
    }

    if (kind === 'cleared' && isBlankReviewValue(id, beforeValue)) {
      continue;
    }

    changes.push({
      id,
      label: left?.label ?? right?.label ?? id,
      before: beforeValue || EMPTY_VALUE,
      after: afterValue || EMPTY_VALUE,
    });
  }

  return changes;
}

function diffSettings(
  before: RadioSettings,
  after: RadioSettings,
  memoryMap: RadioMemoryMap | undefined,
): WriteReviewSettingsGroup[] {
  if (!memoryMap) {
    return [];
  }

  const groups: WriteReviewSettingsGroup[] = [];

  for (const group of collectMemoryMapUiGroups(memoryMap)) {
    const fields: WriteReviewFieldChange[] = [];

    for (const field of group.fields) {
      const left = getSettingAtPath(before, field.path);
      const right = getSettingAtPath(after, field.path);

      if (settingValuesEqual(left, right)) {
        continue;
      }

      const beforeValue = formatMemoryMapFieldValue(left, field);
      const afterValue = formatMemoryMapFieldValue(right, field);
      fields.push({
        id: field.path,
        label: field.ui.label,
        before: beforeValue || EMPTY_VALUE,
        after: afterValue || EMPTY_VALUE,
      });
    }

    if (fields.length > 0) {
      groups.push({ id: group.id, label: group.label, fields });
    }
  }

  return groups;
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

function formatReviewFrequency(frequencyHz: number | undefined): string {
  const text = formatFrequencyMHz(frequencyHz);
  return text ? `${text} MHz` : '';
}

function formatOffset(channel: RadioChannel, settings?: RadioSettings): string {
  const duplex = duplexFromFrequencies(channel.receiveFrequency, channel.transmitFrequency, settings);

  if (duplex === 'split') {
    const transmit = formatReviewFrequency(channel.transmitFrequency);
    return transmit ? `Split ${transmit}` : 'Split';
  }

  if (!duplex) {
    return 'Off';
  }

  const offsetHz = Math.abs(channel.transmitFrequency - channel.receiveFrequency);
  const offset = formatReviewFrequency(offsetHz);
  return offset ? `${duplex} ${offset}` : duplex;
}

function formatReviewTone(tone: RadioTone | undefined): string {
  if (!tone?.tone) {
    return 'None';
  }

  if (tone.type === RadioToneType.CTCSS) {
    return `CTCSS ${(tone.tone / 10).toFixed(1)}`;
  }

  return `DCS ${String(tone.tone).padStart(3, '0')}`;
}

function isBlankReviewValue(id: string, value: string): boolean {
  if (!value) {
    return true;
  }

  if (id === 'offset' && value === 'Off') {
    return true;
  }

  if ((id === 'receiveTone' || id === 'transmitTone') && value === 'None') {
    return true;
  }

  return false;
}

function settingValuesEqual(left: RadioSettingValue | undefined, right: RadioSettingValue | undefined): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (left == null && right == null) {
    return true;
  }

  if (typeof left === 'object' || typeof right === 'object') {
    return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
  }

  return false;
}

function joinClauses(parts: string[]): string {
  if (parts.length <= 1) {
    return parts[0] ?? '';
  }

  if (parts.length === 2) {
    return `${parts[0]} and ${parts[1]}`;
  }

  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}
