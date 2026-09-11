import type {
  RadioMemoryConfig,
  RadioMemoryMap,
  RadioMemoryMapChannelBindings,
  RadioMemoryMapField,
  RadioMemoryMapStruct,
  RadioSettingValue,
} from '@springfield/ham-radio-api';
import { parseSeekAddress, radioAddressToBufferOffset } from '@springfield/ham-radio-utils';

export type CodecFieldRole = 'records' | 'names' | 'extras';

export interface CodecFieldSlot {
  id: string;
  offset: number;
  size: number;
  reserved: boolean;
  typeLabel: string;
  valueKind?: string;
  uiLabel?: string;
  bitOffset?: number;
  bitWidth?: number;
}

export interface CodecStructLayout {
  slots: CodecFieldSlot[];
  recordSize: number;
}

export interface CodecAddressSpan {
  start: number;
  end: number;
}

export interface CodecStructView {
  id: string;
  seek: number;
  count: number;
  stride?: number;
  groupSize?: number;
  groupPad?: number;
  role?: CodecFieldRole;
  span: CodecAddressSpan;
  layout: CodecStructLayout;
  notes: string[];
}

export interface CodecSelection {
  structId: string;
  instanceIndex: number;
  fieldId?: string;
}

export interface CodecByteHit {
  structId: string;
  instanceIndex: number;
  fieldId: string;
  slotIndex: number;
  reserved: boolean;
}

export interface CodecMemoryMapView {
  version?: string;
  description?: string;
  structs: CodecStructView[];
}

function fieldByteLength(field: RadioMemoryMapField): number {
  if (field.type === 'u32') {
    return 4;
  }

  if (field.type === 'u16') {
    return 2;
  }

  if (field.type === 'bits') {
    return 0;
  }

  if (
    field.value?.kind === 'ascii' ||
    field.value?.kind === 'digits' ||
    field.value?.kind === 'dtmf' ||
    field.value?.kind === 'bbcd' ||
    field.value?.kind === 'lbcd'
  ) {
    return field.value.length;
  }

  if (field.value?.kind === 'tone') {
    return 2;
  }

  return 1;
}

function fieldTypeLabel(field: RadioMemoryMapField): string {
  if (field.type === 'bits') {
    return `${field.width ?? 1}b`;
  }

  if (
    field.value?.kind === 'ascii' ||
    field.value?.kind === 'digits' ||
    field.value?.kind === 'dtmf' ||
    field.value?.kind === 'bbcd' ||
    field.value?.kind === 'lbcd'
  ) {
    return `${field.value.kind}×${field.value.length}`;
  }

  if (field.value?.kind === 'tone') {
    return 'tone';
  }

  return field.type;
}

/**
 * Lays out one struct record as sequential fields, including Chirp-style MSB-first bitfields.
 */
export function layoutStructFields(fields: RadioMemoryMapField[]): CodecStructLayout {
  const slots: CodecFieldSlot[] = [];
  let offset = 0;
  let bitIndex = -1;
  let bitByteOffset = 0;

  const flushBits = (): void => {
    if (bitIndex >= 0) {
      offset = bitByteOffset + 1;
      bitIndex = -1;
    }
  };

  for (const field of fields) {
    if (field.type === 'bits') {
      const width = field.width ?? 1;
      let remaining = width;
      let startOffset = offset;
      let startBit = bitIndex;
      let assignedStart = false;

      while (remaining > 0) {
        if (bitIndex < 0) {
          bitByteOffset = offset;
          bitIndex = 7;
        }

        if (!assignedStart) {
          startOffset = bitByteOffset;
          startBit = bitIndex;
          assignedStart = true;
        }

        bitIndex -= 1;
        remaining -= 1;

        if (bitIndex < 0) {
          offset = bitByteOffset + 1;
        }
      }

      slots.push({
        id: field.id,
        offset: startOffset,
        size: 1,
        reserved: field.reserved === true,
        typeLabel: fieldTypeLabel(field),
        valueKind: field.value?.kind,
        uiLabel: field.ui?.label,
        bitOffset: startBit,
        bitWidth: width,
      });
      continue;
    }

    flushBits();
    const size = fieldByteLength(field);

    slots.push({
      id: field.id,
      offset,
      size,
      reserved: field.reserved === true,
      typeLabel: fieldTypeLabel(field),
      valueKind: field.value?.kind,
      uiLabel: field.ui?.label,
    });
    offset += size;
  }

  flushBits();

  return {
    slots,
    recordSize: offset,
  };
}

