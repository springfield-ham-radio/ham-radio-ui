import {
  type RadioChannel,
  type RadioMemoryMap,
  type RadioMemoryMapField,
  type RadioMemoryMapValueKind,
  type RadioTone,
  RadioToneType,
} from '@springfield/ham-radio-api';
import type { SpectrumBand } from '@springfield/ham-radio-api';
import bandsData from '../../node_modules/@springfield/ham-radio-utils/dist/db/bands.json' with { type: 'json' };
import { defaultRepeaterOffsetHz, formatFrequencyMHz } from '~/utils/channel-edit';
import { radioBandsFromConfig } from '~/utils/radio-bands';
import { bandNameForFrequency, transmitPrivilegeWarning } from '~/utils/transmit-privileges';

export type ChannelValidationField =
  | 'receiveFrequency'
  | 'transmitFrequency'
  | 'receiveTone'
  | 'transmitTone'
  | 'name'
  | 'offset'
  | 'privileges';

export interface ChannelValidationFinding {
  level: 'error' | 'warning';
  field: ChannelValidationField;
  code: string;
  message: string;
}

export interface ChannelValidationLicense {
  active: boolean;
  classIds: readonly string[];
  label: string;
}

export interface ChannelValidationRadio {
  bands?: readonly string[];
  memoryMap?: RadioMemoryMap;
  channelSchema?: unknown;
}

const AMATEUR_BANDS = bandsData as SpectrumBand[];

const ADIF_TOKEN_TO_BAND_NAME: Record<string, string> = {
  '160m': '160 Meter',
  '80m': '80 Meter',
  '60m': '60 Meter',
  '40m': '40 Meter',
  '30m': '30 Meter',
  '20m': '20 Meter',
  '17m': '17 Meter',
  '15m': '15 Meter',
  '12m': '12 Meter',
  '10m': '10 Meter',
  '6m': '6 Meter',
  '2m': '2 Meter',
  '1.25m': '1.25 Meter',
  '70cm': '70 Centimeter',
  '33cm': '33 Centimeter',
  '23cm': '23 Centimeter',
};

interface AdifBandWindow {
  token: string;
  label: string;
  minHz: number;
  maxHz: number;
}

function adifBandWindows(tokens: readonly string[]): AdifBandWindow[] {
  const windows: AdifBandWindow[] = [];

  for (const token of tokens) {
    const normalized = token.trim().toLowerCase();
    const bandName = ADIF_TOKEN_TO_BAND_NAME[normalized];

    if (!bandName) {
      continue;
    }

    const band = AMATEUR_BANDS.find((entry) => entry.name === bandName);

    if (!band) {
      continue;
    }

    windows.push({
      token: normalized,
      label: bandName,
      minHz: band.lowerFrequency,
      maxHz: band.upperFrequency,
    });
  }

  return windows;
}

function formatMHz(hz: number): string {
  return `${formatFrequencyMHz(hz)} MHz`;
}

function frequencyInWindows(hz: number, windows: readonly AdifBandWindow[]): boolean {
  return windows.some((window) => hz >= window.minHz && hz <= window.maxHz);
}

function schemaFrequencyBounds(
  channelSchema: unknown,
  property: 'receiveFrequency' | 'transmitFrequency',
): { minimum?: number; maximum?: number } {
  if (!channelSchema || typeof channelSchema !== 'object') {
    return {};
  }

  const properties = (channelSchema as { properties?: Record<string, unknown> }).properties;

  if (!properties || typeof properties !== 'object') {
    return {};
  }

  const field = properties[property];

  if (!field || typeof field !== 'object') {
    return {};
  }

  const minimum = (field as { minimum?: unknown }).minimum;
  const maximum = (field as { maximum?: unknown }).maximum;

  return {
    minimum: typeof minimum === 'number' ? minimum : undefined,
    maximum: typeof maximum === 'number' ? maximum : undefined,
  };
}

function schemaNameMaxLength(channelSchema: unknown): number | undefined {
  if (!channelSchema || typeof channelSchema !== 'object') {
    return undefined;
  }

  const properties = (channelSchema as { properties?: Record<string, unknown> }).properties;
  const name = properties?.name;

  if (!name || typeof name !== 'object') {
    return undefined;
  }

  const maxLength = (name as { maxLength?: unknown }).maxLength;

  return typeof maxLength === 'number' ? maxLength : undefined;
}

