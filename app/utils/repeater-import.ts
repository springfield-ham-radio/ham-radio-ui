import { Frequency, RadioToneType, type RadioChannel, type RadioTone } from '@springfield/ham-radio-api';
import { parseFrequencyMHz } from '~/utils/channel-edit';
import {
  linkedSystemsInText,
  normalizeLinkedNodes,
  parseLinkedNode,
  repeaterBookLinkedTextColumnsPresent,
  repeaterBookNodeColumnsPresent,
  type LinkedNodes,
} from '~/utils/linked-nodes';
import {
  coordinatesFromPair,
  type RepeaterUse,
  type SavedChannelRecordColumns,
} from '~/utils/saved-channels-db';

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
  /** RepeaterBook Last Update when the export includes that column. */
  lastUpdate?: string;
  allstarNode?: string;
  echolinkNode?: string;
  irlpNode?: string;
  wiresNode?: string;
  allstar?: boolean;
  echolink?: boolean;
  irlp?: boolean;
  wires?: boolean;
}

export interface ParsedRepeaterImport {
  format: RepeaterImportFormat;
  repeaters: ParsedRepeater[];
  /** True when the RepeaterBook header included node columns. CHIRP exports never do. */
  nodeColumnsPresent: boolean;
  /**
   * True when the RepeaterBook header included Modes, Mode, or Digital Access.
   * Those cells can name a linked system without giving its node number.
   */
  linkedTextColumnsPresent: boolean;
  /** Which record columns this file can replace on a matching row. */
  recordColumns: SavedChannelRecordColumns;
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

