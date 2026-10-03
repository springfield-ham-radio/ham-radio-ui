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

/** Encode derives these from frequencies/tones; do not seed them on a new channel. */
const DERIVED_CHANNEL_SETTING_IDS = new Set([
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
]);

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
const VHF_REPEATER_OFFSET_HZ = 600_000;
const UHF_REPEATER_OFFSET_HZ = 5_000_000;

/**
 * Standard US amateur FM repeater splits, keyed by receive frequency.
 *
 * Magnitudes follow the ARRL band plan (https://www.arrl.org/band-plan).
 * `patchFromDuplex` still applies the operator's + or − choice. On 2 m that
 * choice is the usual one: outputs in 145.20–145.50 and 146.61–146.97 sit
 * 600 kHz above their inputs (minus), and 147.00–147.39 sit 600 kHz below
 * theirs (plus).
 *
 * - 10 m FM, 29.5–29.7 MHz: inputs 29.520–29.590 pair with outputs
 *   29.610–29.700 (100 kHz).
 * - 6 m, 50–54 MHz: inputs pair with outputs 500 kHz higher
 *   (51.12–51.48 with 51.62–51.98, 52.0–52.48 with 52.5–52.98, and
 *   53.0–53.48 with 53.5–53.98).
 * - 2 m, 144–148 MHz: 600 kHz (146.01–146.37 with 146.61–146.97, and
 *   147.60–147.99 with 147.00–147.39).
 * - 1.25 m, 222–225 MHz: 1.6 MHz. Outputs 223.85–224.98 are above inputs
 *   222.25–223.38, so the customary duplex on the output is minus.
 * - 70 cm, 420–450 MHz: 5 MHz. The plan leaves 442–445 and 447–450 pairing
 *   as a local option; 5 MHz is the usual US split.
 * - 33 cm, 902–928 MHz: 25 MHz (902.000–903.000 inputs with 927.000–928.000
 *   outputs). Note 4 allows regional alternatives such as 12 MHz.
 * - 23 cm, 1240–1300 MHz: 12 MHz (1270–1276 inputs with 1282–1288 outputs).
 *   A regional option pairs 1270–1274 with 1290–1294 (20 MHz).
 *
 * Frequencies outside these ranges keep the previous fallback: 600 kHz below
 * 300 MHz and 5 MHz at or above it.
 */
const REPEATER_OFFSET_BANDS: ReadonlyArray<{
  minHz: number;
  maxHz: number;
  offsetHz: number;
}> = [
  { minHz: 29_500_000, maxHz: 29_700_000, offsetHz: 100_000 },
  { minHz: 50_000_000, maxHz: 54_000_000, offsetHz: 500_000 },
  { minHz: 144_000_000, maxHz: 148_000_000, offsetHz: 600_000 },
  { minHz: 222_000_000, maxHz: 225_000_000, offsetHz: 1_600_000 },
  { minHz: 420_000_000, maxHz: 450_000_000, offsetHz: 5_000_000 },
  { minHz: 902_000_000, maxHz: 928_000_000, offsetHz: 25_000_000 },
  { minHz: 1_240_000_000, maxHz: 1_300_000_000, offsetHz: 12_000_000 },
];

/** USelect cannot use an empty string as an item value (that means "unselected"). */
export const DUPLEX_OFF_SELECT_VALUE = 'off';

export function formatFrequencyMHz(frequencyHz: number | undefined): string {
  if (frequencyHz === undefined) {
    return '';
  }

  return (frequencyHz / 1_000_000).toFixed(4);
}