function structById(memoryMap: RadioMemoryMap | undefined, id: string | undefined) {
  if (!memoryMap || !id) {
    return undefined;
  }

  return memoryMap.structs.find((struct) => struct.id === id);
}

function fieldById(struct: { fields: RadioMemoryMapField[] } | undefined, id: string | undefined) {
  if (!struct || !id) {
    return undefined;
  }

  return struct.fields.find((field) => field.id === id && !field.reserved);
}

function channelNameCapacity(memoryMap: RadioMemoryMap | undefined, channelSchema: unknown): number | undefined {
  const bindings = memoryMap?.channelBindings;

  if (bindings?.nameField) {
    const namesStruct = structById(memoryMap, bindings.names ?? bindings.records);
    const recordsStruct = structById(memoryMap, bindings.records);
    const nameField =
      fieldById(namesStruct, bindings.nameField) ?? fieldById(recordsStruct, bindings.nameField);
    const length = nameField?.value?.kind === 'ascii' ? nameField.value.length : undefined;

    if (length !== undefined) {
      return length;
    }
  }

  return schemaNameMaxLength(channelSchema);
}

function toneFieldKind(
  memoryMap: RadioMemoryMap | undefined,
  side: 'receiveTone' | 'transmitTone',
): RadioMemoryMapValueKind | undefined {
  const bindings = memoryMap?.channelBindings;

  if (!bindings) {
    return undefined;
  }

  const fieldId = side === 'receiveTone' ? bindings.receiveTone : bindings.transmitTone;
  const records = structById(memoryMap, bindings.records);

  return fieldById(records, fieldId)?.value;
}

function frequencyFieldKind(
  memoryMap: RadioMemoryMap | undefined,
  side: 'receiveFrequency' | 'transmitFrequency',
): { field?: RadioMemoryMapField; kind?: RadioMemoryMapValueKind } {
  const bindings = memoryMap?.channelBindings;

  if (!bindings) {
    return {};
  }

  const fieldId = side === 'receiveFrequency' ? bindings.receiveFrequency : bindings.transmitFrequency;
  const records = structById(memoryMap, bindings.records);
  const field = fieldById(records, fieldId);

  return { field, kind: field?.value };
}

function maxLbcdScaled(length: number): number {
  let max = 0;

  for (let index = 0; index < length * 2; index += 1) {
    max = max * 10 + 9;
  }

  return max;
}

function integerMaxForField(field: RadioMemoryMapField | undefined): number | undefined {
  if (!field) {
    return undefined;
  }

  if (field.value?.kind === 'integer') {
    if (field.value.max !== undefined) {
      return field.value.max;
    }
  }

  if (field.type === 'u8') {
    return 0xff;
  }

  if (field.type === 'u16') {
    return 0xffff;
  }

  if (field.type === 'u32') {
    return 0xffff_ffff;
  }

  return undefined;
}

function frequencyEncodable(hz: number, field: RadioMemoryMapField | undefined, kind: RadioMemoryMapValueKind | undefined): boolean {
  if (!kind) {
    return true;
  }

  const rounded = Math.round(hz);

  switch (kind.kind) {
    case 'lbcd': {
      const scale = kind.scale ?? 10;
      const scaled = Math.round(rounded / scale);

      if (scaled < 0) {
        return false;
      }

      return scaled <= maxLbcdScaled(kind.length);
    }
    case 'digits': {
      const scale = kind.scale ?? 1;
      const scaled = Math.round(rounded / scale);
      const max = 10 ** kind.length - 1;

      return scaled >= 0 && scaled <= max;
    }
    case 'bbcd': {
      const scale = 1;
      const scaled = Math.round(rounded / scale);
      const max = 10 ** (kind.length * 2) - 1;

      return scaled >= 0 && scaled <= max;
    }
    case 'integer': {
      const max = integerMaxForField(field);

      if (max === undefined) {
        return true;
      }

      return rounded >= (kind.min ?? 0) && rounded <= Math.min(kind.max ?? max, max);
    }
    default:
      return true;
  }
}

