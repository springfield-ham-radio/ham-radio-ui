import {
  CTCSS,
  DCS,
  Frequency,
  type RadioChannel,
  type RadioMemoryMap,
  type RadioProgrammedChannel,
  type RadioSettingValue,
  type RadioSettings,
  type RadioTone,
  RadioToneType,
} from '@springfield/ham-radio-api';
import type { RadioMemoryMapUiField } from '@springfield/ham-radio-utils';

export interface ChannelPatch {
  name?: string;
  receiveFrequencyHz?: number;
  transmitFrequencyHz?: number;
  receiveTone?: RadioTone;
  transmitTone?: RadioTone;
  settings?: RadioSettings;
}

export interface ChannelFieldSelectItem {
  label: string;
  value: string;
}

export type ChannelFieldEditor =
  | { kind: 'select'; items: ChannelFieldSelectItem[] }
  | { kind: 'integer'; min?: number; max?: number; displayOffset?: number }
  | { kind: 'switch' }
  | { kind: 'text' };

const UHF_THRESHOLD_HZ = 300_000_000;

export function formatFrequencyMHz(frequencyHz: number | undefined): string {
  if (frequencyHz === undefined) {
    return '';
  }

  return (frequencyHz / 1_000_000).toFixed(4);
}

export function parseFrequencyMHz(text: string): number | undefined {
  const trimmed = text.trim();

  if (!trimmed) {
    return undefined;
  }

  const mhz = Number(trimmed);

  if (!Number.isFinite(mhz) || mhz <= 0) {
    return undefined;
  }

  return Math.round(mhz * 1_000_000);
}

export function toneToKey(tone: RadioTone | undefined): string {
  if (!tone || !tone.tone) {
    return 'none';
  }

  return tone.type === RadioToneType.DCS ? `dcs:${tone.tone}` : `ctcss:${tone.tone}`;
}

export function keyToTone(key: string): RadioTone {
  if (!key || key === 'none') {
    return { tone: 0, type: RadioToneType.CTCSS };
  }

  const separator = key.indexOf(':');
  const kind = separator === -1 ? key : key.slice(0, separator);
  const raw = separator === -1 ? '' : key.slice(separator + 1);
  const value = Number(raw);

  if (kind === 'dcs' && Number.isFinite(value)) {
    return { tone: value, type: RadioToneType.DCS };
  }

  if (kind === 'ctcss' && Number.isFinite(value)) {
    return { tone: value, type: RadioToneType.CTCSS };
  }

  return { tone: 0, type: RadioToneType.CTCSS };
}

export function toneSelectItems(): ChannelFieldSelectItem[] {
  const ctcss = Object.values(CTCSS)
    .filter((value): value is number => typeof value === 'number')
    .map((value) => ({
      label: `${(value / 10).toFixed(1)} CTCSS`,
      value: `ctcss:${value}`,
    }));

  const dcs = Object.values(DCS)
    .filter((value): value is number => typeof value === 'number' && value > 0)
    .map((value) => ({
      label: `D${String(value).padStart(3, '0')}`,
      value: `dcs:${value}`,
    }));

  return [{ label: 'None', value: 'none' }, ...ctcss, ...dcs];
}

export function channelNameMaxLength(memoryMap: RadioMemoryMap | undefined): number | undefined {
  const bindings = memoryMap?.channelBindings;

  if (!bindings?.names) {
    return undefined;
  }

  const struct = memoryMap?.structs.find((entry) => entry.id === bindings.names);
  const field = struct?.fields.find((entry) => entry.id === (bindings.nameField ?? 'name'));

  if (field?.value?.kind === 'ascii') {
    return field.value.length;
  }

  return undefined;
}

/**
 * Apply an edit to one programmed channel.
 *
 * Truncates the name, merges settings extras, and keeps encode aliases
 * (transmitPower / mode / skip) and `isuhf` in sync.
 */