export type CodecLayoutBand =
  | { kind: 'field'; slot: CodecFieldSlot }
  | { kind: 'bits'; offset: number; slots: CodecFieldSlot[] };

/**
 * Groups sequential bitfields that share a byte so the map can draw an 8-bit cell.
 */
export function groupLayoutBands(slots: CodecFieldSlot[]): CodecLayoutBand[] {
  const bands: CodecLayoutBand[] = [];

  for (const slot of slots) {
    if (slot.bitWidth !== undefined) {
      const last = bands.at(-1);

      if (last?.kind === 'bits' && last.offset === slot.offset) {
        last.slots.push(slot);
      } else {
        bands.push({ kind: 'bits', offset: slot.offset, slots: [slot] });
      }

      continue;
    }

    bands.push({ kind: 'field', slot });
  }

  return bands;
}

function structInstanceAddress(struct: RadioMemoryMapStruct, instanceIndex: number, recordSize: number): number {
  const seek = parseSeekAddress(struct.seek);
  const stride = struct.stride ?? recordSize;
  const groupSize = struct.groupSize;

  if (!groupSize) {
    return seek + instanceIndex * stride;
  }

  const groupPad = struct.groupPad ?? 0;
  const groupIndex = Math.floor(instanceIndex / groupSize);
  const indexInGroup = instanceIndex % groupSize;

  return seek + groupIndex * (stride * groupSize + groupPad) + indexInGroup * stride;
}

function structSpan(struct: RadioMemoryMapStruct, recordSize: number): CodecAddressSpan {
  const start = parseSeekAddress(struct.seek);
  const count = struct.count ?? 1;
  const lastStart = count <= 1 ? start : structInstanceAddress(struct, count - 1, recordSize);

  return {
    start,
    end: lastStart + Math.max(recordSize, 1) - 1,
  };
}

function bindingRoles(bindings: RadioMemoryMapChannelBindings | undefined): Map<string, CodecFieldRole> {
  const roles = new Map<string, CodecFieldRole>();

  if (!bindings) {
    return roles;
  }

  roles.set(bindings.records, 'records');

  if (bindings.names) {
    roles.set(bindings.names, 'names');
  }

  if (bindings.extras) {
    roles.set(bindings.extras, 'extras');
  }

  return roles;
}

function structNotes(struct: RadioMemoryMapStruct): string[] {
  const notes: string[] = [];

  if (struct.emptyWhen) {
    notes.push(`Empty when first byte is 0x${struct.emptyWhen.equals.toString(16).toUpperCase().padStart(2, '0')}`);
  }

  if (struct.clearEmpty) {
    notes.push('Clear empty slots with 0xFF');
  }

  if (struct.groupSize) {
    notes.push(`Grouped ${struct.groupSize} records` + (struct.groupPad ? ` + ${struct.groupPad} pad bytes` : ''));
  }

  return notes;
}

/**
 * Builds a codec view model from a radio memory map.
 */
export function describeMemoryMap(memoryMap: RadioMemoryMap): CodecMemoryMapView {
  const roles = bindingRoles(memoryMap.channelBindings);

  return {
    version: memoryMap.version,
    description: memoryMap.description,
    structs: (memoryMap.structs ?? []).map((struct) => {
      const layout = layoutStructFields(struct.fields);

      return {
        id: struct.id,
        seek: parseSeekAddress(struct.seek),
        count: struct.count ?? 1,
        stride: struct.stride,
        groupSize: struct.groupSize,
        groupPad: struct.groupPad,
        role: roles.get(struct.id),
        span: structSpan(struct, layout.recordSize),
        layout,
        notes: structNotes(struct),
      };
    }),
  };
}

