import {
  Frequency,
  RadioToneType,
  type RadioChannel,
  type RadioTone,
} from '@springfield/ham-radio-api';
import { formatFrequencyMHz, parseFrequencyMHz } from '~/utils/channel-edit';
import { isValidLatitude, isValidLongitude } from '~/utils/maidenhead';
import {
  detectRepeaterImportFormat,
  importedRepeaterNotes,
  importedRepeaterToRadioChannel,
  parseRepeaterImportCsv,
  repeaterOnAirFromStatus,
  repeaterUseFromLabel,
} from '~/utils/repeater-import';
import { parseLinkedNode, type LinkedNodes } from '~/utils/linked-nodes';
import { coordinatesFromPair, type RepeaterUse, type SavedChannel, type SavedChannelKind } from '~/utils/saved-channels-db';

export const SAVED_CHANNELS_CSV_HEADER =
  'name,tx_mhz,rx_mhz,tx_tone_type,tx_tone,rx_tone_type,rx_tone,notes,kind,use,on_air,callsign,latitude,longitude,allstar_node,echolink_node,irlp_node,wires_node';

export interface ParsedSavedChannelsCsv {
  source: 'library' | 'repeaterbook' | 'chirp';
  channels: RadioChannel[];
  notes: Array<string | undefined>;
  kinds: SavedChannelKind[];
  uses: Array<RepeaterUse | undefined>;
  onAir: Array<boolean | undefined>;
  callsigns: Array<string | undefined>;
  latitudes: Array<number | undefined>;
  longitudes: Array<number | undefined>;
  linkedNodes: LinkedNodes[];
  /** When true, blank node columns replace stored nodes on a matching row. */
  replaceLinkedNodes: boolean;
}

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }

  return value;
}

function formatToneType(tone: RadioTone | undefined): string {
  if (!tone || !tone.tone) {
    return '';
  }

  return tone.type === RadioToneType.DCS ? 'DCS' : 'CTCSS';
}

function formatToneValue(tone: RadioTone | undefined): string {
  if (!tone || !tone.tone) {
    return '';
  }

  if (tone.type === RadioToneType.DCS) {
    return String(tone.tone);
  }

  return (tone.tone / 10).toFixed(1);
}

function formatCoordinate(value: number | undefined): string {
  if (value === undefined) {
    return '';
  }

  return String(value);
}

function formatOnAir(value: boolean | undefined): string {
  if (value === true) {
    return 'yes';
  }

  if (value === false) {
    return 'no';
  }

  return '';
}

/**
 * Serialize library channels to a portable CSV document.
 */
export function serializeSavedChannelsCsv(channels: SavedChannel[]): string {
  const lines = [SAVED_CHANNELS_CSV_HEADER];

  for (const channel of channels) {
    lines.push(
      [
        escapeCsvField(channel.name ?? ''),
        formatFrequencyMHz(channel.transmitFrequency),
        formatFrequencyMHz(channel.receiveFrequency),
        formatToneType(channel.transmitTone),
        formatToneValue(channel.transmitTone),
        formatToneType(channel.receiveTone),
        formatToneValue(channel.receiveTone),
        escapeCsvField(channel.notes ?? ''),
        channel.kind === 'repeater' ? 'repeater' : 'channel',
        channel.kind === 'repeater' ? (channel.use ?? '') : '',
        channel.kind === 'repeater' ? formatOnAir(channel.onAir) : '',
        channel.kind === 'repeater' ? escapeCsvField(channel.callsign ?? '') : '',
        formatCoordinate(channel.latitude),
        formatCoordinate(channel.longitude),
        channel.kind === 'repeater' ? escapeCsvField(channel.allstarNode ?? '') : '',
        channel.kind === 'repeater' ? escapeCsvField(channel.echolinkNode ?? '') : '',
        channel.kind === 'repeater' ? escapeCsvField(channel.irlpNode ?? '') : '',
        channel.kind === 'repeater' ? escapeCsvField(channel.wiresNode ?? '') : '',
      ].join(','),
    );
  }

  return `${lines.join('\n')}\n`;
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

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replaceAll(/[\s-]+/g, '_');
}

function parseTone(typeRaw: string, valueRaw: string): RadioTone {
  const type = typeRaw.trim().toUpperCase();
  const value = valueRaw.trim();

  if (!type || type === 'NONE' || !value) {
    return { tone: 0, type: RadioToneType.CTCSS };
  }

  if (type === 'DCS') {
    const code = Number(value);

    if (!Number.isFinite(code) || code <= 0) {
      throw new Error(`Invalid DCS tone "${valueRaw}"`);
    }

    return { tone: Math.trunc(code), type: RadioToneType.DCS };
  }

  if (type === 'CTCSS') {
    const hz = Number(value);

    if (!Number.isFinite(hz) || hz <= 0) {
      throw new Error(`Invalid CTCSS tone "${valueRaw}"`);
    }

    return { tone: Math.round(hz * 10), type: RadioToneType.CTCSS };
  }

  throw new Error(`Unknown tone type "${typeRaw}"`);
}

/**
 * Parse a HamBench library CSV, or a RepeaterBook / CHIRP export, into portable channels.
 */
