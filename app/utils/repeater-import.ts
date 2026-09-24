import { Frequency, RadioToneType, type RadioChannel, type RadioTone } from '@springfield/ham-radio-api';
import { parseFrequencyMHz } from '~/utils/channel-edit';
import type { RepeaterUse } from '~/utils/saved-channels-db';

export type RepeaterImportFormat = 'repeaterbook' | 'chirp';

export interface ParsedRepeater {
  sourceKey: string;
  sourceFormat: RepeaterImportFormat;
  callsign: string;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
  landmark?: string;
  receiveFrequency: Frequency;
  transmitFrequency: Frequency;
  transmitTone: RadioTone;
  receiveTone: RadioTone;
  use?: RepeaterUse;
  onAir?: boolean;
  modes?: string;
  notes?: string;
  latitude?: number;
  longitude?: number;
}

export interface ParsedRepeaterImport {
  format: RepeaterImportFormat;
  repeaters: ParsedRepeater[];
}

const NONE_TONE: RadioTone = { tone: 0, type: RadioToneType.CTCSS };

/**
 * Parse a RepeaterBook website CSV or CHIRP CSV export into portable repeater rows.
 *
 * RepeaterBook `Frequency` or `Output Freq` is the downlink (radio receive). `Input Freq` is the uplink (radio transmit).
 */
export function parseRepeaterImportCsv(text: string): ParsedRepeaterImport {
  const rows = parseCsvRows(text.replace(/^\uFEFF/, ''));

  if (rows.length === 0) {
    throw new Error('CSV file is empty');
  }

  const header = rows[0]!.map(normalizeHeader);
  const format = detectRepeaterImportFormat(header);

  if (!format) {
    throw new Error('CSV is not a RepeaterBook or CHIRP export');
  }

  const repeaters: ParsedRepeater[] = [];

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]!;
    const parsed = format === 'repeaterbook' ? parseRepeaterBookRow(header, row) : parseChirpRow(header, row);

    if (parsed) {
      repeaters.push(parsed);
    }
  }

  return { format, repeaters };
}

/**
 * Copy a parsed repeater into a portable radio channel for the library or a memory slot.
 */
export function importedRepeaterToRadioChannel(repeater: ParsedRepeater): RadioChannel {
  return {
    name: repeater.sourceFormat === 'repeaterbook' ? undefined : repeater.callsign || undefined,
    transmitFrequency: repeater.transmitFrequency,
    receiveFrequency: repeater.receiveFrequency,
    transmitTone: repeater.transmitTone,
    receiveTone: repeater.receiveTone,
  };
}

/**
 * Build library notes from location and RepeaterBook/CHIRP comment fields.
 */
export function importedRepeaterNotes(repeater: ParsedRepeater): string | undefined {
  const parts = [
    formatRepeaterLocation(repeater),
    repeater.landmark,
    repeater.modes,
    repeater.notes,
  ].filter((part): part is string => Boolean(part && part.trim()));

  if (parts.length === 0) {
    return undefined;
  }

  return parts.join(' · ');
}

/**
 * City, state, and country in a single location label.
 */
export function formatRepeaterLocation(repeater: ParsedRepeater): string {
  return [repeater.city, repeater.state, repeater.country].filter((part) => part && part.trim()).join(', ');
}

export function detectRepeaterImportFormat(header: string[]): RepeaterImportFormat | undefined {
  const columns = new Set(header);

  if (columns.has('location') && columns.has('frequency') && (columns.has('duplex') || columns.has('offset'))) {
    return 'chirp';
  }

  if (columns.has('frequency') && (columns.has('input_freq') || columns.has('rptr_id') || columns.has('state_id'))) {
    return 'repeaterbook';
  }

  if (columns.has('output_freq') && columns.has('input_freq') && (columns.has('call') || columns.has('callsign'))) {
    return 'repeaterbook';
  }

  return undefined;
}