/**
 * Pretty-prints the memory-map JSON for the raw codec view.
 */
export function formatCodecJson(memoryMap: RadioMemoryMap): string {
  return JSON.stringify(memoryMap, null, 2);
}

/**
 * Formats a radio EEPROM address for the codec map.
 */
export function formatCodecAddress(address: number): string {
  const width = address > 0xffff ? 6 : 4;
  return `0x${address.toString(16).toUpperCase().padStart(width, '0')}`;
}

export const CODEC_ROLE_LABELS: Record<CodecFieldRole, string> = {
  records: 'Channel records',
  names: 'Channel names',
  extras: 'Channel extras',
};

export type MemoryMapScope = 'channels' | 'settings';

function channelStructIds(memoryMap: RadioMemoryMap): Set<string> {
  const ids = new Set<string>();
  const bindings = memoryMap.channelBindings;

  if (!bindings) {
    return ids;
  }

  ids.add(bindings.records);

  if (bindings.names) {
    ids.add(bindings.names);
  }

  if (bindings.extras) {
    ids.add(bindings.extras);
  }

  return ids;
}

/**
 * Returns the channel-bound structs or the remaining settings structs.
 */
export function filterMemoryMap(memoryMap: RadioMemoryMap, scope: MemoryMapScope): RadioMemoryMap {
  const channelIds = channelStructIds(memoryMap);
  const structs = (memoryMap.structs ?? []).filter((struct) => {
    const isChannel = channelIds.has(struct.id);
    return scope === 'channels' ? isChannel : !isChannel;
  });

  if (scope === 'channels') {
    return {
      version: memoryMap.version,
      description: memoryMap.description,
      structs,
      ...(memoryMap.channelBindings ? { channelBindings: memoryMap.channelBindings } : {}),
    };
  }

  return {
    version: memoryMap.version,
    description: memoryMap.description,
    structs,
  };
}

/**
 * Keeps EEPROM segments that belong to the channels or settings map.
 */
export function filterMemoryConfig(
  config: RadioMemoryConfig | undefined,
  scope: MemoryMapScope,
): RadioMemoryConfig | undefined {
  if (!config) {
    return undefined;
  }

  const segments = Object.fromEntries(
    Object.entries(config.segments).filter(([name]) => name === scope),
  );

  if (Object.keys(segments).length === 0) {
    return undefined;
  }

  return { ...config, segments };
}

/**
 * Radio EEPROM address of one struct instance, including Kenwood-style grouped stride.
 */
export function codecStructInstanceAddress(struct: CodecStructView, instanceIndex: number): number {
  const stride = struct.stride ?? struct.layout.recordSize;
  const groupSize = struct.groupSize;

  if (!groupSize) {
    return struct.seek + instanceIndex * stride;
  }

  const groupPad = struct.groupPad ?? 0;
  const groupIndex = Math.floor(instanceIndex / groupSize);
  const indexInGroup = instanceIndex % groupSize;

  return struct.seek + groupIndex * (stride * groupSize + groupPad) + indexInGroup * stride;
}

/**
 * Maps a packed or sparse buffer offset back to a radio EEPROM address.
 */
export function bufferOffsetToRadioAddress(
  bufferOffset: number,
  memoryConfig: RadioMemoryConfig,
  bufferLength: number,
): number | undefined {
  const segments = Object.values(memoryConfig.segments);

  if (segments.length === 0 || bufferOffset < 0 || bufferOffset >= bufferLength) {
    return undefined;
  }
  const maxEndAddress = Math.max(...segments.map((segment) => segment.endAddress));

  if (bufferLength >= maxEndAddress + 1) {
    return bufferOffset;
  }

  let offset = 0;

  for (const segment of segments) {
    const length = segment.endAddress - segment.startAddress + 1;

    if (bufferOffset >= offset && bufferOffset < offset + length) {
      return segment.startAddress + (bufferOffset - offset);
    }

    offset += length;
  }

  return undefined;
}