export function parseSavedChannelsCsv(text: string): ParsedSavedChannelsCsv {
  const rows = parseCsvRows(text.replace(/^\uFEFF/, ''));

  if (rows.length === 0) {
    throw new Error('CSV file is empty');
  }

  const header = rows[0]!.map(normalizeHeader);
  const repeaterFormat = detectRepeaterImportFormat(header);

  if (repeaterFormat) {
    const parsed = parseRepeaterImportCsv(text);
    return {
      source: parsed.format,
      channels: parsed.repeaters.map((repeater) => importedRepeaterToRadioChannel(repeater)),
      notes: parsed.repeaters.map((repeater) => importedRepeaterNotes(repeater)),
      kinds: parsed.repeaters.map(() => 'repeater'),
      uses: parsed.repeaters.map((repeater) => repeater.use),
      onAir: parsed.repeaters.map((repeater) => repeater.onAir),
      callsigns: parsed.repeaters.map((repeater) =>
        repeater.sourceFormat === 'repeaterbook' ? repeater.callsign || undefined : undefined,
      ),
      latitudes: parsed.repeaters.map((repeater) => repeater.latitude),
      longitudes: parsed.repeaters.map((repeater) => repeater.longitude),
      linkedNodes: parsed.repeaters.map((repeater) =>
        repeater.sourceFormat === 'repeaterbook'
          ? {
              allstarNode: repeater.allstarNode,
              echolinkNode: repeater.echolinkNode,
              irlpNode: repeater.irlpNode,
              wiresNode: repeater.wiresNode,
            }
          : {},
      ),
      replaceLinkedNodes: parsed.nodeColumnsPresent,
    };
  }

  const required = ['name', 'tx_mhz', 'rx_mhz', 'tx_tone_type', 'tx_tone', 'rx_tone_type', 'rx_tone'];

  for (const column of required) {
    if (!header.includes(column)) {
      throw new Error(`CSV is missing required column "${column}"`);
    }
  }

  const indexOf = (column: string): number => header.indexOf(column);
  const channels: RadioChannel[] = [];
  const notes: Array<string | undefined> = [];
  const kinds: SavedChannelKind[] = [];
  const uses: Array<RepeaterUse | undefined> = [];
  const onAir: Array<boolean | undefined> = [];
  const callsigns: Array<string | undefined> = [];
  const latitudes: Array<number | undefined> = [];
  const longitudes: Array<number | undefined> = [];
  const linkedNodes: LinkedNodes[] = [];
  const nodeColumns = ['allstar_node', 'echolink_node', 'irlp_node', 'wires_node'] as const;
  const replaceLinkedNodes = nodeColumns.some((column) => indexOf(column) !== -1);

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]!;
    const cell = (column: string): string => row[indexOf(column)]?.trim() ?? '';

    const transmitHz = parseFrequencyMHz(cell('tx_mhz'));
    const receiveHz = parseFrequencyMHz(cell('rx_mhz'));

    if (transmitHz === undefined || receiveHz === undefined) {
      throw new Error(`Row ${rowIndex + 1} has an invalid frequency`);
    }

    const name = cell('name');
    const note = indexOf('notes') === -1 ? '' : cell('notes');

    channels.push({
      name: name || undefined,
      transmitFrequency: Frequency(transmitHz),
      receiveFrequency: Frequency(receiveHz),
      transmitTone: parseTone(cell('tx_tone_type'), cell('tx_tone')),
      receiveTone: parseTone(cell('rx_tone_type'), cell('rx_tone')),
    });
    const kind = indexOf('kind') === -1 ? 'channel' : parseSavedChannelKind(cell('kind'));
    const use = kind === 'repeater' && indexOf('use') !== -1 ? repeaterUseFromLabel(cell('use')) : undefined;
    const air = kind === 'repeater' && indexOf('on_air') !== -1 ? repeaterOnAirFromStatus(cell('on_air')) : undefined;
    const callsign = kind === 'repeater' && indexOf('callsign') !== -1 ? cell('callsign') || undefined : undefined;

    const point = coordinatesFromPair(
      indexOf('latitude') === -1 ? undefined : parseOptionalCoordinate(cell('latitude'), isValidLatitude),
      indexOf('longitude') === -1 ? undefined : parseOptionalCoordinate(cell('longitude'), isValidLongitude),
    );

    notes.push(note || undefined);
    kinds.push(kind);
    uses.push(use);
    onAir.push(air);
    callsigns.push(callsign);
    latitudes.push(point.latitude);
    longitudes.push(point.longitude);
    linkedNodes.push(
      kind === 'repeater'
        ? {
            allstarNode: indexOf('allstar_node') === -1 ? undefined : parseLinkedNode(cell('allstar_node')),
            echolinkNode: indexOf('echolink_node') === -1 ? undefined : parseLinkedNode(cell('echolink_node')),
            irlpNode: indexOf('irlp_node') === -1 ? undefined : parseLinkedNode(cell('irlp_node')),
            wiresNode: indexOf('wires_node') === -1 ? undefined : parseLinkedNode(cell('wires_node')),
          }
        : {},
    );
  }

  return {
    source: 'library',
    channels,
    notes,
    kinds,
    uses,
    onAir,
    callsigns,
    latitudes,
    longitudes,
    linkedNodes,
    replaceLinkedNodes,
  };
}

function parseOptionalCoordinate(raw: string, valid: (value: number) => boolean): number | undefined {
  const trimmed = raw.trim();

  if (!trimmed) {
    return undefined;
  }

  const value = Number(trimmed);

  return valid(value) ? value : undefined;
}

function parseSavedChannelKind(value: string): SavedChannelKind {
  return value.trim().toLowerCase() === 'repeater' ? 'repeater' : 'channel';
}