export function applyChannelPatch(
  programmed: RadioProgrammedChannel,
  patch: ChannelPatch,
  options: { nameMaxLength?: number } = {},
): RadioProgrammedChannel {
  if (typeof programmed.radioChannel === 'string') {
    return programmed;
  }

  const current = programmed.radioChannel;
  let name = patch.name ?? current.name ?? '';

  if (options.nameMaxLength !== undefined) {
    name = name.slice(0, options.nameMaxLength);
  }

  const radioChannel: RadioChannel = {
    ...current,
    name,
    receiveFrequency: Frequency(patch.receiveFrequencyHz ?? current.receiveFrequency),
    transmitFrequency: Frequency(patch.transmitFrequencyHz ?? current.transmitFrequency),
    receiveTone: patch.receiveTone ?? current.receiveTone,
    transmitTone: patch.transmitTone ?? current.transmitTone,
  };

  const settings = syncChannelSettingAliases({
    ...(programmed.settings ?? {}),
    ...(patch.settings ?? {}),
  });

  if ('isuhf' in settings) {
    settings.isuhf = radioChannel.receiveFrequency >= UHF_THRESHOLD_HZ;
  }

  return {
    channelNumber: programmed.channelNumber,
    radioChannel,
    settings: Object.keys(settings).length > 0 ? settings : undefined,
  };
}

export function channelFieldEditor(field: RadioMemoryMapUiField): ChannelFieldEditor {
  if (field.fieldId === 'lowpower') {
    return {
      kind: 'select',
      items: [
        { label: 'High', value: '0' },
        { label: 'Low', value: '1' },
      ],
    };
  }

  if (field.fieldId === 'wide') {
    return {
      kind: 'select',
      items: [
        { label: 'Wide', value: 'true' },
        { label: 'Narrow', value: 'false' },
      ],
    };
  }

  if (field.value?.kind === 'enum') {
    return {
      kind: 'select',
      items: field.value.values.map((entry) => ({ label: entry, value: entry })),
    };
  }

  if (field.ui.widget === 'switch' || field.value?.kind === 'boolean') {
    return { kind: 'switch' };
  }

  if (field.ui.widget === 'integer' || field.ui.widget === 'number' || field.value?.kind === 'integer') {
    const integer = field.value?.kind === 'integer' ? field.value : undefined;
    return {
      kind: 'integer',
      min: integer?.min,
      max: integer?.max,
      displayOffset: field.fieldId === 'scode' ? 1 : undefined,
    };
  }

  return { kind: 'text' };
}

export function serializeChannelFieldValue(
  field: RadioMemoryMapUiField,
  value: RadioSettingValue | undefined,
): string {
  if (value === undefined || value === null) {
    return '';
  }

  const editor = channelFieldEditor(field);

  if (editor.kind === 'integer' && editor.displayOffset && typeof value === 'number') {
    return String(value + editor.displayOffset);
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  return String(value);
}

export function parseChannelFieldValue(field: RadioMemoryMapUiField, input: string | number | boolean): RadioSettingValue {
  const editor = channelFieldEditor(field);
  const booleanSelect =
    editor.kind === 'select' && editor.items.some((item) => item.value === 'true' || item.value === 'false');

  if (editor.kind === 'switch' || booleanSelect) {
    if (typeof input === 'boolean') {
      return input;
    }

    if (input === 'true' || input === 'false') {
      return input === 'true';
    }
  }

  if (editor.kind === 'integer') {
    const numeric = typeof input === 'number' ? input : Number(input);

    if (!Number.isFinite(numeric)) {
      return 0;
    }

    return editor.displayOffset ? numeric - editor.displayOffset : numeric;
  }

  if (editor.kind === 'select' && field.fieldId === 'lowpower') {
    return Number(input);
  }

  if (typeof input === 'boolean' || typeof input === 'number') {
    return input;
  }

  return String(input);
}

function syncChannelSettingAliases(settings: RadioSettings): RadioSettings {
  const next: RadioSettings = { ...settings };

  if (typeof next.lowpower === 'number') {
    next.transmitPower = next.lowpower === 0 ? 5 : 1;
  }

  if (typeof next.wide === 'boolean') {
    next.mode = next.wide ? 'FM' : 'NFM';
  }

  if (typeof next.scan === 'boolean') {
    next.skip = next.scan ? '' : 'S';
  }

  return next;
}