/** Blank and unparsable frequencies are both invalid on a contact. */
export function frequencyMHzFieldError(text: string): string | undefined {
  if (parseFrequencyMHz(text) === undefined) {
    return 'Enter a frequency in MHz';
  }

  return undefined;
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
 * Number of memory slots the radio's channel-records struct can hold.
 */
export function channelCapacity(memoryMap: RadioMemoryMap | undefined): number {
  const records = memoryMap?.channelBindings?.records;

  if (!records) {
    return 0;
  }

  const struct = memoryMap?.structs.find((entry) => entry.id === records);
  return struct?.count ?? 0;
}

/**
 * Unused memory slot indexes, in order.
 */
export function availableChannelNumbers(occupied: Iterable<number>, capacity: number): number[] {
  if (capacity <= 0) {
    return [];
  }

  const used = new Set(occupied);
  const slots: number[] = [];

  for (let channelNumber = 0; channelNumber < capacity; channelNumber += 1) {
    if (!used.has(channelNumber)) {
      slots.push(channelNumber);
    }
  }

  return slots;
}

/**
 * Lowest unused slot index, or `undefined` when the radio is full.
 */
export function nextAvailableChannelNumber(occupied: Iterable<number>, capacity: number): number | undefined {
  return availableChannelNumbers(occupied, capacity)[0];
}

export function blankRadioChannel(): RadioChannel {
  return {
    name: '',
    receiveFrequency: Frequency(146_520_000),
    transmitFrequency: Frequency(146_520_000),
    receiveTone: { tone: 0, type: RadioToneType.CTCSS },
    transmitTone: { tone: 0, type: RadioToneType.CTCSS },
  };
}

/**
 * Radio-specific extras for a newly programmed slot (power, mode, scan, …).
 */
export function defaultChannelSettings(memoryMap: RadioMemoryMap | undefined): RadioSettings {
  const settings: RadioSettings = {};
  const bindings = memoryMap?.channelBindings;

  if (!memoryMap || !bindings) {
    return settings;
  }

  const boundIds = new Set(
    [bindings.receiveFrequency, bindings.transmitFrequency, bindings.receiveTone, bindings.transmitTone, bindings.nameField ?? 'name'].filter(
      (id): id is string => Boolean(id),
    ),
  );
  const recordsStruct = memoryMap.structs.find((entry) => entry.id === bindings.records);
  const extrasStruct = bindings.extras ? memoryMap.structs.find((entry) => entry.id === bindings.extras) : undefined;

  for (const struct of [recordsStruct, extrasStruct]) {
    if (!struct) {
      continue;
    }

    for (const field of struct.fields) {
      if (field.reserved || boundIds.has(field.id) || field.id.startsWith('_') || DERIVED_CHANNEL_SETTING_IDS.has(field.id)) {
        continue;
      }

      const editorField: RadioMemoryMapUiField = {
        path: field.id,
        structId: struct.id,
        fieldId: field.id,
        ui: field.ui ?? { group: 'channel', label: field.id, widget: 'text' },
        value: field.value,
      };
      const editor = channelFieldEditor(editorField);

      if (field.id === 'lowpower') {
        settings.lowpower = 0;
        continue;
      }

      if (field.id === 'wide') {
        settings.wide = true;
        continue;
      }

      if (field.id === 'scan') {
        settings.scan = true;
        continue;
      }

      if (editor.kind === 'switch') {
        settings[field.id] = false;
        continue;
      }

      if (editor.kind === 'integer') {
        settings[field.id] = editor.min ?? 0;
        continue;
      }

      if (editor.kind === 'select' && editor.items[0]) {
        settings[field.id] = parseChannelFieldValue(editorField, editor.items[0].value);
      }
    }
  }

  return syncChannelSettingAliases(settings);
}

export function createProgrammedChannel(options: {
  channelNumber: number;
  memoryMap?: RadioMemoryMap;
  source?: Partial<RadioChannel>;
}): RadioProgrammedChannel {
  const blank = blankRadioChannel();
  const source = options.source;
  const programmed: RadioProgrammedChannel = {
    channelNumber: options.channelNumber,
    radioChannel: {
      name: source?.name ?? blank.name,
      receiveFrequency: source?.receiveFrequency ?? blank.receiveFrequency,
      transmitFrequency: source?.transmitFrequency ?? blank.transmitFrequency,
      receiveTone: source?.receiveTone ?? blank.receiveTone,
      transmitTone: source?.transmitTone ?? blank.transmitTone,
    },
    settings: defaultChannelSettings(options.memoryMap),
  };

  return applyChannelPatch(programmed, {}, { nameMaxLength: channelNameMaxLength(options.memoryMap) });
}

/**
 * Name, frequencies, and tones from a portable library channel.
 * Radio-specific settings are left for the caller to keep.
 */
export function channelPatchFromLibrary(source: Partial<RadioChannel>): ChannelPatch {
  return {
    name: source.name ?? '',
    receiveFrequencyHz: source.receiveFrequency,
    transmitFrequencyHz: source.transmitFrequency,
    receiveTone: source.receiveTone,
    transmitTone: source.transmitTone,
  };
}

/**
 * Place portable saved channels into explicit unused slot numbers, in order.
 * Extra sources are skipped when there are not enough slots.
 */
export function programLibraryChannelsIntoSlots(
  sources: Array<Partial<RadioChannel>>,
  slotNumbers: readonly number[],
  memoryMap: RadioMemoryMap | undefined,
): { programmed: RadioProgrammedChannel[]; skipped: number } {
  const take = Math.min(sources.length, slotNumbers.length);
  const programmed = sources.slice(0, take).map((source, index) =>
    createProgrammedChannel({
      channelNumber: slotNumbers[index]!,
      memoryMap,
      source,
    }),
  );

  return {
    programmed,
    skipped: sources.length - take,
  };
}

/**
 * Fill unused radio slots from portable saved channels, in order.
 * Extra sources are skipped when the radio is full.
 */
export function assignLibraryChannelsToSlots(
  sources: Array<Partial<RadioChannel>>,
  occupied: Iterable<number>,
  memoryMap: RadioMemoryMap | undefined,
): { programmed: RadioProgrammedChannel[]; skipped: number } {
  const slots = availableChannelNumbers(occupied, channelCapacity(memoryMap));
  return programLibraryChannelsIntoSlots(sources, slots, memoryMap);
}

/**
 * Confirmation copy for copying library channels into unused memory slots.
 */
export function describeLibrarySlotAssignment(options: {
  radioName: string;
  sourceCount: number;
  slotNumbers: readonly number[];
}): string {
  const { radioName, sourceCount, slotNumbers } = options;

  if (slotNumbers.length === 0) {
    return `There are no unused memory slots on ${radioName}.`;
  }

  if (sourceCount === 0) {
    const noun = slotNumbers.length === 1 ? 'unused memory slot' : 'unused memory slots';
    return `${radioName} has ${slotNumbers.length} ${noun}. Select channels to fill them.`;
  }

  const take = Math.min(sourceCount, slotNumbers.length);
  const first = slotNumbers[0];
  const last = slotNumbers[take - 1];
  const slotLabel = first === last ? `memory slot ${first}` : `memory slots ${first} to ${last}`;

  if (take < sourceCount) {
    return `Only ${slotNumbers.length} unused slots remain on ${radioName}. Add the first ${take} selected channels to ${slotLabel}? Write to the radio to apply the change on the device.`;
  }

  const channelLabel = sourceCount === 1 ? 'this channel' : `${sourceCount} channels`;
  return `Add ${channelLabel} to ${radioName} in unused ${slotLabel}? Write to the radio to apply the change on the device.`;
}

export interface ChannelReorder {
  channels: RadioProgrammedChannel[];
  /** Previous memory slot → slot after the move, for visible (decoded) channels. */
  previousToNext: Map<number, number>;
}

function isVisibleProgrammedChannel(channel: RadioProgrammedChannel): boolean {
  return typeof channel.radioChannel !== 'string';
}

/**
 * Move one occupied row in the Channels table.
 *
 * Occupied slot numbers stay put so gaps are preserved; only the channel data
 * is permuted into the new order. Unresolved records are left in their slots.
 */
export function reorderProgrammedChannels(
  channels: RadioProgrammedChannel[],
  fromIndex: number,
  toIndex: number,
): ChannelReorder {
  const visible = channels
    .filter(isVisibleProgrammedChannel)
    .sort((left, right) => left.channelNumber - right.channelNumber);
  const hidden = channels.filter((channel) => !isVisibleProgrammedChannel(channel));

  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= visible.length ||
    toIndex >= visible.length
  ) {
    return { channels, previousToNext: new Map() };
  }

  const slotNumbers = visible.map((channel) => channel.channelNumber);
  const reordered = [...visible];
  const [moved] = reordered.splice(fromIndex, 1);

  if (moved === undefined) {
    return { channels, previousToNext: new Map() };
  }

  reordered.splice(toIndex, 0, moved);

  const previousToNext = new Map<number, number>();
  const nextVisible = reordered.map((channel, index) => {
    const nextNumber = slotNumbers[index]!;
    previousToNext.set(channel.channelNumber, nextNumber);
    return {
      ...channel,
      channelNumber: nextNumber,
    };
  });

  return {
    channels: [...nextVisible, ...hidden].sort((left, right) => left.channelNumber - right.channelNumber),
    previousToNext,
  };
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

  if ('duplex' in settings && settings.split !== true && settings.duplex !== 'split') {
    settings.duplex = duplexFromFrequencies(radioChannel.receiveFrequency, radioChannel.transmitFrequency);
  }

  if ('isuhf' in settings) {
    settings.isuhf = radioChannel.receiveFrequency >= UHF_THRESHOLD_HZ;
  }

  return {
    channelNumber: programmed.channelNumber,
    radioChannel,
    settings: Object.keys(settings).length > 0 ? settings : undefined,
  };
}

