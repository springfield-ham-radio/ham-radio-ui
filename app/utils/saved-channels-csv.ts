import {
  Frequency,
  RadioToneType,
  type RadioChannel,
  type RadioTone,
} from '@springfield/ham-radio-api';
import { formatFrequencyMHz, parseFrequencyMHz } from '~/utils/channel-edit';
import type { SavedChannel } from '~/utils/saved-channels-db';

export const SAVED_CHANNELS_CSV_HEADER =
  'name,tx_mhz,rx_mhz,tx_tone_type,tx_tone,rx_tone_type,rx_tone,notes';

export interface ParsedSavedChannelsCsv {
  channels: RadioChannel[];
  notes: Array<string | undefined>;
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
 * Parse a channel-library CSV into portable RadioChannel values.
 * New ids are assigned when the rows are inserted.
 */
export function parseSavedChannelsCsv(text: string): ParsedSavedChannelsCsv {
  const rows = parseCsvRows(text.replace(/^\uFEFF/, ''));

  if (rows.length === 0) {
    throw new Error('CSV file is empty');
  }

  const header = rows[0]!.map(normalizeHeader);
  const required = ['name', 'tx_mhz', 'rx_mhz', 'tx_tone_type', 'tx_tone', 'rx_tone_type', 'rx_tone'];

  for (const column of required) {
    if (!header.includes(column)) {
      throw new Error(`CSV is missing required column "${column}"`);
    }
  }

  const indexOf = (column: string): number => header.indexOf(column);
  const channels: RadioChannel[] = [];
  const notes: Array<string | undefined> = [];

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
    notes.push(note || undefined);
  }

  return { channels, notes };
}