function parseRepeaterBookRow(header: string[], row: string[]): ParsedRepeater | undefined {
  const cell = columnLookup(header, row);
  const receiveHz = parseFrequencyMHz(cell('frequency', 'output_freq'));

  if (receiveHz === undefined) {
    return undefined;
  }

  const transmitHz = parseFrequencyMHz(cell('input_freq', 'input_frequency')) ?? receiveHz;
  const stateId = cell('state_id');
  const repeaterId = cell('rptr_id');
  const callsign = cell('callsign') || cell('call') || cell('name');
  const sourceKey = repeaterId
    ? `rb:${stateId || 'unknown'}:${repeaterId}`
    : `rb:${cell('state') || 'unknown'}:${callsign || 'unknown'}:${receiveHz}`;
  const digitalAccess = emptyToUndefined(cell('digital_access'));

  return {
    sourceKey,
    sourceFormat: 'repeaterbook',
    callsign,
    city: emptyToUndefined(cell('nearest_city', 'city', 'location')),
    county: emptyToUndefined(cell('county')),
    state: emptyToUndefined(cell('state')),
    country: emptyToUndefined(cell('country')),
    landmark: emptyToUndefined(cell('landmark')),
    receiveFrequency: Frequency(receiveHz),
    transmitFrequency: Frequency(transmitHz),
    transmitTone: parseRepeaterTone(cell('pl', 'uplink_ctcss', 'uplink_tone')),
    receiveTone: parseRepeaterTone(cell('tsq', 'downlink_ctcss', 'downlink_tone')),
    use: repeaterUseFromLabel(cell('use')),
    onAir: repeaterOnAirFromStatus(cell('operational_status', 'op_status', 'on_air')),
    modes: collectRepeaterBookModes(cell) || emptyToUndefined(cell('modes')),
    notes: [emptyToUndefined(cell('notes')), digitalAccess ? `Digital access ${digitalAccess}` : undefined]
      .filter((part): part is string => Boolean(part))
      .join(' · ') || undefined,
    latitude: parseOptionalNumber(cell('lat')),
    longitude: parseOptionalNumber(cell('long', 'lng')),
  };
}

function parseChirpRow(header: string[], row: string[]): ParsedRepeater | undefined {
  const cell = columnLookup(header, row);
  const receiveHz = parseFrequencyMHz(cell('frequency'));

  if (receiveHz === undefined) {
    return undefined;
  }

  const duplex = cell('duplex').trim().toLowerCase();
  const offsetHz = parseFrequencyMHz(cell('offset')) ?? 0;
  const transmitHz = chirpTransmitFrequency(receiveHz, duplex, offsetHz, cell('offset'));
  const location = cell('location');
  const callsign = cell('name') || cell('callsign');
  const tones = chirpTones(cell('tone'), cell('rtonefreq'), cell('ctonefreq'), cell('dtcscode'));

  return {
    sourceKey: `chirp:${location || receiveHz}:${receiveHz}`,
    sourceFormat: 'chirp',
    callsign,
    receiveFrequency: Frequency(receiveHz),
    transmitFrequency: Frequency(transmitHz),
    transmitTone: tones.transmitTone,
    receiveTone: tones.receiveTone,
    modes: emptyToUndefined(cell('mode')),
    notes: emptyToUndefined(cell('comment')),
  };
}

function chirpTransmitFrequency(receiveHz: number, duplex: string, offsetHz: number, offsetRaw: string): number {
  if (duplex === '+' || duplex === 'plus') {
    return receiveHz + offsetHz;
  }

  if (duplex === '-' || duplex === 'minus') {
    return receiveHz - offsetHz;
  }

  if (duplex === 'split') {
    return parseFrequencyMHz(offsetRaw) ?? receiveHz;
  }

  return receiveHz;
}

function chirpTones(toneModeRaw: string, txCtcssRaw: string, rxCtcssRaw: string, dtcsRaw: string): {
  transmitTone: RadioTone;
  receiveTone: RadioTone;
} {
  const toneMode = toneModeRaw.trim().toLowerCase();

  if (!toneMode || toneMode === 'none') {
    return { transmitTone: NONE_TONE, receiveTone: NONE_TONE };
  }

  if (toneMode === 'tone') {
    return {
      transmitTone: parseCtcssHz(txCtcssRaw),
      receiveTone: NONE_TONE,
    };
  }

  if (toneMode === 'tsql' || toneMode === 'tsql-r') {
    return {
      transmitTone: parseCtcssHz(txCtcssRaw),
      receiveTone: parseCtcssHz(rxCtcssRaw),
    };
  }

  if (toneMode === 'dtcs' || toneMode === 'dcs') {
    const code = parseDcsCode(dtcsRaw);
    return { transmitTone: code, receiveTone: code };
  }

  return { transmitTone: NONE_TONE, receiveTone: NONE_TONE };
}