export function defaultRepeaterOffsetHz(receiveFrequencyHz: number): number {
  const band = REPEATER_OFFSET_BANDS.find(
    (entry) => receiveFrequencyHz >= entry.minHz && receiveFrequencyHz <= entry.maxHz,
  );

  if (band) {
    return band.offsetHz;
  }

  return receiveFrequencyHz >= UHF_THRESHOLD_HZ ? UHF_REPEATER_OFFSET_HZ : VHF_REPEATER_OFFSET_HZ;
}

export function duplexFromFrequencies(
  receiveHz: number,
  transmitHz: number,
  settings?: RadioSettings,
): string {
  if (settings?.duplex === 'split' || settings?.split === true) {
    return 'split';
  }

  if (transmitHz === receiveHz) {
    return '';
  }

  return transmitHz > receiveHz ? '+' : '-';
}

export function duplexToSelectValue(value: RadioSettingValue | undefined): string {
  if (value === undefined || value === null || value === '' || value === DUPLEX_OFF_SELECT_VALUE) {
    return DUPLEX_OFF_SELECT_VALUE;
  }

  return String(value);
}

export function duplexFromSelectValue(value: string): string {
  if (!value || value === DUPLEX_OFF_SELECT_VALUE) {
    return '';
  }

  return value;
}