  return {
    format,
    repeaters,
    nodeColumnsPresent: format === 'repeaterbook' && repeaterBookNodeColumnsPresent(header),
    linkedTextColumnsPresent: format === 'repeaterbook' && repeaterBookLinkedTextColumnsPresent(header),
    recordColumns: repeaterRecordColumns(format, header),
  };
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
 * Notes copied onto a new library row.
 *
 * City, county, state, country, landmark, and modes are stored on the repeater
 * record. They are not folded into notes. A RepeaterBook Notes cell and a
 * Digital Access code (an access code, not a node number) still land here.
 */
export function importedRepeaterNotes(repeater: ParsedRepeater): string | undefined {
  const notes = repeater.notes?.trim();
  return notes ? notes : undefined;
}

/**
 * Which record columns this header can overwrite on re-import.
 * CHIRP CSV has no city, state, or coordinates, so those flags stay off.
 */
export function repeaterRecordColumns(format: RepeaterImportFormat, header: readonly string[]): SavedChannelRecordColumns {
  const has = (...names: string[]): boolean => names.some((name) => header.includes(name));

  if (format === 'chirp') {
    return {
      sourceKey: true,
      sourceFormat: true,
      city: false,
      county: false,
      state: false,
      country: false,
      landmark: false,
      modes: has('mode'),
      lastUpdate: false,
    };
  }

  return {
    sourceKey: true,
    sourceFormat: true,
    city: has('nearest_city', 'city', 'location'),
    county: has('county'),
    state: has('state'),
    country: has('country'),
    landmark: has('landmark'),
    modes: has(
      'modes',
      'mode',
      'fm_analog',
      'dmr',
      'd_star',
      'system_fusion',
      'nxdn',
      'apco_p_25',
      'p25',
      'm17',
      'tetra',
    ),
    lastUpdate: has('last_update'),
  };
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
  const location = cell('nearest_city', 'city', 'location');
  const sourceKey = repeaterId
    ? `rb:${stateId || 'unknown'}:${repeaterId}`
    : `rb:${sourceKeyPart(callsign)}:${receiveHz}:${sourceKeyPart(location)}`;
  const digitalAccess = emptyToUndefined(cell('digital_access'));

  return {
    sourceKey,
    sourceFormat: 'repeaterbook',
    callsign,
    city: emptyToUndefined(location),
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
    ...repeaterCoordinates(
      cell('lat', 'latitude'),
      cell('long', 'lng', 'lon', 'longitude'),
    ),
    lastUpdate: emptyToUndefined(cell('last_update')),
    ...repeaterBookLinkedNodes(cell),
  };
}

function sourceKeyPart(value: string): string {
  const normalized = value.trim().toLowerCase().replaceAll(/\s+/g, ' ');
  return normalized || 'unknown';
}

function repeaterCoordinates(latitudeRaw: string, longitudeRaw: string): { latitude?: number; longitude?: number } {
  return coordinatesFromPair(parseOptionalNumber(latitudeRaw), parseOptionalNumber(longitudeRaw));
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
  const tones = chirpTones(
    cell('tone'),
    cell('rtonefreq'),
    cell('ctonefreq'),
    cell('dtcscode'),
    cell('rxdtcscode'),
    cell('crossmode'),
  );

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

  if (duplex === 'off') {
    return 0;
  }

  return receiveHz;
}

function chirpTones(
  toneModeRaw: string,
  txCtcssRaw: string,
  rxCtcssRaw: string,
  dtcsRaw: string,
  rxDtcsRaw = '',
  crossModeRaw = '',
): {
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

  if (toneMode === 'dtcs' || toneMode === 'dcs' || toneMode === 'dtcs-r') {
    const code = parseDcsCode(dtcsRaw);
    return { transmitTone: code, receiveTone: code };
  }

  if (toneMode === 'cross') {
    return chirpCrossTones(crossModeRaw, txCtcssRaw, rxCtcssRaw, dtcsRaw, rxDtcsRaw);
  }

  return { transmitTone: NONE_TONE, receiveTone: NONE_TONE };
}

function chirpCrossTones(
  crossModeRaw: string,
  txCtcssRaw: string,
  rxCtcssRaw: string,
  dtcsRaw: string,
  rxDtcsRaw: string,
): { transmitTone: RadioTone; receiveTone: RadioTone } {
  const cross = crossModeRaw.trim().toLowerCase();
  const txCtcss = parseCtcssHz(txCtcssRaw);
  const rxCtcss = parseCtcssHz(rxCtcssRaw);
  const txDcs = parseDcsCode(dtcsRaw);
  const rxDcs = parseDcsCode(rxDtcsRaw || dtcsRaw);

  switch (cross) {
    case 'tone->tone':
      return { transmitTone: txCtcss, receiveTone: rxCtcss };
    case 'tone->':
      return { transmitTone: txCtcss, receiveTone: NONE_TONE };
    case '->tone':
      return { transmitTone: NONE_TONE, receiveTone: rxCtcss };
    case 'dtcs->':
      return { transmitTone: txDcs, receiveTone: NONE_TONE };
    case '->dtcs':
      return { transmitTone: NONE_TONE, receiveTone: rxDcs };
    case 'tone->dtcs':
      return { transmitTone: txCtcss, receiveTone: rxDcs };
    case 'dtcs->tone':
      return { transmitTone: txDcs, receiveTone: rxCtcss };
    case 'dtcs->dtcs':
      return { transmitTone: txDcs, receiveTone: rxDcs };
    default:
      return { transmitTone: NONE_TONE, receiveTone: NONE_TONE };
  }
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

/**
 * Website CSV uses EchoLink, IRLP, and AllStar. The export field list uses
 * `EchoLink Node`, `IRLP Node`, `AllStar Node`, and `Wires Node` (also `WIRES Node`).
 */
function repeaterBookLinkedNodes(cell: (...names: string[]) => string): LinkedNodes {
  const named = linkedSystemsInText(
    [collectRepeaterBookModes(cell), cell('modes'), cell('mode'), cell('digital_access')].filter(Boolean).join(' '),
  );

  return normalizeLinkedNodes({
    allstarNode: parseLinkedNode(cell('allstar_node', 'allstar')),
    echolinkNode: parseLinkedNode(cell('echolink_node', 'echolink')),
    irlpNode: parseLinkedNode(cell('irlp_node', 'irlp')),
    wiresNode: parseLinkedNode(cell('wires_node')),
    allstar: named.allstar,
    echolink: named.echolink,
    irlp: named.irlp,
    wires: named.wires,
  });
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
  const trimmed = raw.trim();

  if (!trimmed) {
    return undefined;
  }

  const value = Number(trimmed);

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