function isNoneTone(tone: RadioTone | undefined): boolean {
  return !tone || !tone.tone;
}

function toneEncodable(tone: RadioTone | undefined, kind: RadioMemoryMapValueKind | undefined): boolean {
  if (!kind || isNoneTone(tone)) {
    return true;
  }

  const value = Number(tone.tone);

  if (!Number.isFinite(value)) {
    return false;
  }

  switch (kind.kind) {
    case 'tone': {
      if (tone.type === RadioToneType.CTCSS) {
        const ctcssMin = kind.ctcssMin ?? 0x0258;

        return value >= ctcssMin;
      }

      return kind.values.includes(value);
    }
    case 'ctcss-index':
      return kind.values.includes(value);
    case 'dcs-index':
      return kind.values.includes(value);
    default:
      return true;
  }
}

function hasNonAsciiName(name: string): boolean {
  for (const character of name) {
    if (character.codePointAt(0)! > 255) {
      return true;
    }
  }

  return false;
}

function allocationBandLabel(hz: number): string {
  return bandNameForFrequency(hz);
}

function isCrossBandPair(receiveHz: number, transmitHz: number): boolean {
  if (receiveHz === transmitHz) {
    return false;
  }

  const receiveBand = allocationBandLabel(receiveHz);
  const transmitBand = allocationBandLabel(transmitHz);

  if (!receiveBand || !transmitBand) {
    return false;
  }

  return receiveBand !== transmitBand;
}

function offsetFinding(
  receiveHz: number,
  transmitHz: number,
): ChannelValidationFinding | undefined {
  if (receiveHz === transmitHz) {
    return undefined;
  }

  if (isCrossBandPair(receiveHz, transmitHz)) {
    return undefined;
  }

  const expected = defaultRepeaterOffsetHz(receiveHz);
  const actual = Math.abs(transmitHz - receiveHz);

  if (actual === expected) {
    return undefined;
  }

  return {
    level: 'warning',
    field: 'offset',
    code: 'offset-not-standard',
    message: `Offset is ${formatMHz(actual)}, not the usual ${formatMHz(expected)} split for this band.`,
  };
}

function bandMembershipFindings(
  field: 'receiveFrequency' | 'transmitFrequency',
  hz: number,
  windows: readonly AdifBandWindow[],
): ChannelValidationFinding[] {
  if (windows.length === 0 || frequencyInWindows(hz, windows)) {
    return [];
  }

  const bandList = windows.map((window) => window.label).join(', ');
  const code = field === 'transmitFrequency' ? 'transmit-outside-bands' : 'receive-outside-bands';
  const level = field === 'transmitFrequency' ? 'error' : 'warning';

  return [
    {
      level,
      field,
      code,
      message: `${formatMHz(hz)} is outside this radio’s ${bandList} coverage.`,
    },
  ];
}

function schemaRangeFinding(
  field: 'receiveFrequency' | 'transmitFrequency',
  hz: number,
  bounds: { minimum?: number; maximum?: number },
): ChannelValidationFinding | undefined {
  const { minimum, maximum } = bounds;

  if (minimum === undefined && maximum === undefined) {
    return undefined;
  }

  if ((minimum !== undefined && hz < minimum) || (maximum !== undefined && hz > maximum)) {
    const parts: string[] = [];

    if (minimum !== undefined && maximum !== undefined) {
      parts.push(`${formatMHz(minimum)} to ${formatMHz(maximum)}`);
    } else if (minimum !== undefined) {
      parts.push(`at least ${formatMHz(minimum)}`);
    } else if (maximum !== undefined) {
      parts.push(`at most ${formatMHz(maximum)}`);
    }

    return {
      level: 'error',
      field,
      code: 'frequency-outside-range',
      message: `${formatMHz(hz)} is outside the allowed range (${parts.join(' ')}).`,
    };
  }

  return undefined;
}

/**
 * Validate a library or programmed channel against a target radio configuration.
 */