function toBufferOffset(
  radioAddress: number,
  bufferLength: number,
  memoryConfig?: RadioMemoryConfig,
): number | undefined {
  if (!memoryConfig) {
    return radioAddress >= 0 && radioAddress < bufferLength ? radioAddress : undefined;
  }

  try {
    const offset = radioAddressToBufferOffset(radioAddress, memoryConfig, bufferLength);
    return offset >= 0 && offset < bufferLength ? offset : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Indexes every mapped buffer byte to the struct instance and field that encode it.
 */
export function collectCodecByteHits(
  view: CodecMemoryMapView,
  bufferLength: number,
  memoryConfig?: RadioMemoryConfig,
): Map<number, CodecByteHit[]> {
  const hits = new Map<number, CodecByteHit[]>();

  for (const struct of view.structs) {
    for (let instanceIndex = 0; instanceIndex < struct.count; instanceIndex += 1) {
      const base = codecStructInstanceAddress(struct, instanceIndex);

      for (const [slotIndex, slot] of struct.layout.slots.entries()) {
        const size = Math.max(slot.size, 1);

        for (let byteIndex = 0; byteIndex < size; byteIndex += 1) {
          const bufferOffset = toBufferOffset(base + slot.offset + byteIndex, bufferLength, memoryConfig);

          if (bufferOffset === undefined) {
            continue;
          }

          const existing = hits.get(bufferOffset) ?? [];
          existing.push({
            structId: struct.id,
            instanceIndex,
            fieldId: slot.id,
            slotIndex,
            reserved: slot.reserved,
          });
          hits.set(bufferOffset, existing);
        }
      }
    }
  }

  return hits;
}

/**
 * Picks the most useful field hit at a buffer offset (non-reserved when possible).
 */
export function codecHitAtOffset(hits: Map<number, CodecByteHit[]>, offset: number): CodecByteHit | undefined {
  const atOffset = hits.get(offset);

  if (!atOffset || atOffset.length === 0) {
    return undefined;
  }

  return atOffset.find((hit) => !hit.reserved) ?? atOffset[0];
}

/**
 * Buffer offsets that belong to the selected instance and field.
 */
export function codecSelectionOffsets(
  view: CodecMemoryMapView,
  selection: CodecSelection,
  bufferLength: number,
  memoryConfig?: RadioMemoryConfig,
): { instance: number[]; field: number[] } {
  const struct = view.structs.find((entry) => entry.id === selection.structId);
  const instance: number[] = [];
  const field: number[] = [];

  if (!struct) {
    return { instance, field };
  }

  const base = codecStructInstanceAddress(struct, selection.instanceIndex);
  const recordSize = Math.max(struct.layout.recordSize, 1);

  for (let byteIndex = 0; byteIndex < recordSize; byteIndex += 1) {
    const offset = toBufferOffset(base + byteIndex, bufferLength, memoryConfig);

    if (offset !== undefined) {
      instance.push(offset);
    }
  }

  const slot = selection.fieldId
    ? struct.layout.slots.find((entry) => entry.id === selection.fieldId)
    : undefined;

  if (slot) {
    const size = Math.max(slot.size, 1);

    for (let byteIndex = 0; byteIndex < size; byteIndex += 1) {
      const offset = toBufferOffset(base + slot.offset + byteIndex, bufferLength, memoryConfig);

      if (offset !== undefined) {
        field.push(offset);
      }
    }
  }

  return { instance, field };
}

export const CODEC_FIELD_TONES = [
  'bg-primary/15 text-primary ring-primary/25',
  'bg-info/15 text-info ring-info/25',
  'bg-warning/15 text-warning ring-warning/25',
  'bg-success/15 text-success ring-success/25',
] as const;

export const CODEC_BYTE_TONES = [
  'bg-primary/20 text-primary',
  'bg-info/20 text-info',
  'bg-warning/20 text-warning',
  'bg-success/20 text-success',
] as const;

export const CODEC_BYTE_FIELD_TONES = [
  'bg-primary/40 text-primary',
  'bg-info/40 text-info',
  'bg-warning/40 text-warning',
  'bg-success/40 text-success',
] as const;

/**
 * Tailwind classes for a layout slot on the codec map.
 */
export function codecSlotTone(slot: CodecFieldSlot, index: number): string {
  if (slot.reserved) {
    return 'bg-elevated text-muted ring-default';
  }

  return CODEC_FIELD_TONES[index % CODEC_FIELD_TONES.length] ?? CODEC_FIELD_TONES[0];
}

/**
 * Formats a decoded memory-map value for the hex-dump inspector.
 */
export function formatCodecSettingValue(value: RadioSettingValue | undefined, slot: CodecFieldSlot): string {
  if (value === undefined || value === null) {
    return '—';
  }

  if (typeof value === 'number' && (slot.id === 'freq' || slot.id === 'offset' || slot.valueKind === 'lbcd' || slot.valueKind === 'bbcd' || slot.valueKind === 'digits')) {
    if (value >= 1_000) {
      return `${(value / 1_000_000).toFixed(4)} MHz`;
    }
  }

  if (value && typeof value === 'object' && !Array.isArray(value) && 'mode' in value) {
    const tone = value as { mode?: string; value?: number; code?: number; polarity?: string };

    if (tone.mode === 'none') {
      return 'None';
    }

    if (tone.mode === 'ctcss' && typeof tone.value === 'number') {
      return `CTCSS ${(tone.value / 10).toFixed(1)}`;
    }

    if (tone.mode === 'dcs' && typeof tone.code === 'number') {
      return `DCS ${String(tone.code).padStart(3, '0')}${tone.polarity === 'R' ? 'R' : 'N'}`;
    }
  }

  if (typeof value === 'boolean') {
    if (slot.id === 'wide') {
      return value ? 'Wide' : 'Narrow';
    }

    return value ? 'On' : 'Off';
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }

  return '—';
}

/**
 * Hex bytes for one field in the memory image.
 */
export function formatCodecFieldHex(
  contents: Uint8Array,
  struct: CodecStructView,
  instanceIndex: number,
  slot: CodecFieldSlot,
  memoryConfig?: RadioMemoryConfig,
): string {
  const base = codecStructInstanceAddress(struct, instanceIndex);
  const size = Math.max(slot.size, 1);
  const bytes: string[] = [];

  for (let byteIndex = 0; byteIndex < size; byteIndex += 1) {
    const offset = toBufferOffset(base + slot.offset + byteIndex, contents.length, memoryConfig);

    if (offset === undefined) {
      bytes.push('??');
      continue;
    }

    bytes.push((contents[offset] ?? 0).toString(16).padStart(2, '0').toUpperCase());
  }

  return bytes.join(' ');
}

/**
 * Decoded record for one struct instance, or null when the slot is empty.
 */
export function codecDecodedRecord(
  decoded: Record<string, RadioSettingValue> | undefined,
  struct: CodecStructView,
  instanceIndex: number,
): Record<string, RadioSettingValue> | null | undefined {
  if (!decoded) {
    return undefined;
  }

  const value = decoded[struct.id];

  if (struct.count > 1) {
    if (!Array.isArray(value)) {
      return undefined;
    }

    const item = value[instanceIndex];

    if (item === null) {
      return null;
    }

    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return item as Record<string, RadioSettingValue>;
    }

    return undefined;
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, RadioSettingValue>;
  }

  return undefined;
}

/**
 * Label for prev/next instance navigation on the hex-dump map.
 */
export function codecInstanceLabel(struct: CodecStructView): string {
  if (struct.role === 'records' || struct.role === 'names' || struct.role === 'extras') {
    return 'Channel';
  }

  return struct.id;
}