/**
 * Update TX frequency and duplex/split extras when the operator picks Off / + / - / Split.
 */
export function patchFromDuplex(receiveHz: number, transmitHz: number, duplex: string): ChannelPatch {
  const mode = duplexFromSelectValue(duplex);
  const offset = Math.abs(transmitHz - receiveHz) || defaultRepeaterOffsetHz(receiveHz);

  if (mode === '') {
    return {
      transmitFrequencyHz: receiveHz,
      settings: { duplex: '', split: false },
    };
  }

  if (mode === '+') {
    return {
      transmitFrequencyHz: receiveHz + offset,
      settings: { duplex: '+', split: false },
    };
  }

  if (mode === '-') {
    return {
      transmitFrequencyHz: receiveHz - offset,
      settings: { duplex: '-', split: false },
    };
  }

  return {
    settings: { duplex: mode, split: mode === 'split' },
  };
}

function enumSelectItems(fieldId: string, values: string[]): ChannelFieldSelectItem[] {
  const items: ChannelFieldSelectItem[] = [];
  const seen = new Set<string>();

  for (const entry of values) {
    const value = entry === '' ? (fieldId === 'duplex' ? DUPLEX_OFF_SELECT_VALUE : entry) : entry;

    if (!value || seen.has(value)) {
      continue;
    }

    seen.add(value);
    items.push({
      label: enumSelectLabel(fieldId, entry),
      value,
    });
  }

  return items;
}

function enumSelectLabel(fieldId: string, entry: string): string {
  if (fieldId === 'duplex') {
    if (entry === '') {
      return 'Off';
    }

    if (entry === 'split') {
      return 'Split';
    }
  }

  return entry;
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
      items: enumSelectItems(field.fieldId, field.value.values),
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
  if (field.fieldId === 'duplex') {
    return duplexToSelectValue(value);
  }

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
  if (field.fieldId === 'duplex') {
    return duplexFromSelectValue(String(input));
  }

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