function parseRepeaterTone(raw: string): RadioTone {
  const value = raw.trim();

  if (!value || /^(csq|none|off|no|n\/a|0|0\.0)$/i.test(value)) {
    return NONE_TONE;
  }

  const dcsMatch = value.match(/^d(?:tcs|cs)?\s*(\d{2,3})/i);

  if (dcsMatch) {
    return parseDcsCode(dcsMatch[1]!);
  }

  return parseCtcssHz(value);
}

function parseCtcssHz(raw: string): RadioTone {
  const hz = Number(raw.trim().replace(/hz$/i, '').trim());

  if (!Number.isFinite(hz) || hz <= 0) {
    return NONE_TONE;
  }

  return { tone: Math.round(hz * 10), type: RadioToneType.CTCSS };
}

function parseDcsCode(raw: string): RadioTone {
  const code = Number(raw.trim());

  if (!Number.isFinite(code) || code <= 0) {
    return NONE_TONE;
  }

  return { tone: Math.trunc(code), type: RadioToneType.DCS };
}

function collectRepeaterBookModes(cell: (...names: string[]) => string): string {
  const modes: string[] = [];

  if (isYes(cell('fm_analog'))) {
    modes.push('FM');
  }

  if (isYes(cell('dmr'))) {
    modes.push('DMR');
  }

  if (isYes(cell('d_star'))) {
    modes.push('D-STAR');
  }

  if (isYes(cell('system_fusion'))) {
    modes.push('Fusion');
  }

  if (isYes(cell('nxdn'))) {
    modes.push('NXDN');
  }

  if (isYes(cell('apco_p_25', 'p25'))) {
    modes.push('P25');
  }

  if (isYes(cell('m17'))) {
    modes.push('M17');
  }

  if (isYes(cell('tetra'))) {
    modes.push('TETRA');
  }

  return modes.join(', ');
}

/**
 * RepeaterBook Use is OPEN or CLOSED. Other labels stay unset.
 */
export function repeaterUseFromLabel(value: string | undefined): RepeaterUse | undefined {
  const normalized = value?.trim().toLowerCase();

  if (normalized === 'open' || normalized === 'closed') {
    return normalized;
  }

  return undefined;
}

/**
 * RepeaterBook Operational Status is On-air or Off-air. Unknown labels stay unset.
 */
export function repeaterOnAirFromStatus(value: string | undefined): boolean | undefined {
  const normalized = value?.trim().toLowerCase().replaceAll(/[\s_]+/g, '-');

  if (!normalized) {
    return undefined;
  }

  if (normalized === 'on-air' || normalized === 'onair' || normalized === 'yes' || normalized === 'true' || normalized === '1') {
    return true;
  }

  if (normalized === 'off-air' || normalized === 'offair' || normalized === 'no' || normalized === 'false' || normalized === '0') {
    return false;
  }

  return undefined;
}

function isYes(value: string): boolean {
  return /^(yes|y|1|true)$/i.test(value.trim());
}

function columnLookup(header: string[], row: string[]): (...names: string[]) => string {
  return (...names: string[]): string => {
    for (const name of names) {
      const index = header.indexOf(name);

      if (index !== -1) {
        return row[index]?.trim() ?? '';
      }
    }

    return '';
  };
}

function emptyToUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function parseOptionalNumber(raw: string): number | undefined {
  const value = Number(raw.trim());

  if (!Number.isFinite(value)) {
    return undefined;
  }

  return value;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replaceAll(/[\s-]+/g, '_');
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let index = 0;

  while (index < text.length) {
    const char = text[index]!;

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }

        inQuotes = false;
        index += 1;
        continue;
      }

      field += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      index += 1;
      continue;
    }

    if (char === ',') {
      row.push(field);
      field = '';
      index += 1;
      continue;
    }

    if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') {
        index += 1;
      }

      row.push(field);
      field = '';

      if (row.some((value) => value.trim() !== '')) {
        rows.push(row);
      }

      row = [];
      index += 1;
      continue;
    }

    field += char;
    index += 1;
  }

  row.push(field);

  if (row.some((value) => value.trim() !== '')) {
    rows.push(row);
  }

  return rows;
}