export function validateChannelForRadio(
  channel: Pick<RadioChannel, 'name' | 'receiveFrequency' | 'transmitFrequency' | 'receiveTone' | 'transmitTone'>,
  radio: ChannelValidationRadio,
  license?: ChannelValidationLicense,
): ChannelValidationFinding[] {
  const findings: ChannelValidationFinding[] = [];
  const declaredBands = radio.bands ?? [];
  const tokenList = declaredBands.length > 0 ? declaredBands : radioBandsFromConfig({ bands: declaredBands });
  const bandWindows = adifBandWindows(tokenList);
  const useSchemaFrequencyRange = bandWindows.length === 0;

  const receiveHz = Number(channel.receiveFrequency);
  const transmitHz = Number(channel.transmitFrequency);

  if (useSchemaFrequencyRange) {
    const receiveBounds = schemaFrequencyBounds(radio.channelSchema, 'receiveFrequency');
    const transmitBounds = schemaFrequencyBounds(radio.channelSchema, 'transmitFrequency');
    const receiveRange = schemaRangeFinding('receiveFrequency', receiveHz, receiveBounds);
    const transmitRange = schemaRangeFinding('transmitFrequency', transmitHz, transmitBounds);

    if (receiveRange) {
      findings.push(receiveRange);
    }

    if (transmitRange) {
      findings.push(transmitRange);
    }
  } else {
    findings.push(...bandMembershipFindings('receiveFrequency', receiveHz, bandWindows));
    findings.push(...bandMembershipFindings('transmitFrequency', transmitHz, bandWindows));
  }

  for (const side of ['receiveFrequency', 'transmitFrequency'] as const) {
    const hz = side === 'receiveFrequency' ? receiveHz : transmitHz;
    const { field, kind } = frequencyFieldKind(radio.memoryMap, side);

    if (!frequencyEncodable(hz, field, kind)) {
      findings.push({
        level: 'error',
        field: side,
        code: 'frequency-not-encodable',
        message: `${formatMHz(hz)} cannot be stored in this radio’s memory map.`,
      });
    }
  }

  for (const side of ['receiveTone', 'transmitTone'] as const) {
    const tone = side === 'receiveTone' ? channel.receiveTone : channel.transmitTone;
    const kind = toneFieldKind(radio.memoryMap, side);

    if (!toneEncodable(tone, kind)) {
      const code = side === 'receiveTone' ? 'receive-tone-not-encodable' : 'transmit-tone-not-encodable';

      findings.push({
        level: 'error',
        field: side,
        code,
        message: 'This tone cannot be stored on the radio and may be cleared when programmed.',
      });
    } else if (kind === undefined && !isNoneTone(tone)) {
      findings.push({
        level: 'error',
        field: side,
        code: side === 'receiveTone' ? 'receive-tone-not-encodable' : 'transmit-tone-not-encodable',
        message: 'This radio has no tone field for this side.',
      });
    }
  }

  const name = channel.name ?? '';
  const nameCapacity = channelNameCapacity(radio.memoryMap, radio.channelSchema);

  if (nameCapacity !== undefined && name.length > nameCapacity) {
    findings.push({
      level: 'warning',
      field: 'name',
      code: 'name-truncated',
      message: `Name will be truncated to ${nameCapacity} characters.`,
    });
  }

  if (hasNonAsciiName(name)) {
    findings.push({
      level: 'warning',
      field: 'name',
      code: 'name-not-ascii',
      message: 'Non-ASCII characters in the name may not appear on the radio.',
    });
  }

  const offset = offsetFinding(receiveHz, transmitHz);

  if (offset) {
    findings.push(offset);
  }

  if (license?.active) {
    const privilege = transmitPrivilegeWarning(transmitHz, license);

    if (privilege) {
      findings.push({
        level: 'warning',
        field: 'privileges',
        code: 'transmit-outside-privileges',
        message: privilege.detail,
      });
    }
  }

  return findings;
}

export function partitionChannelFindings(findings: readonly ChannelValidationFinding[]): {
  errors: ChannelValidationFinding[];
  warnings: ChannelValidationFinding[];
} {
  return {
    errors: findings.filter((finding) => finding.level === 'error'),
    warnings: findings.filter((finding) => finding.level === 'warning'),
  };
}
